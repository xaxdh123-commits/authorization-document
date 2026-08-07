import { useEffect, useMemo, useRef, useState } from 'react';
import type { DraftClient } from './autosave';
import type { DraftAnswers, FieldErrors, MaterialItem, PublicCaseModel } from './model';
import { createDemoCase, validateStep } from './model';
import { InformationStep } from './InformationStep';
import { MaterialStep } from './MaterialStep';
import { UploadStep, type UploadedFile } from '../uploads/UploadStep';
import { PdfPreviewStep } from '../signing/PdfPreviewStep';
import { SignaturePlacementEditor, type SignaturePlacement, type SigningResourcePurpose, type SigningResourceRef } from '../signing/SignaturePlacementEditor';

type CurrentFilesResponse = { totalBytes: number; groups: Array<{ requirementKey: string; files: Array<{ fileId: string; fileVersionId: string; version: number; name: string; mimeType: string; sizeBytes: number; downloadUrl?: string }> }> };

const steps = ['基本信息', '委托生产物料', '资料上传', '签署确认'] as const;
type SaveStatus = 'saved' | 'saving' | 'failed' | 'offline';
interface Props {
  model?: PublicCaseModel;
  token?: string;
  initialAnswers?: DraftAnswers;
  initialStep?: number;
  draftClient?: DraftClient;
  onSave?: (version: number, answers: DraftAnswers, step: number) => Promise<{ version: number }>;
  onForceSave?: (version: number, answers: DraftAnswers, step: number) => Promise<{ version: number }>;
  onUpload?: (key: string, file: File, onProgress: (percent: number) => void) => Promise<{ fileId: string }>;
  onLoadCurrentFiles?: () => Promise<CurrentFilesResponse>;
  onRemoveFile?: (fileId: string) => Promise<unknown>;
  onUploadSigningResource?: (file: File, purpose: SigningResourcePurpose, originalFileVersionId?: string) => Promise<SigningResourceRef>;
  onPreparePreview?: () => Promise<{previewUrl:string;contentDigest:string;sha256:string;slots:Array<{slotId:string;page:number;x:number;y:number;width:number;height:number;required:boolean}>}>;
  onSubmit?: (payload: unknown) => Promise<unknown>;
}

