/**
 * PowerTies app catalog — SINGLE SOURCE OF TRUTH for the hub storefront and
 * every app's upgrade screen. The hub imports this file; the gate module
 * copies it per app at integration time. Edit here, re-copy on release.
 *
 * Structure (Keith, Oct 24, 2026): the storefront is organized by MLOT's six
 * parts of a business plus Personal. MLOT itself spans all six parts (it is
 * the diagnostic) and sits at the front door, above the parts.
 * Prices are never shown bare: every tier lists the ACCESS it buys —
 * which parts and apps it unlocks — tier over tier.
 *
 * DISPLAY COPY NOTE (Keith, Nov 6, 2026): the hub page renders the benefit
 * sentences in its own display map (App.tsx) — what each tool's report does
 * for the owner and the business, in plain outcome language. The `blurb`
 * fields below stay as the short feature descriptions the apps' own gate
 * and upgrade screens use; the hub does not render them. Do not "sync" the
 * two casually: entitlement logic reads ids, tiers, parts, pools, and
 * statuses from this file — never the prose.
 */

export type PartId =
  | "leadership"
  | "culture-legacy"
  | "processes"
  | "sales-marketing"
  | "customer-retention"
  | "collections"
  | "personal";

export interface Part {
  id: PartId;
  name: string;
  blurb: string;
}

export const PARTS: Part[] = [
  { id: "leadership", name: "Leadership", blurb: "Direction, decisions, and the owner's plan." },
  { id: "culture-legacy", name: "Culture & Legacy", blurb: "The people, the values, and what outlasts you." },
  { id: "processes", name: "Processes", blurb: "How the work gets done, the same way every time." },
  { id: "sales-marketing", name: "Sales & Marketing", blurb: "Getting found, getting chosen, getting bought." },
  { id: "customer-retention", name: "Customer Retention", blurb: "Keeping the customers you already won." },
  { id: "collections", name: "Collections", blurb: "The money side: getting paid and knowing your numbers." },
  { id: "personal", name: "Personal", blurb: "The owner's own growth, health, and development journey." },
];

export type TierId = "free" | "startup" | "growth" | "legacy" | "personal";

export interface Tier {
  id: TierId;
  name: string;
  monthly: number; // USD
  annual: number; // USD — two months free
  tagline: string;
}

export const TIERS: Tier[] = [
  { id: "free", name: "Free", monthly: 0, annual: 0, tagline: "The front door: see where your business is leaking money." },
  { id: "startup", name: "Startup", monthly: 29, annual: 290, tagline: "Access for a business getting its footing." },
  { id: "growth", name: "Growth", monthly: 79, annual: 790, tagline: "Access for a business ready to scale what works." },
  { id: "legacy", name: "Legacy", monthly: 149, annual: 1490, tagline: "Access to everything, including what comes after you." },
  { id: "personal", name: "Personal", monthly: 19, annual: 190, tagline: "Access to the personal development journey and health tools." },
];

/** Higher business tier always includes everything below it. Personal is
 *  its own separate track: it is NOT included in Legacy (D4, Nov 5, 2026);
 *  it is bought standalone or as a discounted add-on to any season. */
export const TIER_RANK: Record<TierId, number> = {
  free: 0,
  startup: 1,
  growth: 2,
  legacy: 3,
  personal: 1, // separate track — see planIncludes()
};

// ─────────────────────────────────────────────────────────────────────────
// SEASONS + PICKS — the decided packaging model (Keith, Nov 5, 2026).
//
// The v1 tier model above (blanket cumulative tiers) is SUPERSEDED for
// access decisions by seasons with per-customer picks. The authoritative
// evaluator is src/entitlement-core.ts (isEntitledToApp); this section is
// the shared data it runs on: which apps sit in which season's pool, and
// how many picks each size allows. The tier fields on apps remain for the
// storefront's display grouping only.
//
// Rules of the model:
//   - Startup / Growth: Small picks 2, Medium picks 4, Large = all.
//   - Legacy (a 3-app pool): Small picks 1, Medium picks 2, Large = all 3.
//   - A bundle is all three seasons at one size.
//   - The Overwatch dashboard is the tracking SPINE: always included with
//     any Startup season (or bundle), never counted as a pick, and not
//     itself pickable.
//   - Personal is a standalone track (flat, no picks) — standalone $19,
//     or a $9 add-on when bought with any season or bundle. Personal is
//     NOT included in Legacy (D4, Nov 5, 2026 — this reverses v1).
//   - Business Architect sits in BOTH the Growth pool and the Legacy
//     pool: its Legacy phase is part of Legacy (see its note in APPS).
//     A pick in either season unlocks the app.
// ─────────────────────────────────────────────────────────────────────────

