import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  userData: any | null; // Renamed from principalData
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle redirect result first
    const handleRedirect = async () => {
      try {
        await getRedirectResult(auth);
      } catch (err: any) {
        console.error("Redirect Error:", err);
        setError(err.message);
      }
    };
    handleRedirect();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser && currentUser.email) {
        try {
          const userEmail = currentUser.email.toLowerCase();
          
          // 1. Try Principals Collection (Robust Multi-Case Query)
          let principalQ = query(collection(db, "principals"), where("email", "==", userEmail));
          let principalSnap = await getDocs(principalQ);
          
          // Fallback: If lowercase search failed, try exact search (for old mixed-case records)
          if (principalSnap.empty) {
            principalQ = query(collection(db, "principals"), where("email", "==", currentUser.email));
            principalSnap = await getDocs(principalQ);
          }

          if (!principalSnap.empty) {
            const principalDoc = principalSnap.docs[0];
            const data = principalDoc.data();
            
            // Link UID and update status to Active
            if (data.status !== 'Active' || !data.uid) {
              await updateDoc(doc(db, "principals", principalDoc.id), {
                status: 'Active',
                lastActive: new Date().toLocaleString(),
                uid: currentUser.uid,
                email: userEmail // Normalize email to lowercase
              });
            }

            setUserData({ ...data, id: principalDoc.id, role: 'principal' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // 2. Try Teachers Collection
          let teacherQ = query(collection(db, "teachers"), where("email", "==", userEmail));
          let teacherSnap = await getDocs(teacherQ);
          
          if (teacherSnap.empty) {
            teacherQ = query(collection(db, "teachers"), where("email", "==", currentUser.email));
            teacherSnap = await getDocs(teacherQ);
          }

          if (!teacherSnap.empty) {
            const data = teacherSnap.docs[0].data();
            setUserData({ ...data, role: 'teacher' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // 3. Try Students Collection
          let studentQ = query(collection(db, "students"), where("email", "==", userEmail));
          let studentSnap = await getDocs(studentQ);

          if (studentSnap.empty) {
            studentQ = query(collection(db, "students"), where("email", "==", currentUser.email));
            studentSnap = await getDocs(studentQ);
          }

          if (!studentSnap.empty) {
            const data = studentSnap.docs[0].data();
            setUserData({ ...data, role: 'student' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // If no authorized record found
          setError("You are not authorized. Contact school admin.");
          await signOut(auth);
          setUser(null);
          setUserData(null);
          
        } catch (err: any) {
          console.error("Auth Error:", err);
          setError("Verification failed.");
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Enforce account selector
    try {
      setError(null);
      // Using redirect for better mobile/in-app browser support
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
