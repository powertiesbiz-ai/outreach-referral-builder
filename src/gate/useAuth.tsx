/**
 * useAuth.tsx — AuthProvider + useAuth hook.
 *
 * Mirrors MLOT's googleAuth.ts semantics (signInWithPopup with a
 * GoogleAuthProvider, onAuthStateChanged as the source of truth), extended
 * to load the user's entitlement after sign-in and to create the free
 * users/{uid} document on first sign-in.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, isGateConfigured } from "./firebase";
import {
  ensureUserDoc,
  getEntitlement,
  type Entitlement,
} from "./entitlement";

export interface AuthContextValue {
  user: User | null;
  entitlement: Entitlement | null;
  /** True until the first auth state (and its entitlement) has resolved. */
  loading: boolean;
  /**
   * Plain-language reason the last sign-in attempt failed, or null.
   * Popup rejections that are the user's own action (closing the popup)
   * never set this — they stay quiet by design.
   */
  signInError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
}

/**
 * Map a Firebase popup sign-in rejection to the line shown on the
 * sign-in screen. Returns null for rejections that should stay silent
 * (the user closed or superseded the popup themselves).
 */
export function signInErrorMessage(err: unknown): string | null {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  switch (code) {
    case "auth/unauthorized-domain":
      return "This address isn't switched on for Google sign-in yet. We're on it — try again shortly.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site, then try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    default:
      return "Sign-in didn't go through. Check your connection and try again.";
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isGateConfigured);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshEntitlement = useCallback(async () => {
    if (!auth?.currentUser) {
      setEntitlement(null);
      return;
    }
    const ent = await getEntitlement(auth.currentUser.uid);
    if (mountedRef.current) setEntitlement(ent);
  }, []);

  useEffect(() => {
    if (!isGateConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      void (async () => {
        if (!mountedRef.current) return;
        setUser(nextUser);
        if (nextUser) setSignInError(null);
        if (nextUser) {
          // First sign-in creates the free doc; later sign-ins just read it.
          const ent =
            (await ensureUserDoc(nextUser)) ??
            (await getEntitlement(nextUser.uid));
          if (mountedRef.current) setEntitlement(ent);
        } else {
          setEntitlement(null);
        }
        if (mountedRef.current) setLoading(false);
      })();
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isGateConfigured || !auth) {
      console.warn("[PowerTies gate] Sign-in unavailable — gate not configured.");
      return;
    }
    setSignInError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setSignInError(null);
      // onAuthStateChanged picks the new user up and loads the entitlement.
    } catch (err) {
      // Surface a plain-language reason instead of failing silently;
      // signInErrorMessage returns null for the user's own actions
      // (closing the popup), which stay quiet.
      if (mountedRef.current) setSignInError(signInErrorMessage(err));
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setEntitlement(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      entitlement,
      loading,
      signInError,
      signInWithGoogle,
      signOut,
      refreshEntitlement,
    }),
    [user, entitlement, loading, signInError, signInWithGoogle, signOut, refreshEntitlement],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider> (or <Gate>, which includes it).");
  }
  return ctx;
}
