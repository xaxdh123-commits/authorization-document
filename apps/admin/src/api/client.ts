export type AuthSession = { userId: string; roleKey: string; abilities: string[] };
export interface AuthClient { getSession(): Promise<AuthSession>; }
import type { DashboardData } from '../features/dashboard/DashboardPage';
import type { CaseSummary } from '../features/cases/CaseListPage';
import type { ReviewSummary } from '../features/reviews/ReviewQueuePage';

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')).replace(/\/$/, '');
export function getAccessToken() {
  const query = new URLSearchParams(window.location.search);
  return query.get('access_token') ?? query.get('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('token');
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export type CaseCreateInput = {
  customerName: string; contactName: string; factoryDepartment: string;
  materials: Array<{ name: string; specification: string; quantity: number; material: string; craft: string; optionalPrice?: number }>;
  templateVersionId: string; requirements?: string[];
};
export function createApiClient() {
  return {
    async getSession(): Promise<AuthSession> {
      const result = await request<{ user?: { userId: number; roles?: Array<{ roleKey: string }> }; permissions?: string[] }>('/auth/getInfo');
      const user = result.user;
      return { userId: String(user?.userId ?? ''), roleKey: user?.roles?.[0]?.roleKey ?? 'common', abilities: result.permissions ?? [] };
    },
    createCase: (input: CaseCreateInput) => request<{ id: string }>('/cases', { method: 'POST', body: JSON.stringify(input) }),
    listCases: () => request<CaseSummary[]>('/cases'),
    getDashboard: () => request<DashboardData>('/dashboard'),
    listReviews: () => request<ReviewSummary[]>('/reviews'),
  };
}
