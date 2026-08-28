import { useMemo, useState } from 'react';
import { getAccessToken } from '../../api/client';
import { PageHeader } from '../dashboard/DashboardPage';

type RoleConfig = { key: string; name: string; upstream: string; count: number };
type AbilityGroup = { group: string; items: Array<[string, string]> };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')).replace(/\/$/, '');
const abilities: AbilityGroup[] = [
  { group: '业务单', items: [['CASE_READ', '查看业务单'], ['CASE_CREATE', '创建业务单'], ['CASE_EDIT_DRAFT', '编辑草稿'], ['CASE_MANAGE_LINK', '管理客户链接'], ['CASE_CLOSE', '关闭业务单']] },
  { group: '审核', items: [['REVIEW_ITEM', '查看和审核任务'], ['REVIEW_CONFIRM', '确认审核结论'], ['CASE_ASSIGN_REVIEWER', '分配审核员'], ['PDF_RETRY', '重试最终文件']] },
  { group: '配置', items: [['REQUIREMENT_MANAGE', '管理资料项'], ['TEMPLATE_MANAGE', '管理模板'], ['TEMPLATE_PUBLISH', '发布模板']] },
  { group: '系统', items: [['ROLE_MAPPING_MANAGE', '角色权限映射'], ['AUDIT_READ_ALL', '审计日志']] },
];
const roles: RoleConfig[] = [
  { key: 'admin', name: '超级管理员', upstream: 'admin', count: 17 },
  { key: 'service', name: '客服', upstream: 'common', count: 6 },
  { key: 'reviewer', name: '审核员', upstream: 'reviewer', count: 5 },
  { key: 'market', name: '分销管理', upstream: 'market', count: 2 },
];
const allAbilityKeys = abilities.flatMap(group => group.items.map(([key]) => key));
const defaultRoleAbilities: Record<string, string[]> = {
  admin: allAbilityKeys,
  service: ['CASE_READ', 'CASE_CREATE', 'CASE_EDIT_DRAFT', 'CASE_MANAGE_LINK', 'CASE_CLOSE'],
  reviewer: ['CASE_READ', 'REVIEW_ITEM', 'REVIEW_CONFIRM', 'CASE_ASSIGN_REVIEWER', 'PDF_RETRY'],
  market: ['CASE_READ'],
};

export function RoleMappingsPage() {
  const [selected, setSelected] = useState('admin');
  const [roleAbilities, setRoleAbilities] = useState<Record<string, string[]>>(defaultRoleAbilities);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const currentRole = roles.find(r => r.key === selected) ?? roles[0];
  const selectedAbilities = useMemo(() => new Set(roleAbilities[selected] ?? []), [roleAbilities, selected]);
  const setToastBriefly = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };
  const toggleAbility = (ability: string, checked: boolean) => setRoleAbilities(current => {
    const next = new Set(current[selected] ?? []);
    if (checked) next.add(ability); else next.delete(ability);
    return { ...current, [selected]: [...next] };
  });
  const toggleAll = (checked: boolean) => setRoleAbilities(current => ({ ...current, [selected]: checked ? allAbilityKeys : [] }));
  const save = async () => {
    setSaving(true);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`${apiBase}/roles/mappings/${currentRole.upstream}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ abilities: roleAbilities[selected] ?? [], dataScope: 'ALL', enabled: true }),
      });
      if (!response.ok) throw new Error(`接口请求失败（${response.status}）`);
      setToastBriefly('映射已保存');
    } catch (error) {
      setToastBriefly(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return <main className="page">
    <PageHeader eyebrow="系统管理" title="角色权限映射" description="将上游 roleKey 映射为本平台页面与操作能力" actions={<button className="button primary" disabled={saving} onClick={save}>{saving ? '保存中...' : '保存映射'}</button>} />
    {toast && <div className="toast">{toast}</div>}
    <div className="role-layout">
      <aside className="panel role-list">
        <h2>上游角色</h2>
        {roles.map(r => <button className={selected === r.key ? 'active' : ''} onClick={() => setSelected(r.key)} key={r.key}><span className="role-avatar">{r.name[0]}</span><div><strong>{r.name}</strong><code>{r.upstream}</code></div><em>{r.count}</em></button>)}
        <button className="button ghost full">＋ 添加角色映射</button>
      </aside>
      <section className="panel abilities">
        <div className="section-heading">
          <div><h2>{currentRole.name}能力</h2><p>机器角色键：<code>{currentRole.upstream}</code></p></div>
          <label className="inline-check"><input type="checkbox" checked={selectedAbilities.size === allAbilityKeys.length} onChange={e => toggleAll(e.target.checked)} /> 全选</label>
        </div>
        {abilities.map(group => <div className="ability-group" key={group.group}>
          <h3>{group.group}</h3>
          <div>{group.items.map(([key, label]) => <label key={key}><input type="checkbox" checked={selectedAbilities.has(key)} onChange={e => toggleAbility(key, e.target.checked)} /><span><strong>{label}</strong><code>{key}</code></span></label>)}</div>
        </div>)}
      </section>
    </div>
  </main>;
}
