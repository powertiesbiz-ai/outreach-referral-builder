/**
 * people.ts — the people model (design Section 3) and Module A's working
 * machinery (Section 4): CSV import, the one-record merge, per-action
 * permission resolution, the email test, enrichment, fit scoring, and the
 * per-list funnel model. Pure logic, no I/O — the tests run this file
 * directly, and the UI is a thin skin over it.
 */
import type {
  ActionId,
  BaseListId,
  EmailTestAnswer,
  FunnelCase,
  FunnelRates,
  FunnelResult,
  ListDef,
  ListId,
  MembershipBasis,
  Person,
  PermissionResult,
  SourceId,
} from "./types";

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export const BASE_LISTS: ListDef[] = [
  {
    id: "personal",
    name: "Personal",
    rule: "No business contact, unless authorized. Family, friends, and private relationships. If a specific person has genuinely agreed to hear business material, the record says who authorized it and when. Without that note, the answer is no.",
    base: true,
  },
  {
    id: "business",
    name: "Business contacts",
    rule: "All available for outreach. People met through work: vendors' good contacts, partners, fellow owners, professional acquaintances. Normal business outreach applies.",
    base: true,
  },
  {
    id: "clients",
    name: "Current clients",
    rule: "Outreach only for referrals, education, and sales material created for the company. They are never cold-sold a new pitch as if they were strangers; they already pay for the relationship.",
    base: true,
  },
  {
    id: "cold",
    name: "Cold contacts",
    rule: "Available for contact, approached as strangers. People the owner has a name for but no real relationship with. First contact is honest about that: a stranger's introduction, at a stranger's pace.",
    base: true,
  },
];

/** The ready-made owner list the app offers during sorting (Section 3). */
export const REFERRAL_PARTNERS_LIST: ListDef = {
  id: "referral-partners",
  name: "Referral Partners",
  rule: "Business outreach and partner program material. The businesses in neighboring trades who might bring the owner into their bigger work. This list feeds Module C.",
  base: false,
  allowedActions: ["general", "education", "partner-material"],
};

export const CLIENT_ALLOWED: ActionId[] = [
  "referral-ask",
  "education",
  "company-material",
];

export const COLD_ALLOWED: ActionId[] = ["introduction", "general", "education"];

export const BUSINESS_ALLOWED: ActionId[] = [
  "general",
  "referral-ask",
  "education",
  "company-material",
  "introduction",
  "partner-material",
];

/** Warmth order for the funnel's count-each-person-once convention. */
export const WARMTH: ListId[] = [
  "clients",
  "business",
  "referral-partners",
  "cold",
];

// ---------------------------------------------------------------------------
// Identity + merge
// ---------------------------------------------------------------------------

