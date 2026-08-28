import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { requirementCatalog } from '../../api/demoData';
import { PageHeader } from '../dashboard/DashboardPage';

export interface CaseCommandClient {
  createCase(input: {
    customerName: string;
    contactName: string;
    factoryDepartment: string;
    materials: Array<{ name: string; specification: string; quantity: number; material: string; craft: string }>;
    templateVersionId: string;
    requirements?: string[];
    linkExpiresInDays?: number;
    quoteReference?: string;
  }): Promise<{ id: string }>;
}

type CaseType = 'authorization' | 'purchase';
type MaterialDraft = { name: string; specification: string; quantity: string; material: string; craft: string };
const blankMaterial = (): MaterialDraft => ({ name: '', specification: '', quantity: '1', material: '', craft: '' });
const caseTypes: Array<{ key: CaseType; label: string; desc: string }> = [
  { key: 'authorization', label: '授权书业务单', desc: '委托生产资料、物料明细、授权书签署' },
  { key: 'purchase', label: '采购合同业务单', desc: '采购方、供应方、交付与付款条款' },
];

export function CaseCreatePage({ client }: { client?: CaseCommandClient }) {
  const [caseType, setCaseType] = useState<CaseType>('authorization');
  const [customerName, setCustomerName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [factoryDepartment, setFactoryDepartment] = useState('华东印刷一厂');
  const [templateVersionId, setTemplateVersionId] = useState('brand-standard-v3');
  const [requirements, setRequirements] = useState<string[]>(['authorization_letter', 'business_license', 'trademark_certificate']);
  const [materials, setMaterials] = useState<MaterialDraft[]>([blankMaterial()]);
  const [quote, setQuote] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [created, setCreated] = useState<string>();
  const [expires, setExpires] = useState(7);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentTerm, setPaymentTerm] = useState('月结 30 天');
  const [contractAmount, setContractAmount] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('quoteNo');
    if (ref) setQuote(ref);
    const raw = localStorage.getItem('authorization_quote_draft');
    if (raw) {
      setQuote(raw);
      localStorage.removeItem('authorization_quote_draft');
    }
  }, []);

  const submit = async () => {
    if (!customerName.trim()) return;
    const result = await client?.createCase({
      customerName,
      contactName,
      factoryDepartment,
      templateVersionId,
      requirements,
      linkExpiresInDays: expires,
      quoteReference: quote,
      materials: materials.map(m => ({ ...m, quantity: Number(m.quantity) || 1 })),
    });
    if (result) setCreated(result.id);
  };
  const updateMaterial = (i: number, key: keyof MaterialDraft, value: string) => setMaterials(list => list.map((m, index) => index === i ? { ...m, [key]: value } : m));
  const selectCaseType = (next: CaseType) => {
    setCaseType(next);
    setTemplateVersionId(next === 'authorization' ? 'brand-standard-v3' : 'purchase-standard-v1');
    setRequirements(next === 'authorization' ? ['authorization_letter', 'business_license', 'trademark_certificate'] : ['business_license', 'purchase_order']);
  };
  const templateName = templateVersionId === 'purchase-standard-v1' ? '标准采购合同 v1' : templateVersionId === 'general-v2' ? '通用委托生产授权书 v2' : '品牌物料生产授权书 v3';
  const requiredLabel = caseType === 'authorization' ? '含必选授权书' : '含采购凭证';

  if (created) return <main className="page"><div className="success-card"><span>✓</span><h1>业务单创建成功</h1><p>业务单编号：<strong>{created}</strong></p><div className="public-link"><code>https://forms.example.com/f/8Vt7Jx2QpL…</code><button onClick={() => navigator.clipboard?.writeText('https://forms.example.com/f/8Vt7Jx2QpL')}>复制客户链接</button></div><p className="hint">请通过现有沟通渠道将链接发送给客户。链接将在 {expires} 天后过期。</p><Link className="button primary" to={`/cases/${created}`}>查看业务单详情</Link><Link className="button secondary" to="/cases/new">继续创建</Link></div></main>;

  return <main className="page"><PageHeader eyebrow="业务单管理" title="新建业务单" description="选择业务类型后填写对应信息，生成客户填写链接" />
    <div className="case-type-tabs" role="tablist" aria-label="业务单类型">{caseTypes.map(type => <button key={type.key} role="tab" aria-selected={caseType === type.key} className={caseType === type.key ? 'active' : ''} onClick={() => selectCaseType(type.key)}><strong>{type.label}</strong><small>{type.desc}</small></button>)}</div>
    <section className="panel form-panel case-create-panel">
      {caseType === 'authorization' ? <AuthorizationForm customerName={customerName} setCustomerName={setCustomerName} contactName={contactName} setContactName={setContactName} phone={phone} setPhone={setPhone} factoryDepartment={factoryDepartment} setFactoryDepartment={setFactoryDepartment} importOpen={importOpen} setImportOpen={setImportOpen} quote={quote} setQuote={setQuote} materials={materials} setMaterials={setMaterials} updateMaterial={updateMaterial} templateVersionId={templateVersionId} setTemplateVersionId={setTemplateVersionId} requirements={requirements} setRequirements={setRequirements} expires={expires} setExpires={setExpires} /> : <PurchaseContractForm customerName={customerName} setCustomerName={setCustomerName} contactName={contactName} setContactName={setContactName} phone={phone} setPhone={setPhone} factoryDepartment={factoryDepartment} setFactoryDepartment={setFactoryDepartment} quote={quote} setQuote={setQuote} materials={materials} setMaterials={setMaterials} updateMaterial={updateMaterial} deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate} paymentTerm={paymentTerm} setPaymentTerm={setPaymentTerm} contractAmount={contractAmount} setContractAmount={setContractAmount} expires={expires} setExpires={setExpires} />}
      <div className="summary-grid spaced"><Summary title="业务类型" rows={[['类型', caseType === 'authorization' ? '授权书业务单' : '采购合同业务单'], ['模板', templateName]]} /><Summary title="相对方" rows={[['企业名称', customerName || '未填写'], ['联系人', contactName || '未填写']]} /><Summary title="创建信息" rows={[['物料数量', `${materials.length} 项`], ['所需资料', `${requirements.length} 项（${requiredLabel}）`]]} /></div>
      <div className="form-actions"><button className="button ghost">保存草稿</button><span /><button className="button primary" onClick={() => void submit()}>确认创建并生成链接</button></div>
    </section>
  </main>;
}

