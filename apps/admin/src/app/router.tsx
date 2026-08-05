import { Link, Route, Routes } from 'react-router-dom';
import { RouteGuard } from '../auth/RouteGuard';
import { useAuth } from '../auth/AuthProvider';
const Page = ({ title }: { title: string }) => <main><h1>{title}</h1></main>;
export function AppRouter() { return <Routes><Route path="/" element={<Page title="Dashboard" />} /><Route path="/dashboard" element={<Page title="Dashboard" />} /><Route path="/role-mappings" element={<RouteGuard ability="role-mappings:read"><Page title="Role mappings" /></RouteGuard>} /><Route path="*" element={<Page title="Not found" />} /></Routes>; }
export function Navigation() { const auth = useAuth(); const can = (ability: string) => auth.abilities.includes('*') || auth.abilities.includes(ability); return <nav><Link to="/dashboard">Dashboard</Link>{can('role-mappings:read') && <Link to="/role-mappings">Role mappings</Link>}</nav>; }
