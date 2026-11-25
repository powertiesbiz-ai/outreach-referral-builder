/**
 * session.ts — the whole app session, held in React state in memory
 * only. Local-first (design Section 2): closing the app discards
 * everything; nothing is persisted to localStorage, a server, or a
 * database. The only lasting artifacts are the owner's downloads.
 */
import { BASE_LISTS, DEFAULT_RATES, REFERRAL_PARTNERS_LIST } from "./lib/people";
import type {
  BusinessProfile,
  FunnelRates,
  ListDef,
  OutreachPlan,
  PartnerDesign,
  PartnerProject,
  Person,
  ReferralDesign,
  RunningSetup,
} from "./lib/types";
import type { ReportDoc } from "./lib/report";

export interface OutreachDraft {
  setup: RunningSetup;
  setupReason: string;
  budget: "zero" | "some" | "funded";
  runner: string;
  rhythm: string;
  sendingDomain: string;
  templates: { firstTouch: string; followUp: string; emailTest: string };
  rates: {
    conservative: FunnelRates;
    expected: FunnelRates;
    strong: FunnelRates;
  };
}

export interface SessionState {
  profile: BusinessProfile;
  people: Person[];
  lists: ListDef[];
  outreach: OutreachDraft;
  referral: ReferralDesign;
  referralConfirmed: boolean;
  partner: PartnerDesign;
  partnerConfirmed: boolean;
  partnerProjects: PartnerProject[];
  reports: {
    outreach?: ReportDoc;
    referral?: ReportDoc;
    partner?: ReportDoc;
    outreachPlan?: OutreachPlan;
  };
}

export const emptyProfile: BusinessProfile = {
  businessName: "",
  industry: "",
  whatTheySell: "",
  averageSale: 0,
  averageMonthlyEarnings: 0,
  paymentTools: "neither",
  website: "",
  canAddPage: false,
  grossMarginPct: 40,
  bestCustomerProfile: "",
};

export function initialSession(): SessionState {
  return {
    profile: { ...emptyProfile },
    people: [],
    lists: [...BASE_LISTS, { ...REFERRAL_PARTNERS_LIST }],
    outreach: {
      setup: "spreadsheet",
      setupReason: "Not sized yet — answer Step 2 and the app recommends plainly.",
      budget: "zero",
      runner: "Me, the owner",
      rhythm: "Weekday sends in small daily batches; replies checked every working day.",
      sendingDomain: "",
      templates: {
        firstTouch: "",
        followUp: "",
        emailTest: "",
      },
      rates: {
        conservative: { ...DEFAULT_RATES.conservative },
        expected: { ...DEFAULT_RATES.expected },
        strong: { ...DEFAULT_RATES.strong },
      },
    },
    referral: {
      programName: "",
      actions: [],
      rewardType: "percent",
      rewardAmount: 10,
      twoSided: false,
      family: "paid",
      pointsPerAction: 10,
      payoutMethod: "Cash App",
      payoutDay: "On the 1st of the following month",
      minPayout: 10,
      vestingDays: 30,
      whereItLives: "website",
      research: [],
      researchNote: "",
    },
    referralConfirmed: false,
    partner: {
      partnerTypes: [],
      kit: {
        capabilitySheet: "",
        handoffSteps: "",
        partnerSays: "",
        responseTimes: "",
      },
      sampleProject: { projectValue: 60000, ownerPiece: 9000, marginPct: 35 },
      reviewDate: "",
    },
    partnerConfirmed: false,
    partnerProjects: [],
    reports: {},
  };
}

export function templateDrafts(businessName: string): {
  firstTouch: string;
  followUp: string;
  emailTest: string;
} {
  const name = businessName || "our business";
  return {
    firstTouch: `Hi [first name] — [your name] at ${name}. We worked together on [the job], and I am writing the people we have actually served first: if anything about that work needs attention, reply here and I will take care of it myself.`,
    followUp: `Hi [first name] — closing the loop on my note from [day]. No pressure either way; if the timing is wrong, a one-word reply and I will leave it there.`,
    emailTest: `Hi [first name] — a genuine check-in from ${name}, not a pitch. We are tidying up who hears what from us, and I would rather ask than guess: what would you actually want to hear about — offers, useful educational pieces, referral opportunities, or nothing at all? One line back is plenty, and a no is a complete answer that we will honor for good.`,
  };
}
