import { Link, Route, Routes } from 'react-router-dom';
import { RouteGuard } from '../auth/RouteGuard';
import { useAuth } from '../auth/AuthProvider';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CaseListPage } from '../features/cases/CaseListPage';
import { CaseCreatePage } from '../features/cases/CaseCreatePage';
import { CaseDetailPage } from '../features/cases/CaseDetailPage';
import { ReviewQueuePage } from '../features/reviews/ReviewQueuePage';
import { ReviewDetailPage } from '../features/reviews/ReviewDetailPage';
import { createApiClient } from '../api/client';
const Page = ({ title }: { title: string }) => <main><h1>{title}</h1></main>;
const api = createApiClient();
export function AppRouter() { return <Routes><Route path="/" element={<RouteGuard ability="dashboard:read"><DashboardPage client={api} /></RouteGuard>} /><Route path="/dashboard" element={<RouteGuard ability="dashboard:read"><DashboardPage client={api} /></RouteGuard>} /><Route path="/cases" element={<CaseListPage client={api} />} /><Route path="/cases/new" element={<CaseCreatePage client={api} />} /><Route path="/cases/:id" element={<CaseDetailPage />} /><Route path="/reviews" element={<ReviewQueuePage client={api} />} /><Route path="/reviews/:id" element={<ReviewDetailPage />} /><Route path="/role-mappings" element={<RouteGuard ability="role-mappings:read"><Page title="Role mappings" /></RouteGuard>} /><Route path="*" element={<Page title="Not found" />} /></Routes>; }
export function Navigation() { const auth = useAuth(); const can = (ability: string) => auth.abilities.includes('*') || auth.abilities.includes('*:*:*') || auth.abilities.includes(ability); return <nav><Link to="/dashboard">Dashboard</Link>{can('role-mappings:read') && <Link to="/role-mappings">Role mappings</Link>}</nav>; }
