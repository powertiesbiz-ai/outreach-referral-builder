/**
 * entitlement-core.ts — the v2 entitlement model: PURE LOGIC ONLY.
 *
 * No Firebase, no I/O, no imports beyond the catalog's data. This file is
 * the single implementation of the decided packaging model (Keith,
 * Nov 5, 2026); entitlement.ts wraps it with Firestore reads/writes, and
 * api-gate.ts carries a server copy kept in sync (see that file's header).
 *
 * THE MODEL
 *   - Seasons: startup (8 apps), growth (9 paid apps; MLOT is the free
 *     front door), legacy (3 apps). Personal is a standalone track.
 *   - Sizes change price AND app count, as per-customer PICKS:
 *     startup/growth Small = 2, Medium = 4, Large = all;
 *     legacy Small = 1, Medium = 2, Large = all 3.
 *   - The Overwatch dashboard is the tracking SPINE: always included
 *     with any Startup season (or bundle), never counted as a pick.
 *   - A bundle is all three seasons at one size (bundleSize).
 *   - Personal: standalone $19, or a $9 add-on bought with any season or
 *     bundle. Personal is NOT included in Legacy (D4 — reverses v1).
 *   - One-time purchases grant a single run of an app OUTSIDE the
 *     customer's picks (an unconsumed credit), and the purchase price
 *     credits toward a season subscription for 30 days (D3 — the
 *     creditUntil field records that window).
 *   - Session grants: $99 session = Growth access for 30 days, $650 =
 *     90 days, via the v1 trial pattern (status "trial" + trialEnds).
 *     Per the documented session contract, a Growth trial opens ALL
 *     Startup + Growth pool apps (not just picks).
 *   - Support make-good: a comp pick — one extra app in a season until
 *     the end of the current pay period — recorded in compPicks with
 *     source "make-good" and an expiry.
 *
 * users/{uid} v2 shape (v1 scalar fields kept; `plan` is now OPTIONAL —
 * present on v1 docs and on fresh free docs, absent on pure v2 docs):
 *   {
 *     email, displayName, status, trialEnds, genCap, source, updatedAt,
 *     plan?: TierId,                                  // v1 only / display
 *     trialSeason?: SeasonId,                         // session grants
 *     seasons: { startup: SeasonHold|null, growth: SeasonHold|null,
 *                legacy: SeasonHold|null },
 *     bundleSize: SizeId | null,
 *     personal: { active: boolean, addon: boolean },
 *     oneTime: { [appId]: { purchasedAt, consumedAt: string|null,
 *                           creditUntil } },
 *     compPicks: [{ season, appId, expiresAt, source }],
 *     pickHistory: [{ at, season, from, to, by }],
 *     billingCycleStart: string | null,               // bridge-written
 *     cancelAtPeriodEnd?: boolean, periodEndsAt?: string | null,
 *   }
 *   SeasonHold = { size: SizeId, picks: string[],
 *                  lastPickChangeAt: string | null }
 *
 * Writers: the Square webhook bridge writes seasons/bundleSize/personal/
 * status/oneTime (server-side, admin SDK). Session grants and make-goods
 * are written by Tank's tooling (source "session-grant" / "make-good").
 * The customer writes ONLY their picks (see firestore.rules).
 */
import {
  FREE_APP_IDS,
  PERSONAL_APP_IDS,
  PICKABLE_POOLS,
  PICK_ALLOWANCE,
  SEASONS,
  SPINE_APP_ID,
  SPINE_SEASON,
  type SeasonId,
  type SizeId,
  type TierId,
} from "../powerties-catalog";

export type { SeasonId, SizeId };

export type EntitlementStatus = "active" | "trial" | "past_due" | "canceled";
export type EntitlementSource = "square" | "session-grant" | "manual" | "free";

export interface SeasonHold {
  size: SizeId;
  picks: string[];
  lastPickChangeAt: string | null;
}

export interface PersonalHold {
  active: boolean;
  addon: boolean;
}

export interface OneTimeCredit {
  purchasedAt: string;
  consumedAt: string | null;
  /** D3: the unconsumed purchase price credits toward a season
   *  subscription until this date (purchase + 30 days). */
  creditUntil: string;
}

export interface CompPick {
  season: SeasonId;
  appId: string;
  expiresAt: string;
  source: "make-good";
}

export type PickChangeBy = "customer" | "support" | "system";

export interface PickHistoryEntry {
  at: string;
  season: SeasonId;
  from: string[];
  to: string[];
  by: PickChangeBy;
}

