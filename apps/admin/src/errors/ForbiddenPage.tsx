import { Link } from 'react-router-dom';
export function ForbiddenPage() { return <div className="full-state inline"><div className="state-icon">403</div><h1>没有访问权限</h1><p>当前角色未获得此页面的访问权限，请联系管理员配置。</p><Link className="button primary" to="/dashboard">返回工作台</Link></div>; }