export function normalizeKey(name: string, email: string): string {
  const e = email.trim().toLowerCase();
  if (e) return `email:${e}`;
  return `name:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `p${Date.now().toString(36)}-${idCounter}`;
}

export function emptyPerson(name: string): Person {
  return {
    id: nextId(),
    name,
    email: "",
    emailVerification: "none",
    phone: "",
    socialProfile: "",
    company: "",
    enriched: {},
    sources: [],
    memberships: [],
    restrictions: [],
    suppressed: false,
    fitScore: 0,
    notes: "",
  };
}

export function addMembership(
  person: Person,
  listId: ListId,
  basis: MembershipBasis,
  date: string,
  note?: string,
): void {
  if (person.memberships.some((m) => m.listId === listId)) return;
  person.memberships.push({ listId, basis, date, note });
}

export function removeMembership(person: Person, listId: ListId): void {
  person.memberships = person.memberships.filter((m) => m.listId !== listId);
}

export function onList(person: Person, listId: ListId): boolean {
  return person.memberships.some((m) => m.listId === listId);
}

/**
 * Merge incoming rows into the people set: one record per person, every
 * source carried, every true membership kept. A record whose identity
 * matches a suppressed person arrives suppressed — suppression travels
 * across imports and can never be quietly re-added (Sections 3 and 4).
 */
export function mergePeople(
  existing: Person[],
  incoming: Person[],
): Person[] {
  const byKey = new Map<string, Person>();
  for (const p of existing) byKey.set(normalizeKey(p.name, p.email), p);
  // Suppression is keyed by identity and outranks everything.
  const suppressedKeys = new Set(
    existing.filter((p) => p.suppressed).map((p) => normalizeKey(p.name, p.email)),
  );
  for (const inc of incoming) {
    const key = normalizeKey(inc.name, inc.email);
    const found = byKey.get(key);
    if (!found) {
      const copy = { ...inc };
      if (suppressedKeys.has(key) || inc.suppressed) {
        copy.suppressed = true;
        copy.suppressionNote =
          inc.suppressionNote ?? "Suppressed on an earlier list; carried across this import.";
      }
      byKey.set(key, copy);
      continue;
    }
    // Merge fields: keep the first non-empty value, add what is new.
    if (!found.email && inc.email) found.email = inc.email;
    if (!found.phone && inc.phone) found.phone = inc.phone;
    if (!found.socialProfile && inc.socialProfile) found.socialProfile = inc.socialProfile;
    if (!found.company && inc.company) found.company = inc.company;
    if (found.emailVerification === "none" && inc.emailVerification !== "none") {
      found.emailVerification = inc.emailVerification;
    }
    for (const s of inc.sources) {
      if (!found.sources.includes(s)) found.sources.push(s);
    }
    for (const m of inc.memberships) {
      addMembership(found, m.listId, m.basis, m.date, m.note);
    }
    if (inc.suppressed && !found.suppressed) {
      found.suppressed = true;
      found.suppressionNote = inc.suppressionNote;
    }
    if (suppressedKeys.has(key)) found.suppressed = true;
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// CSV import (past customers / phone contacts / LinkedIn connections)
// ---------------------------------------------------------------------------

/** A small RFC-4180-ish CSV parser: quotes, commas, newlines in quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length < 2) return [];
  const headers = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => {
    const out: Record<string, string> = {};
    headers.forEach((h, idx) => {
      out[h] = (r[idx] ?? "").trim();
    });
    return out;
  });
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k]) return row[k];
  }
  return "";
}

/** Turn parsed CSV rows into people for one source. Column names are
 *  matched loosely so invoicing exports, phone exports, and LinkedIn's
 *  connections export all land. */
export function rowsToPeople(
  rows: Record<string, string>[],
  source: SourceId,
): Person[] {
  const people: Person[] = [];
  for (const row of rows) {
    const first = pick(row, ["first name", "firstname", "first"]);
    const last = pick(row, ["last name", "lastname", "last"]);
    let name = pick(row, ["name", "full name", "customer", "contact", "display name"]);
    if (!name && (first || last)) name = `${first} ${last}`.trim();
    const email = pick(row, [
      "email",
      "email address",
      "e-mail",
      "emailaddress",
      "work email",
      "business email",
    ]);
    if (!name && !email) continue;
    const p = emptyPerson(name || email);
    p.email = email;
    p.emailVerification = email ? "unverified" : "none";
    p.phone = pick(row, ["phone", "phone number", "mobile", "tel", "telephone"]);
    p.socialProfile = pick(row, [
      "url",
      "profile url",
      "linkedin",
      "linkedin url",
      "social profile",
    ]);
    p.company = pick(row, ["company", "organization", "business", "employer"]);
    p.sources = [source];
    people.push(p);
  }
  return people;
}

// ---------------------------------------------------------------------------
// Per-action permission resolution (Section 3)
// ---------------------------------------------------------------------------

/**
 * Resolve whether ONE action may go to ONE person, reading every list the
 * person is on. The strictest applicable rule governs that action.
 * Suppression is the one rule that is not per action: a no is about the
 * person, and it outranks every membership.
 */
export function resolvePermission(
  person: Person,
  action: ActionId,
  lists: ListDef[],
): PermissionResult {
  if (person.suppressed) {
    return {
      allowed: false,
      reason: "Suppressed: this person said no or opted out. A no is permanent and outranks every list.",
      governedBy: "Suppression",
    };
  }

  const listById = new Map(lists.map((l) => [l.id, l]));
  const isPersonal = onList(person, "personal");
  const isClient = onList(person, "clients");
  const authorized =
    person.authorization?.actions.includes(action) ?? false;

  // Restrictions from the email test narrow everything (e.g. education-only).
  if (person.restrictions.includes("education-only") && action !== "education") {
    return {
      allowed: false,
      reason: "This person answered the email test: education only. Everything else is closed to them.",
      governedBy: "Email test answer",
    };
  }
  if (
    person.restrictions.includes("referrals-only") &&
    action !== "referral-ask"
  ) {
    return {
      allowed: false,
      reason: "This person answered the email test: referral material only.",
      governedBy: "Email test answer",
    };
  }

  // Personal: no business contact unless authorized — except that the
  // client relationship itself carries referral asks, education, and
  // company material (worked example one, Section 3).
  if (isPersonal && !authorized) {
    const carriedByClient = isClient && CLIENT_ALLOWED.includes(action);
    if (!carriedByClient) {
      return {
        allowed: false,
        reason:
          "Personal: no business contact unless authorized, and this record carries no authorization for this. The Personal rule governs.",
        governedBy: "Personal",
      };
    }
  }

  // Current clients narrow every business action to the client set
  // (worked example two: the client rule, not the open business lane,
  // governs sales material and everything like it).
  if (isClient && !CLIENT_ALLOWED.includes(action)) {
    return {
      allowed: false,
      reason:
        "Current clients: outreach only for referrals, education, and company material. The client rule is the stricter one for this action and it governs.",
      governedBy: "Current clients",
    };
  }

  // Owner lists narrow: if the person sits on an owner list whose stated
  // rule does not permit this action, that list closes it.
  for (const m of person.memberships) {
    const def = listById.get(m.listId);
    if (def && !def.base && def.allowedActions && !def.allowedActions.includes(action)) {
      return {
        allowed: false,
        reason: `${def.name}: this list's own stated rule does not cover this kind of outreach, and an owner list can narrow but never loosen.`,
        governedBy: def.name,
      };
    }
  }

  // Somebody's rules must affirmatively permit the action. When the
  // client rule is one of the permitting rules, it governs — the client
  // limits, not the open business lane, set the terms (Section 3,
  // worked example two).
  const permits: string[] = [];
  if (isClient && CLIENT_ALLOWED.includes(action)) permits.push("Current clients");
  if (isPersonal && authorized) permits.push("Personal (authorized)");
  if (onList(person, "business") && BUSINESS_ALLOWED.includes(action)) {
    permits.push("Business contacts");
  }
  if (onList(person, "cold") && COLD_ALLOWED.includes(action)) permits.push("Cold contacts");
  for (const m of person.memberships) {
    const def = listById.get(m.listId);
    if (def && !def.base && def.allowedActions?.includes(action)) {
      permits.push(def.name);
    }
  }
  if (permits.length === 0) {
    return {
      allowed: false,
      reason: "No list this person is on permits this kind of outreach.",
    };
  }
  return {
    allowed: true,
    reason: `Permitted by: ${permits.join(", ")}.`,
    governedBy: permits[0],
  };
}

