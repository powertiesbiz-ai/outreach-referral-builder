/**
 * referral.ts — Module B working machinery (design Section 5): the
 * margin check, the consultant's standing follow-ups, and the honesty
 * layer that cannot be removed.
 */
import type { ReferralDesign, RewardedActionId } from "./types";

export const REWARDED_ACTIONS: {
  id: RewardedActionId;
  label: string;
  means: string;
  guard: string;
  measurable: string;
}[] = [
  {
    id: "purchase-referral",
    label: "Purchase referral",
    means: "A new customer buys through a member's link or code. The core of almost every program.",
    guard: "The code must ride in the payment record (checkout note or metadata), and the buyer may not be the member.",
    measurable: "Observed at checkout: the sale either carries the member's code or it does not.",
  },
  {
    id: "repeat-booking",
    label: "Repeat booking",
    means: "An existing customer books again, and the person who keeps them coming back earns.",
    guard: "The repeat customer must name or show the member's code at booking; staff log it the same day.",
    measurable: "Observed in the booking record, with the member's code attached.",
  },
  {
    id: "review",
    label: "Review",
    means: "A customer leaves a public review. The reward is for the review being written, never for it being positive.",
    guard: "The review must be the customer's own words on a public platform; review swaps between members do not count.",
    measurable: "Observed on the review platform, linked from the member's claim.",
  },
  {
    id: "membership-signup",
    label: "Membership signup",
    means: "A new customer joins a membership, plan, or subscription the business runs.",
    guard: "The signup must survive its refund window before the reward vests; self-signups under a second email do not count.",
    measurable: "Observed in the membership system, with the member's code attached.",
  },
  {
    id: "other",
    label: "Other",
    means: "The owner's own action, described in their words, checked by the AI for measurability.",
    guard: "Set with the owner during the flow, in writing, before the program launches.",
    measurable: "Must be observable in a record the business already keeps, or it is redesigned before launch.",
  },
];

/** The five honesty defaults. Welded in — the owner designs everything
 *  about their program except the parts that would make it dishonest. */
export const HONESTY_DEFAULTS: { name: string; why: string }[] = [
  {
    name: "One tier only",
    why: "The moment a member earns from people they signed up, the program stops being about customers and becomes about recruiting. That is the shape of every scheme that ends badly, for the members and for the business's name. One tier keeps the program about real customers buying real things.",
  },
  {
    name: "Rewards on real, completed sales only",
    why: "A reward paid on a signup, a click, or a promise is money spent on nothing. Paying only when a sale completes and survives its refund window means the program can only ever cost a share of money that actually arrived.",
  },
  {
    name: "No earnings promises",
    why: "Nobody can honestly promise what a member will earn, because it depends on what their friends actually buy. Promising amounts is the first lie of every bad program, and it is also the claim regulators look for. The design prints the math and promises nothing.",
  },
  {
    name: "The disclosure line beside every link",
    why: "A recommendation paid for in any way has to say so. The FTC requires it, and honesty recommends it. Each member's link and code travel with a plain line, ready to copy, in the pattern of: I earn a reward if you buy through my link.",
  },
  {
    name: "No self-referrals",
    why: "Buying through your own link is not a referral; it is a discount you gave yourself and called it marketing. Blocking it keeps the program's numbers true, so the owner can trust what the program is actually doing.",
  },
];

export const DISCLOSURE_LINE = "I earn a reward if you buy through my link.";

export interface MarginCheck {
  averageSale: number;
  marginPct: number;
  margin: number;
  rewardPerSale: number;
  marginLeft: number;
  /** The one plain sentence the app shows beside the table. */
  sentence: string;
  /** "ok" | "caution" (reward takes most of the margin) | "reckless"
   *  (reward exceeds the whole margin). The owner can always proceed. */
  level: "ok" | "caution" | "reckless";
}

/**
 * The margin check, run on the owner's own numbers: what the reward
 * costs on a real transaction, shown before the owner commits to it.
 */
