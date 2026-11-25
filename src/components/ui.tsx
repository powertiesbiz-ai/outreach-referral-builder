import type { ReactNode } from "react";

export function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: string;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 mb-5">
      <h2 className="text-lg font-bold mb-1">{title}</h2>
      {aside ? <p className="text-sm text-neutral-500 mb-3">{aside}</p> : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-semibold mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C6A15B]";
export const btnCls =
  "bg-neutral-900 text-white text-sm font-semibold rounded-lg px-4 py-2 hover:bg-neutral-700 disabled:opacity-40";
export const btnGoldCls =
  "bg-[#C6A15B] text-neutral-900 text-sm font-bold rounded-lg px-4 py-2 hover:bg-[#b08d4a] disabled:opacity-40";
export const btnGhostCls =
  "border border-neutral-300 text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-40";

export function Callout({ label, text, tone }: { label: string; text: string; tone?: "warn" | "gold" }) {
  return (
    <div
      className={`rounded-lg p-3 text-sm mb-3 ${
        tone === "warn" ? "bg-red-50 border border-red-200" : "bg-[#faf3e3] border border-[#e5d5ae]"
      }`}
    >
      <span className="font-bold text-[#8a6d2f]">{label} </span>
      {text}
    </div>
  );
}

export function moneyFmt(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
