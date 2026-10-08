'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getApiUrl, parseApiError } from '@/lib/api';

const SESSION_COOKIE = 'gorent_session=1; Path=/; Max-Age=86400; SameSite=Lax';

function setSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = SESSION_COOKIE;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'gorent_session=; Path=/; Max-Age=0';
}

interface User {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: 'owner' | 'renter';
}

export type RegisterInput = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone_number?: string;
  role?: 'renter' | 'owner';
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSavedAuth(): { token: string | null; user: User | null } {
  const savedToken = localStorage.getItem('auth_token');
  const savedUser = localStorage.getItem('auth_user');
  if (!savedToken || !savedUser) {
    return { token: null, user: null };
  }

  try {
    return { token: savedToken, user: JSON.parse(savedUser) as User };
  } catch {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const savedAuth = getSavedAuth();
      setToken(savedAuth.token);
      setUser(savedAuth.user);
      setIsLoading(false);
    }, 0);

    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (token && user) {
      setSessionCookie();
    }
  }, [isLoading, token, user]);

  const register = async (input: RegisterInput) => {
    const res = await fetch(`${getApiUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email.trim(),
        password: input.password,
        phone_number: input.phone_number ?? '',
        role: input.role ?? 'renter',
      }),
    });
    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${getApiUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    const data = (await response.json()) as {
      token: string;
      user_id: number;
      role: 'owner' | 'renter';
      first_name: string;
      last_name: string;
    };

    const nextUser: User = {
      user_id: data.user_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: email.trim(),
      role: data.role,
    };

    setToken(data.token);
    setUser(nextUser);
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(nextUser));
    setSessionCookie();
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    clearSessionCookie();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
