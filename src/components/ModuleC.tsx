import { useState } from "react";
import { onList } from "../lib/people";
import {
  LAWYER_NOTE,
  PARTNER_HONESTY_RULES,
  PROJECT_STAGES,
  REWARD_SHAPES,
  partnerMarginCheck,
  projectReward,
  triggerState,
} from "../lib/partners";
import { buildPartnerReport } from "../lib/report";
import type { PartnerTypeDesign, ProjectStage, RewardShape, RewardTrigger } from "../lib/types";
import type { SessionState } from "../session";
import { Callout, Card, Field, btnGhostCls, btnGoldCls, inputCls, moneyFmt } from "./ui";

type Mutate = (fn: (s: SessionState) => void) => void;

const emptyType: PartnerTypeDesign = {
  type: "",
  controls: "",
  rewardShape: "percent-piece",
  rewardPct: 5,
  rewardFlat: 250,
  trigger: "paid",
  clientOwnership: "partner",
  presentation: "introduction",
  invoicing: "owner-to-partner",
  directLater: "The partner is told, and the standing reward applies to direct repeat work for 12 months.",
};

export default function ModuleC({
  s,
  mutate,
  goReports,
}: {
  s: SessionState;
  mutate: Mutate;
  goReports: () => void;
}) {
  const d = s.partner;
  const [proj, setProj] = useState({ partnerName: "", project: "", stage: "introduced" as ProjectStage, ownerPiece: 0 });
  const partners = s.people.filter((p) => onList(p, "referral-partners"));
  const pctType = d.partnerTypes.find((t) => t.rewardShape === "percent-piece" || t.rewardShape === "percent-project");
  const mc = pctType
    ? partnerMarginCheck(d.sampleProject.projectValue, d.sampleProject.ownerPiece, d.sampleProject.marginPct, pctType.rewardPct, pctType.rewardShape === "percent-project" ? "project" : "piece")
    : null;

  const patchType = (idx: number, patch: Partial<PartnerTypeDesign>) =>
    mutate((st) => { st.partner.partnerTypes[idx] = { ...st.partner.partnerTypes[idx], ...patch }; });

  return (
    <div>
      <Card title="Module C · Partner Referrals" aside="The businesses in the trades beside yours, who control projects bigger than anything you could win alone — the general contractor who needs a crew he can trust. The doctrine is Move 2 of More Leads: referral partners in two rings. This module designs the first ring in full; the second ring is the growth path once the first is producing.">
        <p className="text-sm">
          Partners come from the people system, never from a private roster: <strong>{partners.length} partner(s)</strong> sit on your Referral Partners list in Module A.
          {partners.length === 0 && " Sort neighboring businesses onto that list in Module A and they appear here, with their fit notes."}
        </p>
        {partners.length > 0 && (
          <ul className="text-sm mt-2">
            {partners.map((p) => (
              <li key={p.id}><strong>{p.name}</strong>{p.company ? ` · ${p.company}` : ""} · fit {p.fitScore} · court in fit order, warmest first</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Steps 1 and 3 · Partner types and their rewards" aside="Asked per type, because the fit story — and the safe reward — is different for a contractor than for a realtor. The money questions come after the work is described, so the real numbers are in front of you.">
        {d.partnerTypes.map((t, i) => (
          <div key={i} className="border border-neutral-200 rounded-lg p-3 mb-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Partner type (the adjacent trade)">
                <input className={inputCls} value={t.type} placeholder="e.g. General contractors" onChange={(e) => patchType(i, { type: e.target.value })} />
              </Field>
              <Field label="What they control, and where your work fits">
                <input className={inputCls} value={t.controls} placeholder="e.g. Whole-home renovations, $40k–$120k; our flooring is in every one" onChange={(e) => patchType(i, { controls: e.target.value })} />
              </Field>
              <Field label="Reward shape">
                <select className={inputCls} value={t.rewardShape} onChange={(e) => patchType(i, { rewardShape: e.target.value as RewardShape })}>
                  {REWARD_SHAPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
              {(t.rewardShape === "percent-piece" || t.rewardShape === "percent-project") && (
                <Field label="Reward percentage">
                  <input type="number" className={inputCls} value={t.rewardPct} onChange={(e) => patchType(i, { rewardPct: Number(e.target.value) })} />
                </Field>
              )}
              {t.rewardShape === "flat" && (
                <Field label="Flat fee per project won">
                  <input type="number" className={inputCls} value={t.rewardFlat} onChange={(e) => patchType(i, { rewardFlat: Number(e.target.value) })} />
                </Field>
              )}
              {t.rewardShape === "none" && (
                <Field label="Review date for the reward question">
                  <input type="date" className={inputCls} value={d.reviewDate} onChange={(e) => mutate((st) => { st.partner.reviewDate = e.target.value; })} />
                </Field>
              )}
              <Field label="When the reward is earned (the trigger)">
                <select className={inputCls} value={t.trigger} onChange={(e) => patchType(i, { trigger: e.target.value as RewardTrigger })}>
                  <option value="completion">When the project completes</option>
                  <option value="paid">When I am paid for my piece</option>
                </select>
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-1">
              <Field label="Who owns the end-client relationship">
                <select className={inputCls} value={t.clientOwnership} onChange={(e) => patchType(i, { clientOwnership: e.target.value as typeof t.clientOwnership })}>
                  <option value="partner">The partner's client stays the partner's (subcontract)</option>
                  <option value="owner">The client becomes mine (introduction)</option>
                </select>
              </Field>
              <Field label="Introduction or white-label">
                <select className={inputCls} value={t.presentation} onChange={(e) => patchType(i, { presentation: e.target.value as typeof t.presentation })}>
                  <option value="introduction">Introduction — I work under my own name</option>
                  <option value="white-label">White-label — I work under the partner's name</option>
                </select>
              </Field>
              <Field label="Who invoices whom">
                <select className={inputCls} value={t.invoicing} onChange={(e) => patchType(i, { invoicing: e.target.value as typeof t.invoicing })}>
                  <option value="owner-to-partner">I invoice the partner</option>
                  <option value="owner-to-client">I invoice the client directly</option>
                </select>
              </Field>
              <Field label="If the partner's client comes direct later">
                <input className={inputCls} value={t.directLater} onChange={(e) => patchType(i, { directLater: e.target.value })} />
              </Field>
            </div>
            <button type="button" className={btnGhostCls} onClick={() => mutate((st) => { st.partner.partnerTypes.splice(i, 1); })}>Remove this type</button>
          </div>
        ))}
        <button type="button" className={btnGoldCls} onClick={() => mutate((st) => { st.partner.partnerTypes.push({ ...emptyType }); })}>
          Add a partner type
        </button>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <Field label="Sample project: the partner's whole project ($)">
            <input type="number" className={inputCls} value={d.sampleProject.projectValue} onChange={(e) => mutate((st) => { st.partner.sampleProject.projectValue = Number(e.target.value); })} />
          </Field>
          <Field label="Your piece of it ($)">
            <input type="number" className={inputCls} value={d.sampleProject.ownerPiece} onChange={(e) => mutate((st) => { st.partner.sampleProject.ownerPiece = Number(e.target.value); })} />
          </Field>
          <Field label="Your gross margin on your piece (%)">
            <input type="number" className={inputCls} value={d.sampleProject.marginPct} onChange={(e) => mutate((st) => { st.partner.sampleProject.marginPct = Number(e.target.value); })} />
          </Field>
        </div>
        {mc && pctType && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 mt-2">
            <p className="text-sm font-bold mb-1">The margin check, on project economics ({pctType.type || "your percentage type"})</p>
            <p className="text-sm">
              Whole project {moneyFmt(mc.projectValue)} · your piece {moneyFmt(mc.ownerPiece)} · margin {moneyFmt(mc.margin)} · reward at {pctType.rewardPct}% of{" "}
              {pctType.rewardShape === "percent-project" ? "the whole project" : "your piece"} = {moneyFmt(mc.reward)} · margin left {moneyFmt(mc.marginLeft)} ·
              the same {pctType.rewardPct}% on your piece = {moneyFmt(mc.rewardOnPiece)} (margin left {moneyFmt(mc.marginLeftOnPiece)}).
            </p>
            <p className="text-sm mt-1">{mc.sentence}</p>
          </div>
        )}
      </Card>

      <Card title="Step 2 · The enablement kit: what a partner needs to say yes" aside="A partner does not refer out of generosity. They refer when bringing you in makes their project safer, their client happier, and their own name better.">
        <Field label="The one-page capability sheet" hint="What you do, what you do not do, the sizes of job you take, your service area, insurance and licensing stated plainly, two or three named kinds of past work. One page: a partner forwards what fits on one page and files what does not.">
          <textarea className={inputCls} rows={3} value={d.kit.capabilitySheet} onChange={(e) => mutate((st) => { st.partner.kit.capabilitySheet = e.target.value; })} />
        </Field>
        <Field label="The handoff, step by step" hint="Who calls whom, what information travels with the introduction, what you send back and how fast — so the partner is never left wondering whether their client was called.">
          <textarea className={inputCls} rows={3} value={d.kit.handoffSteps} onChange={(e) => mutate((st) => { st.partner.kit.handoffSteps = e.target.value; })} />
        </Field>
        <Field label="What the partner tells their own client" hint="Two or three honest sentences, written for them — including a plain disclosure sentence for the cases where money will change hands for the recommendation.">
          <textarea className={inputCls} rows={2} value={d.kit.partnerSays} onChange={(e) => mutate((st) => { st.partner.kit.partnerSays = e.target.value; })} />
        </Field>
        <Field label="Response-time commitments (your promises, in numbers)">
          <textarea className={inputCls} rows={2} value={d.kit.responseTimes} onChange={(e) => mutate((st) => { st.partner.kit.responseTimes = e.target.value; })} placeholder="e.g. First call within one business day; quote within three days of the site visit; problems reach the partner from me first, the same day." />
        </Field>
      </Card>

      <Card title="Step 5 · The agreement terms, and the honesty rules" aside="Settled one by one in the partner-type editor above: client ownership, introduction or white-label, who invoices whom, the direct-client rule, and how either side ends it (in writing; work in progress finishes under the terms it started under).">
        <Callout label="BEFORE ANYONE SIGNS:" text={LAWYER_NOTE} tone="warn" />
        <table className="w-full text-sm">
          <tbody>
            {PARTNER_HONESTY_RULES.map((r) => (
              <tr key={r.rule} className="border-t border-neutral-100">
                <td className="p-2 font-semibold align-top w-56">{r.rule}</td>
                <td className="p-2">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Tracking: projects, not sales" aside="One row per project, carried through the stages. A reward shows as owed only when its trigger has actually happened — never at introduction, never at quoting, and never on thirty days. Try the sheet here with your first real or sample projects.">
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead><tr className="bg-neutral-50 text-left"><th className="p-2">Partner</th><th className="p-2">Project</th><th className="p-2">Stage</th><th className="p-2">Your piece</th><th className="p-2">Reward owed</th><th className="p-2">Trigger state</th></tr></thead>
            <tbody>
              {s.partnerProjects.map((p, i) => {
                const state = triggerState(p.stage, p.trigger);
                const owed = state === "vested" ? projectReward(p) : 0;
                return (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="p-2">{p.partnerName}</td>
                    <td className="p-2">{p.project}</td>
                    <td className="p-2">
                      <select className="border border-neutral-300 rounded px-1" value={p.stage} onChange={(e) => mutate((st) => { st.partnerProjects[i].stage = e.target.value as ProjectStage; })}>
                        {PROJECT_STAGES.map((stg) => <option key={stg.id} value={stg.id}>{stg.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2">{moneyFmt(p.ownerPiece)}</td>
                    <td className="p-2">{owed ? moneyFmt(owed) : "—"}</td>
                    <td className="p-2">{state.replace(/-/g, " ")}</td>
                  </tr>
                );
              })}
              {s.partnerProjects.length === 0 && <tr><td colSpan={6} className="p-2 text-neutral-500">No projects yet. Add the first one below.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="grid md:grid-cols-4 gap-2">
          <input className={inputCls} placeholder="Partner name" value={proj.partnerName} onChange={(e) => setProj({ ...proj, partnerName: e.target.value })} />
          <input className={inputCls} placeholder="Project (client / site / work)" value={proj.project} onChange={(e) => setProj({ ...proj, project: e.target.value })} />
          <input className={inputCls} type="number" placeholder="Your piece ($)" value={proj.ownerPiece || ""} onChange={(e) => setProj({ ...proj, ownerPiece: Number(e.target.value) })} />
          <select className={inputCls} value={proj.stage} onChange={(e) => setProj({ ...proj, stage: e.target.value as ProjectStage })}>
            {PROJECT_STAGES.map((stg) => <option key={stg.id} value={stg.id}>{stg.label}</option>)}
          </select>
        </div>
        <button type="button" className={btnGhostCls + " mt-2"} onClick={() => {
          if (!proj.partnerName.trim()) return;
          const t = d.partnerTypes[0];
          mutate((st) => {
            st.partnerProjects.push({
              partnerName: proj.partnerName,
              project: proj.project,
              stage: proj.stage,
              ownerPiece: proj.ownerPiece,
              rewardShape: t?.rewardShape ?? "none",
              rewardPct: t?.rewardPct ?? 0,
              rewardFlat: t?.rewardFlat ?? 0,
              trigger: t?.trigger ?? "paid",
            });
          });
          setProj({ partnerName: "", project: "", stage: "introduced", ownerPiece: 0 });
        }}>Add the project to the sheet</button>
        <p className="text-xs text-neutral-500 mt-2">The report prints this sheet's layout and stage definitions, so anyone running it reads a stage the same way. The live sheet itself lives wherever the program runs — this app designs it.</p>
      </Card>

      <Card title="Step 6 · The read-back" aside="Nothing generates until the read-back is confirmed — the same rule as Module B, for the same reason.">
        <p className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-3">
          Partner types: {d.partnerTypes.map((t) => t.type || "(unnamed)").join(", ") || "(none yet)"}. Each partner receives the enablement kit: the capability sheet, the handoff steps, the sentences for their client, and your response-time commitments.
          Rewards: {d.partnerTypes.map((t) => `${t.type || "type"} — ${t.rewardShape === "percent-piece" ? `${t.rewardPct}% of your piece` : t.rewardShape === "percent-project" ? `${t.rewardPct}% of the whole project` : t.rewardShape === "flat" ? moneyFmt(t.rewardFlat) + " per project" : t.rewardShape}, vesting ${t.trigger === "completion" ? "at completion" : "when you are paid"}`).join("; ") || "(none yet)"}.
          The terms are written before the first project, and the terms sheet carries the lawyer-review note on its face.
        </p>
        <label className="flex gap-2 items-center text-sm font-semibold mt-3">
          <input type="checkbox" checked={s.partnerConfirmed} onChange={(e) => mutate((st) => { st.partnerConfirmed = e.target.checked; })} />
          The read-back is right. Build the report.
        </label>
        <div className="mt-3">
          <button type="button" className={btnGoldCls} disabled={!s.partnerConfirmed || d.partnerTypes.length === 0}
            onClick={() => { mutate((st) => { st.reports.partner = buildPartnerReport(st.profile, st.partner, partners, st.lists); }); goReports(); }}>
            Assemble the partner program report →
          </button>
        </div>
      </Card>
    </div>
  );
}
