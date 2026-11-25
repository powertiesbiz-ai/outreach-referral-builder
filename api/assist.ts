import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireEntitlement } from "./_gate.js";

/**
 * POST /api/assist — the Outreach and Referral Builder's AI endpoint.
 *
 * One route for the shared engine's three AI jobs (design Section 2):
 *   kind "consult"  → the consultant's follow-up questions
 *   kind "research" → the research leg: resources WITH cited sources
 *   kind "enrich"   → one person's public business contact information
 *
 * The model is pinned (gemini-3.8-flash); no other model is substituted
 * silently. The gate check is fail-closed: while GATE_ENFORCE=1, a
 * caller without Growth access to this app gets a 403, and any
 * entitlement error answers 503 rather than letting the call through.
 * When the model key is not configured the route answers 500, exactly
 * like the other hub apps' generation routes, and the client falls back
 * to its built-in standing content and says so.
 *
 * Nothing the owner sends here is stored: the request is answered and
 * forgotten. Contact data appears only inside an "enrich" request the
 * owner themselves initiated, for a person on their own list.
 */

const MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 20_000;

function extractJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

function buildPrompt(kind: string, payload: Record<string, unknown>): string {
  if (kind === "consult") {
    return `You are the consultant inside the Outreach and Referral Builder, a PowerTies design tool for small business owners. The owner is answering design questions. Read their answers and return the follow-up questions a good consultant would ask when an answer is thin, risky, or unmeasurable. Name each risk in plain words. Never invent figures. Never promise earnings or results. Return ONLY JSON of the form {"followUps": ["...", "..."]} with at most 5 short plain-language follow-ups.

Context: ${JSON.stringify(payload.context ?? "")}
Answers: ${JSON.stringify(payload.answers ?? {})}`;
  }
  if (kind === "research") {
    return `You are the research leg of the Outreach and Referral Builder, a PowerTies design tool. Find the resources that fit the owner's exact setup described below: their payment platform's own referral/tracking features and limits, link and QR card tools where relevant, the FTC disclosure rule for paid referrals, and the US 1099 basics for referral rewards. Return ONLY JSON of the form {"items": [{"claim": "...", "source": "..."}]} with at most 8 items. Every claim must carry the source it came from (a publication or official page name). If you cannot support a claim with a source, leave it out — an honest gap is required, never an invented feature or rule. State tax and legal points as information, never as legal advice.

Topic: ${JSON.stringify(payload.topic ?? "")}
Setup: ${JSON.stringify(payload.setup ?? {})}`;
  }
  // enrich
  return `You are the enrichment pass of the Outreach and Referral Builder. Find the PUBLIC BUSINESS contact information for the person named below: a business email, a business phone, a business social profile — only what they publish for doing business. Never return personal or private contact details. Never guess an email pattern and present it as found; if all you can offer is a pattern guess, mark it with "guessed": true and say the source is "pattern guess". Return ONLY JSON of the form {"email": {"value": "...", "source": "...", "guessed": false}, "phone": {"value": "...", "source": "..."}, "socialProfile": {"value": "...", "source": "..."}} including only the fields you genuinely found; return {} if you found nothing solid.

Name: ${JSON.stringify(payload.name ?? "")}
Company: ${JSON.stringify(payload.company ?? "")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gate = await requireEntitlement(req, "outreach-referral-builder");
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  let body: unknown = req.body ?? {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }
  const record = body as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : "";
  if (!["consult", "research", "enrich"].includes(kind)) {
    return res.status(400).json({ error: "kind must be consult, research, or enrich." });
  }
  const payload =
    typeof record.payload === "object" && record.payload !== null
      ? (record.payload as Record<string, unknown>)
      : {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let text = "";
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(kind, payload) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!resp.ok) {
      console.error("Assist upstream error:", resp.status);
      return res.status(502).json({ error: "assist unavailable" });
    }
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    text =
      data?.candidates?.[0]?.content?.parts?.map((pt) => pt.text || "").join("") || "";
  } catch (e) {
    console.error("Assist call failed:", e instanceof Error ? e.name : e);
    return res.status(502).json({ error: "assist unavailable" });
  } finally {
    clearTimeout(timeout);
  }

  if (!text) return res.status(502).json({ error: "assist unavailable" });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return res.status(502).json({ error: "assist unavailable" });
  }
  return res.status(200).json(parsed);
}
