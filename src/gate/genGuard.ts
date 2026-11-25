/**
 * genGuard.ts — free-tier daily generation cap (client-side, v1).
 *
 * Firestore document: usage/{uid}  { date: "YYYY-MM-DD", count: number }
 * The date is the user's LOCAL date, so the cap resets at their midnight.
 *
 * v1 tradeoff (deliberate): this is client-side, so it is a courtesy cap,
 * not a hard security boundary — the server-side check in api-gate.ts is
 * the path to a hard cap later. And if Firestore is unreachable we ALLOW
 * the generation and warn, for every plan: a rules hiccup or an outage
 * must never brick a paying user, and for free users a rare extra
 * generation is a cheaper failure than a broken front door (MLOT).
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { FREE_GEN_CAP_DAILY } from "./gate-config";
import { effectivePlan, type Entitlement } from "./entitlement";

export interface ConsumeResult {
  allowed: boolean;
  /** Generations left today. null = no cap applies (paid plan, or cap check skipped). */
  remaining: number | null;
}

/** "YYYY-MM-DD" in the user's local timezone. */
export function localDateString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Try to spend one generation for this user.
 *
 * - Paid plans (anything but the effective free plan): always allowed.
 * - Free plan: reads usage/{uid}; a new day starts at 0. If the count is
 *   already at the cap, returns { allowed: false, remaining: 0 } and does
 *   NOT increment. Otherwise increments and returns what is left.
 * - Firestore missing/failing: allowed, with a console warning (see header).
 */
export async function consumeGeneration(
  uid: string,
  ent: Entitlement | null | undefined,
): Promise<ConsumeResult> {
  if (effectivePlan(ent ?? null) !== "free") {
    return { allowed: true, remaining: null };
  }

  const cap = ent?.genCap ?? FREE_GEN_CAP_DAILY;

  if (!db) {
    console.warn("[PowerTies gate] genGuard: Firestore not configured — allowing generation.");
    return { allowed: true, remaining: null };
  }

  try {
    const ref = doc(db, "usage", uid);
    const today = localDateString();
    const snap = await getDoc(ref);
    const data = snap.exists()
      ? (snap.data() as { date?: string; count?: number })
      : undefined;
    const count = data && data.date === today ? data.count ?? 0 : 0;

    if (count >= cap) {
      return { allowed: false, remaining: 0 };
    }
    await setDoc(ref, { date: today, count: count + 1 }, { merge: true });
    return { allowed: true, remaining: cap - (count + 1) };
  } catch (err) {
    // v1 tradeoff: allow + warn rather than block on an infrastructure error.
    console.warn("[PowerTies gate] genGuard: usage check failed — allowing generation.", err);
    return { allowed: true, remaining: null };
  }
}
