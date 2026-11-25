/**
 * UpgradeScreen.tsx — shown to a signed-in user whose plan does not include
 * this app (or whose trial has expired).
 *
 * Keith's requirement: pricing is presented as ACCESS. Every price is paired
 * with what it unlocks — grouped by the six parts of a business plus
 * Personal — and the full tier table grows tier over tier. Plain language,
 * no jargon.
 */
import { useState } from "react";
import {
  APPS,
  PARTS,
  SESSION_GRANTS,
  TIERS,
  planIncludes,
  type CatalogApp,
  type PartId,
  type Tier,
  type TierId,
} from "../powerties-catalog";
import { STRIPE_LINKS, type GateConfig } from "./gate-config";
import { effectivePlan, type Entitlement } from "./entitlement";
import "./gate.css";

type Billing = "monthly" | "annual";

function tierById(id: TierId): Tier {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

function appsUnlockedBy(tierId: TierId): CatalogApp[] {
  return APPS.filter((app) => planIncludes(tierId, app));
}

function priceLabel(tier: Tier, billing: Billing): string {
  if (tier.id === "free") return "$0";
  if (billing === "monthly") return `$${tier.monthly} / month`;
  return `$${tier.annual} / year (two months free)`;
}

function SubscribeButton({ tier, billing }: { tier: Tier; billing: Billing }) {
  if (tier.id === "free") return null;
  return (
    <a
      className="ptg-btn ptg-btn-primary"
      href={STRIPE_LINKS[tier.id][billing]}
    >
      Get {tier.name} access
    </a>
  );
}

/** What one tier unlocks, grouped by the six parts + Personal (+ front door). */
function AccessByPart({ tierId }: { tierId: TierId }) {
  const unlocked = appsUnlockedBy(tierId);
  const groups: { key: string; name: string; apps: CatalogApp[] }[] = [];

  const frontDoor = unlocked.filter((a) => a.part === "front-door");
  if (frontDoor.length > 0) {
    groups.push({ key: "front-door", name: "Start here", apps: frontDoor });
  }
  for (const part of PARTS) {
    const apps = unlocked.filter((a) => a.part === (part.id as PartId));
    if (apps.length > 0) groups.push({ key: part.id, name: part.name, apps });
  }

  if (groups.length === 0) {
    return <p className="ptg-muted">This plan does not unlock any tools yet.</p>;
  }
  return (
    <div className="ptg-access-groups">
      {groups.map((group) => (
        <div key={group.key} className="ptg-access-group">
          <h4>{group.name}</h4>
          <ul>
            {group.apps.map((app) => (
              <li key={app.id}>{app.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export interface UpgradeScreenProps {
  app: GateConfig;
  /** Optional — when passed, the screen can say what the user has today. */
  entitlement?: Entitlement | null;
}

export function UpgradeScreen({ app, entitlement }: UpgradeScreenProps) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const required = tierById(app.requiredTier);
  const currentPlan = effectivePlan(entitlement ?? null);

  return (
    <div className="ptg-screen">
      <div className="ptg-upgrade">
        <p className="ptg-eyebrow">PowerTies</p>
        <h1 className="ptg-title">{app.appName} is part of {required.name} access</h1>
        <p className="ptg-lede">
          You are signed in{entitlement ? <> on the <strong>{tierById(currentPlan).name}</strong> plan</> : null}.
          {" "}{required.name} access unlocks {app.appName} — and everything listed below.
          One PowerTies account works across every tool, so you only pay once.
        </p>

        <section className="ptg-section">
          <h2 className="ptg-section-title">What {required.name} access unlocks</h2>
          <AccessByPart tierId={required.id} />
          <div className="ptg-actions">
            <SubscribeButton tier={required} billing={billing} />
            <span className="ptg-price-note">{priceLabel(required, billing)}</span>
          </div>
        </section>

        <section className="ptg-section">
          <div className="ptg-tier-head">
            <h2 className="ptg-section-title">All the plans, side by side</h2>
            <div className="ptg-toggle" role="group" aria-label="Billing period">
              <button
                type="button"
                className={billing === "monthly" ? "ptg-toggle-btn ptg-toggle-btn-on" : "ptg-toggle-btn"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billing === "annual" ? "ptg-toggle-btn ptg-toggle-btn-on" : "ptg-toggle-btn"}
                onClick={() => setBilling("annual")}
              >
                Annual — two months free
              </button>
            </div>
          </div>

          <div className="ptg-tier-grid">
            {TIERS.map((tier) => {
              const unlocked = appsUnlockedBy(tier.id);
              const isRequired = tier.id === required.id;
              return (
                <article
                  key={tier.id}
                  className={isRequired ? "ptg-tier-card ptg-tier-card-required" : "ptg-tier-card"}
                >
                  <h3>
                    {tier.name}
                    {isRequired ? <span className="ptg-badge">Unlocks this app</span> : null}
                  </h3>
                  <p className="ptg-tier-price">{priceLabel(tier, billing)}</p>
                  <p className="ptg-muted">{tier.tagline}</p>
                  <p className="ptg-access-heading">
                    {tier.id === "free" ? "What you can use:" : "Access included:"}
                  </p>
                  <ul className="ptg-access-list">
                    {unlocked.map((a) => (
                      <li key={a.id}>{a.name}</li>
                    ))}
                  </ul>
                  <SubscribeButton tier={tier} billing={billing} />
                </article>
              );
            })}
          </div>
          <p className="ptg-muted">
            Each season and size opens a set of tools you choose yourself —
            you pick your apps when you subscribe, and you can re-pick once
            per billing cycle. Personal is its own track, and a discounted
            add-on when bought with any season.
          </p>
        </section>

        <section className="ptg-section ptg-session-note">
          <h2 className="ptg-section-title">Already booked a session with Keith?</h2>
          <ul className="ptg-grant-list">
            {SESSION_GRANTS.map((grant) => (
              <li key={grant.name}>
                <strong>{grant.name}</strong> includes <strong>{grant.grant}</strong>.{" "}
                {grant.detail} If your session access has started, sign in with the
                same Google account you used to book and this screen will go away.
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default UpgradeScreen;
