import { Link } from 'react-router-dom';
export function NotFoundPage() { return <div className="full-state inline"><div className="state-icon">404</div><h1>页面不存在</h1><p>您访问的页面可能已移动或被删除。</p><Link className="button primary" to="/dashboard">返回工作台</Link></div>; }
