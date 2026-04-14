import React, { createContext, useContext, useState } from 'react';
import { DBUser, loginUser, registerUser, updateUserLanguage } from '../database/database';

export interface AppUser {
  id: number;
  username: string;
  email: string;
  preferred_language: string;
}

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changeLanguage: (langCode: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const toAppUser = (u: DBUser): AppUser => ({
  id: u.id, username: u.username, email: u.email,
  preferred_language: u.preferred_language ?? 'en',
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);

  const login = async (email: string, pass: string) => {
    const res = await loginUser(email, pass);
    if (res.success) { setUser(toAppUser(res.user)); return { success: true }; }
    return { success: false, error: res.error };
  };

  const register = async (username: string, email: string, pass: string) => {
    const res = await registerUser(username, email, pass);
    if (res.success) {
      setUser({ id: res.userId, username, email, preferred_language: 'en' });
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const changeLanguage = async (langCode: string) => {
    if (!user) return;
    const ok = await updateUserLanguage(user.id, langCode);
    if (ok) setUser({ ...user, preferred_language: langCode });
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, changeLanguage }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
