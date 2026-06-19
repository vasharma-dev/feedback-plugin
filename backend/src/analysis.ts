// AI feedback analysis: a one-line summary, a module/area, and duplicate detection — so the
// SAME issue reported with different wording gets grouped instead of piling up.
//
// Uses an OpenAI-compatible chat endpoint (Qwen via DashScope, or a local Ollama) when configured;
// otherwise falls back to a word-overlap heuristic so it still works offline + in the smoke test.

import { ai, isAiConfigured } from "./config.js";

export interface Candidate {
  id: string;
  message: string;
}

export interface Analysis {
  matchId: string | null; // an existing feedback id this duplicates, or null
  summary: string; // one short sentence
  module: string; // short area/module name
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);

/** Word-overlap (Jaccard) duplicate detection — the no-AI fallback. */
function heuristic(message: string, candidates: Candidate[]): Analysis {
  const a = new Set(norm(message));
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const b = new Set(norm(c.message));
    const inter = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    const score = union ? inter / union : 0;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const words = message.trim().split(/\s+/);
  return {
    matchId: bestScore >= 0.5 && best ? best.id : null,
    summary: words.slice(0, 10).join(" ") + (words.length > 10 ? "…" : ""),
    module: "general",
  };
}

function parseJson(text: string): Partial<Analysis> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Ask the model to summarize the new feedback and match it to an existing one (if any). */
async function withAi(message: string, type: string, candidates: Candidate[]): Promise<Analysis> {
  const list = candidates.map((c) => `- ${c.id}: ${c.message}`).join("\n") || "(none)";
  const sys =
    "You triage product feedback. Given a NEW item and EXISTING open items, decide if the new one " +
    "describes the SAME underlying issue as one of them (wording may differ; judge by meaning + module). " +
    'Reply ONLY compact JSON: {"matchId": <existing id or null>, "summary": "<one short sentence>", "module": "<short area>"}.';
  const user = `Type: ${type}\nNEW: ${message}\n\nEXISTING:\n${list}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${ai.apiUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ai_${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = parseJson(content);
    if (!parsed) throw new Error("ai_unparseable");
    const validId = candidates.some((c) => c.id === parsed.matchId) ? (parsed.matchId as string) : null;
    return {
      matchId: validId,
      summary: (parsed.summary || "").toString().slice(0, 200) || heuristic(message, []).summary,
      module: (parsed.module || "general").toString().slice(0, 40),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Analyze a new feedback against candidates — never throws (falls back to the heuristic). */
export async function analyzeFeedback(
  message: string,
  type: string,
  candidates: Candidate[]
): Promise<Analysis> {
  if (!isAiConfigured()) return heuristic(message, candidates);
  try {
    return await withAi(message, type, candidates);
  } catch {
    return heuristic(message, candidates); // AI down/slow → degrade gracefully
  }
}