function AuthorizationForm(props: {
  customerName: string; setCustomerName(value: string): void; contactName: string; setContactName(value: string): void; phone: string; setPhone(value: string): void; factoryDepartment: string; setFactoryDepartment(value: string): void; importOpen: boolean; setImportOpen(value: boolean): void; quote: string; setQuote(value: string): void; materials: MaterialDraft[]; setMaterials(value: MaterialDraft[]): void; updateMaterial(i: number, key: keyof MaterialDraft, value: string): void; templateVersionId: string; setTemplateVersionId(value: string): void; requirements: string[]; setRequirements(value: string[]): void; expires: number; setExpires(value: number): void;
}) {
  return <><h2>授权书业务单创建</h2><p className="section-desc">按原授权书业务流程填写委托方、物料、模板和客户资料要求</p><PartyFields {...props} counterpartyLabel="委托方名称" counterpartyPlaceholder="请输入营业执照上的企业全称" departmentLabel="受托工厂 / 部门" /><div className="subsection"><div><h3>从报价单引入</h3><p>支持人工复制、网址参数或同源暂存数据</p></div><button className="button secondary" onClick={() => props.setImportOpen(!props.importOpen)}>导入报价信息</button></div>{props.importOpen && <div className="import-box"><label><span>报价单编号或粘贴内容</span><textarea value={props.quote} onChange={e => props.setQuote(e.target.value)} placeholder="例如：BJ20260804018，或粘贴报价单的物料表格文本" /></label><div className="notice info">仅导入非敏感业务摘要，完整客户资料与价格不会通过网址传递。</div><button onClick={() => props.setImportOpen(false)}>确认导入</button></div>}<MaterialEditor materials={props.materials} setMaterials={props.setMaterials} updateMaterial={props.updateMaterial} title="物料明细" description="可添加多种需要委托生产的物料" /><h2 className="spaced">授权书模板</h2><div className="template-options"><label className={props.templateVersionId === 'brand-standard-v3' ? 'selected' : ''}><input type="radio" name="template" checked={props.templateVersionId === 'brand-standard-v3'} onChange={() => props.setTemplateVersionId('brand-standard-v3')} /><span className="template-thumb">授权<br />委托书</span><div><strong>品牌物料生产授权书</strong><p>适用于品牌方委托指定工厂生产包装、标签等物料</p><small>已发布 · v3</small></div></label><label className={props.templateVersionId === 'general-v2' ? 'selected' : ''}><input type="radio" name="template" checked={props.templateVersionId === 'general-v2'} onChange={() => props.setTemplateVersionId('general-v2')} /><span className="template-thumb">通用<br />授权书</span><div><strong>通用委托生产授权书</strong><p>适用于常规物料的生产委托</p><small>已发布 · v2</small></div></label></div><h2 className="spaced">客户所需提交资料</h2><p className="section-desc">授权书为系统必选，其他凭证可按业务需要选择</p><RequirementSelect requirements={props.requirements} setRequirements={props.setRequirements} /><ExpirySelect expires={props.expires} setExpires={props.setExpires} /></>;
}

