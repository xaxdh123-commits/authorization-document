import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadTemplateTypes, saveTemplateType } from './templateTypes';

type Align = 'left' | 'center' | 'right' | 'justify';
type Block = {
  id: number;
  type: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  textAlign: Align;
  color: string;
  bold?: boolean;
  signatureKind?: string;
  children?: Block[];
  layoutItems?: string[];
  layoutMode?: string;
};

const page = { width: 680, height: 960 };
const palette = ['标题', '正文', '固定文本', '图片', '表格', '物料循环表格', '动态变量', '签名/印章位置'];
const icons = ['T', '¶', '文', '▧', '▦', '表', '{ }', '✎'];
const fontOptions = ['思源宋体', '微软雅黑', '宋体', 'Arial'];
const alignOptions: Array<[Align, string]> = [['left', '左'], ['center', '中'], ['right', '右'], ['justify', '两端']];
const variables = [
  { key: 'customer.name', label: '甲方名称' },
  { key: 'customer.contact', label: '甲方联系人' },
  { key: 'factory.name', label: '乙方名称' },
  { key: 'factory.contact', label: '乙方联系人' },
  { key: 'case.id', label: '业务单编号' },
  { key: 'case.validUntil', label: '有效期' },
  { key: 'materials[]', label: '物料明细' },
  { key: 'purchase.amount', label: '采购金额' },
  { key: 'purchase.deliveryDate', label: '交付日期' },
];
const variableLabels = new Map(variables.map(item => [item.key, item.label]));
const signatureKinds = [
  { key: 'partyASeal', label: '甲方印章', token: '{{sign.partyA.seal}}' },
  { key: 'partyBSeal', label: '乙方印章', token: '{{sign.partyB.seal}}' },
  { key: 'partyASignature', label: '甲方签名', token: '{{sign.partyA.signature}}' },
  { key: 'partyBSignature', label: '乙方签名', token: '{{sign.partyB.signature}}' },
];

const defaults: Block[] = [
  createBlock('标题', { id: 1, text: '委托生产授权书', x: 140, y: 72, width: 400, height: 54, fontSize: 23, textAlign: 'center', bold: true }),
  createBlock('正文', { id: 2, text: '兹授权 {{factory.name}} 按照我方确认的资料，生产以下品牌物料。', x: 70, y: 150, width: 540, height: 72 }),
  createBlock('物料循环表格', { id: 3, x: 70, y: 245, width: 540, height: 86 }),
  createBlock('正文', { id: 4, text: '甲方：{{customer.name}}\n联系人：{{customer.contact}}', x: 70, y: 365, width: 250, height: 76 }),
  createBlock('正文', { id: 5, text: '乙方：{{factory.name}}\n有效期：{{case.validUntil}}', x: 360, y: 365, width: 250, height: 76 }),
  createBlock('固定文本', { id: 6, text: '本授权书自签署之日起生效，有效期至 {{case.validUntil}}。', x: 70, y: 480, width: 540, height: 64 }),
  createBlock('签名/印章位置', { id: 7, text: '{{sign.partyA.seal}}', signatureKind: 'partyASeal', x: 430, y: 620, width: 160, height: 100, textAlign: 'center' }),
];

