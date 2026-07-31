'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onIdTokenChanged,
} from 'firebase/auth';
import { auth, googleProvider, microsoftProvider } from '@/lib/firebase';

export type UserRole = 'FREE_USER' | 'PRO_USER' | 'ADMIN';

interface AuthContextType {
  user: User | null;
  role: UserRole;
  token: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: 'FREE_USER',
  token: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('FREE_USER');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          const currentToken = tokenResult.token;
          setToken(currentToken);
          let assignedRole = (tokenResult.claims.role as UserRole) || 'FREE_USER';

          // Sincronizar con el backend
          try {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
            const res = await fetch(`${apiBase}/auth/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentToken}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.user?.role) {
                assignedRole = data.user.role as UserRole;
              }
            }
          } catch (syncErr) {
            console.error('Error syncing user with PostgreSQL backend:', syncErr);
          }

          setRole(assignedRole);
        } catch (err) {
          console.error('Error fetching user ID token claims:', err);
          setRole('FREE_USER');
        }
      } else {
        setUser(null);
        setRole('FREE_USER');
        setToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithMicrosoft = async () => {
    await signInWithPopup(auth, microsoftProvider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        loading,
        signInWithGoogle,
        signInWithMicrosoft,
        signInWithEmail,
        signUpWithEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