export interface Entitlement {
  email: string;
  displayName: string | null;
  /** v1 blanket tier. Optional in v2 — see migrateV1(). */
  plan?: TierId;
  status: EntitlementStatus;
  trialEnds: string | null;
  /** Season a live trial grants (session grants). Default "growth". */
  trialSeason?: SeasonId;
  genCap: number | null;
  source: EntitlementSource | "stripe"; // "stripe" appears on stale v1 docs
  updatedAt: string;
  seasons?: Partial<Record<SeasonId, SeasonHold | null>>;
  bundleSize?: SizeId | null;
  personal?: PersonalHold;
  oneTime?: Record<string, OneTimeCredit>;
  compPicks?: CompPick[];
  pickHistory?: PickHistoryEntry[];
  /** Start of the current Square billing cycle (bridge-written); the
   *  once-per-cycle pick rule is measured from lastPickChangeAt vs this. */
  billingCycleStart?: string | null;
  cancelAtPeriodEnd?: boolean;
  periodEndsAt?: string | null;
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function isTrialLive(ent: Entitlement, now = new Date()): boolean {
  if (ent.status !== "trial") return false;
  const ends = parseTime(ent.trialEnds);
  return ends !== null && ends > now.getTime();
}

/** Does this doc carry the v2 fields (vs a v1 plan-only doc)? */
export function isV2(ent: Entitlement): boolean {
  return ent.seasons !== undefined || ent.personal !== undefined;
}

/** Paid access of any kind is live: an active subscription, or a trial
 *  whose end is still ahead. past_due and canceled do not allow access
 *  (v1 behaviour kept). Free apps and unconsumed one-time credits are
 *  handled separately in isEntitledToApp. */
export function statusAllowsPaidAccess(ent: Entitlement, now = new Date()): boolean {
  if (ent.status === "active") return true;
  if (ent.status === "trial") return isTrialLive(ent, now);
  return false;
}

// ---------------------------------------------------------------------------
// v1 → v2 migration shim
//
// v1 docs carry only `plan`. v1's contract was blanket access, so the
// shim synthesizes exactly what the customer was promised:
//   startup → Startup season, Large (all pickable apps as picks)
//   growth  → Startup + Growth, Large
//   legacy  → all three seasons, Large, PLUS Personal active
//             (v1 included Personal in Legacy; D4 reverses that for NEW
//             sales, but a v1 legacy doc keeps what it was sold)
//   personal → Personal active (standalone)
// Synthesized picks are the full pickable pool at size "large", so the
// synthesized holds pass validatePicks cleanly.
// ---------------------------------------------------------------------------

function largeHold(season: SeasonId): SeasonHold {
  return { size: "large", picks: [...PICKABLE_POOLS[season]], lastPickChangeAt: null };
}

export function migrateV1(ent: Entitlement): Entitlement {
  if (isV2(ent)) return ent;
  const seasons: Partial<Record<SeasonId, SeasonHold | null>> = {
    startup: null,
    growth: null,
    legacy: null,
  };
  let personal: PersonalHold = { active: false, addon: false };
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
      break; // free / missing → nothing held
  }
  return {
    ...ent,
    seasons,
    bundleSize: null,
    personal,
    oneTime: ent.oneTime ?? {},
    compPicks: ent.compPicks ?? [],
    pickHistory: ent.pickHistory ?? [],
    billingCycleStart: ent.billingCycleStart ?? null,
  };
}

/** Normalize any stored doc (v1 or v2) into a fully-shaped v2 view. */
export function normalizeEntitlement(ent: Entitlement): Entitlement {
  const migrated = migrateV1(ent);
  return {
    ...migrated,
    seasons: {
      startup: migrated.seasons?.startup ?? null,
      growth: migrated.seasons?.growth ?? null,
      legacy: migrated.seasons?.legacy ?? null,
    },
    bundleSize: migrated.bundleSize ?? null,
    personal: migrated.personal ?? { active: false, addon: false },
    oneTime: migrated.oneTime ?? {},
    compPicks: migrated.compPicks ?? [],
    pickHistory: migrated.pickHistory ?? [],
    billingCycleStart: migrated.billingCycleStart ?? null,
  };
}

// ---------------------------------------------------------------------------
// Season access
// ---------------------------------------------------------------------------

/** The effective hold for a season: the bundle (if any) wins, else the
 *  season's own hold. A bundle hold's picks are the customer's recorded
 *  picks for that season (pick state survives bundle/season switches —
 *  the bridge preserves the seasons map when it sets bundleSize). */
export function effectiveHold(
  ent: Entitlement,
  season: SeasonId,
): SeasonHold | null {
  const norm = normalizeEntitlement(ent);
  const own = norm.seasons?.[season] ?? null;
  if (norm.bundleSize) {
    return {
      size: norm.bundleSize,
      picks: own?.picks ?? [],
      lastPickChangeAt: own?.lastPickChangeAt ?? null,
    };
  }
  return own;
}

