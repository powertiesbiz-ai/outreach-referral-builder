/**
 * Gate.tsx — the wrapper every app puts around its root component.
 *
 *   <Gate app={gateConfig}><App /></Gate>
 *
 * Gate includes its own <AuthProvider>, so this one wrapper is the whole
 * client integration. States:
 *   - gate unconfigured (no Firebase env vars) → render children (dormant)
 *   - loading                                  → plain loading screen
 *   - signed out                               → <SignInScreen />
 *   - signed in, not entitled / trial expired  → <UpgradeScreen />
 *   - entitled                                 → <AccountBar /> + children
 */
import type { ReactNode } from "react";
import { TIERS } from "../powerties-catalog";
import type { GateConfig } from "./gate-config";
import { effectivePlan, isEntitled } from "./entitlement";
import { isGateConfigured } from "./firebase";
import { AuthProvider, useAuth } from "./useAuth";
import { UpgradeScreen } from "./UpgradeScreen";
import "./gate.css";

/** Small bar shown above an entitled app: who you are, your plan, sign out. */
export function AccountBar() {
  const { user, entitlement, signOut } = useAuth();
  if (!user) return null;
  const planId = effectivePlan(entitlement);
  const planName = TIERS.find((t) => t.id === planId)?.name ?? planId;
  const name = user.displayName ?? user.email ?? "Signed in";
  return (
    <div className="ptg-account-bar">
      <span className="ptg-account-brand">PowerTies</span>
      <span className="ptg-account-name">{name}</span>
      <span className="ptg-account-plan">{planName} access</span>
      <button type="button" className="ptg-btn ptg-btn-small" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

/** Plain-language sign-in screen: what this is, one account everywhere. */
export function SignInScreen({ app }: { app: GateConfig }) {
  const { signInWithGoogle, signInError } = useAuth();
  return (
    <div className="ptg-screen">
      <div className="ptg-card">
        <p className="ptg-eyebrow">PowerTies</p>
        <h1 className="ptg-title">{app.appName}</h1>
        <p className="ptg-lede">
          {app.appName} is one of the PowerTies tools for business owners.
          Sign in to use it.
        </p>
        <p className="ptg-body">
          One PowerTies account works everywhere — the same sign-in opens
          every PowerTies tool your plan includes, on any device. No new
          password to remember: we use your Google account.
        </p>
        <button
          type="button"
          className="ptg-btn ptg-btn-google"
          onClick={() => void signInWithGoogle()}
        >
          Continue with Google
        </button>
        {signInError ? (
          <p className="ptg-signin-error" role="alert">
            {signInError}
          </p>
        ) : null}
        <p className="ptg-muted">
          New here? Continuing with Google creates your free PowerTies
          account. You can upgrade later, inside any tool, whenever you are ready.
        </p>
      </div>
    </div>
  );
}

function GateInner({ app, children }: { app: GateConfig; children: ReactNode }) {
  const { user, entitlement, loading } = useAuth();

  // Dormant: no Firebase env vars yet — ship the app untouched.
  if (!isGateConfigured) return <>{children}</>;

  if (loading) {
    return (
      <div className="ptg-screen">
        <div className="ptg-card ptg-loading">
          <p className="ptg-eyebrow">PowerTies</p>
          <p className="ptg-body">Loading {app.appName}…</p>
        </div>
      </div>
    );
  }

  if (!user) return <SignInScreen app={app} />;

  if (!isEntitled(entitlement, app)) {
    return <UpgradeScreen app={app} entitlement={entitlement} />;
  }

  return (
    <>
      <AccountBar />
      {children}
    </>
  );
}

export interface GateProps {
  app: GateConfig;
  children: ReactNode;
}

export function Gate({ app, children }: GateProps) {
  // Always render the provider (it degrades gracefully when unconfigured)
  // so an <AccountBar /> placed by the app never sits outside a provider.
  // GateInner handles the dormant case by rendering children untouched.
  return (
    <AuthProvider>
      <GateInner app={app}>{children}</GateInner>
    </AuthProvider>
  );
}

export default Gate;