function PurchaseContractForm(props: {
  customerName: string; setCustomerName(value: string): void; contactName: string; setContactName(value: string): void; phone: string; setPhone(value: string): void; factoryDepartment: string; setFactoryDepartment(value: string): void; quote: string; setQuote(value: string): void; materials: MaterialDraft[]; setMaterials(value: MaterialDraft[]): void; updateMaterial(i: number, key: keyof MaterialDraft, value: string): void; deliveryDate: string; setDeliveryDate(value: string): void; paymentTerm: string; setPaymentTerm(value: string): void; contractAmount: string; setContractAmount(value: string): void; expires: number; setExpires(value: number): void;
}) {
  return <><h2>采购合同业务单创建</h2><p className="section-desc">填写采购双方、标的明细、交付与付款信息，生成采购合同客户确认链接</p><PartyFields {...props} counterpartyLabel="采购方名称" counterpartyPlaceholder="请输入采购方企业全称" departmentLabel="供应方 / 承办部门" /><div className="form-grid spaced"><label><span>合同金额</span><input value={props.contractAmount} onChange={e => props.setContractAmount(e.target.value)} placeholder="例如：¥128,000.00" /></label><label><span>交付日期</span><input type="date" value={props.deliveryDate} onChange={e => props.setDeliveryDate(e.target.value)} /></label><label><span>付款条款</span><select value={props.paymentTerm} onChange={e => props.setPaymentTerm(e.target.value)}><option>月结 30 天</option><option>预付 30%，尾款发货前结清</option><option>验收后 15 天内付款</option></select></label><label><span>采购单引用</span><input value={props.quote} onChange={e => props.setQuote(e.target.value)} placeholder="采购单编号或报价单编号" /></label></div><MaterialEditor materials={props.materials} setMaterials={props.setMaterials} updateMaterial={props.updateMaterial} title="采购标的" description="录入合同内约定的物料、规格、数量、材质和工艺" /><h2 className="spaced">采购合同模板</h2><div className="template-options"><label className="selected"><input type="radio" name="purchase-template" checked readOnly /><span className="template-thumb">采购<br />合同</span><div><strong>标准采购合同</strong><p>适用于常规采购、交付、验收与付款条款</p><small>已发布 · v1</small></div></label></div><h2 className="spaced">客户所需提交资料</h2><div className="requirement-select"><label className="checked"><input type="checkbox" checked readOnly /><span><strong>营业执照</strong><small>FILE · PDF/PNG/JPEG</small></span><em>必选</em></label><label className="checked"><input type="checkbox" checked readOnly /><span><strong>采购订单</strong><small>FILE · PDF/PNG/JPEG</small></span><em>必选</em></label><label><input type="checkbox" /><span><strong>付款凭证</strong><small>FILE · PDF/PNG/JPEG</small></span></label></div><ExpirySelect expires={props.expires} setExpires={props.setExpires} /></>;
}

