import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthClient, AuthSession } from '../api/client';
const AuthContext = createContext<AuthSession | null>(null);
export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => { client.getSession().then(setSession).catch(setError); }, [client]);
  if (error) return <div role="alert">Unable to load authorization</div>;
  if (!session) return <div>Loading authorization…</div>;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider required'); return value; }
