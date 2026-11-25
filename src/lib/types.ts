/**
 * types.ts — shared shapes for the Outreach and Referral Builder.
 *
 * Local-first: every one of these objects lives in the app session on the
 * owner's own device. Nothing here is ever written to a PowerTies server
 * or database; the only lasting artifacts are the files the owner
 * downloads (design Section 2).
 */

export interface BusinessProfile {
  businessName: string;
  industry: string;
  whatTheySell: string;
  /** Average sale = average project or job size. Drives all math. */
  averageSale: number;
  averageMonthlyEarnings: number;
  paymentTools: "stripe" | "square" | "neither";
  website: string;
  canAddPage: boolean;
  /** Gross margin percent on a typical job (owner's number; margin checks). */
  grossMarginPct: number;
  /** What a best customer looks like, in the owner's words (fit scoring). */
  bestCustomerProfile: string;
}

// ---------------------------------------------------------------------------
// The people model (design Section 3): one record per person, many lists,
// permission resolved per action.
// ---------------------------------------------------------------------------

export type BaseListId = "personal" | "business" | "clients" | "cold";

export type ListId = BaseListId | string; // owner lists are arbitrary ids

/** The kinds of outreach the app resolves permission for. */
export type ActionId =
  | "general" // a general business message / offer blast
  | "referral-ask"
  | "education"
  | "company-material" // sales material created for the company
  | "introduction" // a stranger's honest introduction
  | "partner-material"; // partner program material

export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: "general", label: "General business message" },
  { id: "referral-ask", label: "Referral ask" },
  { id: "education", label: "Education piece" },
  { id: "company-material", label: "Company sales material" },
  { id: "introduction", label: "Stranger's introduction" },
  { id: "partner-material", label: "Partner program material" },
];

export interface ListDef {
  id: ListId;
  name: string;
  /** The contact rule, printed in the report exactly as written here. */
  rule: string;
  base: boolean;
  /** For owner lists: the actions this list affirmatively permits. An owner
   *  list can only narrow — see resolvePermission in people.ts. */
  allowedActions?: ActionId[];
}

export type MembershipBasis =
  | "owner-assigned"
  | "email-test"
  | "default-by-silence";

export interface Membership {
  listId: ListId;
  basis: MembershipBasis;
  date: string; // ISO date
  note?: string;
}

export type SourceId = "customers" | "phone" | "linkedin" | "manual";

export type VerificationState =
  | "verified"
  | "unverified"
  | "guessed" // pattern-guessed: held from every send until verified
  | "dead"
  | "none";

export interface EnrichedField {
  value: string;
  /** Where it was found — every enriched field carries its source. */
  source: string;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  emailVerification: VerificationState;
  phone: string;
  socialProfile: string;
  company: string;
  /** Enrichment results, each carrying its source (design Section 4). */
  enriched: {
    email?: EnrichedField;
    phone?: EnrichedField;
    socialProfile?: EnrichedField;
  };
  sources: SourceId[];
  memberships: Membership[];
  /** Personal-list exception: who authorized business contact, when, and
   *  for which actions. Without this note, Personal means no. */
  authorization?: { by: string; when: string; actions: ActionId[] };
  /** Restrictions attached by the email test (e.g. "education-only"). */
  restrictions: string[];
  /** Suppression: said no / opted out. Permanent, everywhere, and it
   *  survives every future import (design Sections 3 and 4). */
  suppressed: boolean;
  suppressionNote?: string;
  fitScore: number; // 0–100, against the owner's best-customer profile
  notes: string;
}

export interface PermissionResult {
  allowed: boolean;
  /** Plain-words reason, printed in the report's judgment calls. */
  reason: string;
  /** Which list's rule governed the answer, when one did. */
  governedBy?: string;
}

// ---------------------------------------------------------------------------
// Module A plan pieces
// ---------------------------------------------------------------------------

export type RunningSetup = "spreadsheet" | "free-crm" | "paid-crm";

export interface FunnelRates {
  deliverablePct: number;
  replyPct: number;
  meetingPct: number; // of replies
  closePct: number; // of meetings
}

export interface FunnelCase {
  people: number;
  landed: number;
  replies: number;
  meetings: number;
  jobs: number;
  value: number;
}

export interface FunnelResult {
  listId: ListId;
  listName: string;
  conservative: FunnelCase;
  expected: FunnelCase;
  strong: FunnelCase;
}

export type EmailTestAnswer =
  | "interested-offers"
  | "education-only"
  | "referrals-only"
  | "no"
  | "auto-responder"
  | "silence";

export interface OutreachPlan {
  setup: RunningSetup;
  setupReason: string;
  runner: string; // who runs it: owner / their AI / a caller
  rhythm: string;
  sendingDomain: string;
  templates: { firstTouch: string; followUp: string; emailTest: string };
  funnel: FunnelResult[];
  freshness: string;
}

// ---------------------------------------------------------------------------
// Module B plan (design Section 5)
// ---------------------------------------------------------------------------

export type RewardedActionId =
  | "purchase-referral"
  | "repeat-booking"
  | "review"
  | "membership-signup"
  | "other";

export interface ReferralDesign {
  programName: string;
  actions: { id: RewardedActionId; label: string; guard: string; measurable: string }[];
  rewardType: "percent" | "flat" | "store-credit" | "discount" | "free-service";
  rewardAmount: number; // percent of sale, or flat dollars
  twoSided: boolean;
  family: "paid" | "points";
  pointsPerAction: number;
  payoutMethod: string;
  payoutDay: string;
  minPayout: number;
  vestingDays: number;
  whereItLives: "website" | "store" | "both";
  research: { claim: string; source: string }[];
  researchNote: string; // honest found-nothing text when the leg finds nothing
}

// ---------------------------------------------------------------------------
// Module C plan (design Section 6)
// ---------------------------------------------------------------------------

export type RewardShape = "percent-piece" | "percent-project" | "flat" | "reciprocal" | "none";
export type RewardTrigger = "completion" | "paid";
export type ProjectStage =
  | "introduced"
  | "quoted"
  | "won"
  | "in-progress"
  | "completed"
  | "paid"
  | "lost"
  | "cancelled";

export interface PartnerTypeDesign {
  type: string;
  controls: string; // the kind of project, its size, where the owner fits
  rewardShape: RewardShape;
  rewardPct: number;
  rewardFlat: number;
  trigger: RewardTrigger;
  clientOwnership: "partner" | "owner";
  presentation: "introduction" | "white-label";
  invoicing: "owner-to-partner" | "owner-to-client";
  directLater: string; // the settled rule, in plain words
}

export interface PartnerDesign {
  partnerTypes: PartnerTypeDesign[];
  kit: {
    capabilitySheet: string;
    handoffSteps: string;
    partnerSays: string; // the sentences the partner tells their client
    responseTimes: string;
  };
  /** Sample project economics the margin check runs on (owner's numbers). */
  sampleProject: {
    projectValue: number;
    ownerPiece: number;
    marginPct: number;
  };
  reviewDate: string; // for "none while young" rewards
}

export interface PartnerProject {
  partnerName: string;
  project: string;
  stage: ProjectStage;
  ownerPiece: number;
  rewardShape: RewardShape;
  rewardPct: number;
  rewardFlat: number;
  trigger: RewardTrigger;
}
