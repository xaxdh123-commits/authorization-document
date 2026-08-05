import { useEffect, useState } from 'react';
const tabs = ['Overview', 'Materials', 'Questionnaire', 'Files', 'Authorization', 'Audit log'] as const;
export interface CaseDetailClient { getCase(): Promise<{ title: string }>; }
export function CaseDetailPage({ client }: { client?: CaseDetailClient }) { const [tab, setTab] = useState<(typeof tabs)[number]>('Overview'); const [title, setTitle] = useState<string>(); useEffect(() => { client?.getCase().then(c => setTitle(c.title)); }, [client]); return <main><h1>Case detail</h1>{title && <p>{title}</p>}<div role="tablist">{tabs.map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{t}</button>)}</div><section><h2>{tab}</h2></section></main>; }
