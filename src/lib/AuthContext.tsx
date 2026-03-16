import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser && currentUser.email) {
        try {
          // 1. Try Principals Collection
          const principalQ = query(collection(db, "principals"), where("email", "==", currentUser.email.toLowerCase()));
          const principalSnap = await getDocs(principalQ);

          if (!principalSnap.empty) {
            setUserData({ ...principalSnap.docs[0].data(), role: 'principal' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // 2. Try Teachers Collection
          const teacherQ = query(collection(db, "teachers"), where("email", "==", currentUser.email.toLowerCase()));
          const teacherSnap = await getDocs(teacherQ);

          if (!teacherSnap.empty) {
            setUserData({ ...teacherSnap.docs[0].data(), role: 'teacher' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // 3. Try Students Collection
          const studentQ = query(collection(db, "students"), where("email", "==", currentUser.email.toLowerCase()));
          const studentSnap = await getDocs(studentQ);

          if (!studentSnap.empty) {
            setUserData({ ...studentSnap.docs[0].data(), role: 'student' });
            setUser(currentUser);
            setError(null);
            setLoading(false);
            return;
          }

          // If none of the above
          await signOut(auth);
          setUser(null);
          setUserData(null);
          setError("You are not authorized to access this dashboard. Please contact your school administration.");
          
        } catch (err: any) {
          console.error("Auth Error:", err);
          setError("An error occurred during verification.");
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
    try {
      setError(null);
      await signInWithPopup(auth, provider);
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
