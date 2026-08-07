import { Navigate, Route, Routes } from 'react-router-dom';
import { RouteGuard } from '../auth/RouteGuard';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CaseListPage } from '../features/cases/CaseListPage';
import { CaseCreatePage } from '../features/cases/CaseCreatePage';
import { CaseDetailPage } from '../features/cases/CaseDetailPage';
import { ReviewQueuePage } from '../features/reviews/ReviewQueuePage';
import { ReviewDetailPage } from '../features/reviews/ReviewDetailPage';
import { RequirementsPage } from '../features/config/RequirementsPage';
import { TemplatesPage } from '../features/templates/TemplatesPage';
import { TemplateEditorPage } from '../features/templates/TemplateEditorPage';
import { RoleMappingsPage } from '../features/system/RoleMappingsPage';
import { AuditLogsPage } from '../features/system/AuditLogsPage';
import { SettingsPage } from '../features/system/SettingsPage';
import { NotFoundPage } from '../errors/NotFoundPage';
import { createApiClient } from '../api/client';
const api = createApiClient();
const guard = (ability: string, page: React.ReactNode) => <RouteGuard ability={ability}>{page}</RouteGuard>;
export function AppRouter() { return <Routes>
  <Route path="/" element={<Navigate to="/dashboard" replace />} />
  <Route path="/dashboard" element={guard('dashboard:read', <DashboardPage client={api} />)} />
  <Route path="/cases" element={guard('cases:read', <CaseListPage client={api} />)} />
  <Route path="/cases/new" element={guard('cases:create', <CaseCreatePage client={api} />)} />
  <Route path="/cases/:id" element={guard('cases:read', <CaseDetailPage />)} />
  <Route path="/reviews" element={<Navigate to="/reviews/pending" replace />} />
  <Route path="/reviews/pending" element={guard('reviews:read', <ReviewQueuePage client={api} mode="pending" />)} />
  <Route path="/reviews/supplement" element={guard('reviews:read', <ReviewQueuePage client={api} mode="supplement" />)} />
  <Route path="/reviews/:id" element={guard('reviews:read', <ReviewDetailPage />)} />
  <Route path="/requirements" element={guard('requirements:read', <RequirementsPage />)} />
  <Route path="/templates" element={guard('templates:read', <TemplatesPage />)} />
  <Route path="/templates/new" element={guard('templates:write', <TemplateEditorPage />)} />
  <Route path="/templates/:id/editor" element={guard('templates:write', <TemplateEditorPage />)} />
  <Route path="/role-mappings" element={guard('role-mappings:read', <RoleMappingsPage />)} />
  <Route path="/audit-logs" element={guard('audit-logs:read', <AuditLogsPage />)} />
  <Route path="/settings" element={guard('settings:read', <SettingsPage />)} />
  <Route path="*" element={<NotFoundPage />} />
</Routes>; }
