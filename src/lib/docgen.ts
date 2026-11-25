/**
 * docgen.ts — generate the owner's files from the SAME ReportDoc the
 * preview renders (design Section 2): a DOCX and a PDF per report, each
 * behind its own button. Generation happens in the owner's session;
 * nothing is stored on a server.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import type { ReportDoc, ReportSection } from "./report";

const GOLD = "C6A15B";

function sectionBlocks(section: ReportSection): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: section.heading, bold: true })],
      spacing: { before: 280, after: 120 },
    }),
  ];
  for (const p of section.paragraphs ?? []) {
    out.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 100 } }));
  }
  for (const b of section.bullets ?? []) {
    out.push(
      new Paragraph({
        children: [new TextRun(`•  ${b}`)],
        spacing: { after: 60 },
        indent: { left: 360 },
      }),
    );
  }
  (section.numbered ?? []).forEach((n, i) => {
    out.push(
      new Paragraph({
        children: [new TextRun(`${i + 1}.  ${n}`)],
        spacing: { after: 60 },
        indent: { left: 360 },
      }),
    );
  });
  for (const c of section.checklist ?? []) {
    out.push(
      new Paragraph({
        children: [new TextRun(`☐  ${c}`)],
        spacing: { after: 60 },
        indent: { left: 360 },
      }),
    );
  }
  if (section.table) {
    const cell = (text: string, bold = false) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
      });
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: section.table.head.map((h) => cell(h, true)),
          }),
          ...section.table.rows.map(
            (r) => new TableRow({ children: r.map((c) => cell(c)) }),
          ),
        ],
      }),
    );
    out.push(new Paragraph({ spacing: { after: 60 } }));
  }
  if (section.callout) {
    out.push(
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({ text: `${section.callout.label} `, bold: true, color: GOLD }),
          new TextRun(section.callout.text),
        ],
      }),
    );
  }
  return out;
}

export async function reportToDocx(doc: ReportDoc): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: "POWERTIES CONSULTING GROUP", bold: true, color: GOLD, size: 20 })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: doc.title, bold: true })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: doc.subtitle, italics: true })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "THE SHORT VERSION", bold: true })],
      spacing: { after: 100 },
    }),
    ...doc.shortVersion.map(
      (s) =>
        new Paragraph({
          children: [new TextRun(`▸  ${s}`)],
          spacing: { after: 60 },
          indent: { left: 360 },
        }),
    ),
    ...doc.sections.flatMap(sectionBlocks),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [
        new TextRun({
          text: "Prepared by the Outreach and Referral Builder · PowerTies Consulting Group",
          italics: true,
          size: 18,
        }),
      ],
    }),
  ];
  const d = new Document({
    creator: "PowerTies Consulting Group",
    lastModifiedBy: "PowerTies Consulting Group",
    title: doc.title,
    description: "",
    keywords: "",
    sections: [{ children }],
  });
  return Packer.toBlob(d);
}

// ---------------------------------------------------------------------------
// PDF: a clean text layout from the same ReportDoc (jsPDF, built in).
// ---------------------------------------------------------------------------

export function reportToPdf(doc: ReportDoc): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const width = 612 - margin * 2;
  let y = 64;

  const ensure = (h: number) => {
    if (y + h > 720) {
      pdf.addPage();
      y = 64;
    }
  };
  const write = (
    text: string,
    opts: { size?: number; bold?: boolean; italic?: boolean; indent?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    pdf.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width - (opts.indent ?? 0)) as string[];
    for (const line of lines) {
      ensure(size + 4);
      pdf.text(line, margin + (opts.indent ?? 0), y);
      y += size + 3.5;
    }
    y += opts.gap ?? 5;
  };

  pdf.setTextColor(0, 0, 0);
  write("POWERTIES CONSULTING GROUP", { size: 9, bold: true, gap: 2 });
  write(doc.title, { size: 19, bold: true, gap: 2 });
  write(doc.subtitle, { italic: true, gap: 12 });
  write("THE SHORT VERSION", { size: 12.5, bold: true, gap: 3 });
  for (const s of doc.shortVersion) write(`•  ${s}`, { indent: 12, gap: 3 });
  y += 6;

  for (const section of doc.sections) {
    ensure(30);
    write(section.heading, { size: 13, bold: true, gap: 4 });
    for (const p of section.paragraphs ?? []) write(p);
    for (const b of section.bullets ?? []) write(`•  ${b}`, { indent: 12, gap: 3 });
    (section.numbered ?? []).forEach((n, i) => write(`${i + 1}.  ${n}`, { indent: 12, gap: 3 }));
    for (const c of section.checklist ?? []) write(`[ ]  ${c}`, { indent: 12, gap: 3 });
    if (section.table) {
      write(section.table.head.join("  |  "), { bold: true, gap: 2 });
      for (const r of section.table.rows) write(r.join("  |  "), { gap: 2 });
      y += 5;
    }
    if (section.callout) {
      write(`${section.callout.label} ${section.callout.text}`, { bold: true, gap: 8 });
    }
    y += 6;
  }
  write("Prepared by the Outreach and Referral Builder · PowerTies Consulting Group", {
    italic: true,
    size: 9,
  });
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
