import { useEffect, useRef, useState } from 'react';
import type { RequirementItem } from '../case-wizard/model';
import { validateUpload } from '../case-wizard/model';

export interface UploadedFile {
  id: string;
  fileVersionId?: string;
  fileId?: string;
  version?: number;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string;
  source?: File;
}

interface Props {
  requirements: RequirementItem[] | string[];
  files?: Record<string, UploadedFile[]>;
  lockedKeys?: string[];
  onChange?: (files: Record<string, UploadedFile[]>) => void;
  onUpload?: (key: string, file: File, onProgress: (percent: number) => void) => Promise<{ fileId: string }>;
  onRemove?: (fileId: string) => Promise<unknown>;
}

const readableSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))}KB` : `${(size / 1024 / 1024).toFixed(1)}MB`;

export function UploadStep({ requirements, files: controlledFiles, lockedKeys = [], onChange, onUpload, onRemove }: Props) {
  const normalized: RequirementItem[] = requirements
    .map((item, index): RequirementItem => typeof item === 'string' ? { key: `legacy-${index}`, label: item, type: 'file', required: false } : item)
    .filter((item) => ['file', 'image'].includes(item.type));
  const [localFiles, setLocalFiles] = useState<Record<string, UploadedFile[]>>({});
  const [removeError, setRemoveError] = useState('');
  const files = controlledFiles ?? localFiles;
  const filesRef = useRef(files);
  const nextTemporaryId = useRef(0);
  useEffect(() => { filesRef.current = files; }, [files]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const updateFiles = (updater: (current: Record<string, UploadedFile[]>) => Record<string, UploadedFile[]>) => {
    const next = updater(filesRef.current);
    filesRef.current = next;
    if (!controlledFiles) setLocalFiles(next);
    onChange?.(next);
    return next;
  };
  const totalBytes = Object.values(files).flat().reduce((sum, file) => sum + file.size, 0);

  const beginUpload = async (requirement: RequirementItem, file: File) => {
    const current = filesRef.current[requirement.key] ?? [];
    const currentTotalBytes = Object.values(filesRef.current).flat().reduce((sum, item) => sum + item.size, 0);
    const validation = current.length >= 10 ? '每项资料最多上传 10 个文件' : validateUpload(file, currentTotalBytes);
    const temp: UploadedFile = { id: `local-${Date.now()}-${nextTemporaryId.current++}`, name: file.name, size: file.size, type: file.type, progress: 0, status: validation ? 'error' : 'uploading', error: validation, source: file, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined };
    updateFiles((latest) => ({ ...latest, [requirement.key]: [...(latest[requirement.key] ?? []), temp] }));
    if (validation) return;
    try {
      const result = onUpload ? await onUpload(requirement.key, file, (progress) => { updateFiles((latest) => ({ ...latest, [requirement.key]: (latest[requirement.key] ?? []).map((item) => item.id === temp.id ? { ...item, progress } : item) })); }) : { fileId: temp.id };
      updateFiles((latest) => ({ ...latest, [requirement.key]: (latest[requirement.key] ?? []).map((item) => item.id === temp.id ? { ...item, id: result.fileId, fileId: result.fileId, fileVersionId: result.fileId, progress: 100, status: 'success' } : item) }));
    } catch {
      updateFiles((latest) => ({ ...latest, [requirement.key]: (latest[requirement.key] ?? []).map((item) => item.id === temp.id ? { ...item, status: 'error', error: '上传中断，请检查网络后重试' } : item) }));
    }
  };

  const remove = async (key: string, id: string) => {
    const entries = filesRef.current[key] ?? [];
    const index = entries.findIndex((item) => item.id === id);
    const target = entries[index]; if (!target) return false;
    setRemoveError('');
    updateFiles((latest) => ({ ...latest, [key]: (latest[key] ?? []).filter((item) => item.id !== id) }));
    try {
      if (onRemove && target.fileId) await onRemove(target.fileId);
      if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return true;
    } catch {
      updateFiles((latest) => {
        if ((latest[key] ?? []).some((item) => item.id === target.id)) return latest;
        const restored = [...(latest[key] ?? [])]; restored.splice(Math.min(index, restored.length), 0, target);
        return { ...latest, [key]: restored };
      });
      setRemoveError('删除失败，文件已恢复，请检查网络后重试');
      return false;
    }
  };
  const retry = async (key: string, item: UploadedFile) => {
    if (!item.source) return;
    if (!await remove(key, item.id)) return;
    const requirement = normalized.find((candidate) => candidate.key === key);
    if (requirement) await beginUpload(requirement, item.source);
  };

  return <section className="step-section">
    {removeError && <div className="alert alert-error" role="alert">{removeError}</div>}
    <div className="section-heading"><span className="eyebrow">第 3 步</span><h1>资料上传</h1><p>支持 PDF、PNG、JPEG；单个文件不超过 20MB，每项最多 10 个，全部资料不超过 200MB。</p></div>
    <div className="privacy-note"><span>隐私保护</span> 身份证等敏感文件仅用于本次审核，系统将记录授权访问。</div>
    <div className="upload-list">{normalized.map((requirement) => {
      const entries = files[requirement.key] ?? []; const locked = lockedKeys.includes(requirement.key) || requirement.locked;
      return <article className={`upload-card ${locked ? 'is-locked' : ''}`} key={requirement.key}>
        <header><div><h2>{requirement.label}{requirement.required && <span className="required">必填</span>}</h2><p>{requirement.description}</p>{requirement.rejectionReason && <div className="rejection-reason"><strong>补件原因：</strong>{requirement.rejectionReason}</div>}</div><span className={`status-chip ${entries.some((item) => item.status === 'success') ? 'status-green' : ''}`}>{locked ? '审核已通过' : entries.length ? `已选择 ${entries.length} 个` : '待上传'}</span></header>
        {!locked && <button className="upload-dropzone" type="button" onClick={() => inputs.current[requirement.key]?.click()}><span className="upload-icon">↑</span><strong>点击选择文件</strong><small>也可拍照后从相册选择清晰原图</small></button>}
        <input ref={(node) => { inputs.current[requirement.key] = node; }} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple aria-label={`上传${requirement.label}`} onChange={(event) => { Array.from(event.target.files ?? []).forEach((file) => void beginUpload(requirement, file)); event.target.value = ''; }} />
        {entries.length > 0 && <div className="file-list">{entries.map((file) => <div className="file-row" key={file.id}>{file.previewUrl ? <img src={file.previewUrl} alt="文件预览" /> : <div className="file-type">PDF</div>}<div className="file-meta"><strong>{file.name}</strong><span>{readableSize(file.size)} · {file.status === 'uploading' ? `上传中 ${file.progress}%` : file.status === 'success' ? '上传成功' : file.error}</span>{file.status === 'uploading' && <progress value={file.progress} max={100} />}</div>{file.status === 'error' && <button className="text-button" type="button" onClick={() => void retry(requirement.key, file)}>重试</button>}{!locked && <button className="icon-button" type="button" aria-label={`移除${file.name}`} onClick={() => void remove(requirement.key, file.id)}>×</button>}</div>)}</div>}
      </article>;
    })}</div>
    <div className="upload-total"><span>本业务单文件用量</span><strong>{readableSize(totalBytes)} / 200MB</strong><progress value={totalBytes} max={200 * 1024 * 1024} /></div>
  </section>;
}
