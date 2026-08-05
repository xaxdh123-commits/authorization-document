import { Route, Routes } from 'react-router-dom';
import { CaseWizardPage } from '../features/case-wizard/CaseWizardPage';
export function AppRouter() { return <Routes><Route path="*" element={<CaseWizardPage />} /></Routes>; }