/** Short-form permissions summary for the CSV's Permissions column. */
export function permissionsSummary(person: Person, lists: ListDef[]): string {
  if (person.suppressed) return "Suppressed: never contact, on any list, ever.";
  const labels: Record<ActionId, string> = {
    general: "general offers",
    "referral-ask": "referral asks",
    education: "education",
    "company-material": "company material",
    introduction: "introductions",
    "partner-material": "partner material",
  };
  const yes: string[] = [];
  const no: string[] = [];
  (Object.keys(labels) as ActionId[]).forEach((a) => {
    const r = resolvePermission(person, a, lists);
    (r.allowed ? yes : no).push(labels[a]);
  });
  return `Yes: ${yes.length ? yes.join(", ") : "nothing"}. No: ${no.length ? no.join(", ") : "nothing"}.`;
}

/** The channel the plan works first, following what enrichment found. */
export function bestChannel(person: Person): string {
  if (person.email && person.emailVerification === "verified") return "Email";
  if (person.socialProfile) return "Human-tapped social";
  if (person.phone) return "Phone";
  if (person.email) return "Email (verify first)";
  return "No channel found yet";
}

/** May this person be put in a send at all? Guessed addresses are held
 *  from every send until they pass verification (Section 4). */
export function sendable(person: Person): boolean {
  if (person.suppressed) return false;
  if (!person.email) return false;
  return person.emailVerification === "verified";
}

// ---------------------------------------------------------------------------
// The email test (Section 4)
// ---------------------------------------------------------------------------

export const EMAIL_TEST_WINDOW_DAYS = 14;

export interface EmailTestOutcome {
  change: string; // plain-words description for the report
}

/**
 * Apply one email-test outcome to one person. Answers adjust memberships;
 * a no suppresses everywhere that day; an auto-responder is the mail
 * system talking, not the person, and counts as silence; silence past
 * the 14-day window (one reminder sent inside it) gains the stated
 * default membership, recorded as default by silence.
 */
