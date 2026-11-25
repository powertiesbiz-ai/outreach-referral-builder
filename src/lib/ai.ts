/**
 * ai.ts — the client side of the shared engine's AI jobs (design
 * Section 2): the consultant's follow-ups, the research leg, and the
 * enrichment/verification assists. All calls go through /api/assist,
 * which runs the pinned model (gemini-3.8-flash) behind the gate.
 *
 * Fail-closed, never fail-silent: when the endpoint is unavailable, the
 * consultant falls back to the built-in standing follow-ups (the math
 * checks in referral.ts / partners.ts always run locally), the research
 * leg returns the honest found-nothing statement, and enrichment
 * returns nothing rather than a guess dressed as a find.
 */
import { authHeader } from "../gate/firebase";

export interface ResearchItem {
  claim: string;
  source: string;
}

async function callAssist<T>(kind: string, payload: unknown): Promise<T | null> {
  try {
    const res = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ kind, payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Sharpened consultant follow-ups. Null → the UI shows the built-in
 *  standing follow-ups from the local math checks instead. */
export async function aiConsult(
  context: string,
  answers: Record<string, unknown>,
): Promise<string[] | null> {
  const out = await callAssist<{ followUps?: string[] }>("consult", { context, answers });
  if (!out || !Array.isArray(out.followUps)) return null;
  return out.followUps.filter((s) => typeof s === "string" && s.trim()).slice(0, 6);
}

/** The research leg. An empty list is an honest answer: the report then
 *  prints the found-nothing statement rather than inventing resources. */
export async function aiResearch(
  topic: string,
  setup: Record<string, unknown>,
): Promise<ResearchItem[]> {
  const out = await callAssist<{ items?: ResearchItem[] }>("research", { topic, setup });
  if (!out || !Array.isArray(out.items)) return [];
  return out.items
    .filter((i) => i && typeof i.claim === "string" && typeof i.source === "string")
    .slice(0, 8);
}

export const RESEARCH_NOTHING_FOUND =
  "The research leg found nothing solid to cite for this setup. That gap is printed here rather than papered over: verify each platform feature and rule at build time from the platform's own documentation, and treat anything a vendor claims without a source as unproven.";

export interface EnrichmentSuggestion {
  email?: { value: string; source: string; guessed?: boolean };
  phone?: { value: string; source: string };
  socialProfile?: { value: string; source: string };
}

/** One person's enrichment assist. Personal-list people are never sent
 *  here at all — the caller checks first (people.ts enforces it again
 *  at apply time). */
export async function aiEnrich(
  name: string,
  company: string,
): Promise<EnrichmentSuggestion | null> {
  const out = await callAssist<EnrichmentSuggestion>("enrich", { name, company });
  return out ?? null;
}
