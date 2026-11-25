/**
 * report.ts — the shared report builder (design Section 2). Every output
 * of every module is assembled ONCE into a ReportDoc: the on-screen
 * preview renders it, and the DOCX and PDF downloads are generated from
 * the same object, so the preview and the files can never disagree.
 */
import {
  ENGINE_RULES,
  bestChannel,
  permissionsSummary,
  resolvePermission,
} from "./people";
import {
  DISCLOSURE_LINE,
  HONESTY_DEFAULTS,
  POINTS_NEVER_MONEY,
  consultantWarnings,
  marginCheck,
} from "./referral";
import {
  LAWYER_NOTE,
  PARTNER_HONESTY_RULES,
  PROJECT_STAGES,
  partnerMarginCheck,
} from "./partners";
import { ACTIONS } from "./types";
import type {
  BusinessProfile,
  ListDef,
  OutreachPlan,
  PartnerDesign,
  Person,
  ReferralDesign,
} from "./types";

export interface ReportTable {
  head: string[];
  rows: string[][];
}

export interface ReportSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  numbered?: string[];
  table?: ReportTable;
  callout?: { label: string; text: string };
  checklist?: string[];
}

export interface ReportDoc {
  id: "outreach" | "referral" | "partner";
  title: string;
  subtitle: string;
  shortVersion: string[];
  sections: ReportSection[];
}

export const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const listName = (lists: ListDef[], id: string): string =>
  lists.find((l) => l.id === id)?.name ?? id;

const sourceLabel = (s: string): string =>
  ({ customers: "Past customers", phone: "Phone contacts", linkedin: "LinkedIn", manual: "Added by hand" })[s] ?? s;

// ---------------------------------------------------------------------------
// Module A report
// ---------------------------------------------------------------------------