export function applyEmailTest(
  person: Person,
  answer: EmailTestAnswer,
  date: string,
  defaultList: ListId = "cold",
): EmailTestOutcome {
  switch (answer) {
    case "interested-offers":
      addMembership(person, "business", "email-test", date, "Answered the email test: wants to hear about offers.");
      return { change: "Gained Business contacts (answered the email test: interested in offers)." };
    case "education-only":
      if (!person.restrictions.includes("education-only")) {
        person.restrictions.push("education-only");
      }
      return { change: "Restriction attached: education only (email test answer)." };
    case "referrals-only":
      if (!person.restrictions.includes("referrals-only")) {
        person.restrictions.push("referrals-only");
      }
      return { change: "Restriction attached: referral material only (email test answer)." };
    case "no":
      person.suppressed = true;
      person.suppressionNote = `Said no in the email test on ${date}. Suppressed on every list, permanently.`;
      return { change: "Said no: suppressed everywhere, permanently, that day." };
    case "auto-responder":
      return { change: "Auto-responder: not a reply. Treated as silence." };
    case "silence":
      addMembership(person, defaultList, "default-by-silence", date, `Silent for the full ${EMAIL_TEST_WINDOW_DAYS}-day test window (one reminder sent inside it).`);
      return { change: `Silent past ${EMAIL_TEST_WINDOW_DAYS} days: gained the default membership (default by silence).` };
  }
}

// ---------------------------------------------------------------------------
// Enrichment (Section 4): public business contact information only.
// ---------------------------------------------------------------------------

export interface EnrichmentFinding {
  email?: { value: string; source: string; guessed?: boolean };
  phone?: { value: string; source: string };
  socialProfile?: { value: string; source: string };
}

/**
 * Apply one enrichment finding to one person. The line (Keith's
 * standard): public business information only; for anyone on the
 * Personal list, enrichment looks for nothing at all; a pattern-guessed
 * address is marked as a guess and held from sends until verified.
 * Returns what was applied, for the report's found-rate accounting.
 */
export function applyEnrichment(
  person: Person,
  finding: EnrichmentFinding,
): { applied: string[]; skippedPersonal: boolean } {
  if (onList(person, "personal")) {
    return { applied: [], skippedPersonal: true };
  }
  const applied: string[] = [];
  if (finding.email && !person.email) {
    person.email = finding.email.value;
    person.enriched.email = { value: finding.email.value, source: finding.email.source };
    person.emailVerification = finding.email.guessed ? "guessed" : "unverified";
    applied.push(finding.email.guessed ? "email (guessed, held from sends)" : "email");
  }
  if (finding.phone && !person.phone) {
    person.phone = finding.phone.value;
    person.enriched.phone = { value: finding.phone.value, source: finding.phone.source };
    applied.push("phone");
  }
  if (finding.socialProfile && !person.socialProfile) {
    person.socialProfile = finding.socialProfile.value;
    person.enriched.socialProfile = {
      value: finding.socialProfile.value,
      source: finding.socialProfile.source,
    };
    applied.push("social profile");
  }
  return { applied, skippedPersonal: false };
}

/** The classic pattern guess, marked as a guess — never presented as found. */
export function guessEmail(name: string, domain: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !domain) return "";
  return `${parts[0]}.${parts[parts.length - 1]}@${domain.replace(/^@/, "")}`;
}

// ---------------------------------------------------------------------------
// Fit scoring + the funnel model (Section 4)
// ---------------------------------------------------------------------------

/** Deterministic fit score: warm memberships, a reachable channel, and
 *  customer history count; the owner's best-customer words add a nudge
 *  when they appear in the record. Sets the work order inside each list. */
export function fitScore(person: Person, bestCustomerWords: string): number {
  if (person.suppressed) return 0;
  let score = 10;
  if (onList(person, "clients")) score += 40;
  if (onList(person, "business")) score += 25;
  if (onList(person, "referral-partners")) score += 20;
  if (onList(person, "cold")) score += 5;
  if (person.sources.includes("customers")) score += 15;
  if (person.emailVerification === "verified") score += 10;
  else if (person.email) score += 4;
  if (person.phone) score += 3;
  if (person.socialProfile) score += 3;
  const words = bestCustomerWords.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const hay = `${person.company} ${person.notes}`.toLowerCase();
  if (words.some((w) => hay.includes(w))) score += 5;
  return Math.min(100, score);
}

