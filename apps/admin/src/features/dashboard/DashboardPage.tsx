import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { statusLabels } from '../../api/demoData';
export type DashboardData = { statuses: Record<string, number>; recent: Array<{ id: string; title: string; status?: string; updatedAt?: string; owner?: string }>; overdue: Array<{ id: string; title: string }> };
export interface DashboardClient { getDashboard(): Promise<DashboardData>; }
export function DashboardPage({ client }: { client: DashboardClient }) {
  const [data, setData] = useState<DashboardData>(); const [error, setError] = useState(false);
  useEffect(() => { client.getDashboard().then(setData).catch(() => setError(true)); }, [client]);
  if (error) return <PageError title="工作台加载失败" />; if (!data) return <PageLoading text="正在加载工作台数据…" />;
  return <main className="page"><PageHeader eyebrow="总览" title="工作台" description="查看业务进度、待办事项和最近更新" actions={<Link className="button primary" to="/cases/new">＋ 新建业务单</Link>} />
    <div className="status-grid" aria-label="业务状态汇总">{Object.entries(data.statuses).map(([key, value], i) => <Link to={`/cases?status=${key}`} className={`status-card tone-${i % 5}`} key={key}><div><span>{statusLabels[key] ?? key}</span><strong>{value}</strong></div><span className="trend">查看详情 →</span></Link>)}</div>
    <div className="dashboard-grid"><section className="panel"><PanelTitle title="待办事项" link="/reviews/pending" /><div className="todo-list"><Todo number={data.statuses.pendingReview ?? 0} title="待审核业务单" note="客户资料已提交，等待逐项审核" color="blue" /><Todo number={data.statuses.needsSupplement ?? 0} title="需跟进补件" note="客户尚未完成被驳回资料的补充" color="orange" /><Todo number={data.statuses.finalPdfFailed ?? 0} title="文件生成失败" note="请检查任务并重新生成最终文件" color="red" /></div></section>
      <section className="panel"><PanelTitle title="快捷操作" /><div className="quick-grid"><Quick to="/cases/new" icon="＋" title="新建业务单" text="创建资料收集任务" /><Quick to="/reviews/pending" icon="✓" title="进入审核" text="处理待审核资料" /><Quick to="/templates/new" icon="▧" title="创建模板" text="设计授权书版式" /><Quick to="/requirements" icon="☷" title="资料项配置" text="管理动态问卷字段" /></div></section></div>
    <section className="panel"><PanelTitle title="最近业务单" link="/cases" /><CaseTable items={data.recent} /></section>
  </main>;
}
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) { return <div className="page-header"><div>{eyebrow && <span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>; }
export function PanelTitle({ title, link }: { title: string; link?: string }) { return <div className="panel-title"><h2>{title}</h2>{link && <Link to={link}>查看全部 →</Link>}</div>; }
function Todo({ number, title, note, color }: { number: number; title: string; note: string; color: string }) { return <div className="todo"><span className={`todo-number ${color}`}>{number}</span><div><strong>{title}</strong><p>{note}</p></div><span>›</span></div>; }
function Quick({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) { return <Link className="quick" to={to}><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></Link>; }
export function StatusChip({ status }: { status: string }) { return <span className={`status-chip status-${status.toLowerCase()}`}>{statusLabels[status] ?? status}</span>; }
export function CaseTable({ items }: { items: DashboardData['recent'] }) { if (!items.length) return <EmptyState title="暂无业务单" text="新建业务单后会显示在这里" />; return <div className="table-wrap"><table><thead><tr><th>业务单编号</th><th>委托方</th><th>状态</th><th>负责人</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Link className="table-link" to={`/cases/${item.id}`}>{item.id}</Link></td><td>{item.title}</td><td><StatusChip status={item.status ?? 'DRAFT'} /></td><td>{item.owner ?? '—'}</td><td>{item.updatedAt ?? '—'}</td><td><Link to={`/cases/${item.id}`}>查看</Link></td></tr>)}</tbody></table></div>; }
export function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span>□</span><strong>{title}</strong><p>{text}</p></div>; }
export function PageLoading({ text }: { text: string }) { return <div className="page-state"><span className="spinner" /><p>{text}</p></div>; }
export function PageError({ title }: { title: string }) { return <div className="page-state"><span className="state-error">!</span><h2>{title}</h2><p>请检查网络连接后重试。</p><button onClick={() => location.reload()}>重新加载</button></div>; }