export function buildOutreachReport(
  profile: BusinessProfile,
  people: Person[],
  lists: ListDef[],
  plan: OutreachPlan,
): ReportDoc {
  const sections: ReportSection[] = [];
  const active = people.filter((p) => !p.suppressed);
  const suppressed = people.filter((p) => p.suppressed);

  sections.push({
    heading: "How to treat each list",
    paragraphs: [
      "Every list carries its contact rule. The rule is the whole system: outreach is prepared per list, and permission for each person is resolved per action under the people model, so the same person can be reachable for one kind of message and closed for another.",
    ],
    table: {
      head: ["List", "The contact rule"],
      rows: lists.map((l) => [l.name, l.rule]),
    },
  });

  // Per-list playbooks
  const playbooks: string[] = [];
  for (const l of lists) {
    const members = active.filter((p) => p.memberships.some((m) => m.listId === l.id));
    playbooks.push(
      `${l.name} (${members.length} people): work this list under its rule. Applicable offers come from what ${profile.businessName} sells: ${profile.whatTheySell}. Nothing outside that line is pitched to this list.`,
    );
  }
  playbooks.push(
    "Current clients, the closing step: when this list has been worked through one full cycle and the warmest clients are known, give these clients a program. A referral ask with nothing behind it spends goodwill; the Referral module (Module B) designs the program that gives the ask a link, a code, a reward, and written rules.",
  );
  sections.push({
    heading: "The per-list playbooks",
    bullets: playbooks,
    callout: {
      label: "IN PLAIN TERMS:",
      text: "Warmest first, cold last, each list at its own pace and under its own rule. The client playbook ends by pointing into Module B on purpose: outreach warms the clients, the referral program gives them something real to act on.",
    },
  });

  // The numbers model
  const funnelRows: string[][] = [];
  for (const f of plan.funnel) {
    for (const [caseName, c] of [
      ["Conservative", f.conservative],
      ["Expected", f.expected],
      ["Strong", f.strong],
    ] as const) {
      funnelRows.push([
        f.listName,
        caseName,
        String(c.people),
        String(c.landed),
        String(c.replies),
        `about ${Math.round(c.meetings)}`,
        `about ${Math.round(c.jobs)}`,
        money(c.value),
      ]);
    }
  }
  sections.push({
    heading: "The numbers: what each list is worth",
    paragraphs: [
      `The funnel runs on ${profile.businessName}'s own numbers: an average project of ${money(profile.averageSale)}. List size, times the share of addresses that land, times the reply rate, times the share of replies that become meetings, times the share of meetings that close, times the average project value. Each person counts once, under the warmest list they belong to.`,
      "Three honest things. First, these are planning figures, not forecasts: rerun the model with real numbers after the first month. Second, plan around the expected case; the strong case is a ceiling, not a goal to promise anyone. Third, the model's real use is comparison: the lists are not equal, and a small warm list routinely out-produces a large cold one.",
    ],
    table: {
      head: ["List", "Case", "People", "Emails land", "Replies", "Meetings", "New jobs", "Value"],
      rows: funnelRows,
    },
    callout: {
      label: "WATCH OUT:",
      text: "The model must never be allowed to dress itself up as a promise. Every figure carries its rates beside it, and the numbers are what the math gives if the rates hold.",
    },
  });

  // Every person, once
  const peopleRows = [...active]
    .sort((a, b) => b.fitScore - a.fitScore)
    .map((p) => [
      p.name,
      p.memberships.map((m) => listName(lists, m.listId)).join(", ") || "No list yet",
      permissionsSummary(p, lists),
    ]);
  sections.push({
    heading: "Every person, shown once",
    paragraphs: [
      "Each person appears once, with every list they are on and what may and may not be sent to them, in plain words. Read it and overrule the app wherever you know better; your knowledge outranks the sorting.",
    ],
    table: { head: ["Person", "Lists", "Permissions"], rows: peopleRows },
  });

  // Judgment calls
  const judgment: string[] = [];
  for (const p of people) {
    if (p.memberships.length > 1) {
      const differing = ACTIONS.filter((a) => {
        const results = p.memberships.map(() => resolvePermission(p, a.id, lists).allowed);
        return results[0] !== undefined && resolvePermission(p, a.id, lists).allowed !== undefined;
      });
      void differing;
      judgment.push(
        `${p.name} sits on ${p.memberships.length} lists (${p.memberships.map((m) => listName(lists, m.listId)).join(", ")}); permission is resolved per action, strictest rule governing. Summary: ${permissionsSummary(p, lists)}`,
      );
    }
    for (const m of p.memberships) {
      if (m.basis === "default-by-silence") {
        judgment.push(`${p.name}: membership on ${listName(lists, m.listId)} came from silence in the email test window, recorded openly as default by silence.`);
      }
    }
    if (p.emailVerification === "guessed") {
      judgment.push(`${p.name}: the email address is a pattern guess (${p.email}). It is held from every send until it passes verification.`);
    }
    if (p.emailVerification === "dead") {
      judgment.push(`${p.name}: the email address on record is dead. No email outreach until a working address is found.`);
    }
  }
  for (const p of suppressed) {
    judgment.push(`${p.name}: suppressed. ${p.suppressionNote ?? "Said no or opted out."}`);
  }
  sections.push({
    heading: "The overlaps and judgment calls",
    bullets: judgment.length
      ? judgment
      : ["No multi-list overlaps, no defaulted memberships, no guessed addresses, and no suppressions in this run."],
  });

  sections.push({
    heading: "The running plan",
    paragraphs: [
      `Running setup: ${plan.setup === "spreadsheet" ? "a spreadsheet" : plan.setup === "free-crm" ? "a free CRM" : "a paid CRM"}. ${plan.setupReason}`,
      `Who runs it: ${plan.runner}. The rhythm: ${plan.rhythm}`,
      `Sending setup: outreach goes from ${plan.sendingDomain || "a real business address on the business's own domain"}, prepared so mail lands in inboxes rather than spam folders. Every address is verified before it is ever sent to.`,
      `The email test: one value-first message, in your voice, ending with honest questions. Answers adjust memberships. A no suppresses the person that day, everywhere. An auto-responder is not a reply. Silence for the full 14-day window (one reminder sent inside it) gains the stated default membership, recorded as default by silence.`,
      `Freshness: ${plan.freshness}`,
    ],
  });

  sections.push({
    heading: "The templates, in your voice",
    paragraphs: [
      `First touch: ${plan.templates.firstTouch}`,
      `Follow-up: ${plan.templates.followUp}`,
      `The email test message: ${plan.templates.emailTest}`,
    ],
  });

  sections.push({
    heading: "The engine rules",
    table: { head: ["Rule", "Why it is a rule"], rows: ENGINE_RULES.map((r) => [r.rule, r.why]) },
    callout: {
      label: "IN PLAIN TERMS:",
      text: "Verify first. Never contact the never-contact list. A no lasts forever, everywhere. Send on weekdays, in small batches, and stop the moment someone answers. Keep LinkedIn in human hands. Read the replies. Work the best fits first.",
    },
  });

  sections.push({
    heading: "Your checklist",
    checklist: [
      "Confirm the sending address is set up on the business domain.",
      "Run verification on every address marked unverified before the first send.",
      "Work the lists warmest first, in fit-score order inside each list.",
      "Send the email test to everyone whose memberships permit it, and record the answers.",
      "After the first month, rerun the numbers model with the real rates.",
      "Design the referral program in Module B once the client list is warm.",
    ],
  });

  return {
    id: "outreach",
    title: `Outreach Program — ${profile.businessName}`,
    subtitle: "Module A: the people system, the plan, and the rules it runs under.",
    shortVersion: [
      `${people.length} people loaded and merged into one record each; ${suppressed.length} suppressed and out forever.`,
      `The plan runs on ${plan.setup === "spreadsheet" ? "a spreadsheet" : plan.setup === "free-crm" ? "a free CRM" : "a paid CRM"}, worked by ${plan.runner}, on this rhythm: ${plan.rhythm}`,
      "Every person carries their lists, their permissions, and the basis for each membership. The contact file (CSV) carries the same truth for your AI.",
    ],
    sections,
  };
}

