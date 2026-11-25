/**
 * gate-config.ts — per-app gate configuration and shared gate constants.
 *
 * Each app creates exactly one GateConfig, e.g.:
 *
 *   export const gateConfig: GateConfig = {
 *     appId: "branding-intelligence",   // must match the catalog app id
 *     requiredTier: "startup",          // lowest tier that unlocks this app
 *     appName: "Branding Intelligence",
 *   };
 */
import type { TierId } from "../powerties-catalog";

export interface GateConfig {
  /** Entitlement key — must match the `id` of this app in powerties-catalog.ts. */
  appId: string;
  /** Lowest tier whose access includes this app. */
  requiredTier: TierId;
  /** Plain-language name shown on the sign-in and upgrade screens. */
  appName: string;
}

export function defineGateConfig(config: GateConfig): GateConfig {
  return config;
}

/**
 * Stripe Payment Links, per tier and billing period.
 *
 * ⚠️  TANK: fill these in once the Stripe Payment Links exist.
 * Every value below is the placeholder "REPLACE_WITH_STRIPE_PAYMENT_LINK".
 * Until real links are pasted in, the Subscribe buttons on the upgrade
 * screen will point at that placeholder text — do not ship a paid app
 * live with placeholders still in place.
 *
 * Note: "free" is included only so this Record is exhaustive over TierId;
 * the free tier has nothing to buy and its links are never rendered.
 */
export const STRIPE_LINKS: Record<TierId, { monthly: string; annual: string }> = {
  free: {
    monthly: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
    annual: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
  },
  startup: {
    monthly: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
    annual: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
  },
  growth: {
    monthly: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
    annual: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
  },
  legacy: {
    monthly: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
    annual: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
  },
  personal: {
    monthly: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
    annual: "REPLACE_WITH_STRIPE_PAYMENT_LINK",
  },
};

/** Daily generation cap for the free plan (client-side, v1 — see genGuard.ts). */
export const FREE_GEN_CAP_DAILY = 5;
