import { useState } from "react";
import { downloadBlob, reportToDocx, reportToPdf, slug } from "../lib/docgen";
import { buildContactCsv } from "../lib/report";
import type { ReportDoc, ReportSection } from "../lib/report";
import type { SessionState } from "../session";
import { Callout, btnGhostCls, btnGoldCls } from "./ui";

function SectionView({ section }: { section: ReportSection }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-bold mb-2">{section.heading}</h3>
      {(section.paragraphs ?? []).map((p, i) => (
        <p key={i} className="text-sm mb-2">{p}</p>
      ))}
      {section.bullets && (
        <ul className="text-sm list-disc pl-5 mb-2">
          {section.bullets.map((b, i) => <li key={i} className="mb-1">{b}</li>)}
        </ul>
      )}
      {section.numbered && (
        <ol className="text-sm list-decimal pl-5 mb-2">
          {section.numbered.map((b, i) => <li key={i} className="mb-1">{b}</li>)}
        </ol>
      )}
      {section.checklist && (
        <ul className="text-sm mb-2">
          {section.checklist.map((b, i) => <li key={i} className="mb-1">☐ {b}</li>)}
        </ul>
      )}
      {section.table && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-sm border border-neutral-200">
            <thead>
              <tr className="bg-neutral-50">
                {section.table.head.map((h, i) => <th key={i} className="p-2 text-left border-b border-neutral-200">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((r, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  {r.map((c, j) => <td key={j} className="p-2 align-top">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.callout && <Callout label={section.callout.label} text={section.callout.text} />}
    </div>
  );
}

export function ReportPreview({ doc }: { doc: ReportDoc }) {
  return (
    <div className="print-area bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <p className="text-xs font-bold tracking-widest text-[#8a6d2f]">POWERTIES CONSULTING GROUP</p>
      <h2 className="text-2xl font-bold mt-1">{doc.title}</h2>
      <p className="text-sm italic text-neutral-600 mb-4">{doc.subtitle}</p>
      <h3 className="text-base font-bold mb-2">THE SHORT VERSION</h3>
      <ul className="text-sm mb-6">
        {doc.shortVersion.map((s, i) => <li key={i} className="mb-1">▸ {s}</li>)}
      </ul>
      {doc.sections.map((sec, i) => <SectionView key={i} section={sec} />)}
      <p className="text-xs italic text-neutral-500 mt-6">
        Prepared by the Outreach and Referral Builder · PowerTies Consulting Group
      </p>
    </div>
  );
}

export default function Reports({ s }: { s: SessionState }) {
  const docs = [s.reports.outreach, s.reports.referral, s.reports.partner].filter(
    (d): d is ReportDoc => !!d,
  );
  const [activeId, setActiveId] = useState<string>(docs[0]?.id ?? "");
  const active = docs.find((d) => d.id === activeId) ?? docs[0];

  if (docs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-bold mb-2">Reports</h2>
        <p className="text-sm">
          Nothing assembled yet. Work a module — Outreach, Referral, or Partner Referrals — confirm its read-back,
          and its report appears here: the full report on screen first, every action plan readable, and only then
          the download buttons. The preview and the files are rendered from the same assembled plan, so they can
          never disagree.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="no-print flex flex-wrap gap-2 mb-4">
        {docs.map((d) => (
          <button key={d.id} type="button" className={active?.id === d.id ? btnGoldCls : btnGhostCls} onClick={() => setActiveId(d.id)}>
            {d.id === "outreach" ? "Module A · Outreach" : d.id === "referral" ? "Module B · Referral" : "Module C · Partner Referrals"}
          </button>
        ))}
      </div>

      {active && (
        <>
          <div className="no-print bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
            <p className="text-sm font-semibold mb-2">
              Download “{active.title}” — pick one format per download; the other stays available whenever you want it.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGoldCls} onClick={async () => {
                downloadBlob(await reportToDocx(active), `${slug(active.title)}.docx`);
              }}>Download DOCX</button>
              <button type="button" className={btnGoldCls} onClick={() => {
                downloadBlob(reportToPdf(active), `${slug(active.title)}.pdf`);
              }}>Download PDF</button>
              {active.id === "outreach" && (
                <button type="button" className={btnGoldCls} onClick={() => {
                  const csv = buildContactCsv(s.people, s.lists);
                  downloadBlob(new Blob([csv], { type: "text/csv" }), "contact-file.csv");
                }}>Download the contact file (CSV)</button>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              The CSV is Module A's machine-readable contact file: one row per person, every list, the permissions summary,
              the basis for each membership — everything your AI needs to load it into a CRM and work it correctly.
            </p>
          </div>
          <Callout label="BEFORE YOU CLOSE:" text="This app holds nothing afterward. If you close it without downloading, the work on this screen is gone — that is the local-first promise working as designed. Take the files first." tone="warn" />
          <ReportPreview doc={active} />
        </>
      )}
    </div>
  );
}
