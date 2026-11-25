/**
 * api-gate.ts — SERVER-SIDE entitlement verifier template for Vercel api/ routes.
 *
 * ⚠️  NOT imported by client code. An integrator COPIES this file into the
 * app's api/ folder as `api/_gate.ts` (the leading underscore keeps Vercel
 * from treating it as a route) and calls requireEntitlement() at the top of
 * each generation route. See README-INTEGRATION.md.
 *
 * v2 (Nov 5, 2026): the check is BY APP ID under the seasons + picks model
 * decided by Keith (see src/entitlement-core.ts, whose logic is duplicated
 * below — server code must not import client code, so this file is
 * self-contained; KEEP THE TWO IN SYNC). Call it with the app's catalog id:
 *
 *   const gate = await requireEntitlement(req, "ai-cfo");
 *
 * Passing a v1 tier id ("growth") still works as a COARSE legacy check
 * (holds that season or higher, any size) for call sites not yet updated —
 * it cannot verify picks, so prefer the app id.
 *
 * Zero new dependencies:
 *   - Firebase ID tokens are verified by hand: fetch Google's securetoken
 *     x509 certificates (cached), verify the RS256 signature with
 *     node:crypto, then check aud / iss / exp.
 *   - The user's entitlement is read from the Firestore REST API, using the
 *     caller's own ID token as the Bearer token (Firestore rules let a user
 *     read their own users/{uid} doc, so no service account is needed).
 *
 * Dormant by default: unless env GATE_ENFORCE === "1", requireEntitlement
 * always returns ok. Set GATE_ENFORCE=1 in Vercel only when you are ready
 * for the route to actually reject unentitled callers.
 */
import { createVerify } from "node:crypto";

// ---------------------------------------------------------------------------
// Season/picks model — SERVER COPY. KEEP IN SYNC with powerties-catalog.ts
// (SEASON_POOLS / PICKABLE_POOLS / PERSONAL_APP_IDS / FREE_APP_IDS) and
// src/entitlement-core.ts (evaluation order + the v1 migration shim).
// ---------------------------------------------------------------------------
type SeasonId = "startup" | "growth" | "legacy";
type SizeId = "small" | "medium" | "large";
type TierId = "free" | "startup" | "growth" | "legacy" | "personal";

const SEASONS: SeasonId[] = ["startup", "growth", "legacy"];
const SPINE_APP_ID = "overwatch-dashboard";
const FREE_APP_IDS: string[] = ["mlot"];

const PICKABLE_POOLS: Record<SeasonId, string[]> = {
  startup: [
    "ai-business-plan-generator",
    "branding-intelligence",
    "website-strategist-ai",
    "ai-gtm-expert",
    "lead-finder-pro",
    "ai-business-toolkit-explorer",
    "video-package-studio",
  ],
  growth: [
    "mlot-pro",
    "ai-plan-builder",
    "business-architect",
    "ai-cfo",
    "linkedin-tools",
    "analyst",
    "futurist",
    "reviews",
    "hiring-scorecard",
    "customer-retention",
    "outreach-referral-builder",
  ],
  legacy: ["succession-builder", "exit-readiness", "business-architect"],
};

const PERSONAL_APP_IDS: string[] = [
  "warrior-25",
  "true-fitness-eval",
  "total-health-os",
  "sensible-plate",
  "blind-spot-profiler",
  "360-personal-value-review",
  "pattern-analysis-engine",
  "life-purpose-architect",
  "guild-ascend",
  "curriculum-architect",
  "wealth-leadership-academy",
];

interface SeasonHold {
  size: SizeId;
  picks: string[];
  lastPickChangeAt: string | null;
}