function PartyFields(props: { customerName: string; setCustomerName(value: string): void; contactName: string; setContactName(value: string): void; phone: string; setPhone(value: string): void; factoryDepartment: string; setFactoryDepartment(value: string): void; counterpartyLabel: string; counterpartyPlaceholder: string; departmentLabel: string }) {
  return <div className="form-grid"><label><span>{props.counterpartyLabel} <b>*</b></span><input value={props.customerName} onChange={e => props.setCustomerName(e.target.value)} placeholder={props.counterpartyPlaceholder} /></label><label><span>联系人 <b>*</b></span><input value={props.contactName} onChange={e => props.setContactName(e.target.value)} placeholder="请输入客户联系人" /></label><label><span>联系电话</span><input value={props.phone} onChange={e => props.setPhone(e.target.value)} placeholder="用于业务联系" /></label><label><span>{props.departmentLabel} <b>*</b></span><select value={props.factoryDepartment} onChange={e => props.setFactoryDepartment(e.target.value)}><option>华东印刷一厂</option><option>包装材料二厂</option><option>食品标签车间</option></select></label></div>;
}

function MaterialEditor({ materials, setMaterials, updateMaterial, title, description }: { materials: MaterialDraft[]; setMaterials(value: MaterialDraft[]): void; updateMaterial(i: number, key: keyof MaterialDraft, value: string): void; title: string; description: string }) {
  return <div className="subsection material-section"><div><h3>{title}</h3><p>{description}</p></div><button className="button secondary" onClick={() => setMaterials([...materials, blankMaterial()])}>＋ 添加物料</button><div className="material-table"><div className="material-row head"><span>物料名称</span><span>规格</span><span>数量</span><span>材质</span><span>工艺</span><span>操作</span></div>{materials.map((m, i) => <div className="material-row" key={i}><input aria-label={`物料 ${i + 1} 名称`} value={m.name} onChange={e => updateMaterial(i, 'name', e.target.value)} placeholder="如：乳白PVC不干胶" /><input value={m.specification} onChange={e => updateMaterial(i, 'specification', e.target.value)} placeholder="如：10×10cm" /><input type="number" value={m.quantity} onChange={e => updateMaterial(i, 'quantity', e.target.value)} /><input value={m.material} onChange={e => updateMaterial(i, 'material', e.target.value)} placeholder="材质" /><input value={m.craft} onChange={e => updateMaterial(i, 'craft', e.target.value)} placeholder="印刷、覆膜等" /><button className="text-danger" disabled={materials.length === 1} onClick={() => setMaterials(materials.filter((_, x) => x !== i))}>删除</button></div>)}</div></div>;
}

function RequirementSelect({ requirements, setRequirements }: { requirements: string[]; setRequirements(value: string[]): void }) {
  return <div className="requirement-select">{requirementCatalog.slice(0, 6).map(r => <label key={r.key} className={requirements.includes(r.key) ? 'checked' : ''}><input type="checkbox" checked={requirements.includes(r.key)} disabled={r.required} onChange={e => setRequirements(e.target.checked ? [...requirements, r.key] : requirements.filter(x => x !== r.key))} /><span><strong>{r.name}</strong><small>{r.type} · PDF/PNG/JPEG</small></span>{r.required && <em>必选</em>}</label>)}</div>;
}

function ExpirySelect({ expires, setExpires }: { expires: number; setExpires(value: number): void }) {
  return <><label className="expiry"><span>客户链接有效期</span><select value={expires} onChange={e => setExpires(Number(e.target.value))}><option value={3}>3 天</option><option value={7}>7 天</option><option value={14}>14 天</option><option value={30}>30 天</option></select><small>完成后链接将自动关闭访问，也可在业务单详情中续期或停用。</small></label><div className="notice warning">创建后将生成随机、不可猜测且可过期的客户链接。客户仅凭链接进入，请通过可信渠道发送。</div></>;
}

function Summary({ title, rows }: { title: string; rows: string[][] }) {
  return <div className="summary-card"><h3>{title}</h3>{rows.map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>;
}
