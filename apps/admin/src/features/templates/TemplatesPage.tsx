import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../dashboard/DashboardPage';
import { loadTemplateTypes, saveTemplateType } from './templateTypes';

const templates = [
  { id: 'brand-v3', type: '授权书', name: '品牌物料生产授权书', desc: '品牌方委托指定工厂生产包装、标签等物料', version: 'v3', used: 126, status: '已发布', cover: ['委托生产', '授 权 书'] },
  { id: 'purchase-v1', type: '采购合同', name: '标准采购合同', desc: '适用于物料采购、交付、验收与付款条款确认', version: 'v1', used: 18, status: '已发布', cover: ['采购业务', '合 同'] },
  { id: 'nda-v1', type: '保密协议', name: '双向保密协议', desc: '适用于报价、打样、资料交接前的保密约定', version: 'v1', used: 9, status: '已发布', cover: ['资料保密', '协 议'] },
  { id: 'food-v1', type: '授权书', name: '食品包装专项授权书', desc: '食品包装、标签生产专项授权', version: 'v1', used: 0, status: '草稿', cover: ['食品包装', '授 权 书'] },
];

export function TemplatesPage() {
  const [types, setTypes] = useState(loadTemplateTypes);
  const [typeName, setTypeName] = useState('');
  const [selectedType, setSelectedType] = useState('全部类型');
  const [status, setStatus] = useState('全部状态');
  const [keyword, setKeyword] = useState('');
  const [toast, setToast] = useState('');
  const filtered = useMemo(() => templates.filter(t =>
    (selectedType === '全部类型' || t.type === selectedType) &&
    (status === '全部状态' || t.status === status) &&
    (!keyword.trim() || t.name.includes(keyword.trim()) || t.desc.includes(keyword.trim()))
  ), [keyword, selectedType, status]);
  const addType = () => {
    const next = saveTemplateType(typeName);
    setTypes(next);
    setSelectedType(typeName.trim() || selectedType);
    setTypeName('');
    setToast('模板类型已新增');
    window.setTimeout(() => setToast(''), 1600);
  };

  return <main className="page">
    <PageHeader eyebrow="配置中心" title="文档模板" description="按文档类型管理模板版本并使用可视化编辑器排版" actions={<Link className="button primary" to="/templates/new">＋ 创建模板</Link>} />
    {toast && <div className="toast">{toast}</div>}
    <section className="panel filter-panel">
      <div className="filters">
        <label className="search-field"><span>搜索模板</span><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="模板名称" /></label>
        <label><span>模板类型</span><select value={selectedType} onChange={e => setSelectedType(e.target.value)}><option>全部类型</option>{types.map(type => <option key={type}>{type}</option>)}</select></label>
        <label><span>状态</span><select value={status} onChange={e => setStatus(e.target.value)}><option>全部状态</option><option>草稿</option><option>已发布</option><option>已停用</option></select></label>
        <label className="template-type-create"><span>新增模板类型</span><div><input value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="例如：报价单" /><button type="button" onClick={addType}>新增</button></div></label>
      </div>
    </section>
    <div className="template-grid">{filtered.map(t => <article className="template-card" key={t.id}><div className="template-cover"><div><strong>{t.cover[0]}</strong><span>{t.cover[1]}</span><small>模板预览</small></div><span className={t.status === '草稿' ? 'draft' : ''}>{t.status}</span></div><div className="template-card-body"><div><h2>{t.name}</h2><span className="version-tag">{t.version}</span><span className="type-tag">{t.type}</span></div><p>{t.desc}</p><dl><div><dt>引用业务单</dt><dd>{t.used}</dd></div><div><dt>最近更新</dt><dd>2026-08-04</dd></div></dl><div className="card-actions"><Link className="button primary" to={`/templates/${t.id}/editor`}>打开编辑器</Link><button className="button secondary">复制</button><button className="more-button">•••</button></div></div></article>)}</div>
  </main>;
}
