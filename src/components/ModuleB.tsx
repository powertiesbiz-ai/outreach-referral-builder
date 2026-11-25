import { useState } from "react";
import { RESEARCH_NOTHING_FOUND, aiConsult, aiResearch } from "../lib/ai";
import {
  DISCLOSURE_LINE,
  HONESTY_DEFAULTS,
  POINTS_NEVER_MONEY,
  REWARDED_ACTIONS,
  consultantWarnings,
  marginCheck,
} from "../lib/referral";
import { buildReferralReport } from "../lib/report";
import type { RewardedActionId } from "../lib/types";
import type { SessionState } from "../session";
import { Callout, Card, Field, btnCls, btnGhostCls, btnGoldCls, inputCls, moneyFmt } from "./ui";

type Mutate = (fn: (s: SessionState) => void) => void;

export default function ModuleB({
  s,
  mutate,
  goReports,
}: {
  s: SessionState;
  mutate: Mutate;
  goReports: () => void;
}) {
  const d = s.referral;
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const check = marginCheck(s.profile.averageSale || 0, s.profile.grossMarginPct, d);
  const warnings = consultantWarnings(d, s.profile.averageSale || 0, s.profile.grossMarginPct);

  const toggleAction = (id: RewardedActionId) => {
    mutate((st) => {
      const has = st.referral.actions.some((a) => a.id === id);
      if (has) st.referral.actions = st.referral.actions.filter((a) => a.id !== id);
      else {
        const def = REWARDED_ACTIONS.find((a) => a.id === id)!;
        st.referral.actions.push({ id, label: def.label, guard: def.guard, measurable: def.measurable });
      }
    });
  };

  const askConsultant = async () => {
    setBusy("consult");
    const out = await aiConsult(
      "Module B: designing a customer referral program.",
      { ...d, averageSale: s.profile.averageSale, marginPct: s.profile.grossMarginPct },
    );
    setBusy("");
    if (out && out.length) setAiNotes(out);
    else setAiNotes(["The AI consultant is not reachable right now. The built-in standing follow-ups below are the same checks, computed from your numbers — nothing is skipped."]);
  };

  const runResearch = async () => {
    setBusy("research");
    const items = await aiResearch("Referral program resources for this exact setup", {
      paymentTools: s.profile.paymentTools,
      whereItLives: d.whereItLives,
      industry: s.profile.industry,
    });
    setBusy("");
    mutate((st) => {
      st.referral.research = items;
      st.referral.researchNote = items.length === 0 ? RESEARCH_NOTHING_FOUND : "";
    });
  };

  return (
    <div>
      <Card title="Module B · Referral — the customer referral program" aside="This module designs referrals from customers: people who bought and were happy. Partner businesses are a different design, with their own module (Module C). The order is deliberate: the money questions come after you have said what a sale is worth.">
        <p className="text-sm">
          From your profile: <strong>{s.profile.businessName || "(name your business on the home screen)"}</strong> · average sale{" "}
          <strong>{moneyFmt(s.profile.averageSale || 0)}</strong> · gross margin <strong>{s.profile.grossMarginPct}%</strong> · payments:{" "}
          <strong>{s.profile.paymentTools}</strong>
        </p>
      </Card>

      <Card title="Steps 1–2 · The program, and what earns">
        <Field label="Program name" hint="Suggested from your business name; confirm it again at the read-back.">
          <input className={inputCls} value={d.programName} placeholder={s.profile.businessName ? `${s.profile.businessName} Referral Program` : "Program name"}
            onChange={(e) => mutate((st) => { st.referral.programName = e.target.value; })} />
        </Field>
        <p className="text-sm font-semibold mb-2">What actions earn rewards? Each is explained before you pick it.</p>
        {REWARDED_ACTIONS.map((a) => {
          const chosen = d.actions.find((x) => x.id === a.id);
          return (
            <div key={a.id} className="border border-neutral-200 rounded-lg p-3 mb-2">
              <label className="flex gap-2 items-start">
                <input type="checkbox" className="mt-1" checked={!!chosen} onChange={() => toggleAction(a.id)} />
                <span><strong className="text-sm">{a.label}.</strong> <span className="text-sm">{a.means}</span></span>
              </label>
              {chosen && (
                <div className="grid md:grid-cols-2 gap-2 mt-2">
                  <Field label="The guard (what stops gaming)">
                    <input className={inputCls} value={chosen.guard} onChange={(e) => mutate((st) => {
                      const t = st.referral.actions.find((x) => x.id === a.id)!; t.guard = e.target.value;
                    })} />
                  </Field>
                  <Field label="How it is observed (measurability)">
                    <input className={inputCls} value={chosen.measurable} onChange={(e) => mutate((st) => {
                      const t = st.referral.actions.find((x) => x.id === a.id)!; t.measurable = e.target.value;
                    })} />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card title="Steps 3–5 · The reward, the family, and getting paid">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Reward type">
            <select className={inputCls} value={d.rewardType} onChange={(e) => mutate((st) => { st.referral.rewardType = e.target.value as typeof st.referral.rewardType; })}>
              <option value="percent">Percentage commission</option>
              <option value="flat">Flat amount per action</option>
              <option value="store-credit">Store credit</option>
              <option value="discount">Discount on a future purchase</option>
              <option value="free-service">Free service</option>
            </select>
          </Field>
          <Field label={d.rewardType === "percent" ? "Reward (% of the sale)" : "Reward amount ($)"}>
            <input type="number" className={inputCls} value={d.rewardAmount} onChange={(e) => mutate((st) => { st.referral.rewardAmount = Number(e.target.value); })} />
          </Field>
          <Field label="Who gets rewarded">
            <select className={inputCls} value={d.twoSided ? "both" : "sender"} onChange={(e) => mutate((st) => { st.referral.twoSided = e.target.value === "both"; })}>
              <option value="sender">The sender only</option>
              <option value="both">Sender and new customer both</option>
            </select>
          </Field>
          <Field label="Program family">
            <select className={inputCls} value={d.family} onChange={(e) => mutate((st) => { st.referral.family = e.target.value as typeof st.referral.family; })}>
              <option value="paid">Paid commission — real money on real sales</option>
              <option value="points">Free points — recognition, levels, perks</option>
            </select>
          </Field>
          {d.family === "points" ? (
            <Field label="Points per rewarded action">
              <input type="number" className={inputCls} value={d.pointsPerAction} onChange={(e) => mutate((st) => { st.referral.pointsPerAction = Number(e.target.value); })} />
            </Field>
          ) : (
            <Field label="Minimum payout ($)">
              <input type="number" className={inputCls} value={d.minPayout} onChange={(e) => mutate((st) => { st.referral.minPayout = Number(e.target.value); })} />
            </Field>
          )}
          <Field label="Vesting / hold (days)">
            <input type="number" className={inputCls} value={d.vestingDays} onChange={(e) => mutate((st) => { st.referral.vestingDays = Number(e.target.value); })} />
          </Field>
          <Field label="Payout method">
            <input className={inputCls} value={d.payoutMethod} onChange={(e) => mutate((st) => { st.referral.payoutMethod = e.target.value; })} />
          </Field>
          <Field label="Payout timing">
            <input className={inputCls} value={d.payoutDay} onChange={(e) => mutate((st) => { st.referral.payoutDay = e.target.value; })} />
          </Field>
          <Field label="Where the program lives">
            <select className={inputCls} value={d.whereItLives} onChange={(e) => mutate((st) => { st.referral.whereItLives = e.target.value as typeof st.referral.whereItLives; })}>
              <option value="website">Linked to my website</option>
              <option value="store">Run from the store (code / QR cards)</option>
              <option value="both">Both — one set of rules, one ledger</option>
            </select>
          </Field>
        </div>
        {d.family === "points" && <Callout label="WELDED IN:" text={POINTS_NEVER_MONEY} />}
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 mt-2">
          <p className="text-sm font-bold mb-1">The margin check, on your numbers</p>
          <p className="text-sm">
            Average sale {moneyFmt(check.averageSale)} · margin at {check.marginPct}% is {moneyFmt(check.margin)} · the reward costs{" "}
            {moneyFmt(check.rewardPerSale)} per referred sale · margin left {moneyFmt(check.marginLeft)}.
          </p>
          <p className="text-sm mt-1">{check.sentence}</p>
        </div>
      </Card>

      <Card title="The consultant and the research leg" aside="The consultant names risks in plain words and lets you decide with the risk in front of you. It never silently fixes an answer and never blocks a determined owner. The research leg cites its sources — and says so when it finds nothing solid.">
        {warnings.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-semibold mb-1">Standing follow-ups, computed from your answers:</p>
            <ul className="text-sm list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" className={btnCls} disabled={busy === "consult"} onClick={() => void askConsultant()}>
            {busy === "consult" ? "Asking…" : "Ask the AI consultant to sharpen these"}
          </button>
          <button type="button" className={btnCls} disabled={busy === "research"} onClick={() => void runResearch()}>
            {busy === "research" ? "Researching…" : "Run the research leg"}
          </button>
        </div>
        {aiNotes.length > 0 && <ul className="text-sm list-disc pl-5 mb-3">{aiNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        {d.research.length > 0 ? (
          <ul className="text-sm list-disc pl-5">
            {d.research.map((r, i) => <li key={i}>{r.claim} <span className="text-neutral-500">(Source: {r.source})</span></li>)}
          </ul>
        ) : d.researchNote ? (
          <Callout label="HONEST GAP:" text={d.researchNote} />
        ) : (
          <p className="text-sm text-neutral-500">No research run yet. The report will print the honest found-nothing statement if the leg finds nothing to cite.</p>
        )}
      </Card>

      <Card title="The honesty layer — five defaults that cannot be removed">
        <table className="w-full text-sm">
          <tbody>
            {HONESTY_DEFAULTS.map((h) => (
              <tr key={h.name} className="border-t border-neutral-100">
                <td className="p-2 font-semibold align-top w-44">{h.name}</td>
                <td className="p-2">{h.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Callout label="IN PLAIN TERMS:" text={`You design everything about your program except the parts that would make it dishonest. Those five parts are welded in. Every member link carries the line: "${DISCLOSURE_LINE}"`} />
      </Card>

      <Card title="Step 8 · The read-back" aside="Nothing generates until this read-back is confirmed, because a report built on a misread answer is worse than no report.">
        <p className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-3">
          The program is called <strong>{d.programName || "(unnamed)"}</strong>. Members earn{" "}
          <strong>{d.family === "points" ? `${d.pointsPerAction} points` : d.rewardType === "percent" ? `${d.rewardAmount}% of the sale` : `${moneyFmt(d.rewardAmount)}`}</strong>{" "}
          for: {d.actions.map((a) => a.label).join(", ") || "(no actions picked yet)"}
          {d.twoSided ? ", paid to the sender and the new customer both" : ""}. Rewards vest after {d.vestingDays} days and are paid{" "}
          {d.payoutDay.toLowerCase()} by {d.payoutMethod}
          {d.family === "paid" ? ` once a member reaches ${moneyFmt(d.minPayout)}` : ""}. The program lives{" "}
          {d.whereItLives === "both" ? "on the website and in the store, one ledger" : d.whereItLives === "website" ? "on the website" : "in the store"}. The five honesty rules stand as printed above.
          {d.family === "points" ? ` ${POINTS_NEVER_MONEY}` : ""}
        </p>
        <label className="flex gap-2 items-center text-sm font-semibold mt-3">
          <input type="checkbox" checked={s.referralConfirmed} onChange={(e) => mutate((st) => { st.referralConfirmed = e.target.checked; })} />
          The read-back is right. Build the report.
        </label>
        <div className="mt-3">
          <button type="button" className={btnGoldCls} disabled={!s.referralConfirmed || d.actions.length === 0 || !d.programName.trim()}
            onClick={() => { mutate((st) => { st.reports.referral = buildReferralReport(st.profile, st.referral); }); goReports(); }}>
            Assemble the referral program report →
          </button>
        </div>
      </Card>
    </div>
  );
}
