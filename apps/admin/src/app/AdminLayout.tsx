import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const groups = [
  { title: '业务中心', items: [
    { to: '/dashboard', icon: '▦', label: '工作台', ability: 'dashboard:read' },
    { to: '/cases', icon: '▤', label: '业务单管理', ability: 'cases:read' },
    { to: '/reviews/pending', icon: '✓', label: '审核中心', ability: 'reviews:read' },
  ]},
  { title: '配置中心', items: [
    { to: '/requirements', icon: '☷', label: '资料项配置', ability: 'requirements:read' },
    { to: '/templates', icon: '▧', label: '授权书模板', ability: 'templates:read' },
  ]},
  { title: '系统管理', items: [
    { to: '/role-mappings', icon: '♙', label: '角色权限映射', ability: 'role-mappings:read' },
    { to: '/audit-logs', icon: '◷', label: '操作审计日志', ability: 'audit-logs:read' },
    { to: '/settings', icon: '⚙', label: '系统设置', ability: 'settings:read' },
  ]},
];

const titles: Record<string, string> = {
  dashboard: '工作台', cases: '业务单管理', reviews: '审核中心', requirements: '资料项配置',
  templates: '授权书模板', 'role-mappings': '角色权限映射', 'audit-logs': '操作审计日志', settings: '系统设置',
};

export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const location = useLocation();
  const can = (ability: string) => auth.abilities.some(a => a === '*' || a === '*:*:*' || a === ability);
  const section = location.pathname.split('/')[1] || 'dashboard';
  const displayName = auth.displayName ?? '当前用户';
  const pageTitle = titles[section] ?? '页面';
  return <div className="admin-layout">
    <button className="mobile-menu" aria-label="打开导航" onClick={() => setOpen(true)}>☰</button>
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand"><span className="brand-mark">授</span><div><strong>委托生产资料平台</strong><small>授权文件管理</small></div></div>
      <button className="drawer-close" aria-label="关闭导航" onClick={() => setOpen(false)}>×</button>
      <nav aria-label="主导航">{groups.map(group => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.filter(item => can(item.ability)).map(item => <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><span>{item.icon}</span>{item.label}</NavLink>)}</div>)}</nav>
      <div className="sidebar-foot"><span className="connection-dot" />服务运行正常 <small>版本 1.0.0</small></div>
    </aside>
    {open && <button className="drawer-mask" aria-label="关闭导航遮罩" onClick={() => setOpen(false)} />}
    <div className="workspace">
      <header className="topbar"><div><div className="breadcrumb"><Link to="/dashboard">首页</Link><span>/</span><span>{pageTitle}</span></div></div><div className="top-actions"><button className="icon-button" aria-label="帮助">?</button><button className="icon-button notification" aria-label="通知">♢</button><div className="user-avatar">{displayName.slice(0, 1)}</div><div className="user-meta"><strong>{displayName}</strong><small>{auth.roleName ?? '普通用户'}</small></div></div></header>
      <div className="page-content">{children}</div>
    </div>
  </div>;
}