export function holdsSeason(ent: Entitlement, season: SeasonId): boolean {
  return effectiveHold(ent, season) !== null;
}

/** Seasons at or below `season` in business order (startup < growth <
 *  legacy) — used ONLY for trial/session-grant evaluation, whose
 *  documented contract is cumulative. Paid seasons are NOT cumulative
 *  under the picks model. */
export function seasonsUpTo(season: SeasonId): SeasonId[] {
  const idx = SEASONS.indexOf(season);
  return SEASONS.slice(0, idx + 1);
}

// ---------------------------------------------------------------------------
// The access question
// ---------------------------------------------------------------------------

/**
 * Is this user entitled to this app right now? (v2 — the decided model.)
 *
 * Order of checks:
 *   1. Free apps (MLOT): yes for any signed-in user's doc, any status —
 *      the generation cap governs use, not the gate.
 *   2. Unconsumed one-time credit for this app: yes, regardless of
 *      subscription status — a single run was bought outright and a
 *      lapsed subscription does not confiscate it.
 *   3. Everything else needs live paid access (active, or a live trial).
 *   4. Live trial (session grant): all apps in the trial season's pool
 *      and every season below it (the documented session contract).
 *   5. Personal apps: personal.active (standalone or add-on). Legacy
 *      does NOT confer Personal (D4).
 *   6. The spine: included whenever the Startup season is held (directly
 *      or via a bundle).
 *   7. Season apps: the app is in a held season's access set — all
 *      pickable apps at Large; the recorded picks at Small/Medium —
 *      or an unexpired comp pick covers it.
 */
export function isEntitledToApp(
  ent: Entitlement | null | undefined,
  appId: string,
  now = new Date(),
): boolean {
  if (!ent) return false;
  if (FREE_APP_IDS.includes(appId)) return true;

  const norm = normalizeEntitlement(ent);

  const credit = norm.oneTime?.[appId];
  if (credit && !credit.consumedAt) return true;

  if (!statusAllowsPaidAccess(norm, now)) return false;

  if (norm.status === "trial") {
    const grantSeason = norm.trialSeason ?? "growth";
    return seasonsUpTo(grantSeason).some((season) =>
      seasonPoolIncludes(season, appId),
    );
  }

  if (PERSONAL_APP_IDS.includes(appId)) {
    return norm.personal?.active === true;
  }

  if (appId === SPINE_APP_ID) {
    return holdsSeason(norm, SPINE_SEASON);
  }

  for (const season of SEASONS) {
    const hold = effectiveHold(norm, season);
    if (!hold) continue;
    if (!seasonPoolIncludes(season, appId)) continue;
    if (hold.size === "large") return true;
    if (hold.picks.includes(appId)) return true;
  }

  const comp = (norm.compPicks ?? []).some(
    (c) =>
      c.appId === appId &&
      (parseTime(c.expiresAt) ?? 0) > now.getTime(),
  );
  if (comp) return true;

  return false;
}

function seasonPoolIncludes(season: SeasonId, appId: string): boolean {
  return PICKABLE_POOLS[season].includes(appId) || appId === SPINE_APP_ID && season === SPINE_SEASON;
}

// ---------------------------------------------------------------------------
// Display plan (compat for AccountBar / genGuard — NOT an access rule)
// ---------------------------------------------------------------------------

const SEASON_DISPLAY_RANK: Record<SeasonId, number> = {
  startup: 1,
  growth: 2,
  legacy: 3,
};

/**
 * The single plan label shown in the account bar and used by the free
 * generation cap: the highest season held, else Personal, else Free.
 * An expired trial reads as Free (v1 behaviour).
 */
export function effectivePlan(ent: Entitlement | null | undefined): TierId {
  if (!ent) return "free";
  const norm = normalizeEntitlement(ent);
  if (norm.status === "trial") {
    if (!isTrialLive(norm)) return "free";
    return norm.trialSeason ?? "growth";
  }
  if (!statusAllowsPaidAccess(norm)) {
    // Keep the label of what they hold while past_due (they still "have"
    // the plan; access is what pauses). Canceled reads as what remains.
    if (norm.status === "canceled") return "free";
  }
  let best: TierId = "free";
  let bestRank = 0;
  for (const season of SEASONS) {
    if (holdsSeason(norm, season) && SEASON_DISPLAY_RANK[season] > bestRank) {
      bestRank = SEASON_DISPLAY_RANK[season];
      best = season;
    }
  }
  if (best === "free" && norm.personal?.active) return "personal";
  if (best === "free" && !isV2(ent) && ent.plan) return ent.plan;
  return best;
}

// ---------------------------------------------------------------------------
// Pick rules
// ---------------------------------------------------------------------------

/** How many picks this season + size allows (the whole pickable pool at
 *  Large). */
