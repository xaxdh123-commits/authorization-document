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
  <Route path="/dashboard" element={guard('CASE_READ', <DashboardPage client={api} />)} />
  <Route path="/cases" element={guard('CASE_READ', <CaseListPage client={api} />)} />
  <Route path="/cases/new" element={guard('CASE_CREATE', <CaseCreatePage client={api} />)} />
  <Route path="/cases/:id" element={guard('CASE_READ', <CaseDetailPage />)} />
  <Route path="/reviews" element={<Navigate to="/reviews/pending" replace />} />
  <Route path="/reviews/pending" element={guard('REVIEW_ITEM', <ReviewQueuePage client={api} mode="pending" />)} />
  <Route path="/reviews/supplement" element={guard('REVIEW_ITEM', <ReviewQueuePage client={api} mode="supplement" />)} />
  <Route path="/reviews/:id" element={guard('REVIEW_ITEM', <ReviewDetailPage />)} />
  <Route path="/requirements" element={guard('REQUIREMENT_MANAGE', <RequirementsPage />)} />
  <Route path="/templates" element={guard('TEMPLATE_MANAGE', <TemplatesPage />)} />
  <Route path="/templates/new" element={guard('TEMPLATE_MANAGE', <TemplateEditorPage />)} />
  <Route path="/templates/:id/editor" element={guard('TEMPLATE_MANAGE', <TemplateEditorPage />)} />
  <Route path="/role-mappings" element={guard('ROLE_MAPPING_MANAGE', <RoleMappingsPage />)} />
  <Route path="/audit-logs" element={guard('AUDIT_READ_ALL', <AuditLogsPage />)} />
  <Route path="/settings" element={guard('ROLE_MAPPING_MANAGE', <SettingsPage />)} />
  <Route path="*" element={<NotFoundPage />} />
</Routes>; }