export function TemplateEditorPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const storageKey = `template-editor:${id}`;
  const [blocks, setBlocks] = useState<Block[]>(() => {
    try {
      return normalizeBlocks(JSON.parse(localStorage.getItem(storageKey) ?? '') as Block[]);
    } catch {
      return defaults;
    }
  });
  const [selected, setSelected] = useState(blocks[0]?.id);
  const [saved, setSaved] = useState(false);
  const [templateTypes, setTemplateTypes] = useState(loadTemplateTypes);
  const [templateType, setTemplateType] = useState('授权书');
  const [newType, setNewType] = useState('');
  const current = blocks.find(b => b.id === selected);
  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(blocks));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const updateBlock = (id: number, patch: Partial<Block>) => setBlocks(list => list.map(block => block.id === id ? { ...block, ...patch } : block));
  const removeBlock = (id: number) => {
    const next = blocks.filter(block => block.id !== id);
    setBlocks(next);
    setSelected(next[0]?.id);
  };
  const add = (type: string) => {
    const maxZ = Math.max(0, ...blocks.map(block => block.zIndex));
    const next = createBlock(type, { id: Date.now(), x: 90 + blocks.length * 12, y: 110 + blocks.length * 18, zIndex: maxZ + 1 });
    setBlocks([...blocks, next]);
    setSelected(next.id);
  };
  const addTemplateType = () => {
    const name = newType.trim();
    if (!name) return;
    const next = saveTemplateType(name);
    setTemplateTypes(next);
    setTemplateType(name);
    setNewType('');
  };

  return <div className="editor-page">
    <header className="editor-header">
      <button className="icon-button" onClick={() => navigate('/templates')}>←</button>
      <div><input aria-label="模板名称" defaultValue={id === 'new' ? '未命名文档模板' : '品牌物料生产授权书'} /><small>草稿 · 自动保存已开启</small></div>
      <label className="editor-type"><span>类型</span><select aria-label="模板类型" value={templateType} onChange={e => setTemplateType(e.target.value)}>{templateTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="editor-type editor-type-create"><span>新增类型</span><input aria-label="新增模板类型" value={newType} onChange={e => setNewType(e.target.value)} placeholder="类型名" /><button type="button" onClick={addTemplateType}>新增</button></label>
      <div><button className="button secondary">预览</button><button className="button secondary" onClick={save}>{saved ? '✓ 已保存' : '保存草稿'}</button><button className="button primary">发布版本</button></div>
    </header>
    <div className="editor-workspace">
      <aside className="component-palette">
        <h2>组件</h2>
        <p>点击组件添加到页面</p>
        {palette.map((p, i) => <button onClick={() => add(p)} key={p}><span>{icons[i]}</span><strong>{p}</strong><small>＋</small></button>)}
        <div className="variables"><h3>可用变量</h3>{variables.map(item => <button type="button" key={item.key} onClick={() => current && updateBlock(current.id, { text: `${current.text}${current.text ? ' ' : ''}{{${item.key}}}` })}><strong>{item.label}</strong><code>{`{{${item.key}}}`}</code></button>)}</div>
      </aside>
      <section className="canvas-area">
        <div className="canvas-toolbar"><span /> <button>−</button><strong>85%</strong><button>＋</button><select aria-label="页面"><option>A4 · 自由布局</option></select></div>
        <div className="a4-page free-canvas" aria-label="文档画布">
          <div className="page-header-line">委托生产资料平台 · 文档模板</div>
          {blocks.map(block => <CanvasBlock key={block.id} block={block} selected={selected === block.id} select={() => setSelected(block.id)} update={patch => updateBlock(block.id, patch)} remove={() => removeBlock(block.id)} />)}
          <div className="page-footer-line">第 1 页 / 共 1 页</div>
        </div>
      </section>
      <aside className="property-panel">
        <h2>属性设置</h2>
        {current ? <><div className="property-type">当前组件：<strong>{current.type}</strong></div><BlockProperties block={current} update={patch => updateBlock(current.id, patch)} /><hr /><h3>页面设置</h3><div className="two-fields"><label><span>上边距</span><input defaultValue="20 mm" /></label><label><span>下边距</span><input defaultValue="20 mm" /></label><label><span>左边距</span><input defaultValue="18 mm" /></label><label><span>右边距</span><input defaultValue="18 mm" /></label></div><label><span>页眉</span><input defaultValue="委托生产资料平台 · 文档模板" /></label><label><span>页脚</span><input defaultValue="第 {page} 页 / 共 {pages} 页" /></label></> : <p>请选择页面中的组件。</p>}
      </aside>
    </div>
  </div>;
}