export function pickAllowance(season: SeasonId, size: SizeId): number {
  const rule = PICK_ALLOWANCE[season][size];
  return rule === null ? PICKABLE_POOLS[season].length : rule;
}

export interface PickValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a proposed pick list for a season + size:
 *   - every pick is in the season's pickable pool (the spine is NOT
 *     pickable — it is always included and never counts);
 *   - no duplicates;
 *   - count within the size's allowance (under is fine, over is not).
 */
export function validatePicks(
  season: SeasonId,
  size: SizeId,
  picks: string[],
): PickValidation {
  const errors: string[] = [];
  const pool = PICKABLE_POOLS[season];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (pick === SPINE_APP_ID) {
      errors.push(
        `${SPINE_APP_ID} is always included and never counts as a pick.`,
      );
      continue;
    }
    if (!pool.includes(pick)) {
      errors.push(`${pick} is not in the ${season} season.`);
    }
    if (seen.has(pick)) errors.push(`${pick} is picked twice.`);
    seen.add(pick);
  }
  const allowance = pickAllowance(season, size);
  if (picks.length > allowance) {
    errors.push(
      `${season} ${size} allows ${allowance} pick(s); ${picks.length} given.`,
    );
  }
  return { ok: errors.length === 0, errors };
}

/**
 * May this hold's picks change now? Customers: once per billing cycle —
 * a change is allowed when no customer change has landed since the
 * current cycle started (billingCycleStart, written by the bridge).
 * When the cycle start is unknown, allow (fail-open for the customer;
 * the bridge writes it from the first webhook onward). Support and
 * system changes always bypass (support corrections per SUPPORT-FLOW.md).
 */
export function canChangePicks(
  ent: Entitlement,
  season: SeasonId,
  opts: { by?: PickChangeBy; now?: Date } = {},
): boolean {
  const by = opts.by ?? "customer";
  if (by === "support" || by === "system") return true;
  const hold = effectiveHold(ent, season);
  if (!hold) return false;
  if (!hold.lastPickChangeAt) return true;
  const cycleStart = parseTime(normalizeEntitlement(ent).billingCycleStart);
  if (cycleStart === null) return true;
  const last = parseTime(hold.lastPickChangeAt);
  if (last === null) return true;
  return last < cycleStart;
}

/** The apps a hold currently opens (spine handled separately). */
export function holdApps(hold: SeasonHold, season: SeasonId): string[] {
  if (hold.size === "large") return [...PICKABLE_POOLS[season]];
  return hold.picks.filter((id) => PICKABLE_POOLS[season].includes(id));
}

export interface PickChangeResult {
  ok: boolean;
  errors: string[];
  /** The full seasons map to write (only this season's hold changed). */
  seasons?: Partial<Record<SeasonId, SeasonHold | null>>;
  /** The pickHistory entry to append. */
  historyEntry?: PickHistoryEntry;
}

/**
 * Compute a pick change (the hub picker writes the result; support
 * tooling reuses it with by: "support"). Validates the picks, enforces
 * the once-per-cycle rule for customers, and preserves the season's
 * size and the other seasons untouched. Under a bundle, the season's
 * size comes from the bundle — the picks are still recorded per season.
 */
export function applyPickChange(
  ent: Entitlement,
  season: SeasonId,
  picks: string[],
  opts: { by?: PickChangeBy; now?: Date } = {},
): PickChangeResult {
  const by = opts.by ?? "customer";
  const now = opts.now ?? new Date();
  const norm = normalizeEntitlement(ent);
  const hold = effectiveHold(norm, season);
  if (!hold) {
    return { ok: false, errors: [`No ${season} season on this account.`] };
  }
  const validation = validatePicks(season, hold.size, picks);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  if (!canChangePicks(norm, season, { by, now })) {
    return {
      ok: false,
      errors: ["Picks were already changed this billing cycle."],
    };
  }
  // The bridge materializes a stored hold for every held season (under a
  // bundle, one per season at the bundle size), so a stored hold exists
  // here; its size is preserved exactly — picks and the change stamp are
  // the only things a pick change may touch (firestore.rules enforce
  // the same constraint).
  const stored = norm.seasons?.[season] ?? null;
  const nextHold: SeasonHold = {
    size: stored?.size ?? hold.size,
    picks: [...picks],
    lastPickChangeAt: now.toISOString(),
  };
  const seasons: Partial<Record<SeasonId, SeasonHold | null>> = {
    ...(norm.seasons ?? {}),
    [season]: nextHold,
  };
  return {
    ok: true,
    errors: [],
    seasons,
    historyEntry: {
      at: now.toISOString(),
      season,
      from: [...hold.picks],
      to: [...picks],
      by,
    },
  };
}
