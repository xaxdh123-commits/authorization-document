import type { DraftAnswers, FieldErrors, PublicCaseModel, RequirementItem } from './model';

interface Props { model?: PublicCaseModel; answers?: DraftAnswers; errors?: FieldErrors; onChange?: (key: string, value: string | string[]) => void }

function RequirementField({ item, value, error, onChange }: { item: RequirementItem; value: DraftAnswers[string]; error?: string; onChange: (value: string | string[]) => void }) {
  const id = `field-${item.key}`;
  const common = { id, 'aria-invalid': Boolean(error), 'aria-describedby': `${id}-help ${id}-error` } as const;
  let input;
  if (item.type === 'longText') input = <textarea {...common} disabled={item.locked} rows={4} value={String(value ?? '')} placeholder={item.example} onChange={(event) => onChange(event.target.value)} />;
  else if (item.type === 'single') input = <div className="choice-grid">{item.options?.map((option) => <label className="choice" key={option.value}><input type="radio" disabled={item.locked} name={item.key} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div>;
  else if (item.type === 'multi') {
    const selected = Array.isArray(value) ? value : [];
    input = <div className="choice-grid">{item.options?.map((option) => <label className="choice" key={option.value}><input type="checkbox" disabled={item.locked} checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((current) => current !== option.value))} /><span>{option.label}</span></label>)}</div>;
  } else input = <input {...common} disabled={item.locked} type={item.type === 'date' ? 'date' : item.type === 'number' ? 'number' : 'text'} min={item.type === 'number' ? 1 : undefined} value={String(value ?? '')} placeholder={item.example} onChange={(event) => onChange(event.target.value)} />;
  return <div className="form-field"><label className="field-label" htmlFor={['single', 'multi'].includes(item.type) ? undefined : id}>{item.label}{item.required && <span className="required">必填</span>}{item.locked && <span className="status-chip status-green">审核已通过</span>}</label>{item.description && <p className="field-help" id={`${id}-help`}>{item.description}</p>}{input}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}

export function InformationStep({ model, answers = {}, errors = {}, onChange = () => undefined }: Props) {
  const dynamic = model?.requirements.filter((item) => !['file', 'image'].includes(item.type)) ?? [];
  return <section className="step-section"><div className="section-heading"><span className="eyebrow">第 1 步</span><h1>基本信息</h1><p>请核对委托方信息，并补充本次授权所需内容。</p></div>
    {model && <div className="party-summary"><div><span>委托方</span><strong>{model.customerName}</strong></div><div><span>受托方</span><strong>{model.trusteeName}</strong></div><div><span>业务单号</span><strong>{model.caseNo}</strong></div></div>}
    <div className="form-grid"><div className="form-field"><label className="field-label" htmlFor="contactName">联系人姓名<span className="required">必填</span></label><input id="contactName" value={String(answers.contactName ?? '')} aria-invalid={Boolean(errors.contactName)} onChange={(event) => onChange('contactName', event.target.value)} />{errors.contactName && <p className="field-error">{errors.contactName}</p>}</div><div className="form-field"><label className="field-label" htmlFor="contactPhone">手机号码<span className="required">必填</span></label><input id="contactPhone" inputMode="tel" maxLength={11} value={String(answers.contactPhone ?? '')} aria-invalid={Boolean(errors.contactPhone)} onChange={(event) => onChange('contactPhone', event.target.value.replace(/\D/g, ''))} />{errors.contactPhone && <p className="field-error">{errors.contactPhone}</p>}</div></div>
    <div className="divider"><span>授权资料</span></div>{dynamic.map((item) => <RequirementField key={item.key} item={item} value={answers[item.key] ?? item.defaultValue} error={errors[item.key]} onChange={(value) => onChange(item.key, value)} />)}
  </section>;
}
