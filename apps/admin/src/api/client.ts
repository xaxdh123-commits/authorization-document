import { demoCases, demoReviews, demoStatusCounts } from './demoData';
export type AuthSession = { userId: string; roleKey: string; abilities: string[]; displayName?: string; roleName?: string };
export interface AuthClient { getSession(): Promise<AuthSession>; }
import type { DashboardData } from '../features/dashboard/DashboardPage';
import type { CaseSummary } from '../features/cases/CaseListPage';
import type { ReviewSummary } from '../features/reviews/ReviewQueuePage';

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')).replace(/\/$/, '');
export const isDemoMode = () => import.meta.env.VITE_DEMO_MODE === 'true' || new URLSearchParams(window.location.search).get('demo') === '1';
const roleNames: Record<string, string> = { admin: '超级管理员', common: '普通用户', service: '客服', customer_service: '客服', reviewer: '审核员', market: '分销管理' };
function readAuthCookie() { const match = document.cookie.split('; ').find((item) => item.startsWith('Admin-Token=') || item.startsWith('admin_token=')); return match ? decodeURIComponent(match.slice(match.indexOf('=') + 1)) : null; }
export function getAccessToken() { const query = new URLSearchParams(window.location.search); return query.get('access_token') ?? query.get('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('token') ?? readAuthCookie(); }
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers); headers.set('Content-Type', 'application/json');
  const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`接口请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}
export type CaseCreateInput = { customerName: string; contactName: string; factoryDepartment: string; materials: Array<{ name: string; specification: string; quantity: number; material: string; craft: string; optionalPrice?: number }>; templateVersionId: string; requirements?: string[]; linkExpiresInDays?: number; quoteReference?: string };
const wait = <T,>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), 160));
export function createApiClient() {
  const demo = isDemoMode();
  return {
    demo,
    async getSession(): Promise<AuthSession> {
      if (demo) return wait({ userId: '1', roleKey: 'admin', displayName: '若依', roleName: '超级管理员', abilities: ['*:*:*'] });
      const result = await request<{ user?: { userId: number; nickName?: string; roles?: Array<{ roleKey: string; roleName?: string }> }; permissions?: string[] }>('/auth/getInfo');
      const user = result.user; const firstRole = user?.roles?.[0];
      const abilities = result.permissions ?? [];
      const roleKey = firstRole?.roleKey ?? 'common';
      return { userId: String(user?.userId ?? ''), roleKey, displayName: user?.nickName ?? '当前用户', roleName: firstRole?.roleName ?? roleNames[roleKey] ?? roleKey, abilities };
    },
    createCase: (input: CaseCreateInput) => demo ? wait({ id: `CASE-${Date.now().toString().slice(-6)}` }) : request<{ id: string }>('/cases', { method: 'POST', body: JSON.stringify(input) }),
    listCases: (): Promise<CaseSummary[]> => demo ? wait(demoCases) : request('/cases'),
    async getDashboard(): Promise<DashboardData> {
      if (demo) return wait({ statuses: demoStatusCounts, recent: demoCases.slice(0, 5), overdue: demoCases.slice(3, 5) });
      return request('/dashboard');
    },
    listReviews: (): Promise<ReviewSummary[]> => demo ? wait(demoReviews) : request('/reviews'),
  };
}