function CanvasBlock({ block, selected, select, update, remove }: { block: Block; selected: boolean; select(): void; update(patch: Partial<Block>): void; remove(): void }) {
  const beginDrag = (event: ReactPointerEvent) => {
    if ((event.target as HTMLElement).closest('button,.resize-handle')) return;
    select();
    const startX = pointerCoordinate(event.clientX);
    const startY = pointerCoordinate(event.clientY);
    const origin = { x: block.x, y: block.y };
    const move = (e: PointerEvent) => update({ x: clamp(origin.x + pointerCoordinate(e.clientX) - startX, 0, page.width - block.width), y: clamp(origin.y + pointerCoordinate(e.clientY) - startY, 0, page.height - block.height) });
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  const beginResize = (event: ReactPointerEvent) => {
    event.stopPropagation();
    select();
    const startX = pointerCoordinate(event.clientX);
    const startY = pointerCoordinate(event.clientY);
    const origin = { width: block.width, height: block.height };
    const move = (e: PointerEvent) => update({ width: clamp(origin.width + pointerCoordinate(e.clientX) - startX, 48, page.width - block.x), height: clamp(origin.height + pointerCoordinate(e.clientY) - startY, 32, page.height - block.y) });
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  return <div tabIndex={0} role="button" aria-label={`${block.type}组件`} className={`editor-block free-block block-${block.type} ${selected ? 'selected' : ''}`} onPointerDown={beginDrag} onClick={select} style={blockStyle(block)}>
    <EditorBlock block={block} />
    {selected && <div className="block-actions"><button onClick={e => { e.stopPropagation(); remove(); }}>×</button></div>}
    <span className="resize-handle" aria-hidden="true" onPointerDown={beginResize} />
  </div>;
}

function BlockProperties({ block, update }: { block: Block; update(patch: Partial<Block>): void }) {
  return <>
    <label><span>内容</span><textarea rows={5} value={block.text} onChange={e => update({ text: e.target.value })} /></label>
    {block.type === '签名/印章位置' && <label><span>动态签署项</span><select value={block.signatureKind ?? 'partyASeal'} onChange={e => { const kind = signatureKinds.find(item => item.key === e.target.value) ?? signatureKinds[0]; update({ signatureKind: kind.key, text: kind.token }); }}>{signatureKinds.map(kind => <option key={kind.key} value={kind.key}>{kind.label}</option>)}</select></label>}
    <div className="two-fields">
      <label><span>X</span><input type="number" value={block.x} onChange={e => update({ x: numeric(e.target.value, block.x) })} /></label>
      <label><span>Y</span><input type="number" value={block.y} onChange={e => update({ y: numeric(e.target.value, block.y) })} /></label>
      <label><span>宽度</span><input type="number" value={block.width} onChange={e => update({ width: numeric(e.target.value, block.width) })} /></label>
      <label><span>高度</span><input type="number" value={block.height} onChange={e => update({ height: numeric(e.target.value, block.height) })} /></label>
    </div>
    <div className="two-fields">
      <label><span>字体</span><select value={block.fontFamily} onChange={e => update({ fontFamily: e.target.value })}>{fontOptions.map(font => <option key={font}>{font}</option>)}</select></label>
      <label><span>字号</span><input type="number" value={block.fontSize} onChange={e => update({ fontSize: numeric(e.target.value, block.fontSize) })} /></label>
      <label><span>行距</span><input type="number" value={block.lineHeight} step="0.1" onChange={e => update({ lineHeight: numeric(e.target.value, block.lineHeight) })} /></label>
      <label><span>层级</span><input type="number" value={block.zIndex} onChange={e => update({ zIndex: numeric(e.target.value, block.zIndex) })} /></label>
    </div>
    <label><span>颜色</span><input type="color" value={block.color} onChange={e => update({ color: e.target.value })} /></label>
    <label><span>对齐方式</span><div className="segmented">{alignOptions.map(([value, label]) => <button type="button" key={value} className={block.textAlign === value ? 'active' : ''} onClick={() => update({ textAlign: value })}>{label}</button>)}</div></label>
    <label className="inline-check"><input type="checkbox" checked={Boolean(block.bold)} onChange={e => update({ bold: e.target.checked })} /> 加粗</label>
  </>;
}

function EditorBlock({ block }: { block: Block }) {
  if (block.type === '标题') return <h1>{block.text}</h1>;
  if (block.type === '物料循环表格') return <div className="editor-table"><strong>物料名称</strong><strong>规格</strong><strong>数量</strong><strong>材质</strong><strong>工艺</strong><span>{'{{item.name}}'}</span><span>{'{{item.spec}}'}</span><span>{'{{item.quantity}}'}</span><span>{'{{item.material}}'}</span><span>{'{{item.craft}}'}</span></div>;
  if (block.type === '表格') return <div className="editor-table simple"><strong>字段</strong><strong>内容</strong><span>合同编号</span><span>{'{{case.id}}'}</span></div>;
  if (block.type === '图片') return <div className="image-placeholder">图片组件</div>;
  if (block.type === '签名/印章位置') return <div className="signature-region"><span>{signatureLabel(block)}</span><small>{block.width} × {block.height} 像素</small></div>;
  return <>{renderRichText(block.text)}</>;
}

function createBlock(type: string, patch: Partial<Block> = {}): Block {
  const base: Block = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    text: type === '动态变量' ? '{{customer.name}}' : type === '签名/印章位置' ? '{{sign.partyA.seal}}' : type === '图片' ? '图片占位' : type === '表格' ? '字段　内容' : `请输入${type}内容`,
    x: 80,
    y: 120,
    width: type === '标题' ? 400 : type === '签名/印章位置' ? 160 : 260,
    height: type === '标题' ? 54 : type === '签名/印章位置' ? 100 : 76,
    zIndex: 1,
    fontFamily: '思源宋体',
    fontSize: type === '标题' ? 23 : 12,
    lineHeight: 1.6,
    textAlign: type === '标题' || type === '签名/印章位置' ? 'center' : 'left',
    color: '#172033',
    bold: type === '标题',
    signatureKind: type === '签名/印章位置' ? 'partyASeal' : undefined,
  };
  return { ...base, ...patch };
}

function normalizeBlocks(value: Block[]) {
  if (!Array.isArray(value) || value.length === 0) return defaults;
  const flattened = value.flatMap((block, index) => normalizeBlock(block, index));
  return flattened.length ? flattened : defaults;
}

function normalizeBlock(block: Block, index: number): Block[] {
  if (block.type === '布局容器' || block.type === '左右并列') {
    const children = block.children?.length
      ? block.children
      : block.layoutItems?.map((text, childIndex) => createBlock('正文', { id: block.id * 10 + childIndex, text }))
        ?? [createBlock('正文', { text: (block as any).leftText ?? '左侧内容' }), createBlock('正文', { text: (block as any).rightText ?? '右侧内容' })];
    return children.map((child, childIndex) => normalizeOne(child, index + childIndex));
  }
  return [normalizeOne(block, index)];
}

function normalizeOne(block: Block, index: number): Block {
  const base = createBlock(block.type);
  return {
    ...base,
    ...block,
    x: typeof block.x === 'number' ? block.x : 70 + index * 16,
    y: typeof block.y === 'number' ? block.y : 90 + index * 88,
    width: typeof block.width === 'number' ? block.width : base.width,
    height: typeof block.height === 'number' ? block.height : base.height,
    zIndex: typeof block.zIndex === 'number' ? block.zIndex : index + 1,
    children: undefined,
    layoutItems: undefined,
    layoutMode: undefined,
  };
}

function blockStyle(block: Block): CSSProperties {
  return {
    left: block.x,
    top: block.y,
    width: block.width,
    height: block.height,
    zIndex: block.zIndex,
    fontFamily: block.fontFamily,
    fontSize: block.fontSize,
    lineHeight: block.lineHeight,
    textAlign: block.textAlign,
    color: block.color,
    fontWeight: block.bold ? 700 : 400,
  };
}

function lines(value = '') {
  return value.split('\n').map((line, index) => <p key={`${line}-${index}`}>{line || '\u00a0'}</p>);
}

function renderRichText(value = '') {
  return value.split('\n').map((line, lineIndex) => <p key={`${line}-${lineIndex}`}>{renderLine(line)}</p>);
}

function renderLine(line: string) {
  const parts = line.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, index) => {
    const match = part.match(/^\{\{([^}]+)\}\}$/);
    if (!match) return part || (index === 0 ? '\u00a0' : '');
    const key = match[1];
    return <span className="variable-tag" title={`{{${key}}}`} key={`${key}-${index}`}>{variableLabels.get(key) ?? key}</span>;
  });
}

function signatureLabel(block: Block) {
  const kind = signatureKinds.find(item => item.key === block.signatureKind || item.token === block.text);
  return kind?.label ?? '动态签署项';
}

function numeric(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pointerCoordinate(value: number) {
  return Number.isFinite(value) ? value : 0;
}