export type SeasonId = "startup" | "growth" | "legacy";
export type SizeId = "small" | "medium" | "large";

export const SEASONS: SeasonId[] = ["startup", "growth", "legacy"];

/** The app id of the tracking spine (Overwatch dashboard). */
export const SPINE_APP_ID = "overwatch-dashboard";
/** The season the spine rides with. */
export const SPINE_SEASON: SeasonId = "startup";

/** Apps included with a free signed-in account. */
export const FREE_APP_IDS: string[] = ["mlot"];

/** Per-season app pools — the pickable universe for each season.
 *  The spine is listed in its season's pool for completeness but is
 *  flagged by SPINE_APP_ID and is never a pick (see PICKABLE_POOLS). */
export const SEASON_POOLS: Record<SeasonId, string[]> = {
  startup: [
    "ai-business-plan-generator",
    "branding-intelligence",
    "website-strategist-ai",
    "ai-gtm-expert",
    "lead-finder-pro",
    "ai-business-toolkit-explorer",
    "video-package-studio",
    "overwatch-dashboard", // spine — always included, never a pick
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
  legacy: [
    "succession-builder",
    "exit-readiness",
    "business-architect", // cross-listed: its Legacy phase (see APPS note)
  ],
};

/** The pools customers actually pick from (spine removed). */
export const PICKABLE_POOLS: Record<SeasonId, string[]> = {
  startup: SEASON_POOLS.startup.filter((id) => id !== SPINE_APP_ID),
  growth: [...SEASON_POOLS.growth],
  legacy: [...SEASON_POOLS.legacy],
};

/** Picks allowed per season + size. `null` = the whole pickable pool. */
export const PICK_ALLOWANCE: Record<SeasonId, Record<SizeId, number | null>> = {
  startup: { small: 2, medium: 4, large: null },
  growth: { small: 2, medium: 4, large: null },
  legacy: { small: 1, medium: 2, large: null },
};

/** Every app on the Personal track (flat access, no picks). */
export const PERSONAL_APP_IDS: string[] = [
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

/** Which season's pool an app belongs to (first match), or its track. */
export function appTrack(
  appId: string,
): SeasonId | "personal" | "free" | null {
  if (FREE_APP_IDS.includes(appId)) return "free";
  for (const season of SEASONS) {
    if (SEASON_POOLS[season].includes(appId)) return season;
  }
  if (PERSONAL_APP_IDS.includes(appId)) return "personal";
  return null;
}

export type AppStatus = "live" | "coming";

export interface CatalogApp {
  id: string; // entitlement key — matches users/{uid} access + gate config
  name: string;
  part: PartId | "front-door";
  /** Lowest tier whose access includes this app. */
  tier: TierId;
  status: AppStatus;
  url?: string; // live apps only
  blurb: string;
  /** Cross-listing note (e.g. Business Architect's Legacy phase). */
  note?: string;
  /** How this slotting was decided, for Keith's review. */
  slottedBy: "keith" | "pricing-doc" | "tank";
}

export const APPS: CatalogApp[] = [
  // ── Front door ──────────────────────────────────────────────────────────
  {
    id: "mlot",
    name: "MLOT — Money Left on the Table",
    part: "front-door",
    tier: "free",
    status: "live",
    blurb: "The diagnostic that looks across all six parts of your business and finds the money leaking out.",
    slottedBy: "keith",
  },
  {
    id: "mlot-pro",
    name: "MLOT Pro — Growth Strategy Center",
    part: "front-door",
    tier: "growth",
    status: "live",
    url: "https://ai-business-growth-strategy-center.vercel.app",
    blurb: "Where your MLOT report becomes a sequenced growth plan.",
    slottedBy: "pricing-doc",
  },

  // ── Leadership ──────────────────────────────────────────────────────────
  {
    id: "ai-plan-builder",
    name: "AI Plan Builder",
    part: "leadership",
    tier: "growth",
    status: "live",
    url: "https://ai-plan-builder.vercel.app",
    blurb: "The prescriptive engine behind MLOT: what to do, in what order, and why.",
    slottedBy: "keith",
  },
  {
    id: "business-architect",
    name: "Business Architect",
    part: "leadership",
    tier: "growth",
    status: "live",
    url: "https://business-architect-three.vercel.app",
    blurb: "Design how your whole business is organized, phase by phase.",
    note: "Its Legacy phase is part of Culture & Legacy below.",
    slottedBy: "keith",
  },
  {
    id: "ai-business-plan-generator",
    name: "Business Plan Generator",
    part: "leadership",
    tier: "startup",
    status: "live",
    url: "https://ai-business-plan-generator-one.vercel.app",
    blurb: "An investor- and bank-ready business plan, built with you step by step.",
    slottedBy: "tank",
  },

  // ── Culture & Legacy ────────────────────────────────────────────────────
  {
    id: "succession-builder",
    name: "Succession Builder",
    part: "culture-legacy",
    tier: "legacy",
    status: "live",
    url: "https://succession-builder.vercel.app",
    blurb: "Plan who takes over, how, and when — before you have to.",
    slottedBy: "keith",
  },
  {
    id: "exit-readiness",
    name: "Valuation & Exit Readiness",
    part: "culture-legacy",
    tier: "legacy",
    status: "live",
    url: "https://exit-readiness-puce.vercel.app",
    blurb: "A defensible value range for your business plus the readiness gaps that move it, ranked by impact.",
    note: "Legacy season pool (built Nov 5, 2026; appId `exit-readiness` from the app's own build). An educational estimate — not a formal appraisal.",
    slottedBy: "tank",
  },
  {
    id: "reviews",
    name: "Reviews",
    part: "culture-legacy",
    tier: "growth",
    status: "live",
    url: "https://review-app-jet-omega.vercel.app",
    blurb: "Scheduled team and owner reviews with a guided, strengths-first session and a values-fit read.",
    note: "Growth season pool (built Nov 5, 2026; appId `reviews` from the app's own build).",
    slottedBy: "tank",
  },
  {
    id: "hiring-scorecard",
    name: "Hiring Scorecard",
    part: "culture-legacy",
    tier: "growth",
    status: "live",
    url: "https://hiring-scorecard-delta.vercel.app",
    blurb: "Score candidates against the role's 90-day success profile and your organization's values.",
    note: "Growth season pool (built Nov 5, 2026; appId `hiring-scorecard` from the app's own build).",
    slottedBy: "tank",
  },

  // ── Processes ───────────────────────────────────────────────────────────
  {
    id: "ai-business-toolkit-explorer",
    name: "AI Business Toolkit Explorer",
    part: "processes",
    tier: "startup",
    status: "live",
    url: "https://ai-business-toolkit-explorer.vercel.app",
    blurb: "Find the right AI tools for how your business actually runs.",
    slottedBy: "pricing-doc",
  },

  // ── Sales & Marketing ───────────────────────────────────────────────────
  {
    id: "branding-intelligence",
    name: "Branding Intelligence",
    part: "sales-marketing",
    tier: "startup",
    status: "live",
    url: "https://branding-intelligence.vercel.app",
    blurb: "A reputation and digital presence audit: how your business looks to buyers before they call.",
    slottedBy: "keith",
  },
  {
    id: "website-strategist-ai",
    name: "Website Strategist",
    part: "sales-marketing",
    tier: "startup",
    status: "live",
    url: "https://website-strategist-ai.vercel.app",
    blurb: "A website plan built around how your customers decide.",
    slottedBy: "tank",
  },
  {
    id: "ai-gtm-expert",
    name: "AI GTM Expert",
    part: "sales-marketing",
    tier: "startup",
    status: "live",
    url: "https://ai-gtm-expert.vercel.app",
    blurb: "A go-to-market plan for your next offer or market.",
    slottedBy: "pricing-doc",
  },
  {
    id: "lead-finder-pro",
    name: "Lead Finder Pro",
    part: "sales-marketing",
    tier: "startup",
    status: "live",
    url: "https://lead-finder-pro-lime.vercel.app",
    blurb: "Find the businesses most likely to buy from you.",
    slottedBy: "tank",
  },
  {
    id: "video-package-studio",
    name: "Video Package Studio",
    part: "sales-marketing",
    tier: "startup",
    status: "coming",
    blurb: "Video content packages: plan, script, and package your videos.",
    note: "Startup season pool (pricing pass, Nov 5, 2026). App id assigned by Tank — no gate integration exists in the app yet.",
    slottedBy: "tank",
  },

  // ── The tracking spine ────────────────────────────────────────────────
  {
    id: "overwatch-dashboard",
    name: "Client Overwatch Dashboard",
    part: "leadership",
    tier: "startup",
    status: "coming",
    blurb: "All your business tracking in one board — the spine the rest of the season reports into.",
    note: "The tracking SPINE: always included with any Startup season or bundle, never counted as a pick (Keith, Nov 5, 2026). App id assigned by Tank — the client-overwatch standard has no gate integration yet.",
    slottedBy: "keith",
  },
  {
    id: "linkedin-tools",
    name: "LinkedIn Strategy + Engagement",
    part: "sales-marketing",
    tier: "growth",
    status: "live",
    url: "https://linkedin-strategy-pro.vercel.app",
    blurb: "LinkedIn positioning and engagement analysis for the owner.",
    slottedBy: "pricing-doc",
  },

  // ── Customer Retention ──────────────────────────────────────────────────
  {
    id: "customer-retention",
    name: "Customer Retention",
    part: "customer-retention",
    tier: "growth",
    status: "coming",
    blurb: "Keep past clients close: useful touches on a steady rhythm, referrals earned instead of begged, and repeat business from being remembered fondly.",
    note: "Growth season pool (built Nov 6, 2026; appId `customer-retention` from the app's own build). Centered on the owner's past client list — engaging past clients for referrals and regular useful, non-annoying touches. Deployed Nov 7, 2026 (customer-retention-mauve.vercel.app) behind its gate; the hub pool listing and live flip follow Keith's Firebase authorized-domain add for that domain.",
    slottedBy: "keith",
  },
  {
    id: "outreach-referral-builder",
    name: "Outreach and Referral Builder",
    part: "customer-retention",
    tier: "growth",
    status: "live",
    url: "https://outreach-referral-builder.vercel.app",
    blurb: "Design the three systems a growing business runs on: the people system (who you know, sorted, with written contact rules), the customer referral program, and the partner referral program — each handed back as a report you can follow step by step or hand to your own AI to build from.",
    note: "Growth season pool (designed and built Nov 25, 2026, from the Program Builder app design Keith approved the same day). One app, three modules: Outreach, Referral, Partner Referrals. Local-first: it stores nobody's contacts; the owner's work leaves in their downloads.",
    slottedBy: "keith",
  },
  {
    id: "customer-service-desk",
    name: "Customer Service Desk",
    part: "customer-retention",
    tier: "growth",
    status: "coming",
    blurb: "Every customer question and problem in one inbox, with a drafted reply ready for your approval — and an FAQ that grows from the questions customers actually ask.",
    note: "Growth season pool (built Nov 7, 2026; appId `customer-service-desk` from the app's own build). Deployed Nov 8, 2026 (customer-service-desk-seven.vercel.app) behind its gate; the hub pool listing and live flip follow Keith's Firebase authorized-domain add for that domain.",
    slottedBy: "tank",
  },

  // ── Collections ─────────────────────────────────────────────────────────
  {
    id: "ai-cfo",
    name: "AI CFO",
    part: "collections",
    tier: "growth",
    status: "live",
    url: "https://ai-cfo-sooty.vercel.app",
    blurb: "Financial systems and answers from your own numbers and documents.",
    slottedBy: "keith",
  },
  {
    id: "margin-master",
    name: "Margin Master",
    part: "collections",
    tier: "growth",
    status: "coming",
    blurb: "Receipts become tax-ready books, and every price is checked against the market — so every job holds its margin.",
    note: "Growth season pool, Collections part (built Oct 7, 2026; gate-integrated Nov 7, 2026 at Keith's direction). The numbers companion to AI CFO: its financial summary feeds the AI CFO alongside bank statements and invoices. Deployed Nov 7, 2026 (margin-master-two.vercel.app) behind its gate; the hub pool listing and live flip follow Keith's Firebase authorized-domain add for that domain.",
    slottedBy: "tank",
  },
  {
    id: "analyst",
    name: "The Analyst",
    part: "collections",
    tier: "growth",
    status: "live",
    url: "https://invest-analysis-engine.vercel.app",
    blurb: "Buffett-style analysis of a specific company or opportunity.",
    slottedBy: "pricing-doc",
  },
  {
    id: "futurist",
    name: "The Futurist",
    part: "collections",
    tier: "growth",
    status: "live",
    url: "https://sentinel-ai-taupe.vercel.app",
    blurb: "Trend analysis: where your market is going before it gets there.",
    slottedBy: "pricing-doc",
  },

  // ── Personal ────────────────────────────────────────────────────────────
  {
    id: "warrior-25",
    name: "Warrior 25",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://warrior-25.vercel.app",
    blurb: "The senior mobility and strength program: 25 pounds, at your pace.",
    slottedBy: "keith",
  },
  {
    id: "true-fitness-eval",
    name: "True Fitness Eval",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://true-fitness-eval.vercel.app",
    blurb: "An honest read on where your fitness stands and what to do next.",
    slottedBy: "keith",
  },
  {
    id: "total-health-os",
    name: "Total Health OS",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://total-health-os.vercel.app",
    blurb: "Your health command center: records, medications, check-ins, and summaries — all in your own Drive.",
    note: "Personal tier decided by Keith, Nov 5, 2026 — the Personal health trio with Warrior 25 and True Fitness Eval. Health data stays in the user's own Drive; the gate reads entitlement only.",
    slottedBy: "keith",
  },
  {
    id: "sensible-plate",
    name: "The Sensible Plate",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://the-sensible-plate.vercel.app",
    blurb: "A personal nutrition game plan built around the foods you actually like — and pattern checks that tell you what to change when doing everything right still isn't moving.",
    note: "Deployed Nov 7, 2026 on Keith's direction. Personal track (flat, no picks). Local-first, no user-data database; plans come from a coded food table, with one guarded AI call that sorts foods the table doesn't know, inside the table's rules; the gate is the client-side sign-in wall + entitlement read. Data stays in the user's own browser; the gate reads entitlement only.",
    slottedBy: "keith",
  },
  {
    id: "blind-spot-profiler",
    name: "Blind Spot Profiler",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://blind-spot-profiler.vercel.app",
    blurb: "Needs stage: see what you cannot see about yourself.",
    slottedBy: "pricing-doc",
  },
  {
    id: "360-personal-value-review",
    name: "360 Personal Value Review",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://360-personal-value-review.vercel.app",
    blurb: "Needs stage: how the people around you experience your value.",
    slottedBy: "pricing-doc",
  },
  {
    id: "pattern-analysis-engine",
    name: "Pattern Analysis Engine",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://pattern-analysis-engine.vercel.app",
    blurb: "Needs stage: the patterns running your decisions.",
    slottedBy: "pricing-doc",
  },
  {
    id: "life-purpose-architect",
    name: "Life Purpose Architect",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://life-purpose-architect.vercel.app",
    blurb: "Wants stage: design the life you actually want.",
    slottedBy: "pricing-doc",
  },
  {
    id: "guild-ascend",
    name: "Guild Ascend",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://guild-ascend.vercel.app",
    blurb: "Wants stage: rise inside a standard of honour.",
    slottedBy: "pricing-doc",
  },
  {
    id: "curriculum-architect",
    name: "Curriculum Architect",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://curriculum-architect-weld.vercel.app",
    blurb: "Meant-to-be stage: turn what you know into what you teach.",
    slottedBy: "pricing-doc",
  },
  {
    id: "wealth-leadership-academy",
    name: "Wealth Leadership Academy",
    part: "personal",
    tier: "personal",
    status: "live",
    url: "https://wealth-leadership-academy.vercel.app",
    blurb: "Meant-to-be stage: lead people and money with the same standard.",
    slottedBy: "pricing-doc",
  },
];

/**
 * V1 DISPLAY HELPER — retained for the storefront/upgrade-screen grouping
 * only. Access decisions use the v2 season/picks evaluator
 * (src/entitlement-core.ts → isEntitledToApp), which supersedes this.
 * Two v1 behaviours are deliberately kept OUT of the display helper now:
 * Personal is NOT included in Legacy (D4, Nov 5, 2026 — reversed), and
 * business tiers are no longer a blanket "everything below" for access
 * (sizes + picks decide). This function still answers the coarser
 * storefront question "which shelf does this app sit on for plan X".
 */
export function planIncludes(plan: TierId, app: CatalogApp): boolean {
  if (app.tier === "free") return true;
  if (app.part === "personal" || app.tier === "personal") {
    return plan === "personal";
  }
  return TIER_RANK[plan] >= TIER_RANK[app.tier] && plan !== "personal";
}

/** Session grants, described in access terms (Keith, Oct 24, 2026). */
export const SESSION_GRANTS = [
  {
    name: "The $99 AI working session",
    grant: "30 days of Growth access",
    detail:
      "One month with everything Growth unlocks — every Startup and Growth app across Leadership, Processes, Sales & Marketing, and Collections — so the plan from your session has the tools to run on.",
  },
  {
    name: "The $650 planning session",
    grant: "90 days of Growth access",
    detail:
      "A full quarter of Growth access: time to work the plan, not just read it.",
  },
];
