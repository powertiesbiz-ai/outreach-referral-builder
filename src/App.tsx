import { useCallback, useState } from "react";
import ModuleA from "./components/ModuleA";
import ModuleB from "./components/ModuleB";
import ModuleC from "./components/ModuleC";
import Reports from "./components/Reports";
import { Card, Field, btnGhostCls, btnGoldCls, inputCls } from "./components/ui";
import { initialSession, templateDrafts, type SessionState } from "./session";

type View = "home" | "a" | "b" | "c" | "reports";

const NAV: { id: View; label: string }[] = [
  { id: "home", label: "Home & profile" },
  { id: "a", label: "Module A · Outreach" },
  { id: "b", label: "Module B · Referral" },
  { id: "c", label: "Module C · Partner Referrals" },
  { id: "reports", label: "Reports & downloads" },
];

export default function App() {
  const [session, setSession] = useState<SessionState>(() => initialSession());
  const [view, setView] = useState<View>("home");

  /** All state changes flow through here: clone, mutate, replace. The
   *  session lives in memory only — nothing persists anywhere. */
  const mutate = useCallback((fn: (s: SessionState) => void) => {
    setSession((prev) => {
      const next = structuredClone(prev) as SessionState;
      fn(next);
      return next;
    });
  }, []);

  const p = session.profile;

  return (
    <div className="min-h-screen">
      <header className="no-print bg-neutral-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <p className="text-xs font-bold tracking-widest text-[#C6A15B]">POWERTIES CONSULTING GROUP</p>
          <h1 className="text-2xl font-bold mt-1">Outreach and Referral Builder</h1>
          <p className="text-sm text-neutral-300 mt-1">
            One app, three modules: the people system, the customer referral program, and the partner referral program —
            designed on paper here, built afterward on your own systems.
          </p>
        </div>
        <nav className="max-w-5xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              className={`text-sm font-semibold rounded-lg px-3 py-1.5 ${
                view === n.id ? "bg-[#C6A15B] text-neutral-900" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {view === "home" && (
          <div>
            <Card
              title="The order of use"
              aside="For most businesses, Outreach comes first: you already have the raw material today — past customers, phone contacts, LinkedIn connections, sitting unorganized. Referral comes when there are happy customers to mobilize. Partner Referrals comes third, because partners are courted best from strength. But the order is a recommendation, not a lock: any module can be started first."
            >
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="border border-neutral-200 rounded-lg p-3">
                  <p className="font-bold mb-1">Module A · Outreach</p>
                  <p>Loads everyone you know, sorts them onto lists with written contact rules, puts them to one honest email test, and hands back the plan, the numbers, and the contact file your AI loads into a CRM.</p>
                  <button type="button" className={btnGoldCls + " mt-2"} onClick={() => setView("a")}>Open Module A</button>
                </div>
                <div className="border border-neutral-200 rounded-lg p-3">
                  <p className="font-bold mb-1">Module B · Referral</p>
                  <p>Designs the customer referral program: what earns, what it pays, when it vests, the rules in plain words — with the margin check run on your real average sale and the honesty layer welded in.</p>
                  <button type="button" className={btnGoldCls + " mt-2"} onClick={() => setView("b")}>Open Module B</button>
                </div>
                <div className="border border-neutral-200 rounded-lg p-3">
                  <p className="font-bold mb-1">Module C · Partner Referrals</p>
                  <p>Designs the partner program: the neighboring businesses who control bigger projects, the kit that makes it easy for them to say yes, rewards on project time, and the terms in writing before the first project.</p>
                  <button type="button" className={btnGoldCls + " mt-2"} onClick={() => setView("c")}>Open Module C</button>
                </div>
              </div>
              <p className="text-xs text-neutral-500 mt-3">
                How this differs from the Customer Retention app beside it on the hub: that app runs the ongoing touches.
                This app designs the three systems underneath that work. Retention keeps the fire burning; this builds the fireplace and the woodpile.
              </p>
            </Card>

            <Card
              title="Your business profile — entered once"
              aside="All three modules read from this profile, and no module re-asks what it already holds. Local-first: the profile lives in this session on your device. Nothing is stored on a PowerTies server — and if you close the app without downloading your reports, the work is gone. The app will warn you before the last step rather than pretend otherwise."
            >
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Business name">
                  <input className={inputCls} value={p.businessName} onChange={(e) => mutate((st) => { st.profile.businessName = e.target.value; })} />
                </Field>
                <Field label="Industry (your trade, in your words)">
                  <input className={inputCls} value={p.industry} onChange={(e) => mutate((st) => { st.profile.industry = e.target.value; })} />
                </Field>
              </div>
              <Field label="What you sell (main products or services, with prices)">
                <textarea className={inputCls} rows={2} value={p.whatTheySell} onChange={(e) => mutate((st) => { st.profile.whatTheySell = e.target.value; })} />
              </Field>
              <div className="grid md:grid-cols-3 gap-3">
                <Field label="Average sale / average project ($)" hint="Drives every piece of math in all three modules.">
                  <input type="number" className={inputCls} value={p.averageSale || ""} onChange={(e) => mutate((st) => { st.profile.averageSale = Number(e.target.value); })} />
                </Field>
                <Field label="Average monthly earnings ($)">
                  <input type="number" className={inputCls} value={p.averageMonthlyEarnings || ""} onChange={(e) => mutate((st) => { st.profile.averageMonthlyEarnings = Number(e.target.value); })} />
                </Field>
                <Field label="Gross margin on a typical job (%)">
                  <input type="number" className={inputCls} value={p.grossMarginPct} onChange={(e) => mutate((st) => { st.profile.grossMarginPct = Number(e.target.value); })} />
                </Field>
                <Field label="Payment tools">
                  <select className={inputCls} value={p.paymentTools} onChange={(e) => mutate((st) => { st.profile.paymentTools = e.target.value as typeof st.profile.paymentTools; })}>
                    <option value="stripe">Stripe</option>
                    <option value="square">Square</option>
                    <option value="neither">Neither</option>
                  </select>
                </Field>
                <Field label="Website (what it runs on)">
                  <input className={inputCls} value={p.website} onChange={(e) => mutate((st) => { st.profile.website = e.target.value; })} />
                </Field>
                <Field label="Best customer, in your words" hint="Fit scoring in Module A runs against this.">
                  <input className={inputCls} value={p.bestCustomerProfile} onChange={(e) => mutate((st) => { st.profile.bestCustomerProfile = e.target.value; })} />
                </Field>
              </div>
              <label className="flex gap-2 items-center text-sm mb-3">
                <input type="checkbox" checked={p.canAddPage} onChange={(e) => mutate((st) => { st.profile.canAddPage = e.target.checked; })} />
                I can add a page to my website
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGhostCls} onClick={() => mutate((st) => { st.outreach.templates = templateDrafts(st.profile.businessName); if (!st.referral.programName && st.profile.businessName) st.referral.programName = `${st.profile.businessName} Referral Program`; })}>
                  Draft my Module A templates from this profile
                </button>
                <button type="button" className={btnGoldCls} onClick={() => setView("a")}>
                  Start with Module A →
                </button>
              </div>
            </Card>
          </div>
        )}

        {view === "a" && <ModuleA s={session} mutate={mutate} goReports={() => setView("reports")} />}
        {view === "b" && <ModuleB s={session} mutate={mutate} goReports={() => setView("reports")} />}
        {view === "c" && <ModuleC s={session} mutate={mutate} goReports={() => setView("reports")} />}
        {view === "reports" && <Reports s={session} />}
      </main>

      <footer className="no-print max-w-5xl mx-auto px-4 pb-8 text-xs text-neutral-500">
        Outreach and Referral Builder · PowerTies Consulting Group. Local-first: this app stores nobody's customers or
        contacts in a PowerTies database. What you make here leaves in the files you download.
      </footer>
    </div>
  );
}
