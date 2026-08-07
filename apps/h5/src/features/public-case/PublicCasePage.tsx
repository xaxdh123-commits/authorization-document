import { useEffect, useState } from 'react';
import { demoApi, readDemoDraft } from '../../api/demoAdapter';
import { getPublicToken, isDemoRequest, publicApi } from '../../api/client';
import { CaseWizardPage } from '../case-wizard/CaseWizardPage';
import type { PublicCaseModel } from '../case-wizard/model';

export function PublicCasePage() {
  const rawToken = getPublicToken(); const demo = isDemoRequest(rawToken); const token = rawToken ?? (demo ? 'demo' : undefined);
  const [state, setState] = useState<{ kind: 'loading' | 'ready' | 'unavailable'; model?: PublicCaseModel }>({ kind: 'loading' });
  useEffect(() => { let active = true; if (!token) { setState({ kind: 'unavailable' }); return; } const client = demo ? demoApi : publicApi; void client.loadCase(token).then((model) => { if (active) setState({ kind: 'ready', model }); }).catch(() => { if (active) setState({ kind: 'unavailable' }); }); return () => { active = false; }; }, [token, demo]);
  if (state.kind === 'loading') return <LoadingPage />;
  if (state.kind === 'unavailable' || !token || !state.model) return <UnavailablePage />;
  const draft = demo ? readDemoDraft(token) : undefined;
  if (draft?.submitted || state.model.mode === 'completed') return <ClosedPage />;
  return <CaseWizardPage model={state.model} token={token} initialAnswers={draft?.answers} initialStep={draft?.step} onSave={demo ? (version, answers, step) => demoApi.saveDraft(token, version, answers, step) : (version, answers) => publicApi.saveDraft(token, version, answers)} onForceSave={demo ? (version, answers, step) => demoApi.forceDraft(token, version, answers, step) : (version, answers) => publicApi.forceDraft(token, version, answers)} onUpload={demo ? (key, file, progress) => demoApi.upload(token, key, file, progress) : (key, file, progress) => publicApi.upload(token, key, file, progress)} onLoadCurrentFiles={demo ? undefined : () => publicApi.loadCurrentFiles(token)} onRemoveFile={demo ? undefined : (fileId) => publicApi.removeFile(token, fileId)} onUploadSigningResource={demo ? undefined : (file, purpose, originalFileVersionId) => publicApi.uploadSigningResource(token, file, purpose, originalFileVersionId)} onPreparePreview={demo ? undefined : () => publicApi.preparePreview(token)} onSubmit={demo ? (payload) => demoApi.submit(token, payload as never) : (payload) => publicApi.submit(token, payload as Parameters<typeof publicApi.submit>[1])} />;
}

function LoadingPage() { return <div className="state-page"><div className="state-card"><div className="loading-mark"><i /><i /><i /></div><h1>正在安全加载业务单</h1><p>正在验证链接并准备资料，请稍候…</p><div className="skeleton-lines"><i /><i /><i /></div></div></div>; }
export function UnavailablePage() { return <div className="state-page"><div className="state-card"><div className="unavailable-icon">⌁</div><h1>此链接当前无法访问</h1><p>链接可能已过期、停用、完成或被重新生成。为保护业务信息，我们不会显示具体原因。</p><div className="recovery-box"><strong>如何继续？</strong><p>请联系向您发送本链接的客服，获取新的有效链接。请勿将本页面截图或地址转发给他人。</p></div><button className="secondary-button" onClick={() => window.location.reload()}>重新尝试</button><small className="reference">访问参考：{new Date().toISOString().slice(0, 10).replaceAll('-', '')}-{Math.random().toString(36).slice(2, 8).toUpperCase()}</small></div></div>; }
function ClosedPage() { return <div className="state-page"><div className="state-card success"><div className="success-check">✓</div><h1>本次资料已提交</h1><p>此填写入口已关闭，无需重复操作。如需补充或修改，请联系您的专属客服。</p><p className="muted">您现在可以安全关闭此页面。</p></div></div>; }
