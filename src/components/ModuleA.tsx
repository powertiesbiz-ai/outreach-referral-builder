import { useMemo, useRef, useState } from "react";
import {
  applyEmailTest,
  applyEnrichment,
  fitScore,
  guessEmail,
  mergePeople,
  onList,
  parseCsv,
  resolvePermission,
  rowsToPeople,
  runFunnel,
  sendable,
  addMembership,
  removeMembership,
  EMAIL_TEST_WINDOW_DAYS,
} from "../lib/people";
import { aiEnrich } from "../lib/ai";
import { buildContactCsv, buildOutreachReport } from "../lib/report";
import type {
  ActionId,
  EmailTestAnswer,
  ListDef,
  Person,
  RunningSetup,
  SourceId,
  VerificationState,
} from "../lib/types";
import type { SessionState } from "../session";
import { Callout, Card, Field, btnCls, btnGhostCls, btnGoldCls, inputCls, moneyFmt } from "./ui";

type Mutate = (fn: (s: SessionState) => void) => void;

const ALL_ACTIONS: ActionId[] = [
  "general",
  "referral-ask",
  "education",
  "company-material",
  "introduction",
  "partner-material",
];

export default function ModuleA({
  s,
  mutate,
  goReports,
}: {
  s: SessionState;
  mutate: Mutate;
  goReports: () => void;
}) {
  const [source, setSource] = useState<SourceId>("customers");
  const [paste, setPaste] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkList, setBulkList] = useState<string>("clients");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [newList, setNewList] = useState({ name: "", rule: "" });
  const [manual, setManual] = useState({ name: "", email: "", phone: "", company: "" });
  const [enrich, setEnrich] = useState({ email: "", phone: "", social: "", src: "", domain: "" });
  const [aiNote, setAiNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const focus = s.people.find((p) => p.id === focusId) ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const funnel = useMemo(
    () => runFunnel(s.people, s.lists, s.outreach.rates, s.profile.averageSale || 0),
    [s.people, s.lists, s.outreach.rates, s.profile.averageSale],
  );

  const rescore = (people: Person[]): Person[] =>
    people.map((p) => ({ ...p, fitScore: fitScore(p, s.profile.bestCustomerProfile) }));

  const loadRows = (rows: Record<string, string>[], src: SourceId) => {
    const incoming = rowsToPeople(rows, src);
    mutate((st) => {
      st.people = rescore(mergePeople(st.people, incoming));
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    loadRows(parseCsv(text), source);
  };

  const recommendSetup = (): { setup: RunningSetup; reason: string } => {
    const n = s.people.length;
    if (n < 500 && s.outreach.budget === "zero") {
      return {
        setup: "spreadsheet",
        reason: `A spreadsheet: ${n} people and a zero budget. Free and simple; you or your AI moves every row by hand. No automation, no tracking beyond what someone types in.`,
      };
    }
    if (n <= 3000) {
      return {
        setup: "free-crm",
        reason: `A free CRM (for example HubSpot Free or Zoho CRM free tier): ${n} people is past spreadsheet comfort. Real pipelines, contact history, and send tracking at no cost, inside limits a growing list will eventually hit.`,
      };
    }
    return {
      setup: "paid-crm",
      reason: `A paid CRM: ${n} people, or a team running outreach, needs automation and reporting. The monthly cost has to earn its keep against the funnel numbers below — check them before you pay.`,
    };
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAssign = () => {
    mutate((st) => {
      for (const p of st.people) {
        if (selected.has(p.id)) addMembership(p, bulkList, "owner-assigned", today, "Assigned in bulk at sorting.");
      }
      st.people = rescore(st.people);
    });
    setSelected(new Set());
  };

  const buildReport = () => {
    mutate((st) => {
      const plan = {
        setup: st.outreach.setup,
        setupReason: st.outreach.setupReason,
        runner: st.outreach.runner,
        rhythm: st.outreach.rhythm,
        sendingDomain: st.outreach.sendingDomain,
        templates: st.outreach.templates,
        funnel,
        freshness:
          "Re-verify the addresses and re-run a light version of the email test twice a year for warm lists and yearly for cold lists, with the dates written into the program's calendar. The contact file is reissued at each cycle.",
      };
      st.reports.outreachPlan = plan;
      st.reports.outreach = buildOutreachReport(st.profile, st.people, st.lists, plan);
    });
    goReports();
  };

  const testOutcomes: { id: EmailTestAnswer; label: string }[] = [
    { id: "interested-offers", label: "Answered: interested in offers" },
    { id: "education-only", label: "Answered: education only" },
    { id: "referrals-only", label: "Answered: referrals only" },
    { id: "no", label: "Answered: no (suppress everywhere)" },
    { id: "auto-responder", label: "Auto-responder (not a reply)" },
    { id: "silence", label: `Silent past ${EMAIL_TEST_WINDOW_DAYS} days` },
  ];

  return (
    <div>
      <Card title="Step 1 · Your numbers, confirmed" aside="These two numbers run the whole plan: they size the funnel below and set the pace the engine recommends. They come from your business profile — change them there and this module follows.">
        <p className="text-sm">
          Average project or job size: <strong>{moneyFmt(s.profile.averageSale || 0)}</strong> ·
          Average monthly earnings: <strong>{moneyFmt(s.profile.averageMonthlyEarnings || 0)}</strong> ·
          Gross margin: <strong>{s.profile.grossMarginPct}%</strong>
        </p>
        {(!s.profile.averageSale || !s.profile.businessName) && (
          <Callout label="FIRST:" text="Finish the business profile on the home screen. The plan is only as honest as these numbers." tone="warn" />
        )}
      </Card>

      <Card title="Step 2 · Where the program will run" aside="The recommendation follows your answers, not a house preference. The trade-offs are in the open.">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Budget for tools">
            <select className={inputCls} value={s.outreach.budget} onChange={(e) => mutate((st) => { st.outreach.budget = e.target.value as typeof st.outreach.budget; })}>
              <option value="zero">Zero — free tools only</option>
              <option value="some">Some — a little each month</option>
              <option value="funded">Funded — tools are a real line item</option>
            </select>
          </Field>
          <Field label="Who runs the program">
            <select className={inputCls} value={s.outreach.runner} onChange={(e) => mutate((st) => { st.outreach.runner = e.target.value; })}>
              <option>Me, the owner</option>
              <option>My AI</option>
              <option>A caller</option>
              <option>Me and my AI together</option>
            </select>
          </Field>
          <Field label="People loaded so far">
            <p className="text-sm py-2">{s.people.length} people (Step 4 loads them)</p>
          </Field>
        </div>
        <button type="button" className={btnCls} onClick={() => { const r = recommendSetup(); mutate((st) => { st.outreach.setup = r.setup; st.outreach.setupReason = r.reason; }); }}>
          Recommend my setup
        </button>
        <p className="text-sm mt-3">{s.outreach.setupReason}</p>
      </Card>

      <Card title="Step 3 · What running it well takes" aside="The kit, laid out before any list is loaded, so the plan is built on a true picture of the work.">
        <Field label="Sending address (your business domain)" hint="Outreach goes from a real business address on your own domain, prepared so mail lands in inboxes rather than spam folders.">
          <input className={inputCls} placeholder="you@yourbusiness.com" value={s.outreach.sendingDomain} onChange={(e) => mutate((st) => { st.outreach.sendingDomain = e.target.value; })} />
        </Field>
        <Field label="The weekly rhythm">
          <input className={inputCls} value={s.outreach.rhythm} onChange={(e) => mutate((st) => { st.outreach.rhythm = e.target.value; })} />
        </Field>
        <Field label="First-touch template (your voice)">
          <textarea className={inputCls} rows={3} value={s.outreach.templates.firstTouch} onChange={(e) => mutate((st) => { st.outreach.templates.firstTouch = e.target.value; })} />
        </Field>
        <Field label="Follow-up template">
          <textarea className={inputCls} rows={2} value={s.outreach.templates.followUp} onChange={(e) => mutate((st) => { st.outreach.templates.followUp = e.target.value; })} />
        </Field>
        <Field label="The email test message (Step 6 designs it; this is the draft)">
          <textarea className={inputCls} rows={3} value={s.outreach.templates.emailTest} onChange={(e) => mutate((st) => { st.outreach.templates.emailTest = e.target.value; })} />
        </Field>
        <p className="text-xs text-neutral-500">Templates are drafted from how you talk about your work: one clear ask per message, never a blast template with the name swapped in. The home screen's "Draft my templates" button fills these from your business name.</p>
      </Card>

      <Card title="Step 4 · Load the people" aside="Past customers from your invoicing or spreadsheet, phone contacts exported as a file, LinkedIn's own connections export. However they arrive, duplicates merge into one record per person, carrying every source.">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <select className={inputCls + " w-auto"} value={source} onChange={(e) => setSource(e.target.value as SourceId)}>
            <option value="customers">Past customers</option>
            <option value="phone">Phone contacts</option>
            <option value="linkedin">LinkedIn connections</option>
          </select>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className={btnCls} onClick={() => fileRef.current?.click()}>Load a CSV file</button>
          <span className="text-sm text-neutral-500">{s.people.length} people · {s.people.filter((p) => p.suppressed).length} suppressed · {s.people.filter(sendable).length} sendable today (verified email)</span>
        </div>
        <Field label="…or paste CSV rows here">
          <textarea className={inputCls} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Name,Email,Phone,Company\nJane Cousin,jane@example.com,555-0100,"} />
        </Field>
        <button type="button" className={btnGhostCls} onClick={() => { if (paste.trim()) { loadRows(parseCsv(paste), source); setPaste(""); } }}>Load pasted rows</button>
        <div className="grid md:grid-cols-4 gap-2 mt-4">
          <input className={inputCls} placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
          <input className={inputCls} placeholder="Email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
          <input className={inputCls} placeholder="Phone" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
          <input className={inputCls} placeholder="Company" value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} />
        </div>
        <button type="button" className={btnGhostCls + " mt-2"} onClick={() => {
          if (!manual.name && !manual.email) return;
          loadRows([{ name: manual.name, email: manual.email, phone: manual.phone, company: manual.company }], "manual");
          setManual({ name: "", email: "", phone: "", company: "" });
        }}>Add one person by hand</button>
        <div className="mt-3">
          <button type="button" className={btnGhostCls} onClick={() => {
            const csv = buildContactCsv(s.people, s.lists);
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "contact-file.csv"; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
          }}>Download the contact file (CSV) as it stands</button>
        </div>
      </Card>

      <Card title="Step 5 · Sort the people onto lists" aside="Select many at once and assign in bulk. A person can sit on several lists in the same pass — the per-action rules, not a filing fight, decide what they may be sent. Owner lists can narrow a person's treatment; they can never loosen a base list's rule.">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <div className="grow min-w-[200px]">
            <Field label="New list of your own (name + its stated rule)">
              <input className={inputCls} placeholder="List name, e.g. Past customers — kitchen work" value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} />
            </Field>
            <input className={inputCls} placeholder="Its rule, e.g. Program news only" value={newList.rule} onChange={(e) => setNewList({ ...newList, rule: e.target.value })} />
          </div>
          <button type="button" className={btnGhostCls} onClick={() => {
            if (!newList.name.trim()) return;
            const id = newList.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            mutate((st) => {
              if (!st.lists.some((l) => l.id === id)) {
                st.lists.push({ id, name: newList.name.trim(), rule: newList.rule.trim() || "Owner-created list.", base: false, allowedActions: ["general", "education"] });
              }
            });
            setNewList({ name: "", rule: "" });
          }}>Create the list</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <span className="text-sm">{selected.size} selected →</span>
          <select className={inputCls + " w-auto"} value={bulkList} onChange={(e) => setBulkList(e.target.value)}>
            {s.lists.map((l: ListDef) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="button" className={btnCls} disabled={selected.size === 0} onClick={bulkAssign}>Assign in bulk</button>
          <button type="button" className={btnGhostCls} onClick={() => setSelected(new Set(s.people.map((p) => p.id)))}>Select everyone</button>
          <button type="button" className={btnGhostCls} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-neutral-200 rounded-lg">
          <table className="w-full text-sm">
            <thead><tr className="bg-neutral-50 text-left">
              <th className="p-2"></th><th className="p-2">Person</th><th className="p-2">Lists</th><th className="p-2">Fit</th><th className="p-2">State</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {s.people.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="p-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                  <td className="p-2"><strong>{p.name}</strong><br /><span className="text-neutral-500">{p.email || "no email"} · {p.sources.join(", ")}</span></td>
                  <td className="p-2">{p.memberships.map((m) => s.lists.find((l) => l.id === m.listId)?.name ?? m.listId).join(", ") || "—"}</td>
                  <td className="p-2">{p.fitScore}</td>
                  <td className="p-2">{p.suppressed ? <span className="text-red-700 font-semibold">Suppressed</span> : p.emailVerification === "guessed" ? "Guess held" : p.emailVerification}</td>
                  <td className="p-2"><button type="button" className={btnGhostCls} onClick={() => { setFocusId(p.id); setEnrich({ email: "", phone: "", social: "", src: "", domain: "" }); }}>Work this person</button></td>
                </tr>
              ))}
              {s.people.length === 0 && <tr><td colSpan={6} className="p-3 text-neutral-500">No people loaded yet. Step 4 is where they arrive.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {focus && (
        <Card title={`Working: ${focus.name}`} aside="Memberships, the Personal authorization, verification, enrichment, and the email test — everything about one person in one place.">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold mb-1">Lists (click to add or remove)</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {s.lists.map((l) => (
                  <button key={l.id} type="button" className={onList(focus, l.id) ? btnGoldCls : btnGhostCls}
                    onClick={() => mutate((st) => {
                      const p = st.people.find((x) => x.id === focus.id)!;
                      if (onList(p, l.id)) removeMembership(p, l.id);
                      else addMembership(p, l.id, "owner-assigned", today, "Assigned by the owner during sorting.");
                      st.people = rescore(st.people);
                    })}>
                    {l.name}{onList(focus, l.id) ? " ✓" : ""}
                  </button>
                ))}
              </div>
              <p className="text-sm font-semibold mb-1">Permissions, resolved per action</p>
              <ul className="text-sm mb-3">
                {ALL_ACTIONS.map((a) => {
                  const r = resolvePermission(focus, a, s.lists);
                  return <li key={a}>{r.allowed ? "✓" : "✗"} {a} — <span className="text-neutral-500">{r.reason}</span></li>;
                })}
              </ul>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={focus.suppressed} onChange={(e) => mutate((st) => {
                  const p = st.people.find((x) => x.id === focus.id)!;
                  p.suppressed = e.target.checked;
                  p.suppressionNote = e.target.checked ? "Suppressed by the owner in the app. Permanent, on every list." : undefined;
                })} />
                Suppressed (said no / opted out — permanent, everywhere)
              </label>
            </div>
            <div>
              <Field label="Personal authorization (who agreed, when, for what)" hint="Only matters for people on the Personal list. Without this note, Personal means no business contact.">
                <input className={inputCls} placeholder="Authorized by (name)" value={focus.authorization?.by ?? ""} onChange={(e) => mutate((st) => {
                  const p = st.people.find((x) => x.id === focus.id)!;
                  p.authorization = { by: e.target.value, when: p.authorization?.when ?? today, actions: p.authorization?.actions ?? ["general"] };
                })} />
              </Field>
              <Field label="Email verification state" hint="Every address is verified before it is ever sent to. Guessed addresses are held from every send until they pass verification.">
                <select className={inputCls} value={focus.emailVerification} onChange={(e) => mutate((st) => {
                  const p = st.people.find((x) => x.id === focus.id)!;
                  p.emailVerification = e.target.value as VerificationState;
                })}>
                  <option value="none">No email</option>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="guessed">Guessed (held from sends)</option>
                  <option value="dead">Dead address</option>
                </select>
              </Field>
              <p className="text-sm font-semibold mb-1">Enrichment — public business information only</p>
              {onList(focus, "personal") ? (
                <Callout label="THE LINE:" text="This person is on the Personal list. Enrichment looks for nothing at all beyond what you already have." />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Found email" value={enrich.email} onChange={(e) => setEnrich({ ...enrich, email: e.target.value })} />
                    <input className={inputCls} placeholder="Found phone" value={enrich.phone} onChange={(e) => setEnrich({ ...enrich, phone: e.target.value })} />
                    <input className={inputCls} placeholder="Found social profile URL" value={enrich.social} onChange={(e) => setEnrich({ ...enrich, social: e.target.value })} />
                    <input className={inputCls} placeholder="Source (where it was found)" value={enrich.src} onChange={(e) => setEnrich({ ...enrich, src: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" className={btnGhostCls} onClick={() => {
                      if (!enrich.src.trim()) { setAiNote("Every enriched field carries its source. Name the source first."); return; }
                      mutate((st) => {
                        const p = st.people.find((x) => x.id === focus.id)!;
                        applyEnrichment(p, {
                          email: enrich.email ? { value: enrich.email, source: enrich.src } : undefined,
                          phone: enrich.phone ? { value: enrich.phone, source: enrich.src } : undefined,
                          socialProfile: enrich.social ? { value: enrich.social, source: enrich.src } : undefined,
                        });
                        st.people = rescore(st.people);
                      });
                      setAiNote("Enrichment applied, with its source on every field.");
                    }}>Apply found information</button>
                    <input className={inputCls + " w-44"} placeholder="Company domain for a guess" value={enrich.domain} onChange={(e) => setEnrich({ ...enrich, domain: e.target.value })} />
                    <button type="button" className={btnGhostCls} onClick={() => {
                      const g = guessEmail(focus.name, enrich.domain);
                      if (!g) { setAiNote("A guess needs a full name and a domain."); return; }
                      mutate((st) => {
                        const p = st.people.find((x) => x.id === focus.id)!;
                        applyEnrichment(p, { email: { value: g, source: "pattern guess", guessed: true } });
                      });
                      setAiNote(`Pattern guess recorded: ${g}. It is marked as a guess and held from every send until it passes verification.`);
                    }}>Record a pattern guess</button>
                    <button type="button" className={btnGhostCls} onClick={async () => {
                      setAiNote("Asking the research pass…");
                      const found = await aiEnrich(focus.name, focus.company);
                      if (!found || (!found.email && !found.phone && !found.socialProfile)) {
                        setAiNote("The research pass found nothing solid for this person. That is an honest result — the record stays as you supplied it, marked unresearched, and is never guessed at.");
                        return;
                      }
                      mutate((st) => {
                        const p = st.people.find((x) => x.id === focus.id)!;
                        applyEnrichment(p, found);
                        st.people = rescore(st.people);
                      });
                      setAiNote("Research pass applied what it found, each field with its source.");
                    }}>Ask the research pass</button>
                  </div>
                  {aiNote && <p className="text-sm mt-2">{aiNote}</p>}
                </>
              )}
              <p className="text-sm font-semibold mt-3 mb-1">The email test outcome for this person</p>
              <div className="flex flex-wrap gap-1">
                {testOutcomes.map((o) => (
                  <button key={o.id} type="button" className={btnGhostCls} onClick={() => mutate((st) => {
                    const p = st.people.find((x) => x.id === focus.id)!;
                    applyEmailTest(p, o.id, today);
                    st.people = rescore(st.people);
                  })}>{o.label}</button>
                ))}
              </div>
              {focus.memberships.length > 0 && (
                <ul className="text-xs text-neutral-500 mt-2">
                  {focus.memberships.map((m) => (
                    <li key={m.listId}>{s.lists.find((l) => l.id === m.listId)?.name}: {m.basis}, {m.date}{m.note ? ` — ${m.note}` : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card title="Step 6 · The email test" aside={`One value-first message, in your voice — never a pitch wearing a survey's clothes. Answers adjust memberships. A no suppresses that day, everywhere. An auto-responder is not a reply. Silence for the full ${EMAIL_TEST_WINDOW_DAYS}-day window, with one reminder sent inside it, gains the default membership (Cold contacts, low frequency), recorded openly as default by silence. Who may receive the test at all is resolved per action: a person whose memberships permit no business contact is not tested, because the test is business contact.`}>
        <p className="text-sm mb-2">Test message (from Step 3):</p>
        <p className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-3">{s.outreach.templates.emailTest || "(Draft it in Step 3.)"}</p>
        <p className="text-sm mt-3">
          Reachable for the test today: {s.people.filter((p) => !p.suppressed && resolvePermission(p, "general", s.lists).allowed).length} people ·
          held out by their memberships: {s.people.filter((p) => !p.suppressed && !resolvePermission(p, "general", s.lists).allowed).length}
        </p>
        <button type="button" className={btnGhostCls + " mt-2"} onClick={() => mutate((st) => {
          for (const p of st.people) {
            const tested = p.memberships.some((m) => m.basis === "email-test" || m.basis === "default-by-silence");
            if (!p.suppressed && !tested) applyEmailTest(p, "silence", today);
          }
          st.people = rescore(st.people);
        })}>Mark everyone still unanswered as silent past the window</button>
      </Card>

      <Card title="Step 7 · The numbers, and the plan" aside="The funnel, per list, in three cases. Each person counts once, under the warmest list they belong to. Rates are planning assumptions you can change — never a promise.">
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          {(["conservative", "expected", "strong"] as const).map((c) => (
            <div key={c} className="border border-neutral-200 rounded-lg p-3">
              <p className="text-sm font-bold capitalize mb-2">{c} rates</p>
              {(["deliverablePct", "replyPct", "meetingPct", "closePct"] as const).map((k) => (
                <label key={k} className="flex justify-between text-xs mb-1">
                  <span>{k.replace("Pct", "")} %</span>
                  <input type="number" className="w-16 border border-neutral-300 rounded px-1" value={s.outreach.rates[c][k]}
                    onChange={(e) => mutate((st) => { st.outreach.rates[c][k] = Number(e.target.value); })} />
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-neutral-50 text-left"><th className="p-2">List</th><th className="p-2">People</th><th className="p-2">Conservative</th><th className="p-2">Expected</th><th className="p-2">Strong</th></tr></thead>
            <tbody>
              {funnel.map((f) => (
                <tr key={f.listId} className="border-t border-neutral-100">
                  <td className="p-2 font-semibold">{f.listName}</td>
                  <td className="p-2">{f.conservative.people}</td>
                  <td className="p-2">about {Math.round(f.conservative.jobs)} jobs · {moneyFmt(f.conservative.value)}</td>
                  <td className="p-2">about {Math.round(f.expected.jobs)} jobs · {moneyFmt(f.expected.value)}</td>
                  <td className="p-2">about {Math.round(f.strong.jobs)} jobs · {moneyFmt(f.strong.value)}</td>
                </tr>
              ))}
              {funnel.length === 0 && <tr><td colSpan={5} className="p-2 text-neutral-500">No lists with people yet — the model runs when the lists do.</td></tr>}
            </tbody>
          </table>
        </div>
        <Callout label="REMEMBER:" text="Plan around the expected case. The strong case is a ceiling, not a goal to promise anyone. Rerun this model with real rates after the first month." />
        <button type="button" className={btnGoldCls} disabled={s.people.length === 0} onClick={buildReport}>
          Assemble the outreach report and contact file →
        </button>
      </Card>
    </div>
  );
}
