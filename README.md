# Outreach and Referral Builder

One app, three modules (design: "Outreach and Referral Builder — App
Design", Keith's decisions of November 25, 2026):

- **Module A · Outreach** — the people system: CSV imports (past
  customers, phone contacts, LinkedIn), one record per person with many
  list memberships, per-action permission resolution, the email test
  (14-day window, one reminder), enrichment (public business info only,
  sources carried, guesses held), per-list funnel math, the eight engine
  rules. Outputs: the outreach report + the contact file (CSV).
- **Module B · Referral** — the customer referral program designer:
  eight-step flow, margin check on the owner's numbers, the five
  non-removable honesty defaults, a two-part report with the Build
  Brief for Your AI.
- **Module C · Partner Referrals** — the partner program designer
  (More Leads Move 2): partner types drawn from Module A's Referral
  Partners list, the enablement kit, project-economics margin check,
  agreement terms with the lawyer-review note, project tracking.

Pattern: the standard PowerTies hub app — Vite + React + TS, the
Firebase gate (GATE_ENFORCE) at Growth access, AI calls through
`api/assist.ts` on the pinned model `gemini-3.8-flash` with fail-closed
entitlement checks, and local-first throughout: no database of the
owner's contacts or business data. Preview and downloads (separate
DOCX / PDF buttons per report, CSV standalone) are all generated from
the same assembled plan object in the owner's session.

Tests: `npm test` (tests/orb.test.mjs — the design's test plan, run
against the real lib code).
