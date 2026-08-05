import { useState } from 'react';
const tabs = ['Overview', 'Materials', 'Questionnaire', 'Files', 'Authorization', 'Audit log'] as const;
export function CaseDetailPage() { const [tab, setTab] = useState<(typeof tabs)[number]>('Overview'); return <main><h1>Case detail</h1><div role="tablist">{tabs.map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{t}</button>)}</div><section><h2>{tab}</h2></section></main>; }