export function warmestList(person: Person): ListId | null {
  for (const id of WARMTH) {
    if (onList(person, id)) return id;
  }
  // Owner lists count under themselves when no warm base list applies.
  const owner = person.memberships.find((m) => !BASE_LISTS.some((b) => b.id === m.listId));
  return owner ? owner.listId : null;
}

function funnelCase(people: number, rates: FunnelRates, avgValue: number): FunnelCase {
  const landed = people * (rates.deliverablePct / 100);
  const replies = landed * (rates.replyPct / 100);
  const meetings = replies * (rates.meetingPct / 100);
  const jobs = meetings * (rates.closePct / 100);
  return {
    people,
    landed: Math.round(landed),
    replies: Math.round(replies * 10) / 10,
    meetings: Math.round(meetings * 10) / 10,
    jobs: Math.round(jobs * 100) / 100,
    value: Math.round(jobs * avgValue),
  };
}

/**
 * The per-list funnel. Each person counts ONCE, under the warmest list
 * they belong to, so nobody is double-counted into a bigger promise.
 * Rates are planning assumptions the owner can change — never a promise.
 */
export function runFunnel(
  people: Person[],
  lists: ListDef[],
  ratesByCase: { conservative: FunnelRates; expected: FunnelRates; strong: FunnelRates },
  avgValue: number,
): FunnelResult[] {
  const counts = new Map<ListId, number>();
  for (const p of people) {
    if (p.suppressed) continue;
    if (onList(p, "personal") && !onList(p, "clients") && !onList(p, "business")) {
      continue; // Personal-only people are not outreach inventory.
    }
    const warm = warmestList(p);
    if (!warm) continue;
    counts.set(warm, (counts.get(warm) ?? 0) + 1);
  }
  const results: FunnelResult[] = [];
  for (const def of lists) {
    const n = counts.get(def.id) ?? 0;
    if (n === 0) continue;
    results.push({
      listId: def.id,
      listName: def.name,
      conservative: funnelCase(n, ratesByCase.conservative, avgValue),
      expected: funnelCase(n, ratesByCase.expected, avgValue),
      strong: funnelCase(n, ratesByCase.strong, avgValue),
    });
  }
  return results;
}

/** The eight engine rules, printed into every Module A plan (Section 4). */
export const ENGINE_RULES: { rule: string; why: string }[] = [
  { rule: "Verify every email before sending", why: "Dead addresses bounce, and bounces damage the sender's reputation until even good addresses stop landing. Verification is cheap. A burned domain is not." },
  { rule: "Check the guard list before every send", why: "Every program keeps a guard list: colleagues, vendors, competitors, and anyone who has ever said no, graded never-contact. The sender checks it before each batch. A grading that lives only in memory protects nobody; the list is the protection." },
  { rule: "Suppression is permanent and travels", why: "Anyone who opts out or says no is out forever, on every list at once, and the record carries across every future import, so a new list can never quietly re-add them." },
  { rule: "Weekday sends, with a daily cap", why: "Outreach goes out on weekdays, in human-sized daily batches sized to the list and the funnel. A steady rhythm reads as a business working; a blast reads as a spammer, to people and to filters alike." },
  { rule: "Follow-ups are spaced, and stop on reply", why: "A short ladder of follow-ups, days apart, each adding something or closing politely. The moment a person replies, the ladder stops for them. Chasing someone who already answered earns the wrong reputation." },
  { rule: "LinkedIn is human-tapped only", why: "Automating LinkedIn outreach violates LinkedIn's terms and risks the owner's profile, a business asset built over years. The system prepares lists and drafts; a human hand does the tapping." },
  { rule: "Replies are checked on a rhythm", why: "Replies are read on the program's working days and answered in the owner's voice. A no is honored the day it arrives. An auto-responder is logged as no reply." },
  { rule: "Fit scoring sets the order", why: "Each contact is scored against the owner's best-customer profile. Outreach runs in score order inside each list, so the best fits hear first." },
];

export const DEFAULT_RATES: {
  conservative: FunnelRates;
  expected: FunnelRates;
  strong: FunnelRates;
} = {
  conservative: { deliverablePct: 90, replyPct: 2, meetingPct: 25, closePct: 20 },
  expected: { deliverablePct: 90, replyPct: 4, meetingPct: 30, closePct: 25 },
  strong: { deliverablePct: 90, replyPct: 6, meetingPct: 35, closePct: 30 },
};

export type { BaseListId };