export function marginCheck(
  averageSale: number,
  marginPct: number,
  design: Pick<ReferralDesign, "rewardType" | "rewardAmount" | "twoSided">,
): MarginCheck {
  const margin = (averageSale * marginPct) / 100;
  let rewardPerSale =
    design.rewardType === "percent"
      ? (averageSale * design.rewardAmount) / 100
      : design.rewardAmount;
  if (design.twoSided) rewardPerSale *= 2;
  const marginLeft = margin - rewardPerSale;
  let level: MarginCheck["level"] = "ok";
  let sentence: string;
  if (rewardPerSale > margin) {
    level = "reckless";
    sentence = `At this setting, the reward costs more than the entire margin on an average sale: every referred job loses money before any other cost is counted. You can keep it. It is your business. But keep it knowing exactly what it costs.`;
  } else if (marginLeft < margin * 0.1) {
    level = "reckless";
    sentence = `At this setting, the reward takes nearly all of the margin on an average sale, leaving almost nothing for the work itself. You can keep it. It is your business. But keep it knowing exactly what it costs.`;
  } else if (rewardPerSale > margin / 2) {
    level = "caution";
    sentence = `At this setting, the reward takes most of the margin on every referred job, so referred customers would have to repeat or the program loses money on the work it creates. You can keep it. It is your business. But keep it knowing what it costs.`;
  } else {
    level = "ok";
    sentence = `At this setting, the reward leaves most of the margin standing on an average sale, which is the shape of a program that can run for years.`;
  }
  return {
    averageSale,
    marginPct,
    margin: Math.round(margin * 100) / 100,
    rewardPerSale: Math.round(rewardPerSale * 100) / 100,
    marginLeft: Math.round(marginLeft * 100) / 100,
    sentence,
    level,
  };
}

/** The consultant's standing follow-ups, computed from the design. The
 *  AI sharpens the wording when it is available; these fire regardless,
 *  so the checks never depend on the model being up. */
export function consultantWarnings(
  design: ReferralDesign,
  averageSale: number,
  marginPct: number,
): string[] {
  const warnings: string[] = [];
  const check = marginCheck(averageSale, marginPct, design);
  if (check.level !== "ok") warnings.push(`Margin: ${check.sentence}`);
  for (const a of design.actions) {
    if (a.id === "other" && !a.measurable.trim()) {
      warnings.push(
        "Measurability: your custom action has no stated way to observe it. An action nobody can observe cannot be rewarded honestly — name the record it shows up in.",
      );
    }
    if (!a.guard.trim()) {
      warnings.push(
        `Gaming: the action "${a.label}" has no stated guard. If a reward is paid for an action, someone will eventually manufacture that action; write the guard before launch.`,
      );
    }
  }
  if (design.family === "paid" && design.rewardAmount > 0 && design.minPayout > 0) {
    const actionsToThreshold =
      design.rewardType === "percent"
        ? design.minPayout / ((averageSale * design.rewardAmount) / 100)
        : design.minPayout / design.rewardAmount;
    if (actionsToThreshold > 25) {
      warnings.push(
        `Fit: at the current reward, a member needs about ${Math.ceil(actionsToThreshold)} rewarded actions to reach the $${design.minPayout} payout threshold. A threshold members never reach reads as a promise the program does not keep — lower the threshold or raise the reward.`,
      );
    }
  }
  if (design.family === "points" && design.pointsPerAction <= 0) {
    warnings.push("Fit: the points design awards no points per action yet. Set the points before the read-back.");
  }
  return warnings;
}

/** The points family's welded sentence — printed in BOTH parts of the
 *  Module B report whenever the family is points. */
export const POINTS_NEVER_MONEY =
  "Points are never money. Points cannot be cashed out, transferred for cash, or redeemed for cash. They buy recognition, levels, and the in-store perks this design names — nothing else.";
