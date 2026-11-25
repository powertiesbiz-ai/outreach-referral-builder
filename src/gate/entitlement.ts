/**
 * entitlement.ts — Firestore access for the PowerTies gate entitlement.
 *
 * The MODEL (types, evaluation, pick rules, the v1→v2 migration shim)
 * lives in entitlement-core.ts — pure logic, no Firebase. This file is
 * the thin I/O wrapper: create the initial free doc on first sign-in,
 * read users/{uid} back. All access decisions delegate to the core.
 *
 * One document per user: users/{uid} — v2 shape documented in
 * entitlement-core.ts. Writers: the Square webhook bridge (server-side)
 * writes plan/status/seasons/personal/oneTime; session grants and
 * support make-goods are written by Tank's tooling; the customer writes
 * ONLY their picks (see firestore.rules).
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { CatalogApp, TierId } from "../powerties-catalog";
import type { GateConfig } from "./gate-config";
import { db } from "./firebase";
import {
  isEntitledToApp,
  normalizeEntitlement,
  type Entitlement,
} from "./entitlement-core";

export * from "./entitlement-core";

/** Minimal shape of a Firebase user that ensureUserDoc needs. */
export interface GateUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Is this entitlement good for this app right now? (v2 evaluator.)
 *
 * Accepts a catalog app or a per-app GateConfig; both resolve to the
 * app's id and the core's isEntitledToApp decides. This replaces the
 * v1 blanket-tier check — a GateConfig's `requiredTier` is retained on
 * the config for display, but access is by app id under the picks model.
 */
export function isEntitled(
  ent: Entitlement | null | undefined,
  app: CatalogApp | GateConfig,
): boolean {
  if (!ent) return false;
  return isEntitledToApp(ent, "appId" in app ? app.appId : app.id);
}

/**
 * @deprecated v1 tier check, kept so older copied gate code still
 * compiles. Access decisions must use isEntitled / isEntitledToApp.
 * Semantics preserved from v1 for a raw plan value.
 */
export function planIncludesTier(plan: TierId, requiredTier: TierId): boolean {
  const rank: Record<TierId, number> = {
    free: 0,
    startup: 1,
    growth: 2,
    legacy: 3,
    personal: 1,
  };
  if (requiredTier === "free") return true;
  if (requiredTier === "personal") return plan === "personal";
  if (plan === "personal") return false;
  return rank[plan] >= rank[requiredTier];
}

/**
 * Create users/{uid} with the free plan if it does not exist yet.
 * Called on first sign-in. The fresh doc carries BOTH the v1 `plan`
 * scalar (older copies still read it) and the empty v2 shape.
 * Returns the (existing or new) entitlement, or null when Firestore is
 * unavailable (gate dormant).
 */
export async function ensureUserDoc(
  user: User | GateUserLike,
): Promise<Entitlement | null> {
  if (!db) {
    console.warn("[PowerTies gate] ensureUserDoc skipped — Firestore not configured.");
    return null;
  }
  try {
    const existing = await getEntitlement(user.uid);
    if (existing) return existing;
    const fresh: Entitlement = {
      email: user.email ?? "",
      displayName: user.displayName ?? null,
      plan: "free",
      status: "active",
      trialEnds: null,
      genCap: null,
      source: "free",
      updatedAt: new Date().toISOString(),
      seasons: { startup: null, growth: null, legacy: null },
      bundleSize: null,
      personal: { active: false, addon: false },
      oneTime: {},
      compPicks: [],
      pickHistory: [],
      billingCycleStart: null,
    };
    await setDoc(doc(db, "users", user.uid), fresh);
    return fresh;
  } catch (err) {
    console.warn("[PowerTies gate] ensureUserDoc failed:", err);
    return null;
  }
}

/** Read users/{uid}, normalized to the v2 shape (v1 docs pass through
 *  the migration shim). Returns null when missing or Firestore is
 *  unavailable. */
export async function getEntitlement(
  uid: string,
): Promise<Entitlement | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return normalizeEntitlement(snap.data() as Entitlement);
  } catch (err) {
    console.warn("[PowerTies gate] getEntitlement failed:", err);
    return null;
  }
}

// Re-export so integrators have one obvious place to get the fetch helper.
// (The implementation lives in firebase.ts, next to `auth`.)
export { authHeader } from "./firebase";
