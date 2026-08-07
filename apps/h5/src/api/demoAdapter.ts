import type { DraftAnswers, PublicCaseModel } from '../features/case-wizard/model';
import { createDemoCase } from '../features/case-wizard/model';

interface DemoDraft { answers: DraftAnswers; version: number; step: number; submitted?: boolean }
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const storageKey = (token: string) => `authorization-h5-demo-draft:${token.replace(/[^a-z0-9_-]/gi, '').slice(0, 32)}`;

export function readDemoDraft(token: string): DemoDraft | undefined {
  try { const raw = localStorage.getItem(storageKey(token)); return raw ? JSON.parse(raw) as DemoDraft : undefined; } catch { return undefined; }
}

export const demoApi = {
  async loadCase(token: string): Promise<PublicCaseModel> {
    await wait(350);
    if (token.includes('invalid') || token.includes('expired') || token.includes('disabled')) throw new Error('unavailable');
    return createDemoCase(token, token.includes('20') ? 20 : 2);
  },
  async saveDraft(token: string, version: number, answers: DraftAnswers, step = 0) {
    await wait(280);
    if (token.includes('conflict')) { const error = new Error('conflict'); Object.assign(error, { status: 409 }); throw error; }
    const next = { answers, version: version + 1, step }; localStorage.setItem(storageKey(token), JSON.stringify(next)); return next;
  },
  async forceDraft(token: string, version: number, answers: DraftAnswers, step = 0) {
    const next = { answers, version: version + 1, step }; localStorage.setItem(storageKey(token), JSON.stringify(next)); return next;
  },
  async upload(_token: string, _key: string, _file: File, onProgress: (percent: number) => void) {
    for (const percent of [12, 34, 61, 82, 100]) { await wait(120); onProgress(percent); }
    return { fileId: `demo-${Date.now()}` };
  },
  async submit(token: string, payload: { answers: DraftAnswers; version: number; step: number }) {
    await wait(500); localStorage.setItem(storageKey(token), JSON.stringify({ ...payload, submitted: true })); return { completed: true as const };
  },
};
