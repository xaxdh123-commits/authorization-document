import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthClient, AuthSession } from '../api/client';
const AuthContext = createContext<AuthSession | null>(null);
export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => { client.getSession().then(setSession).catch(setError); }, [client]);
  if (error) return <div className="full-state"><div className="state-icon">!</div><h1>认证服务暂不可用</h1><p>无法获取当前用户信息，请稍后重试。</p><button onClick={() => location.reload()}>重新加载</button><a href="?demo=1">进入演示模式</a></div>;
  if (!session) return <div className="full-state"><span className="spinner" /><h1>正在验证访问权限</h1><p>请稍候，正在连接统一认证服务…</p></div>;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('缺少认证上下文'); return value; }
