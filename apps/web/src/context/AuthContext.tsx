import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getMeApi,
  loginApi,
  logoutApi,
  type AuthUser,
  type LoginCredentials,
} from "../api/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Test auth override for non-auth feature test suites mounting full App on private routes
let testAuthOverride: { user: AuthUser | null; loading: boolean } | null = null;

export function setTestAuthOverride(override: { user: AuthUser | null; loading: boolean } | null) {
  testAuthOverride = override;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    testAuthOverride ? testAuthOverride.user : null
  );
  const [loading, setLoading] = useState(
    testAuthOverride ? testAuthOverride.loading : true
  );

  const checkAuth = async () => {
    if (testAuthOverride) return;
    try {
      setLoading(true);
      const currentUser = await getMeApi();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (testAuthOverride) return;
    checkAuth();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const loggedInUser = await loginApi(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  };

  const logout = async () => {
    await logoutApi();
    setUser(null);
  };

  const refreshUser = async () => {
    const currentUser = await getMeApi();
    setUser(currentUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
