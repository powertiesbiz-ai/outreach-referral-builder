#!/usr/bin/env node
/**
 * orb.test.mjs — the design's test plan (Section 8 of the Outreach and
 * Referral Builder app design), run against the app's real lib code.
 *
 * Pattern follows the hub apps' contract tests: stage the production
 * src/lib tree under tests/.staging, bundle a driver with esbuild, run
 * it under node. The driver prints PASS/FAIL per assertion and a count,
 * and exits non-zero on any failure.
 *
 * Usage: node tests/orb.test.mjs   (from the app root)
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const staging = join(here, ".staging");
const esbuildBin = join(root, "node_modules", ".bin", "esbuild");

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "lib"), { recursive: true });
for (const f of ["types.ts", "people.ts", "referral.ts", "partners.ts", "report.ts"]) {
  cpSync(join(root, "src", "lib", f), join(staging, "lib", f));
}

const driver = String.raw`
import {
  BASE_LISTS, REFERRAL_PARTNERS_LIST, DEFAULT_RATES,
  addMembership, applyEmailTest, applyEnrichment, emptyPerson,
  fitScore, guessEmail, mergePeople, onList, parseCsv,
  permissionsSummary, resolvePermission, rowsToPeople, runFunnel, sendable,
} from "./lib/people";
import { HONESTY_DEFAULTS, POINTS_NEVER_MONEY, consultantWarnings, marginCheck } from "./lib/referral";
import { LAWYER_NOTE, partnerMarginCheck, triggerState } from "./lib/partners";
import { buildContactCsv, buildOutreachReport, buildPartnerReport, buildReferralReport } from "./lib/report";

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("PASS", label); }
  else { failed++; console.log("FAIL", label); }
}
const LISTS = [...BASE_LISTS, REFERRAL_PARTNERS_LIST];
const TODAY = "2026-11-25";
const profile = {
  businessName: "Bright Shine Cleaning", industry: "House cleaning",
  whatTheySell: "Deep cleans and recurring cleaning plans",
  averageSale: 240, averageMonthlyEarnings: 9000, paymentTools: "neither",
  website: "", canAddPage: false, grossMarginPct: 40,
  bestCustomerProfile: "homeowners who book recurring plans",
};
function person(name, email) {
  const p = emptyPerson(name);
  if (email) { p.email = email; p.emailVerification = "unverified"; }
  return p;
}
const reportText = (doc) => JSON.stringify(doc);

// ── 1. People and permissions: the messy sample list ─────────────────
const customersCsv = "Name,Email,Phone,Company\nJane Cousin,jane@example.com,555-0101,\nBob Builder,bob@example.com,555-0102,Builder Co\nDead Email,dead@old.example,555-0103,";
const phoneCsv = "Name,Email,Phone\nJane Cousin,jane@example.com,555-0101\nPhone Only,,555-0199";
const linkedinCsv = "First Name,Last Name,Email Address,Company\nJane,Cousin,jane@example.com,\nPast,Customer,past@example.com,Past Co";
let people = [];
people = mergePeople(people, rowsToPeople(parseCsv(customersCsv), "customers"));
people = mergePeople(people, rowsToPeople(parseCsv(phoneCsv), "phone"));
people = mergePeople(people, rowsToPeople(parseCsv(linkedinCsv), "linkedin"));
ok(people.length === 5, "merge: 7 rows across 3 sources become 5 people");
const jane = people.find((p) => p.name === "Jane Cousin");
ok(jane.sources.length === 3, "merge: the person in all three sources carries all three sources");
ok(people.some((p) => p.name === "Dead Email"), "merge: the dead-email name is present as a record");
addMembership(jane, "personal", "owner-assigned", TODAY);
addMembership(jane, "clients", "owner-assigned", TODAY);

// ── 2. Multi-list case one: client + cousin ──────────────────────────
ok(resolvePermission(jane, "referral-ask", LISTS).allowed === true, "case 1: referral ask allowed for client+cousin");
ok(resolvePermission(jane, "education", LISTS).allowed === true, "case 1: education allowed for client+cousin");
ok(resolvePermission(jane, "general", LISTS).allowed === false, "case 1: general offer blast blocked for client+cousin (no authorization)");

// ── 3. Multi-list case two: fellow owner who is also a client ────────
const bob = people.find((p) => p.name === "Bob Builder");
addMembership(bob, "business", "owner-assigned", TODAY);
addMembership(bob, "clients", "owner-assigned", TODAY);
const bobMat = resolvePermission(bob, "company-material", LISTS);
ok(bobMat.allowed === true && bobMat.governedBy === "Current clients", "case 2: sales material resolves under the client limits");
ok(resolvePermission(bob, "general", LISTS).allowed === false, "case 2: general blast blocked by the client limits, not widened by Business");

// ── 4. Owner lists narrow, never loosen ──────────────────────────────
const newsOnly = { id: "program-news", name: "Program news", rule: "Program news only.", base: false, allowedActions: ["general", "education"] };
const lists2 = [...LISTS, newsOnly];
addMembership(bob, "program-news", "owner-assigned", TODAY);
ok(resolvePermission(bob, "partner-material", lists2).allowed === false, "owner list: a narrowing owner list closes actions its rule does not cover");

// ── 5. Multi-list case three: opt-out survives re-import ─────────────
const past = people.find((p) => p.name === "Past Customer");
addMembership(past, "cold", "owner-assigned", TODAY);
applyEmailTest(past, "no", TODAY);
ok(past.suppressed === true, "case 3: a no in the email test suppresses the same day");
people = mergePeople(people, rowsToPeople(parseCsv(linkedinCsv), "linkedin"));
const past2 = people.find((p) => p.name === "Past Customer");
ok(past2.suppressed === true, "case 3: suppression survives a re-import of the same list");
ok(permissionsSummary(past2, LISTS).includes("Suppressed"), "case 3: suppression shows in the permissions summary (report judgment calls)");

// ── 6. The email test, scripted answers ──────────────────────────────
const t1 = person("Interested One", "i1@example.com");
applyEmailTest(t1, "interested-offers", TODAY);
ok(onList(t1, "business") && t1.memberships.find((m) => m.listId === "business").basis === "email-test", "email test: interested answer adds Business contacts, basis recorded");
const t2 = person("Education Only", "e1@example.com");
addMembership(t2, "business", "owner-assigned", TODAY);
applyEmailTest(t2, "education-only", TODAY);
ok(resolvePermission(t2, "education", LISTS).allowed === true && resolvePermission(t2, "general", LISTS).allowed === false, "email test: education-only restricts everything else");
const t3 = person("Away Message", "a1@example.com");
applyEmailTest(t3, "auto-responder", TODAY);
ok(t3.memberships.length === 0 && !t3.suppressed, "email test: an auto-responder counts as silence, changes nothing");
const t4 = person("Silent One", "s1@example.com");
applyEmailTest(t4, "silence", TODAY);
const t4m = t4.memberships.find((m) => m.listId === "cold");
ok(!!t4m && t4m.basis === "default-by-silence", "email test: silence past 14 days gains the default membership, basis default-by-silence");

// ── 7. Funnel math, hand-checked against the design's sample ─────────
const cold1000 = [];
for (let i = 0; i < 1000; i++) {
  const p = person("Cold " + i, "cold" + i + "@example.com");
  addMembership(p, "cold", "owner-assigned", TODAY);
  cold1000.push(p);
}
const funnel = runFunnel(cold1000, LISTS, DEFAULT_RATES, 4000);
const coldF = funnel.find((f) => f.listId === "cold");
ok(coldF.conservative.value === 3600 && coldF.expected.value === 10800 && coldF.strong.value === 22680, "funnel: the design sample's three values are $3,600 / $10,800 / $22,680");
ok(coldF.conservative.jobs === 0.9 && coldF.expected.jobs === 2.7 && coldF.strong.jobs === 5.67, "funnel: jobs run unrounded (0.9 / 2.7 / 5.67) under the 'about' display");
const bothLists = person("Both Lists", "both@example.com");
addMembership(bothLists, "clients", "owner-assigned", TODAY);
addMembership(bothLists, "cold", "owner-assigned", TODAY);
const funnel2 = runFunnel([bothLists], LISTS, DEFAULT_RATES, 4000);
ok(funnel2.length === 1 && funnel2[0].listId === "clients" && funnel2[0].conservative.people === 1, "funnel: a multi-list person counts once, under their warmest list");

// ── 8. The contact file: every field lands ───────────────────────────
jane.fitScore = fitScore(jane, profile.bestCustomerProfile);
const csv = buildContactCsv([jane, bob], LISTS);
const parsedBack = parseCsv(csv);
ok(parsedBack.length === 2, "csv: one row per person comes back out of a fresh parse");
ok(Object.keys(parsedBack[0]).join("|") === "name|email|phone|social profile|lists|permissions summary|source|membership basis|best channel|fit score", "csv: the design's exact columns, in order");
ok(parsedBack[0].lists.includes("Personal") && parsedBack[0].lists.includes("Current clients"), "csv: the Lists column names every membership");
ok(parsedBack[0]["permissions summary"].includes("referral asks"), "csv: the Permissions summary travels with the person");

// ── 9. Enrichment: the line holds ────────────────────────────────────
const biz = person("Biz Owner", "");
biz.company = "Biz Co";
const r1 = applyEnrichment(biz, { email: { value: "owner@bizco.example", source: "company website" }, phone: { value: "555-0110", source: "Google business profile" } });
ok(r1.applied.length === 2 && biz.enriched.email.source === "company website", "enrichment: business info lands with its source on every field");
const fam = person("Family Member", "");
addMembership(fam, "personal", "owner-assigned", TODAY);
const famBefore = JSON.stringify(fam);
const r2 = applyEnrichment(fam, { email: { value: "fam@private.example", source: "somewhere" } });
ok(r2.skippedPersonal === true && JSON.stringify(fam) === famBefore, "enrichment: a Personal record comes back exactly as supplied, nothing researched");
const guessed = person("Guess Me", "");
applyEnrichment(guessed, { email: { value: guessEmail("Guess Me", "bizco.example"), source: "pattern guess", guessed: true } });
ok(guessed.emailVerification === "guessed" && sendable(guessed) === false, "enrichment: a guessed address is marked as a guess and held from sends");
const verified = person("Verified One", "v@example.com");
verified.emailVerification = "verified";
ok(sendable(verified) === true && sendable(jane) === false, "verification: only a verified address is sendable");

// ── 10. Module B: margin check on the design's sample ────────────────
const mc25 = marginCheck(240, 40, { rewardType: "percent", rewardAmount: 25, twoSided: false });
ok(mc25.margin === 96 && mc25.rewardPerSale === 60 && mc25.marginLeft === 36 && mc25.level === "caution", "module B margin: 25% of $240 leaves $36 of $96 (caution)");
const mc10 = marginCheck(240, 40, { rewardType: "percent", rewardAmount: 10, twoSided: false });
ok(mc10.rewardPerSale === 24 && mc10.marginLeft === 72 && mc10.level === "ok", "module B margin: 10% leaves $72 (ok)");
const baseDesign = {
  programName: "Bright Shine Referral Program",
  actions: [{ id: "purchase-referral", label: "Purchase referral", guard: "Code in the payment record.", measurable: "Seen at checkout." }],
  rewardType: "percent", rewardAmount: 25, twoSided: false, family: "paid",
  pointsPerAction: 10, payoutMethod: "Cash App", payoutDay: "On the 1st of the following month",
  minPayout: 10, vestingDays: 30, whereItLives: "website", research: [], researchNote: "Nothing found.",
};
const reckless = { ...baseDesign, rewardAmount: 50 };
ok(marginCheck(240, 40, reckless).level === "reckless" && consultantWarnings(reckless, 240, 40).length > 0, "module B: a reward bigger than the margin warns in plain words (and the owner can still proceed)");

// ── 11. Module B report: points wording, neither pattern, honesty ────
const pointsReport = buildReferralReport(profile, { ...baseDesign, family: "points" });
const pointsText = reportText(pointsReport);
ok(pointsText.includes(POINTS_NEVER_MONEY), "module B report: the points-are-never-money sentence is in the report");
const glanceIdx = pointsText.indexOf("program at a glance");
const walkIdx = pointsText.indexOf("step-by-step setup walkthrough");
ok(pointsText.indexOf(POINTS_NEVER_MONEY) > glanceIdx && pointsText.lastIndexOf(POINTS_NEVER_MONEY) > walkIdx, "module B report: points wording appears in BOTH parts");
ok(pointsText.includes("manual pattern") || pointsText.includes("recorded by hand"), "module B report: payments 'neither' gets the manual code-and-ledger pattern");
ok(HONESTY_DEFAULTS.every((h) => (pointsText.split(h.name).length - 1) >= 2), "module B report: all five honesty defaults appear in the rules AND the Build Brief");
ok(pointsText.includes("Personal-list people hear nothing"), "handoff: the Module B launch announcement resolves through Module A's lists");

// ── 12. Module C: margin check on project economics ──────────────────
const pc = partnerMarginCheck(60000, 9000, 35, 5, "project");
ok(pc.margin === 3150 && pc.reward === 3000 && pc.marginLeft === 150 && pc.level === "reckless", "module C margin: 5% of the whole $60,000 project leaves $150 of $3,150");
ok(pc.rewardOnPiece === 450 && pc.marginLeftOnPiece === 2700, "module C margin: the same 5% on the owner's piece is $450, leaving $2,700");

// ── 13. Module C: the trigger states ─────────────────────────────────
ok(triggerState("introduced", "completion") === "waiting-on-completion", "tracking: nothing is owed at introduction");
ok(triggerState("quoted", "paid") === "waiting-on-payment", "tracking: nothing is owed at quoting");
ok(triggerState("completed", "completion") === "vested", "tracking: completion trigger vests at completion");
ok(triggerState("completed", "paid") === "waiting-on-payment", "tracking: paid trigger still waits at completion");
ok(triggerState("paid", "paid") === "vested", "tracking: paid trigger vests when the owner is paid");
ok(triggerState("cancelled", "completion") === "not-owed", "tracking: a cancelled project earns nothing");

// ── 14. Module C: feeder list, per-person outreach, the report ───────
const partnerPerson = person("Pat Partner", "pat@gc.example");
partnerPerson.company = "GC Partners LLC";
addMembership(partnerPerson, "referral-partners", "owner-assigned", TODAY);
addMembership(partnerPerson, "personal", "owner-assigned", TODAY);
ok(resolvePermission(partnerPerson, "partner-material", LISTS).allowed === false, "module C: a partner contact also on Personal receives no marketing");
const partnerDesign = {
  partnerTypes: [{
    type: "General contractors", controls: "Whole-home renovations; flooring in every one",
    rewardShape: "percent-piece", rewardPct: 5, rewardFlat: 250, trigger: "paid",
    clientOwnership: "partner", presentation: "white-label", invoicing: "owner-to-partner",
    directLater: "The partner is told and the standing reward applies for 12 months.",
  }],
  kit: { capabilitySheet: "Flooring, tile, insured.", handoffSteps: "Partner calls us; we call the client same day.", partnerSays: "Our flooring crew is Bright Shine's partner crew.", responseTimes: "First call within one business day." },
  sampleProject: { projectValue: 60000, ownerPiece: 9000, marginPct: 35 },
  reviewDate: "",
};
const partnerReport = buildPartnerReport(profile, partnerDesign, [partnerPerson], LISTS);
const partnerText = reportText(partnerReport);
for (const part of ["partner program design", "partner list", "enablement kit", "agreement-terms", "tracking sheet", "Build Brief for Your AI"]) {
  ok(partnerText.toLowerCase().includes(part.toLowerCase()), "module C report contains: " + part);
}
ok(partnerText.includes("lawyer"), "module C report: the terms sheet prints the lawyer-review note");
ok(partnerText.includes("comes direct later"), "module C report: the direct-client clause is on the terms sheet");

// ── 15. Handoffs in the Module A report ──────────────────────────────
const plan = {
  setup: "spreadsheet", setupReason: "Small list, zero budget.", runner: "Me, the owner",
  rhythm: "Weekdays, small batches.", sendingDomain: "owner@brightshine.example",
  templates: { firstTouch: "Hi.", followUp: "Closing the loop.", emailTest: "A genuine check-in." },
  funnel: runFunnel([jane, bob], LISTS, DEFAULT_RATES, 240),
  freshness: "Twice a year for warm lists.",
};
const outReport = buildOutreachReport(profile, [jane, bob], LISTS, plan);
const outText = reportText(outReport);
ok(outText.includes("give these clients a program"), "handoff: the Current clients playbook ends by pointing into Module B");
ok(outText.includes("Verify every email before sending"), "module A report: the engine rules are printed into the plan");

console.log("\\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
`;

writeFileSync(join(staging, "driver.ts"), driver);
execFileSync(
  esbuildBin,
  [join(staging, "driver.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${join(staging, "driver.mjs")}`],
  { stdio: "inherit" },
);

// Static local-first check: no browser storage anywhere in the app source.
const srcFiles = ["session.ts", "App.tsx"];
let storageFree = true;
for (const f of srcFiles) {
  const text = readFileSync(join(root, "src", f), "utf8");
  if (/(?:localStorage|sessionStorage|indexedDB)\s*\./.test(text)) storageFree = false;
}
console.log(storageFree ? "PASS session: the app holds nothing in browser storage — close and reopen, and nothing is there" : "FAIL session: browser storage found in app source");

try {
  execFileSync("node", [join(staging, "driver.mjs")], { stdio: "inherit" });
  if (!storageFree) process.exit(1);
} catch {
  process.exit(1);
}
