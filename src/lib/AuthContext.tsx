import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, getDocs, getDoc, updateDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { syncClaimsAndRefreshToken } from './syncClaims';
import type { SchoolOption } from '../components/SchoolPicker';
import { SELECTED_SCHOOL_KEY } from '../components/SchoolPicker';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  /** Multi-school principal picker — when populated the App renders the
   *  picker modal. User clicking an option calls `pickSchool(schoolId)`. */
  schoolOptions: SchoolOption[] | null;
  pickSchool: (schoolId: string) => Promise<void>;
  pickerBusy: boolean;
  /** Re-read the principal's doc + merge into userData. Call after writes
   *  that update fields like schoolName / branchName so the header, picker,
   *  and any other consumer that reads `userData.schoolName` reflects the
   *  change without forcing a full re-login. */
  refreshUserData: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]         = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);   // true until Firebase responds
  const [error, setError]       = useState<string | null>(null);
  // Picker state — when set, App.tsx renders the SchoolPicker modal.
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[] | null>(null);
  const [pickerBusy, setPickerBusy]       = useState(false);

  // Re-runnable resolver — extracted from the auth listener so the picker
  // can call it again with a `preferredSchoolId` after the user picks.
  // Returns true when userData was set (success), false when picker is
  // showing and waiting for input.
  const resolveUserContext = async (
    currentUser: User,
    prefs: { preferredSchoolId?: string } = {},
  ): Promise<boolean> => {
    const userEmail = currentUser.email!.toLowerCase().trim();

    // Sync claims with optional preference (set after user picks a school).
    const synced = await syncClaimsAndRefreshToken(
      currentUser,
      prefs.preferredSchoolId
        ? { preferredRole: "principal", preferredSchoolId: prefs.preferredSchoolId }
        : undefined,
    );
    const claimSchoolId = synced?.schoolId || null;
    const claimRole = synced?.role || null;

    // Primary scoped query
    const pQuery = claimSchoolId
      ? query(
          collection(db, 'principals'),
          where('schoolId', '==', claimSchoolId),
          where('email', '==', userEmail),
        )
      : query(collection(db, 'principals'), where('email', '==', userEmail));
    const snap = await getDocs(pQuery);
    let matched = snap.docs[0] ?? null;

    // Owner→principal recovery: when the user accidentally registered as
    // owner (orphan schools/{uid} doc) but is also an invited principal
    // somewhere, the scoped query above misses the principal record.
    // Recovery is allowed because hasOwnerRole() permits unrestricted LIST.
    let recoveryAll: typeof snap.docs = [];
    if (!matched && claimRole === "owner") {
      try {
        const recoverySnap = await getDocs(
          query(collection(db, 'principals'), where('email', '==', userEmail)),
        );
        recoveryAll = recoverySnap.docs.slice();

        if (recoveryAll.length === 0) {
          // No principal record → fall through to data_entry / "not authorised"
        } else if (recoveryAll.length === 1) {
          // Single record → use it directly
          matched = recoveryAll[0];
        } else {
          // Multiple records → check stored selection from previous session.
          const stored = typeof window !== "undefined"
            ? window.localStorage.getItem(SELECTED_SCHOOL_KEY)
            : null;
          if (stored) {
            const fromStored = recoveryAll.find(d => (d.data() as any).schoolId === stored);
            if (fromStored) matched = fromStored;
          }
          // Still nothing → show picker. Caller must wait for pickSchool().
          if (!matched) {
            const opts: SchoolOption[] = recoveryAll.map(d => {
              const dd = d.data() as any;
              return {
                id: d.id,
                schoolId: dd.schoolId,
                schoolName: dd.schoolName || "Unnamed school",
                branchName: dd.branchName || dd.branch || dd.branchId,
                status: dd.status,
                lastActive: dd.lastActive,
              };
            });
            setUser(currentUser);
            setSchoolOptions(opts);
            setError(null);
            return false; // wait for picker
          }
        }
      } catch (recErr) {
        console.warn('[AuthContext] owner→principal recovery query failed:', recErr);
      }
    }

    if (matched) {
      const data = matched.data() as any;
      // One-time UID linking + status upgrade
      if (data.status !== 'Active' || !data.uid) {
        await updateDoc(doc(db, 'principals', matched.id), {
          uid: currentUser.uid,
          status: 'Active',
          email: userEmail,
          lastActive: new Date().toLocaleString(),
        });
      }
      // Persist the chosen schoolId for next session
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SELECTED_SCHOOL_KEY, data.schoolId);
        }
      } catch { /* localStorage may be blocked */ }

      setUser(currentUser);
      setUserData({ ...data, id: matched.id, role: 'principal' });
      setSchoolOptions(null); // clear picker if it was showing
      setError(null);
      return true;
    }

    // Not a principal — check data_entry path (unchanged from before).
    return false; // signals fall-through to caller's deo/error logic
  };

  // Picker callback — re-runs resolveUserContext with the picked schoolId.
  const pickSchool = async (chosenSchoolId: string) => {
    if (!user) return;
    setPickerBusy(true);
    try {
      // Persist immediately so the next sync uses it even if the call fails.
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SELECTED_SCHOOL_KEY, chosenSchoolId);
        }
      } catch { /* ignore */ }
      await resolveUserContext(user, { preferredSchoolId: chosenSchoolId });
    } catch (err) {
      console.error('[AuthContext] pickSchool failed:', err);
      setError('Could not switch school. Try again.');
    } finally {
      setPickerBusy(false);
    }
  };

  useEffect(() => {
    // 1. Set persistence FIRST before listener starts
    //    This ensures session is restored correctly on refresh
    setPersistence(auth, browserLocalPersistence).then(() => {
    });

    // Live subscription for current DEO / principal doc — so allowedPages
    // updates propagate to the logged-in user without needing a re-login.
    let liveUnsub: (() => void) | null = null;
    const clearLive = () => { if (liveUnsub) { liveUnsub(); liveUnsub = null; } };

    // 2. THE ONLY auth listener in the entire app
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearLive();
      if (currentUser?.email) {
        try {
          const userEmail = currentUser.email.toLowerCase().trim();

          // Try to resolve the user as a principal (handles single-record,
          // stored-selection, and picker paths). Returns true on success,
          // false when picker is showing (waiting for user input) OR when
          // the user isn't a principal at all.
          const resolved = await resolveUserContext(currentUser);
          if (resolved) {
            // Done — userData is set, picker (if any) is cleared
            setLoading(false);
            return;
          }

          // If resolveUserContext set the picker, halt here and wait.
          if (schoolOptions && schoolOptions.length > 0) {
            setLoading(false);
            return;
          }

          // Re-derive claims for the data_entry / pending fallback paths.
          // (resolveUserContext already called syncUserClaims, so this read
          // just inspects the existing token without another network round-trip.)
          const tokenResult = await currentUser.getIdTokenResult();
          const claimSchoolId = (tokenResult.claims as any).schoolId || null;

          {
            // Not a principal — check if they are an approved data entry operator.
            // Same schoolId-filter pattern: rules require inSameSchool() on list.
            const deoQuery = claimSchoolId
              ? query(collection(db, 'data_entry_staff'),
                  where('schoolId', '==', claimSchoolId),
                  where('email', '==', userEmail),
                  where('status', '==', 'approved')
                )
              : query(collection(db, 'data_entry_staff'),
                  where('email', '==', userEmail),
                  where('status', '==', 'approved')
                );
            const deoSnap = await getDocs(deoQuery);

            if (!deoSnap.empty) {
              const deoDoc = deoSnap.docs[0];
              const deoData = deoDoc.data();
              // Update last active
              await updateDoc(doc(db, 'data_entry_staff', deoDoc.id), {
                lastActive: new Date().toLocaleString(),
                uid: currentUser.uid,
              });
              setUser(currentUser);
              setUserData({ ...deoData, id: deoDoc.id, role: 'data_entry' });
              setError(null);

              // Live-refresh allowedPages / status whenever principal edits
              liveUnsub = onSnapshot(
                doc(db, 'data_entry_staff', deoDoc.id),
                (snap) => {
                  if (!snap.exists()) {
                    // Access was revoked — log the user out of app state
                    setUserData(null);
                    setError('Your access has been revoked. Please contact your principal.');
                    return;
                  }
                  const fresh = snap.data() as any;
                  setUserData({ ...fresh, id: snap.id, role: 'data_entry' });
                },
                () => { /* silent fail — keep cached data */ }
              );
            } else {
              // Check if pending (to show a better error message).
              const pendingQuery = claimSchoolId
                ? query(collection(db, 'data_entry_staff'),
                    where('schoolId', '==', claimSchoolId),
                    where('email', '==', userEmail),
                  )
                : query(collection(db, 'data_entry_staff'),
                    where('email', '==', userEmail),
                  );
              const pendingSnap = await getDocs(pendingQuery);
              setUser(currentUser);
              setUserData(null);
              setError(
                !pendingSnap.empty
                  ? `Your access request is ${pendingSnap.docs[0].data().status}. Please wait for principal approval.`
                  : `Access denied: ${userEmail} is not authorised. Submit an access request first.`
              );
            }
          }
        } catch (err: any) {
          console.error('Auth lookup error:', err);
          setError('Could not verify your identity. Check network.');
          setUser(null);
          setUserData(null);
        }
      } else {
        // Logged out
        setUser(null);
        setUserData(null);
        setError(null);
      }

      // 5. Always release the loading gate at the end
      setLoading(false);
    });

    return () => { unsubscribe(); clearLive(); };
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    // signInWithPopup works on localhost AND production
    // onAuthStateChanged fires automatically after popup resolves
    await signInWithPopup(auth, provider);
    // NOTE: Do NOT navigate here. App.tsx re-renders automatically via state.
  };

  // ── Live school-name subscription ────────────────────────────────────
  // The header / branding strip reads `userData.schoolName` (or branchName).
  // Subscribing to schools/{schoolId} as the canonical source of truth means
  // ANY rename — from this session, another tab, or the cascade trigger —
  // flows instantly into the UI without depending on which denormalized
  // field happens to be fresh. Runs whenever the resolved schoolId changes.
  useEffect(() => {
    const schoolId = (userData as { schoolId?: string } | null)?.schoolId;
    if (!schoolId) return;
    const unsub = onSnapshot(
      doc(db, "schools", schoolId),
      (snap) => {
        if (!snap.exists()) return;
        const liveName = String((snap.data() as { name?: string })?.name || "").trim();
        if (!liveName) return;
        // Functional setState — pulls the latest userData ref at flush time
        // so we don't stamp over a stale closure. We mirror onto BOTH
        // schoolName AND branchName because the header falls back through
        // both fields and we want either lookup to see the same fresh value.
        setUserData((prev: any) => {
          if (!prev) return prev;
          if (prev.schoolName === liveName && prev.branchName === liveName) return prev;
          return { ...prev, schoolName: liveName, branchName: liveName };
        });
      },
      (err) => console.warn("[AuthContext] live school-name listener failed:", err),
    );
    return () => unsub();
  }, [(userData as { schoolId?: string } | null)?.schoolId]);

  // Re-pull the principal/data_entry doc and merge into in-memory userData.
  // Called by Settings after a save so the header + name strip refresh
  // without needing a full page reload or re-login.
  const refreshUserData = async () => {
    try {
      const current = userData;
      if (!current?.id || !current?.role) return;
      const collName = current.role === "data_entry" ? "data_entry" : "principals";
      const fresh = await getDoc(doc(db, collName, current.id));
      if (fresh.exists()) {
        setUserData({ ...current, ...fresh.data(), id: current.id, role: current.role });
      }
    } catch (err) {
      console.warn("[AuthContext] refreshUserData failed:", err);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserData(null);
    setError(null);
    setSchoolOptions(null);
    // Clear stored school selection so a fresh login on this browser
    // re-shows the picker for users with multiple records.
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(SELECTED_SCHOOL_KEY);
      }
    } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{
      user, userData, loading, error,
      loginWithGoogle, logout,
      schoolOptions, pickSchool, pickerBusy,
      refreshUserData,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
