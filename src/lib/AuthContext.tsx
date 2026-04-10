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
import { collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]         = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);   // true until Firebase responds
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    // 1. Set persistence FIRST before listener starts
    //    This ensures session is restored correctly on refresh
    setPersistence(auth, browserLocalPersistence).then(() => {
    });

    // 2. THE ONLY auth listener in the entire app
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser?.email) {
        try {
          const userEmail = currentUser.email.toLowerCase().trim();

          // 3. Fetch principals whitelist and match in-memory
          //    (Handles case-insensitive emails & avoids Firestore index errors)
          const snap = await getDocs(collection(db, 'principals'));
          const matched = snap.docs.find(
            (d) => d.data().email?.toLowerCase().trim() === userEmail
          );

          if (matched) {
            const data = matched.data();

            // 4. One-time UID linking + status upgrade
            if (data.status !== 'Active' || !data.uid) {
              await updateDoc(doc(db, 'principals', matched.id), {
                uid: currentUser.uid,
                status: 'Active',
                email: userEmail,
                lastActive: new Date().toLocaleString()
              });
            }

            setUser(currentUser);
            setUserData({ ...data, id: matched.id, role: 'principal' });
            setError(null);
          } else {
            // Not a principal — check if they are an approved data entry operator
            const deoSnap = await getDocs(
              query(collection(db, 'data_entry_staff'),
                where('email', '==', userEmail),
                where('status', '==', 'approved')
              )
            );

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
            } else {
              // Check if pending (to show a better error message)
              const pendingSnap = await getDocs(
                query(collection(db, 'data_entry_staff'),
                  where('email', '==', userEmail)
                )
              );
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

    return () => unsubscribe();
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

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserData(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, error, loginWithGoogle, logout }}>
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
