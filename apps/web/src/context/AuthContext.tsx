import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Role } from '../api/types.js';
import * as api from '../api/client.js';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAdmin: boolean;
  isEmployee: boolean;
  loading: boolean;
  login: (input: { loginName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const session = await api.getSession();
      setUser(session.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  const login = async (input: { loginName: string; password: string }) => {
    const session = await api.login(input);
    setUser(session.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      try {
        await api.ensureSessionChallenge();
      } catch {
        // Fallback: LoginPage mount or subsequent login will retry
      }
    }
  };

  const role = user?.role ?? null;
  const isAdmin = role === 'admin';
  const isEmployee = role === 'employee';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isEmployee,
        loading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