export function CaseWizardPage({ model: providedModel, initialAnswers = {}, initialStep = 0, draftClient, onSave, onForceSave, onUpload, onLoadCurrentFiles, onRemoveFile, onUploadSigningResource, onPreparePreview, onSubmit }: Props = {}) {
  const [model, setModel] = useState(providedModel ?? createDemoCase('demo'));
  const [started, setStarted] = useState(Boolean(providedModel && initialStep > 0));
  const [step, setStep] = useState(initialStep);
  const [answers, setAnswers] = useState<DraftAnswers>({ contactName: providedModel?.contactName ?? '', contactPhone: '', ...initialAnswers });
  const [files, setFiles] = useState<Record<string, UploadedFile[]>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [version, setVersion] = useState(providedModel?.version ?? 1);
  const [conflict, setConflict] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [signature, setSignature] = useState<SignaturePlacement>({ method: 'handwritten', x: 62, y: 72, scale: 1 });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview,setPreview]=useState<{previewUrl:string;contentDigest:string;sha256:string;slots:Array<{slotId:string;page:number;x:number;y:number;width:number;height:number;required:boolean}>}|null>(null);
  const previewRef = useRef<typeof preview>(null);
  const wizardActive = useRef(true);
  const [completed, setCompleted] = useState(model.mode === 'completed');
  const mounted = useRef(false);
  const filesLoaded = useRef(false);
  const saveHandler = onSave ?? (draftClient ? async (_version: number, value: DraftAnswers) => { await draftClient.saveDraft(value); return { version: _version + 1 }; } : undefined);
  const requiredUploads = useMemo(() => model.requirements.filter((item) => ['file', 'image'].includes(item.type) && item.required && !item.locked), [model.requirements]);

  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => {
    wizardActive.current = true;
    return () => {
      wizardActive.current = false;
      const url = previewRef.current?.previewUrl;
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!onLoadCurrentFiles || filesLoaded.current) return;
    filesLoaded.current = true; let active = true;
    void onLoadCurrentFiles().then((response) => {
      if (!active) return;
      const restored: Record<string, UploadedFile[]> = {};
      response.groups.forEach((group) => { restored[group.requirementKey] = group.files.map((file) => ({ id: file.fileVersionId, fileId: file.fileId, fileVersionId: file.fileVersionId, version: file.version, name: file.name, size: file.sizeBytes, type: file.mimeType, progress: 100, status: 'success' })); });
      setFiles((current) => Object.keys(current).length ? current : restored);
    }).catch(() => { if (active) setErrors((current) => ({ ...current, uploads: '已上传资料加载失败，请刷新页面重试' })); });
    return () => { active = false; };
  }, [onLoadCurrentFiles]);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!online) { setSaveStatus('offline'); return; }
    if (!saveHandler) { setSaveStatus('saved'); return; }
    setSaveStatus('saving'); const timer = window.setTimeout(() => { void saveHandler(version, answers, step).then((result) => { setVersion(result.version); setSaveStatus('saved'); }).catch((error: Error & { status?: number }) => { if (error.status === 409 || error.message === 'conflict') setConflict(true); setSaveStatus('failed'); }); }, 600); return () => window.clearTimeout(timer);
  }, [answers, step, online]);

  const updateAnswer = (key: string, value: DraftAnswers[string]) => { setAnswers((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const updateMaterials = (materials: MaterialItem[]) => { setModel((current) => ({ ...current, materials })); setErrors((current) => ({ ...current, materials: '' })); setAnswers((current) => ({ ...current, materialsVersion: Number(current.materialsVersion ?? 0) + 1, __materials: materials as unknown as string[] })); };
  const next = () => {
    const currentErrors = validateStep(step, model, answers);
    if (step === 2) requiredUploads.forEach((item) => { if (!(files[item.key] ?? []).some((file) => file.status === 'success')) currentErrors[item.key] = `请上传${item.label}`; });
    setErrors(currentErrors); if (Object.keys(currentErrors).length > 0) { document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if(step===2&&onPreparePreview){setSaveStatus('saving');const save=saveHandler?saveHandler(version,answers,3):Promise.resolve({version});void save.then((result)=>{if(wizardActive.current){setVersion(result.version);setSaveStatus('saved');setStep(3);}return onPreparePreview();}).then((result)=>{if(!wizardActive.current){if(result.previewUrl.startsWith('blob:'))URL.revokeObjectURL(result.previewUrl);return;}const previousUrl=previewRef.current?.previewUrl;if(previousUrl?.startsWith('blob:')&&previousUrl!==result.previewUrl)URL.revokeObjectURL(previousUrl);previewRef.current=result;setPreview(result);}).catch(()=>{if(wizardActive.current){setSaveStatus('failed');setErrors({preview:'授权书预览生成失败，请稍后重试或联系客服检查 PDF 服务。'});setStep(3)}});return;}setStep((current) => Math.min(3, current + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = async () => {
    const finalErrors: FieldErrors = {};
    if (!signature.resource || (signature.method === 'seal' && !signature.confirmed)) finalErrors.signature = '请完成手写签名，或明确确认要使用的印章图片';
    if (!consent) finalErrors.consent = '请阅读并同意真实性与授权意愿声明';
    if(onPreparePreview&&!preview)finalErrors.preview='请先生成并查看签署前授权书 PDF';
    setErrors(finalErrors); if (Object.keys(finalErrors).length) return;
    setSubmitting(true); try { await onSubmit?.({ answers, version, signature, consent,preview }); setCompleted(true); } catch { setErrors({ submit: '提交失败，请检查网络后重试。请勿重复点击提交。' }); } finally { setSubmitting(false); }
  };

  if (completed) return <CompletionPage caseNo={model.caseNo} />;
  if (!started) return <IntroPage model={model} onStart={() => setStarted(true)} />;
  const supplement = model.mode === 'supplement';
  return <div className="public-shell"><PublicHeader step={step} status={saveStatus} online={online} /><main className="wizard-main"><nav className="mobile-progress" aria-label="填写进度"><span>步骤 {step + 1} / 4</span><strong>{steps[step]}</strong><div><i style={{ width: `${(step + 1) * 25}%` }} /></div></nav>{supplement && <div className="supplement-banner"><strong>需要补充资料</strong><p>审核人员已标注需要修改的项目。已通过的内容保持锁定，请按原因补充后重新提交。</p></div>}
    {step === 0 && <InformationStep model={model} answers={answers} errors={errors} onChange={updateAnswer} />}
    {step === 1 && <MaterialStep materials={model.materials} error={errors.materials} onChange={updateMaterials} />}
    {step === 2 && <><UploadStep requirements={model.requirements} files={files} lockedKeys={supplement ? model.requirements.filter((item) => !item.rejectionReason).map((item) => item.key) : []} onChange={setFiles} onUpload={onUpload} onRemove={onRemoveFile} />{errors.uploads && <div className="alert alert-error">{errors.uploads}</div>}{Object.entries(errors).filter(([key]) => model.requirements.some((item) => item.key === key)).map(([key, value]) => <div className="alert alert-error" key={key}>{value}</div>)}</>}
    {step === 3 && <section className="step-section"><div className="section-heading"><span className="eyebrow">第 4 步</span><h1>{supplement ? '确认补件并重新签署' : '签署确认'}</h1><p>请预览授权书并选择一种签署方式。提交后内容将进入审核，不能继续修改。</p></div><div className="legal-disclaimer"><strong>普通电子签署提示</strong><p>当前为普通电子签署，不等同于第三方可靠电子签名。</p><p>本次签署仅用于确认本业务资料与授权意愿；当前版本未接入第三方电子认证、可信时间戳或司法存证服务。</p></div>{errors.preview&&<div className="alert alert-error">{errors.preview}</div>}<PdfPreviewStep digest={preview?.sha256??'正在生成固定版本预览…'} previewUrl={preview?.previewUrl} model={model} signature={signature} slots={preview?.slots} /><SignaturePlacementEditor value={signature} onChange={setSignature} onUploadResource={onUploadSigningResource} />{errors.signature && <p className="field-error standalone">{errors.signature}</p>}<div className="final-summary"><h2>提交前确认</h2><dl><div><dt>委托方</dt><dd>{model.customerName}</dd></div><div><dt>生产物料</dt><dd>{model.materials.length} 项</dd></div><div><dt>已上传资料</dt><dd>{Object.values(files).flat().filter((file) => file.status === 'success').length} 个文件</dd></div><div><dt>签署方式</dt><dd>{signature.method === 'handwritten' ? '手写签名' : '上传印章'}</dd></div></dl><label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我确认所填信息及上传资料真实、合法、有效，并自愿授权受托方按照本业务单生产所列物料。</span></label>{errors.consent && <p className="field-error">{errors.consent}</p>}{errors.submit && <div className="alert alert-error">{errors.submit}</div>}</div></section>}
    <div className="wizard-actions">{step > 0 && <button type="button" className="secondary-button" onClick={() => setStep((current) => current - 1)}>上一步</button>}{step < 3 ? <button type="button" className="primary-button" onClick={next}>保存并继续</button> : <button type="button" className="primary-button" disabled={submitting} onClick={() => void submit()}>{submitting ? '正在安全提交…' : supplement ? '重新提交审核' : '确认并提交审核'}</button>}</div><p className="support-hint">遇到问题？请联系向您发送本链接的客服，或拨打业务单中的服务电话。</p></main>{conflict && <div className="modal-backdrop"><div className="modal"><span className="modal-icon">!</span><h2>草稿版本发生冲突</h2><p>检测到该链接可能在其他页面更新。您的本地内容仍已保留，我们不会自动覆盖。</p><button className="primary-button" onClick={() => window.location.reload()}>加载服务器最新版</button><button className="secondary-button" onClick={() => { if (onForceSave) void onForceSave(version, answers, step).then((result) => { setVersion(result.version); setConflict(false); setSaveStatus('saved'); }); else setConflict(false); }}>用本地内容创建新版本</button></div></div>}</div>;
}

function PublicHeader({ step, status, online }: { step: number; status: SaveStatus; online: boolean }) {
  const labels: Record<SaveStatus, string> = { saved: '草稿已保存', saving: '正在保存…', failed: '保存失败', offline: '离线，内容暂存本机' };
  return <header className="public-header"><div className="brand"><span className="brand-mark">委</span><div><strong>委托生产资料平台</strong><small>安全资料提交</small></div></div><ol aria-label="办理步骤">{steps.map((name, index) => <li key={name} className={index < step ? 'done' : index === step ? 'active' : ''}><i>{index < step ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol><div className={`save-state ${status}`}><i />{online ? labels[status] : labels.offline}</div></header>;
}

function IntroPage({ model, onStart }: { model: PublicCaseModel; onStart: () => void }) {
  return <div className="public-shell intro-page"><header className="simple-header"><div className="brand"><span className="brand-mark">委</span><div><strong>委托生产资料平台</strong><small>安全资料提交</small></div></div><span className="secure-badge">加密传输</span></header><main className="intro-main"><div className="intro-hero"><span className="eyebrow">客户资料填写邀请</span><h1>请确认并提交委托生产资料</h1><p>{model.customerName}，您好。请根据以下业务单核对物料、上传所需凭证并完成普通电子签署。</p></div><div className="case-glance"><div><span>业务单号</span><strong>{model.caseNo}</strong></div><div><span>受托方 / 生产单位</span><strong>{model.trusteeName}</strong></div><div><span>需确认物料</span><strong>{model.materials.length} 项</strong></div><div><span>链接有效期</span><strong>{model.deadline}</strong></div></div><div className="process-preview">{steps.map((name, index) => <div key={name}><i>{index + 1}</i><span><strong>{name}</strong><small>{['核对双方与授权信息', '确认生产明细', '上传必选与可选凭证', '预览授权书并签署'][index]}</small></span></div>)}</div><div className="consent-panel"><h2>开始前请知悉</h2><ul><li>请准备营业执照、授权书等本次要求的资料。</li><li>填写过程会自动保存，可在有效期内通过原链接继续。</li><li>敏感资料仅供本次业务审核使用，请勿转发本链接。</li></ul><label className="consent-check"><input type="checkbox" defaultChecked /><span>我已阅读并同意按照上述目的提交资料</span></label><button className="primary-button wide" onClick={onStart}>开始填写</button></div><p className="support-hint">预计用时 6–10 分钟 · 如有疑问请联系您的专属客服</p></main></div>;
}

export function CompletionPage({ caseNo }: { caseNo: string }) { return <div className="state-page"><div className="state-card success"><div className="success-check">✓</div><span className="eyebrow">提交成功</span><h1>资料已安全提交</h1><p>我们已收到您的资料并关闭本次填写入口。审核结果将由客服通过现有沟通方式通知您。</p><div className="receipt"><span>业务单号</span><strong>{caseNo}</strong><span>当前状态</span><strong className="green-text">待审核</strong></div><div className="next-info"><strong>接下来会发生什么？</strong><ol><li>审核人员逐项核对资料</li><li>如需补充，客服会发送补件说明</li><li>全部通过后生成最终授权文件</li></ol></div><p className="muted">您现在可以安全关闭此页面。</p></div></div>; }
