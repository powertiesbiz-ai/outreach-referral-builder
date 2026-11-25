/**
 * partners.ts — Module C working machinery (design Section 6): the
 * margin check on project economics, the project tracking model, and
 * the partner honesty rules.
 */
import type {
  PartnerProject,
  ProjectStage,
  RewardShape,
  RewardTrigger,
} from "./types";

export const PROJECT_STAGES: { id: ProjectStage; label: string; means: string }[] = [
  { id: "introduced", label: "Introduced", means: "The partner has passed the owner's name or the project over." },
  { id: "quoted", label: "Quoted", means: "The owner has priced their piece of the work." },
  { id: "won", label: "Won", means: "The work is the owner's, on the partner's project." },
  { id: "in-progress", label: "In progress", means: "The owner's crew is doing the work." },
  { id: "completed", label: "Completed", means: "The owner's piece is finished." },
  { id: "paid", label: "Paid", means: "The owner has been paid for their piece." },
  { id: "lost", label: "Lost", means: "The project died before the work was won. The stage it died at is recorded." },
  { id: "cancelled", label: "Cancelled", means: "Won, then cancelled before completion. Earns nothing, and the terms say so." },
];

export const REWARD_SHAPES: { id: RewardShape; label: string }[] = [
  { id: "percent-piece", label: "A percentage of the owner's piece" },
  { id: "percent-project", label: "A percentage of the partner's whole project" },
  { id: "flat", label: "A flat fee per project" },
  { id: "reciprocal", label: "Reciprocal referrals (no money)" },
  { id: "none", label: "None, while the relationship is young" },
];

export interface PartnerMarginCheck {
  projectValue: number;
  ownerPiece: number;
  marginPct: number;
  margin: number;
  /** What the reward costs on the base the owner picked. */
  reward: number;
  marginLeft: number;
  /** The same percentage taken on the owner's piece, for comparison. */
  rewardOnPiece: number;
  marginLeftOnPiece: number;
  sentence: string;
  level: "ok" | "caution" | "reckless";
}

/**
 * The Module C margin check. A percentage is only as safe as the number
 * it is taken on: the classic way partner programs go broke is setting
 * the percentage on the partner's whole project while the margin lives
 * on the owner's much smaller piece of it.
 */
export function partnerMarginCheck(
  projectValue: number,
  ownerPiece: number,
  marginPct: number,
  rewardPct: number,
  base: "project" | "piece",
): PartnerMarginCheck {
  const margin = (ownerPiece * marginPct) / 100;
  const reward = ((base === "project" ? projectValue : ownerPiece) * rewardPct) / 100;
  const rewardOnPiece = (ownerPiece * rewardPct) / 100;
  const marginLeft = margin - reward;
  let level: PartnerMarginCheck["level"] = "ok";
  let sentence: string;
  if (reward > margin) {
    level = "reckless";
    sentence =
      "At this setting, the reward costs more than the entire margin on your piece of the project: the partnership loses money on the work it brings you. A percentage is only as safe as the number it is taken on.";
  } else if (marginLeft < margin * 0.1) {
    level = "reckless";
    sentence =
      "At this setting, the reward takes nearly all of the margin on your piece, leaving almost nothing for the work itself. A percentage is only as safe as the number it is taken on, and a percentage of a partner's whole project can quietly be nearly all of the margin on your piece of it.";
  } else if (reward > margin / 2) {
    level = "caution";
    sentence =
      "At this setting, the reward takes most of the margin on your piece. A percentage is only as safe as the number it is taken on, and a percentage of a partner's whole project can quietly be nearly all of the margin on your piece of it.";
  } else {
    level = "ok";
    sentence =
      "At this setting, the reward leaves most of the margin on your piece standing, which is the shape of a partnership that can run for years.";
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    projectValue,
    ownerPiece,
    marginPct,
    margin: round(margin),
    reward: round(reward),
    marginLeft: round(marginLeft),
    rewardOnPiece: round(rewardOnPiece),
    marginLeftOnPiece: round(margin - rewardOnPiece),
    sentence,
    level,
  };
}

/** The reward a project carries, from the design's basis. */
export function projectReward(p: PartnerProject): number {
  switch (p.rewardShape) {
    case "percent-piece":
      return Math.round(p.ownerPiece * (p.rewardPct / 100) * 100) / 100;
    case "percent-project":
      // The project value is not carried per project in the sheet; the
      // percentage of the owner's piece is the computable fallback and
      // the report says the base out loud wherever it matters.
      return Math.round(p.ownerPiece * (p.rewardPct / 100) * 100) / 100;
    case "flat":
      return p.rewardFlat;
    default:
      return 0;
  }
}

export type TriggerState =
  | "not-owed"
  | "waiting-on-completion"
  | "waiting-on-payment"
  | "vested"
  | "paid-out";

/**
 * The reward shows as OWED only when its trigger has actually happened:
 * completion, or the owner being paid — never at introduction, never at
 * quoting, and never on the customer program's thirty days. A project
 * cancelled before completion earns nothing.
 */
export function triggerState(
  stage: PartnerProject["stage"],
  trigger: RewardTrigger,
): TriggerState {
  if (stage === "lost" || stage === "cancelled") return "not-owed";
  if (trigger === "completion") {
    if (stage === "completed" || stage === "paid") return "vested";
    return "waiting-on-completion";
  }
  // trigger === "paid"
  if (stage === "paid") return "vested";
  return "waiting-on-payment";
}

export const PARTNER_HONESTY_RULES: { rule: string; why: string }[] = [
  {
    rule: "Rewards only on real, completed, paid project work",
    why: "An introduction is worth nothing until it becomes finished work that somebody paid for. The trigger is where this rule lives, and no setting in the module pays earlier.",
  },
  {
    rule: "No promises to partners about volume",
    why: "The owner cannot honestly promise a partner a flow of work, a number of projects, or an income, in either direction, and the kit and the terms contain no such language. What the owner promises is behavior: response times, honest quotes, and problems reported early.",
  },
  {
    rule: "The terms are in writing before the first project",
    why: "A partnership that starts on a handshake and writes its terms after the first disagreement has the order backwards. The module will not generate a launch step for a partner whose terms sheet is unfinished.",
  },
  {
    rule: "The client is never misled about who is doing the work",
    why: "Introduction or white-label, the client knows whose crew is in their home or on their site, and the paid nature of a recommendation stays sayable out loud, with the disclosure sentence the kit provides.",
  },
];

export const LAWYER_NOTE =
  "One plain note, printed on the terms sheet itself: this sheet is a business agreement written in plain words, and anything either business intends to hold the other to deserves a lawyer's review before it is signed. The module designs the terms. It does not pretend to be a law firm.";
