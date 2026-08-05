const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')).replace(/\/$/, '');
export type PublicCaseContext = { id?: string; requirements?: string[]; customerName?: string; templateVersionId?: string; accessToken?: string };
export function getPublicCaseContext(): PublicCaseContext {
  const query = new URLSearchParams(window.location.search); const token = query.get('access_token') ?? query.get('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('token') ?? undefined;
  let data: PublicCaseContext = {};
  const encoded = query.get('case') ?? query.get('caseData') ?? localStorage.getItem('authorization_case');
  if (encoded) { try { const decoded = decodeURIComponent(encoded); data = JSON.parse(decoded.startsWith('{') ? decoded : atob(decoded)); } catch { /* invalid optional context */ } }
  return { ...data, id: data.id ?? query.get('caseId') ?? query.get('id') ?? undefined, accessToken: token };
}
export async function publicRequest<T>(path: string, init: RequestInit = {}) { const headers = new Headers(init.headers); const token = getPublicCaseContext().accessToken; if (token) headers.set('Authorization', `Bearer ${token}`); if (init.body) headers.set('Content-Type', 'application/json'); const response = await fetch(`${apiBase}${path}`, { ...init, headers }); if (!response.ok) throw new Error(`API request failed (${response.status})`); return response.json() as Promise<T>; }