// ---------------------------------------------------------------------------
// The contact file (CSV) — the design's exact columns
// ---------------------------------------------------------------------------

export function buildContactCsv(people: Person[], lists: ListDef[]): string {
  const esc = (v: string): string =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const head = [
    "Name",
    "Email",
    "Phone",
    "Social profile",
    "Lists",
    "Permissions summary",
    "Source",
    "Membership basis",
    "Best channel",
    "Fit score",
  ];
  const rows = [...people]
    .sort((a, b) => b.fitScore - a.fitScore)
    .map((p) => {
      const emailCell = p.email
        ? `${p.email} [${p.emailVerification}]${p.enriched.email ? ` (found: ${p.enriched.email.source})` : ""}`
        : "";
      return [
        p.name,
        emailCell,
        p.phone,
        p.socialProfile,
        p.memberships.map((m) => listName(lists, m.listId)).join("; "),
        permissionsSummary(p, lists),
        p.sources.map(sourceLabel).join("; "),
        p.memberships
          .map((m) => `${listName(lists, m.listId)}: ${m.basis} ${m.date}${m.note ? ` (${m.note})` : ""}`)
          .join("; "),
        bestChannel(p),
        String(p.fitScore),
      ]
        .map(esc)
        .join(",");
    });
  return [head.join(","), ...rows].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Module B report (two parts + Build Brief)
// ---------------------------------------------------------------------------

export function buildReferralReport(
  profile: BusinessProfile,
  design: ReferralDesign,
): ReportDoc {
  const check = marginCheck(profile.averageSale, profile.grossMarginPct, design);
  const warnings = consultantWarnings(design, profile.averageSale, profile.grossMarginPct);
  const rewardText =
    design.family === "points"
      ? `${design.pointsPerAction} points per rewarded action`
      : design.rewardType === "percent"
        ? `${design.rewardAmount}% of the sale`
        : `${money(design.rewardAmount)} per rewarded action (${design.rewardType})`;
  const sections: ReportSection[] = [];

  sections.push({
    heading: "Part 1: The program at a glance",
    table: {
      head: ["Piece", "Your design"],
      rows: [
        ["Program name", design.programName],
        ["Rewarded actions", design.actions.map((a) => a.label).join(", ")],
        ["Reward", rewardText + (design.twoSided ? ", paid to the sender and the new customer both" : ", paid to the sender")],
        ["Program family", design.family === "paid" ? "Paid commission: real money on real sales" : "Free points: recognition, levels, and perks"],
        ["Payout method", design.payoutMethod],
        ["Payout timing", design.payoutDay],
        ["Minimum payout", design.family === "paid" ? money(design.minPayout) : "No cash payouts (points)"],
        ["Vesting / hold", `${design.vestingDays} days, so refunds and cancellations settle first`],
        ["Where it lives", design.whereItLives === "both" ? "Website and store, one set of rules, one ledger" : design.whereItLives === "website" ? "Linked to the website: personal links and codes, tracked through checkout" : "Run from the store: printed code and QR cards"],
        ["Payment tools", profile.paymentTools === "neither" ? "Neither Stripe nor Square: the manual code-and-ledger pattern" : profile.paymentTools === "stripe" ? "Stripe" : "Square"],
      ],
    },
    paragraphs:
      design.family === "points" ? [POINTS_NEVER_MONEY] : undefined,
  });

  sections.push({
    heading: "The pieces and the structure",
    bullets: [
      `The member offer: join ${design.programName}, get a personal link and code, earn ${rewardText} when someone buys through it. The disclosure line travels with every link: "${DISCLOSURE_LINE}"`,
      profile.paymentTools === "neither"
        ? "Tracking, the manual pattern: the member's code is recorded by hand on every sale, in the ledger, the same day. No code on the sale, no reward — the habit is the system."
        : `Tracking: the member's code rides in the ${profile.paymentTools === "stripe" ? "Stripe" : "Square"} payment record (checkout note or metadata), so every rewarded sale can be traced from payment to member.`,
      "The ledger: one row per sale — date, item, amount, member code, reward owed, status (vesting, vested, paid).",
      `The payout run: ${design.payoutDay}, one run, checked once, paying every member at or over the threshold whose rewards have vested.`,
      "How a member joins: they sign up, get their link and code, and the rules below in plain words. How a referral is recorded: the code arrives with the sale. How a reward vests: after the hold period, if the sale still stands. How a payout happens: on the payout day, by the chosen method.",
    ],
  });

  sections.push({
    heading: "The rules, in the words your members will read",
    bullets: [
      ...design.actions.map((a) => `${a.label}: earns ${rewardText}. Guard: ${a.guard}`),
      `Rewards vest after ${design.vestingDays} days and are paid ${design.payoutDay.toLowerCase()} once a member reaches ${design.family === "paid" ? money(design.minPayout) : "the stated points level"}.`,
      `Every link and code carries the disclosure line: "${DISCLOSURE_LINE}"`,
      ...(design.family === "points" ? [POINTS_NEVER_MONEY] : []),
    ],
  });

  sections.push({
    heading: "The honesty layer: five defaults that cannot be removed",
    table: { head: ["Default", "Why it exists"], rows: HONESTY_DEFAULTS.map((d) => [d.name, d.why]) },
    callout: {
      label: "IN PLAIN TERMS:",
      text: "You designed everything about this program except the parts that would make it dishonest. Those five parts are welded in.",
    },
  });

  sections.push({
    heading: "The incentive math, printed plainly",
    paragraphs: [
      `On your average sale of ${money(profile.averageSale)} at a ${profile.grossMarginPct}% gross margin (${money(check.margin)} of margin):`,
    ],
    table: {
      head: ["Line", "Amount"],
      rows: [
        ["Average sale", money(check.averageSale)],
        [`Gross margin at ${check.marginPct}%`, money(check.margin)],
        ["Reward per referred sale" + (design.twoSided ? " (two-sided)" : ""), money(check.rewardPerSale)],
        ["Margin left after the reward, before all other costs", money(check.marginLeft)],
      ],
    },
    callout: { label: "THE MARGIN CHECK:", text: check.sentence },
  });

  if (warnings.length) {
    sections.push({
      heading: "The consultant's follow-ups, answered in the open",
      bullets: warnings,
    });
  }

  sections.push({
    heading: "Resources, with their sources",
    bullets: design.research.length
      ? design.research.map((r) => `${r.claim} (Source: ${r.source})`)
      : [design.researchNote],
    callout: {
      label: "WATCH OUT:",
      text: "The research leg reports what it found, with the source named beside each claim, and it says so when it found nothing solid. Verify each resource at build time using its cited source.",
    },
  });

  const walkthrough: string[] = [
    `Set up the ledger with the columns this design names, in ${profile.paymentTools === "neither" ? "a spreadsheet" : "your system of record"}.`,
    profile.paymentTools === "neither"
      ? "Print the code cards for the counter, invoices, and packaging, one code per member, and start the habit: no code recorded, no reward."
      : `Create the referral page on ${profile.website || "your website"} and the /r/CODE redirect that sets the tracking cookie, and wire the code into the ${profile.paymentTools === "stripe" ? "Stripe" : "Square"} checkout so it lands in the payment record.`,
    "Write the member rules page from Part 1, word for word, including the five honesty defaults and the disclosure line.",
    "Run the test step before anyone is invited: one small real transaction, traced end to end — link, ledger, vested reward — in the PowerTiesRefer pattern.",
    "Announce the program through Module A's people system: the announcement is prepared per list and resolved per person, so Current clients hear it as company material, Business contacts as normal outreach, and Personal-list people hear nothing at all unless their record carries an authorization.",
    "Run the first payout on the first payout day, even if it is small, and reconcile it against the payment records before the money moves.",
  ];
  sections.push({
    heading: "Part 2: The step-by-step setup walkthrough",
    numbered: walkthrough,
  });

  sections.push({
    heading: "Build Brief for Your AI",
    paragraphs: [
      "Written for a machine reader. Build exactly this design; check your work against the testable statements.",
    ],
    bullets: [
      "Components to build: referral page, link and code redirect (/r/CODE, 90-day first-party cookie, code wins over cookie), checkout code capture (code in the payment record's metadata or note), ledger (members, sales, payouts), payout run, member dashboard (link, code, disclosure line, clicks, sales, vested vs vesting earnings).",
      "Data model: members (name, email, code, payout handle, date joined, W-9 on file), sales (date, item, amount, member code, reward owed, status), payouts (month, member, amount, handle, date sent, status). The member's code is the key that ties a person to their payment handle.",
      `Rules as testable statements: rewarded actions are ${design.actions.map((a) => a.label).join(", ")}; reward is ${rewardText}; vesting is ${design.vestingDays} days; minimum payout is ${design.family === "paid" ? money(design.minPayout) : "n/a (points)"}; payout day is ${design.payoutDay}; family is ${design.family}.`,
      ...HONESTY_DEFAULTS.map((d) => `Honesty default (non-removable): ${d.name} — ${d.why}`),
      ...(design.family === "points" ? [`Points rule (non-removable): ${POINTS_NEVER_MONEY}`] : []),
      `Disclosure line, verbatim, beside every link and code: "${DISCLOSURE_LINE}"`,
      "Acceptance test: one end-to-end test transaction (link click, purchase with code, ledger row, reward vesting after the hold, payout at threshold) must complete with the ledger showing exactly one sale, one reward, and the correct status at each step. Test data is removed afterward.",
    ],
  });

  return {
    id: "referral",
    title: `Referral Program Design — ${design.programName}`,
    subtitle: `Module B: the customer referral program for ${profile.businessName}, in two parts.`,
    shortVersion: [
      `${design.programName}: ${design.actions.length} rewarded actions, reward ${rewardText}, vesting ${design.vestingDays} days, payouts ${design.payoutDay.toLowerCase()}.`,
      `The margin check: on an average ${money(profile.averageSale)} sale, the reward costs ${money(check.rewardPerSale)} of ${money(check.margin)} margin.`,
      "The five honesty defaults are welded in. Part 2 walks the setup step by step and carries the Build Brief for Your AI.",
    ],
    sections,
  };
}

// ---------------------------------------------------------------------------
// Module C report (five parts + Build Brief)
// ---------------------------------------------------------------------------

export function buildPartnerReport(
  profile: BusinessProfile,
  design: PartnerDesign,
  partners: Person[],
  lists: ListDef[],
): ReportDoc {
  void lists;
  const sp = design.sampleProject;
  const sections: ReportSection[] = [];

  sections.push({
    heading: "The partner program design",
    table: {
      head: ["Partner type", "What they control", "Reward", "Trigger", "Client relationship", "Presentation", "Invoicing"],
      rows: design.partnerTypes.map((t) => [
        t.type,
        t.controls,
        t.rewardShape === "percent-piece"
          ? `${t.rewardPct}% of the owner's piece`
          : t.rewardShape === "percent-project"
            ? `${t.rewardPct}% of the whole project`
            : t.rewardShape === "flat"
              ? `${money(t.rewardFlat)} per project`
              : t.rewardShape === "reciprocal"
                ? "Reciprocal referrals"
                : `None while young (review ${design.reviewDate || "date to be set"})`,
        t.trigger === "completion" ? "Vests at project completion" : "Vests when the owner is paid",
        t.clientOwnership === "partner" ? "The partner's client stays the partner's" : "The client becomes the owner's",
        t.presentation === "introduction" ? "Introduction, under the owner's own name" : "White-label, under the partner's name",
        t.invoicing === "owner-to-partner" ? "Owner invoices the partner" : "Owner invoices the client directly",
      ]),
    },
    paragraphs: [
      "Partner rewards are never earned on an introduction, a quote, or a promise, and never on the customer program's thirty days. Project work settles on project time. A project won and then cancelled before completion earns nothing, and the terms say so before the first project.",
    ],
  });

  // Margin check on the primary (first) percentage type, or the sample.
  const pctType = design.partnerTypes.find(
    (t) => t.rewardShape === "percent-piece" || t.rewardShape === "percent-project",
  );
  if (pctType) {
    const mc = partnerMarginCheck(
      sp.projectValue,
      sp.ownerPiece,
      sp.marginPct,
      pctType.rewardPct,
      pctType.rewardShape === "percent-project" ? "project" : "piece",
    );
    sections.push({
      heading: "The margin check, on project economics",
      table: {
        head: ["Line", "Amount"],
        rows: [
          ["The partner's whole project", money(mc.projectValue)],
          ["Your piece of it", money(mc.ownerPiece)],
          [`Gross margin at ${mc.marginPct}% on your piece`, money(mc.margin)],
          [`Reward at ${pctType.rewardPct}% of ${pctType.rewardShape === "percent-project" ? "the whole project" : "your piece"}`, money(mc.reward)],
          ["Margin left after that reward", money(mc.marginLeft)],
          [`The same ${pctType.rewardPct}% taken on your piece`, money(mc.rewardOnPiece)],
          ["Margin left at that reward", money(mc.marginLeftOnPiece)],
        ],
      },
      callout: { label: "THE MARGIN CHECK:", text: mc.sentence },
    });
  }

  sections.push({
    heading: "The partner list, with fit notes",
    table: {
      head: ["Partner", "Company", "Best channel", "Permissions"],
      rows: partners.length
        ? partners.map((p) => [p.name, p.company || "—", bestChannel(p), permissionsSummary(p, lists)])
        : [["(No partners on the Referral Partners list yet)", "—", "—", "Add partners during sorting in Module A; this list is the feeder."]],
    },
    paragraphs: [
      "Court in fit order: the partners who control the work your trade fits inside, and who already know your name, first. Partners discovered later are added to the same list in Module A, so the people system stays the one source of truth.",
    ],
  });

  sections.push({
    heading: "The enablement kit",
    bullets: [
      `The one-page capability sheet: ${design.kit.capabilitySheet}`,
      `The handoff, step by step: ${design.kit.handoffSteps}`,
      `What the partner tells their own client: ${design.kit.partnerSays}`,
      `Response-time commitments: ${design.kit.responseTimes}`,
    ],
    callout: {
      label: "IN PLAIN TERMS:",
      text: "A partner refers when bringing you in makes their project safer, their client happier, and their own name better. The kit is everything they need in hand to say yes.",
    },
  });

  sections.push({
    heading: "The agreement-terms sheet",
    bullets: design.partnerTypes.flatMap((t) => [
      `${t.type} — client relationship: ${t.clientOwnership === "partner" ? "the partner's client is the partner's client; you serve them through the partner" : "on introduction, the client becomes your client, and the reward is the price of the introduction"}.`,
      `${t.type} — presentation: ${t.presentation === "introduction" ? "you work under your own name in front of the client" : "you work under the partner's name, as part of the partner's crew"}.`,
      `${t.type} — invoicing: ${t.invoicing === "owner-to-partner" ? "you invoice the partner" : "you invoice the client directly"}. The reward trigger (vests ${t.trigger === "completion" ? "at completion" : "when you are paid"}) hangs off this answer.`,
      `${t.type} — if the partner's client comes direct later: ${t.directLater}`,
      `${t.type} — ending it: either business can leave in writing; work already in progress finishes under the terms it started under.`,
    ]),
    callout: { label: "BEFORE ANYONE SIGNS:", text: LAWYER_NOTE },
  });

  sections.push({
    heading: "The tracking sheet layout: projects, not sales",
    table: {
      head: ["Field", "What it carries"],
      rows: [
        ["Partner", "The business that brought the project in, tied to its record on the Referral Partners list in Module A."],
        ["Project", "The project in plain words: the client or site, the kind of work, and the partner's project value where it is known."],
        ["Stage", PROJECT_STAGES.map((s) => s.label).join(", ") + "."],
        ["The owner's piece", "The value of the work the owner performs. The reward's base, and the number the margin check ran on."],
        ["Reward owed", "Computed from the design's basis: the percentage and what it was taken on, or the flat fee, or reciprocal, or none."],
        ["Trigger state", "Waiting on completion, waiting on payment, vested, or paid. The reward shows as owed only when its trigger has actually happened."],
      ],
    },
    paragraphs: [
      "One row per project, carried through the stages. The stages assume long cycles on purpose: a partner program judged at thirty days will look dead while it is actually just early. Where projects die is the most useful number in the whole sheet.",
    ],
  });

  sections.push({
    heading: "The honesty rules, applied to partners",
    table: { head: ["Rule", "Why"], rows: PARTNER_HONESTY_RULES.map((r) => [r.rule, r.why]) },
  });

  sections.push({
    heading: "Build Brief for Your AI",
    bullets: [
      "Components to build: the partner list view drawn from the people system (the Referral Partners list in Module A is the source of truth — never a private roster), the capability sheet as a printable page, the project tracking sheet with its stages, and the reward calculation with its trigger states.",
      "Data model: partners (people-system record id, type, fit note), projects (partner id, description, stage, owner's piece, partner project value), rewards (project id, shape, base, amount, trigger, trigger state). The partner's record in the people system is the key; the owner's piece is the reward's base wherever a percentage is used, unless the design states the whole project as the base in writing.",
      "Rules as testable statements: a reward is owed only when its trigger (completion, or the owner being paid) has happened; a project lost or cancelled before completion earns nothing; no launch step generates for a partner whose terms sheet is unfinished; partner outreach resolves per person through the people model's permissions before anything is sent.",
      ...PARTNER_HONESTY_RULES.map((r) => `Honesty rule (non-removable): ${r.rule} — ${r.why}`),
      `The terms sheet carries this note on its face: ${LAWYER_NOTE}`,
      "Acceptance test: one sample project carried from introduced to paid, with the reward appearing as owed only at its trigger, and the tracking sheet showing every stage it passed through.",
    ],
  });

  return {
    id: "partner",
    title: `Partner Program Design — ${profile.businessName}`,
    subtitle: "Module C: the neighboring businesses, what they need to say yes, and the written terms.",
    shortVersion: [
      `${design.partnerTypes.length} partner type(s) designed, drawn from the Referral Partners list (${partners.length} partner(s) on it).`,
      "Rewards vest on project completion or on the owner being paid — never on an introduction, and never on thirty days.",
      "The kit, the terms sheet (with the lawyer-review note on its face), and the project tracking layout are all in this report, with the Build Brief for Your AI.",
    ],
    sections,
  };
}