interface ServerEntitlement {
  plan?: TierId;
  status: string;
  trialEnds: string | null;
  trialSeason?: SeasonId;
  seasons?: Partial<Record<SeasonId, SeasonHold | null>>;
  bundleSize?: SizeId | null;
  personal?: { active: boolean; addon: boolean };
  oneTime?: Record<string, { purchasedAt: string; consumedAt: string | null; creditUntil: string }>;
  compPicks?: Array<{ season: SeasonId; appId: string; expiresAt: string; source: string }>;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function isV2(ent: ServerEntitlement): boolean {
  return ent.seasons !== undefined || ent.personal !== undefined;
}

function largeHold(season: SeasonId): SeasonHold {
  return { size: "large", picks: [...PICKABLE_POOLS[season]], lastPickChangeAt: null };
}

/** v1 → v2 migration shim — same contract as entitlement-core.ts. */
function migrateV1(ent: ServerEntitlement): ServerEntitlement {
  if (isV2(ent)) return ent;
  const seasons: Partial<Record<SeasonId, SeasonHold | null>> = {
    startup: null,
    growth: null,
    legacy: null,
  };
  let personal = { active: false, addon: false };
  switch (ent.plan) {
    case "startup":
      seasons.startup = largeHold("startup");
      break;
    case "growth":
      seasons.startup = largeHold("startup");
      seasons.growth = largeHold("growth");
      break;
    case "legacy":
      seasons.startup = largeHold("startup");
      seasons.growth = largeHold("growth");
      seasons.legacy = largeHold("legacy");
      personal = { active: true, addon: false };
      break;
    case "personal":
      personal = { active: true, addon: false };
      break;
    default:
      break;
  }
  return { ...ent, seasons, bundleSize: null, personal };
}

function effectiveHold(ent: ServerEntitlement, season: SeasonId): SeasonHold | null {
  const own = ent.seasons?.[season] ?? null;
  if (ent.bundleSize) {
    return {
      size: ent.bundleSize,
      picks: own?.picks ?? [],
      lastPickChangeAt: own?.lastPickChangeAt ?? null,
    };
  }
  return own;
}

function isTrialLive(ent: ServerEntitlement, nowMs: number): boolean {
  if (ent.status !== "trial") return false;
  const ends = parseTime(ent.trialEnds);
  return ends !== null && ends > nowMs;
}

function statusAllowsPaidAccess(ent: ServerEntitlement, nowMs: number): boolean {
  if (ent.status === "active") return true;
  if (ent.status === "trial") return isTrialLive(ent, nowMs);
  return false;
}

function seasonPoolIncludes(season: SeasonId, appId: string): boolean {
  return (
    PICKABLE_POOLS[season].includes(appId) ||
    (appId === SPINE_APP_ID && season === "startup")
  );
}

/** The v2 access decision — mirrors entitlement-core.ts isEntitledToApp. */
function isEntitledToApp(
  rawEnt: ServerEntitlement,
  appId: string,
  nowMs = Date.now(),
): boolean {
  if (FREE_APP_IDS.includes(appId)) return true;
  const ent = migrateV1(rawEnt);

  const credit = ent.oneTime?.[appId];
  if (credit && !credit.consumedAt) return true;

  if (!statusAllowsPaidAccess(ent, nowMs)) return false;

  if (ent.status === "trial") {
    const grantSeason = ent.trialSeason ?? "growth";
    const idx = SEASONS.indexOf(grantSeason);
    return SEASONS.slice(0, idx + 1).some((s) => seasonPoolIncludes(s, appId));
  }

  if (PERSONAL_APP_IDS.includes(appId)) {
    return ent.personal?.active === true;
  }

  if (appId === SPINE_APP_ID) {
    return effectiveHold(ent, "startup") !== null;
  }

  for (const season of SEASONS) {
    const hold = effectiveHold(ent, season);
    if (!hold) continue;
    if (!seasonPoolIncludes(season, appId)) continue;
    if (hold.size === "large") return true;
    if (hold.picks.includes(appId)) return true;
  }

  return (ent.compPicks ?? []).some(
    (c) => c.appId === appId && (parseTime(c.expiresAt) ?? 0) > nowMs,
  );
}

/** Coarse v1-tier fallback: holds the named season (or higher / Personal),
 *  any size, with live paid access. Cannot verify picks. */
function tierFallbackAllows(rawEnt: ServerEntitlement, tier: TierId): boolean {
  const ent = migrateV1(rawEnt);
  const nowMs = Date.now();
  if (tier === "free") return true;
  if (!statusAllowsPaidAccess(ent, nowMs)) return false;
  if (ent.status === "trial") {
    const grantSeason = ent.trialSeason ?? "growth";
    if (tier === "personal") return false;
    return SEASONS.indexOf(grantSeason) >= SEASONS.indexOf(tier as SeasonId);
  }
  if (tier === "personal") return ent.personal?.active === true;
  const need = SEASONS.indexOf(tier as SeasonId);
  return SEASONS.some(
    (s, i) => i >= need && effectiveHold(ent, s) !== null,
  );
}

/** Display label for the result's `plan` field (compat with v1 callers). */
function displayPlan(rawEnt: ServerEntitlement): TierId {
  const ent = migrateV1(rawEnt);
  if (ent.status === "trial") {
    return isTrialLive(ent, Date.now()) ? (ent.trialSeason ?? "growth") : "free";
  }
  const rank: Record<SeasonId, number> = { startup: 1, growth: 2, legacy: 3 };
  let best: TierId = "free";
  let bestRank = 0;
  for (const s of SEASONS) {
    if (effectiveHold(ent, s) !== null && rank[s] > bestRank) {
      bestRank = rank[s];
      best = s;
    }
  }
  if (best === "free" && ent.personal?.active) return "personal";
  return best;
}

function isTierId(value: string): value is TierId {
  return (
    value === "free" ||
    value === "startup" ||
    value === "growth" ||
    value === "legacy" ||
    value === "personal"
  );
}

// ---------------------------------------------------------------------------
// Request / result shapes (framework-agnostic: works with Vercel's Node
// req objects and with fetch-style Requests)
// ---------------------------------------------------------------------------
export interface GateRequest {
  headers:
    | Record<string, string | string[] | undefined>
    | { get(name: string): string | null };
}

export type RequireEntitlementResult =
  | { ok: true; uid: string | null; plan: TierId }
  | { ok: false; status: number; body: { error: string } };

function fail(status: number, error: string): RequireEntitlementResult {
  return { ok: false, status, body: { error } };
}

function getHeader(req: GateRequest, name: string): string | null {
  const headers = req.headers as { get?: unknown };
  if (typeof headers.get === "function") {
    return (headers.get as (n: string) => string | null).call(req.headers, name);
  }
  const record = req.headers as Record<string, string | string[] | undefined>;
  const value = record[name] ?? record[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function projectId(): string {
  return process.env.FIREBASE_PROJECT_ID || "mlot-analyzer";
}

// ---------------------------------------------------------------------------
// Google securetoken certificate cache
// ---------------------------------------------------------------------------
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google token certs (${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  // Honour cache-control max-age when present; fall back to one hour.
  let maxAgeSeconds = 3600;
  const cc = res.headers.get("cache-control");
  const match = cc ? /max-age=(\d+)/.exec(cc) : null;
  if (match) maxAgeSeconds = Number.parseInt(match[1], 10);
  certCache = { certs, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  return certs;
}

// ---------------------------------------------------------------------------
// ID token verification (RS256, aud, iss, exp)
// ---------------------------------------------------------------------------
interface JwtHeader {
  alg?: string;
  kid?: string;
}
interface JwtPayload {
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

async function verifyIdToken(token: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodePart<JwtHeader>(headerPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unexpected token header");

  const certs = await getCerts();
  const certPem = certs[header.kid];
  if (!certPem) throw new Error("Unknown signing key");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  const signature = Buffer.from(signaturePart, "base64url");
  if (!verifier.verify(certPem, signature)) throw new Error("Bad signature");

  const payload = decodePart<JwtPayload>(payloadPart);
  const proj = projectId();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== proj) throw new Error("Wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${proj}`) {
    throw new Error("Wrong issuer");
  }
  if (!payload.exp || payload.exp <= nowSeconds) throw new Error("Token expired");
  if (!payload.sub) throw new Error("Token has no subject");
  return payload;
}

// ---------------------------------------------------------------------------
// Entitlement read via Firestore REST (caller's ID token as Bearer)
// ---------------------------------------------------------------------------

/** Decode one Firestore REST typed value into plain JS. */
function decodeFirestoreValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, fv] of Object.entries(fields)) out[k] = decodeFirestoreValue(fv);
    return out;
  }
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(decodeFirestoreValue);
  }
  return null;
}

async function readEntitlement(
  uid: string,
  idToken: string,
): Promise<ServerEntitlement> {
  const proj = projectId();
  const url =
    `https://firestore.googleapis.com/v1/projects/${proj}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) {
    // No doc yet = a free user who has not opened a gated app.
    return { status: "active", trialEnds: null };
  }
  if (!res.ok) throw new Error(`Firestore entitlement read failed (${res.status})`);
  const doc = (await res.json()) as { fields?: Record<string, unknown> };
  const plain: Record<string, unknown> = {};
  for (const [k, fv] of Object.entries(doc.fields ?? {})) {
    plain[k] = decodeFirestoreValue(fv);
  }
  return plain as unknown as ServerEntitlement;
}

// ---------------------------------------------------------------------------
// The one function routes call
// ---------------------------------------------------------------------------
/**
 * Check that the request carries a valid Firebase ID token whose user is
 * entitled to `appId` (preferred, v2) — or, as a coarse legacy fallback,
 * to a v1 tier id.
 *
 * Usage in a Vercel api route:
 *   const gate = await requireEntitlement(req, "ai-cfo");
 *   if (!gate.ok) return res.status(gate.status).json(gate.body);
 *   // ... gate.uid / gate.plan for the verified caller
 */
export async function requireEntitlement(
  req: GateRequest,
  appIdOrTier: string,
): Promise<RequireEntitlementResult> {
  // Dormant unless explicitly switched on.
  if (process.env.GATE_ENFORCE !== "1") {
    return { ok: true, uid: null, plan: "free" };
  }

  const authorization = getHeader(req, "authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return fail(401, "Sign in required.");
  }
  const idToken = authorization.slice("Bearer ".length).trim();

  let payload: JwtPayload;
  try {
    payload = await verifyIdToken(idToken);
  } catch {
    return fail(401, "Sign in required.");
  }
  const uid = payload.sub as string;

  try {
    const ent = await readEntitlement(uid, idToken);
    const allowed = isTierId(appIdOrTier)
      ? tierFallbackAllows(ent, appIdOrTier)
      : isEntitledToApp(ent, appIdOrTier);
    if (!allowed) {
      return fail(403, "Your plan does not include this tool.");
    }
    return { ok: true, uid, plan: displayPlan(ent) };
  } catch {
    // Fail closed on entitlement errors while enforcing — but with a 503,
    // so clients can tell "you are not allowed" apart from "try again".
    return fail(503, "Could not check your plan. Please try again.");
  }
}
