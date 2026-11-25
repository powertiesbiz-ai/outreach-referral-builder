import { defineGateConfig } from "./gate-config";

/**
 * Outreach and Referral Builder — gate values.
 *
 * Tier: Growth, per the app design (Keith, Nov 25, 2026): the whole app
 * sits at Growth access from the first screen, one card in the hub's
 * Customer Retention section beside Customer Retention. appId
 * "outreach-referral-builder" matches the shared catalog entry.
 */
export const gateConfig = defineGateConfig({
  appId: "outreach-referral-builder",
  requiredTier: "growth",
  appName: "Outreach and Referral Builder",
});
