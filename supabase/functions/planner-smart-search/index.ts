// ============================================================
//  planner-smart-search — "Ask my planner" Edge Function
//  Shipped: 2026-05-30
//
//  The first AI piece for Eggie's Creator Hub. A Supabase Edge
//  Function (Deno) that lives inside the SAME Supabase project —
//  no new host, no API key in the browser.
//
//  Flow:
//    1. Verify the caller's Supabase login (JWT forwarded from the page).
//    2. Read THEIR planner_items under RLS — so the function can only
//       ever see items the signed-in user (or a delegated manager) is
//       allowed to see. No service-role key, no data leakage.
//    3. Send a compact list to Claude with the user's question.
//    4. Return { answer, items } — items are the matched rows, ranked.
//
//  Secrets required (set via `supabase secrets set …`):
//    ANTHROPIC_API_KEY   — from console.anthropic.com
//    ANTHROPIC_MODEL     — optional, defaults to claude-sonnet-4-6
//  SUPABASE_URL + SUPABASE_ANON_KEY are injected automatically.
//
//  Deploy + test: see SMART-SEARCH-SETUP.md
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

// CORS — the page is served from creatorhub.eggieweggie.ca, the function
// from *.supabase.co, so we must allow cross-origin calls.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // ---- 1. Auth: reuse the caller's JWT so RLS applies ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  // ---- 2. Parse input ----
  let payload: { question?: string; manageOwnerId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad JSON body" }, 400);
  }
  const question = (payload.question || "").trim();
  if (!question) return json({ error: "Ask a question first" }, 400);

  // ---- 3. Pull the user's planner items (RLS-scoped) ----
  let q = sb
    .from("planner_items")
    .select("id,title,status,platforms,hook,scheduled_at,posted_at,is_priority,notes")
    .neq("status", "archived")
    .limit(300);

  // Manager impersonation: page passes the creator's owner id; RLS allows
  // it because planner_is_manager_of(user_id) is true for delegated managers.
  if (payload.manageOwnerId) q = q.eq("owner_id", payload.manageOwnerId);

  const { data: items, error: itemsErr } = await q;
  if (itemsErr) return json({ error: "Couldn't read planner: " + itemsErr.message }, 500);
  if (!items || !items.length) {
    return json({ answer: "There aren't any active planner items to search yet.", items: [] });
  }

  // Compact representation — keep tokens (and cost) low.
  const compact = items.map((it) => ({
    id: it.id,
    title: it.title || "Untitled",
    status: it.status,
    priority: !!it.is_priority,
    platforms: it.platforms || [],
    deadline: it.scheduled_at,
    posted: it.posted_at,
    hook: (it.hook || "").slice(0, 160),
    notes: (it.notes || "").slice(0, 200),
  }));

  // ---- 4. Ask Claude ----
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);

  const system =
    "You are the planning assistant inside a VTuber content creator's hub. " +
    "You are given the creator's question and a JSON array of their content items " +
    "(status is one of idea/script/recording/editing/edited/scheduled/posted). " +
    "Pick the items that best answer the question and rank them most-relevant first. " +
    "Consider priority flags, deadlines, and how far along each item is. " +
    "Reply with ONLY a JSON object, no prose, no markdown fences: " +
    '{"answer": "<one or two warm, encouraging sentences>", "item_ids": ["<id>", ...]}. ' +
    "Use only ids that appear in the provided list. If nothing fits, return an empty item_ids array.";

  const userMsg =
    `QUESTION:\n${question}\n\nITEMS (JSON):\n${JSON.stringify(compact)}`;

  let aiRes: Response;
  try {
    aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
  } catch (e) {
    return json({ error: "AI request failed: " + String(e) }, 502);
  }

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return json({ error: `AI error ${aiRes.status}`, detail }, 502);
  }

  const aiJson = await aiRes.json();
  const text = (aiJson?.content?.[0]?.text || "").trim();

  // Be forgiving: strip accidental fences, grab the first {...} block.
  let parsed: { answer?: string; item_ids?: string[] } = {};
  try {
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    // Fall back to returning the raw answer with no ranked items.
    return json({ answer: text || "I couldn't parse a clean answer.", items: [] });
  }

  // ---- 5. Join ranked ids back to the full rows, preserving order ----
  const byId = new Map(items.map((it) => [it.id, it]));
  const ranked = (parsed.item_ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean);

  return json({ answer: parsed.answer || "", items: ranked });
});
