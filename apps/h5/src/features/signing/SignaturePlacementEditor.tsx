import { useEffect, useRef, useState } from 'react';
import type { PublicSignatureSlot, SigningResourcePurpose as SharedSigningResourcePurpose } from '@auth/contracts';

export type SigningMethod = 'handwritten' | 'seal';
export type SigningResourcePurpose = SharedSigningResourcePurpose;
export interface SigningResourceRef { fileId: string; fileVersionId: string; version: number }
export type SignatureSlot = PublicSignatureSlot;
export interface SignaturePosition { slotId: string; page: number; x: number; y: number; width: number; height: number }
export interface SignaturePlacement {
  method: SigningMethod;
  resource?: string;
  x: number;
  y: number;
  scale: number;
  confirmed?: boolean;
  resourceFileId?: string;
  resourceFileVersionId?: string;
  resourceVersion?: number;
  originalFileVersionId?: string;
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;
export function mapPlacementToSlots(placement: SignaturePlacement, slots: SignatureSlot[]): SignaturePosition[] {
  const ratio = Math.min(0.96, Math.max(0.3, placement.scale * 0.6));
  const horizontal = Math.min(100, Math.max(0, placement.x)) / 100;
  const vertical = Math.min(100, Math.max(0, placement.y)) / 100;
  return slots.filter((slot) => slot.required).map((slot) => {
    const width = slot.width * ratio; const height = slot.height * ratio;
    return { slotId: slot.slotId, page: slot.page, x: rounded(slot.x + (slot.width - width) * horizontal), y: rounded(slot.y + (slot.height - height) * vertical), width: rounded(width), height: rounded(height) };
  });
}

function HandwritingCanvas({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = rect.width * ratio; canvas.height = 180 * ratio; const context = canvas.getContext('2d'); context?.scale(ratio, ratio); if (context) { context.strokeStyle = '#12233f'; context.lineWidth = 2.4; context.lineCap = 'round'; context.lineJoin = 'round'; } }, []);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  return <div><canvas ref={canvasRef} className="signature-canvas" aria-label="手写签名区域" onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const current = point(event); event.currentTarget.getContext('2d')?.beginPath(); event.currentTarget.getContext('2d')?.moveTo(current.x, current.y); }} onPointerMove={(event) => { if (!drawing.current) return; const current = point(event); const context = event.currentTarget.getContext('2d'); context?.lineTo(current.x, current.y); context?.stroke(); }} onPointerUp={(event) => { drawing.current = false; onChange(event.currentTarget.toDataURL('image/png')); }} /><button type="button" className="secondary-button" onClick={() => { const canvas = canvasRef.current; canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); }}>清空重签</button></div>;
}

async function defaultCutout(source: string): Promise<string> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { try { const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const context = canvas.getContext('2d'); if (!context) throw new Error('canvas'); context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, canvas.width, canvas.height); for (let index = 0; index < pixels.data.length; index += 4) { const [r, g, b] = [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]]; if (r > 235 && g > 235 && b > 235) pixels.data[index + 3] = 0; } context.putImageData(pixels, 0, 0); resolve(canvas.toDataURL('image/png')); } catch (error) { reject(error); } }; image.onerror = reject; image.src = source; }); }

function dataUrlFile(value: string, name: string): File {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('invalid image');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: match[1] });
}

interface Props {
  value?: SignaturePlacement;
  onChange?: (value: SignaturePlacement) => void;
  cutoutSeal?: (source: string) => Promise<string>;
  onUploadResource?: (file: File, purpose: SigningResourcePurpose, originalFileVersionId?: string) => Promise<SigningResourceRef>;
}

