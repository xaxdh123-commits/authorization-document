import { Link, Route, Routes } from 'react-router-dom';
import { RouteGuard } from '../auth/RouteGuard';
import { useAuth } from '../auth/AuthProvider';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CaseListPage } from '../features/cases/CaseListPage';
import { CaseCreatePage } from '../features/cases/CaseCreatePage';
import { CaseDetailPage } from '../features/cases/CaseDetailPage';
import { ReviewQueuePage } from '../features/reviews/ReviewQueuePage';
import { ReviewDetailPage } from '../features/reviews/ReviewDetailPage';
const Page = ({ title }: { title: string }) => <main><h1>{title}</h1></main>;
const dashboardClient = { getDashboard: async () => ({ statuses: { draft: 0, pending: 0, overdue: 0 }, recent: [], overdue: [] }) };
const caseClient = { listCases: async () => [] };
const reviewClient = { listReviews: async () => [] };
export function AppRouter() { return <Routes><Route path="/" element={<RouteGuard ability="dashboard:read"><DashboardPage client={dashboardClient} /></RouteGuard>} /><Route path="/dashboard" element={<RouteGuard ability="dashboard:read"><DashboardPage client={dashboardClient} /></RouteGuard>} /><Route path="/cases" element={<CaseListPage client={caseClient} />} /><Route path="/cases/new" element={<CaseCreatePage />} /><Route path="/cases/:id" element={<CaseDetailPage />} /><Route path="/reviews" element={<ReviewQueuePage client={reviewClient} />} /><Route path="/reviews/:id" element={<ReviewDetailPage />} /><Route path="/role-mappings" element={<RouteGuard ability="role-mappings:read"><Page title="Role mappings" /></RouteGuard>} /><Route path="*" element={<Page title="Not found" />} /></Routes>; }
export function Navigation() { const auth = useAuth(); const can = (ability: string) => auth.abilities.includes('*') || auth.abilities.includes(ability); return <nav><Link to="/dashboard">Dashboard</Link>{can('role-mappings:read') && <Link to="/role-mappings">Role mappings</Link>}</nav>; }