export function SignaturePlacementEditor({ value, onChange = () => undefined, cutoutSeal = defaultCutout, onUploadResource }: Props = {}) {
  const [placement, setPlacement] = useState<SignaturePlacement>(value ?? { method: 'handwritten', x: 62, y: 72, scale: 1 });
  const [original, setOriginal] = useState(''); const [processed, setProcessed] = useState('');
  const [originalRef, setOriginalRef] = useState<SigningResourceRef>(); const [cutoutFailed, setCutoutFailed] = useState(false); const [busy, setBusy] = useState(false);
  const sealGeneration = useRef(0);
  const update = (patch: Partial<SignaturePlacement>) => { const next = { ...placement, ...patch }; setPlacement(next); onChange(next); };
  const process = async (source: string, generation = sealGeneration.current) => {
    if (generation !== sealGeneration.current) return;
    setCutoutFailed(false); setProcessed('');
    try {
      const result = await cutoutSeal(source);
      if (generation === sealGeneration.current) setProcessed(result);
    } catch {
      if (generation === sealGeneration.current) setCutoutFailed(true);
    }
  };
  const uploadSeal = (file?: File) => {
    if (!file || !['image/png', 'image/jpeg'].includes(file.type)) return;
    const generation = ++sealGeneration.current;
    setOriginalRef(undefined);
    setOriginal('');
    setProcessed('');
    setCutoutFailed(false);
    update({ resource: undefined, confirmed: false, resourceFileId: undefined, resourceFileVersionId: undefined, resourceVersion: undefined, originalFileVersionId: undefined });
    const reader = new FileReader(); reader.onload = () => { const source = String(reader.result); if (generation !== sealGeneration.current) return; setOriginal(source); setBusy(true); const upload = onUploadResource ? onUploadResource(file, 'SEAL_ORIGINAL') : Promise.resolve({ fileId: 'local-original', fileVersionId: 'local-original', version: 1 }); void upload.then((reference) => { if (generation !== sealGeneration.current) return; setOriginalRef(reference); update({ originalFileVersionId: reference.fileVersionId }); return process(source, generation); }).catch(() => { if (generation === sealGeneration.current) setCutoutFailed(true); }).finally(() => { if (generation === sealGeneration.current) setBusy(false); }); }; reader.readAsDataURL(file);
  };
  const confirmProcessed = async () => { if (!processed || !originalRef) return; setBusy(true); try { const reference = onUploadResource ? await onUploadResource(dataUrlFile(processed, '印章抠图.png'), 'SEAL_PROCESSED', originalRef.fileVersionId) : { fileId: 'local-processed', fileVersionId: 'local-processed', version: 1 }; update({ resource: processed, confirmed: true, resourceFileId: reference.fileId, resourceFileVersionId: reference.fileVersionId, resourceVersion: reference.version, originalFileVersionId: originalRef.fileVersionId }); } finally { setBusy(false); } };
  const confirmOriginal = () => { if (!originalRef) return; update({ resource: original, confirmed: true, resourceFileId: originalRef.fileId, resourceFileVersionId: originalRef.fileVersionId, resourceVersion: originalRef.version, originalFileVersionId: originalRef.fileVersionId }); };
  const switchMode = (method: SigningMethod) => { sealGeneration.current += 1; setOriginal(''); setProcessed(''); setOriginalRef(undefined); setCutoutFailed(false); update({ method, resource: undefined, confirmed: false, resourceFileId: undefined, resourceFileVersionId: undefined, resourceVersion: undefined, originalFileVersionId: undefined }); };

  return <div className="signing-editor">
    <div className="signing-methods" role="radiogroup" aria-label="签署方式"><button type="button" className={placement.method === 'handwritten' ? 'method-card active' : 'method-card'} onClick={() => switchMode('handwritten')}><span className="method-icon">签</span><strong>手写签名</strong><small>在屏幕上直接书写</small></button><button type="button" className={placement.method === 'seal' ? 'method-card active' : 'method-card'} onClick={() => switchMode('seal')}><span className="method-icon seal">章</span><strong>上传印章</strong><small>支持 PNG 或 JPEG</small></button></div>
    <input className="sr-only" aria-label="签署方式" readOnly value={placement.method === 'handwritten' ? 'Handwritten' : 'Stamp'} />
    {placement.method === 'handwritten' ? <div className="signature-panel"><h3>请在框内签名</h3><p>建议横向书写完整姓名，签名将覆盖到授权书指定位置。</p><HandwritingCanvas onChange={(resource) => update({ resource, confirmed: Boolean(resource) })} /></div> : <div className="signature-panel"><h3>上传印章图片</h3><p>原图会先安全保存；抠图结果只有经您明确确认后才会作为签署资源。</p><label className="seal-uploader"><input aria-label="选择印章图片" type="file" accept="image/png,image/jpeg" onChange={(event) => uploadSeal(event.target.files?.[0])} /><span>选择印章图片</span><small>建议使用白底、光线均匀的正面照片</small></label>{original && <div className="cutout-result"><img src={original} alt="印章原图预览" />{processed && <img src={processed} alt="印章透明背景预览" />}<div>{busy ? <strong>正在安全保存并处理…</strong> : cutoutFailed ? <><strong>自动抠图失败，已保留原图</strong><button type="button" className="text-button" onClick={() => void process(original)}>重试抠图</button><button type="button" className="text-button" disabled={!originalRef} onClick={confirmOriginal}>确认使用原图</button><button type="button" className="text-button" onClick={() => switchMode('handwritten')}>改用手写签名</button></> : processed ? <><strong>请确认抠图结果</strong><button type="button" className="primary-button" disabled={busy || !originalRef} onClick={() => void confirmProcessed()}>确认使用抠图结果</button></> : null}</div></div>}</div>}
    <div className="placement-controls"><h3>调整签章位置</h3><p>位置与大小会实时显示在授权书的全部必填甲方签署位内。</p><label>水平位置 <output>{placement.x}%</output><input aria-label="水平位置" type="range" min={0} max={100} value={placement.x} onChange={(event) => update({ x: Number(event.target.value) })} /></label><label>垂直位置 <output>{placement.y}%</output><input aria-label="垂直位置" type="range" min={0} max={100} value={placement.y} onChange={(event) => update({ y: Number(event.target.value) })} /></label><label>显示大小 <output>{Math.round(placement.scale * 100)}%</output><input aria-label="显示大小" type="range" min={50} max={160} value={placement.scale * 100} onChange={(event) => update({ scale: Number(event.target.value) / 100 })} /></label></div>
  </div>;
}
