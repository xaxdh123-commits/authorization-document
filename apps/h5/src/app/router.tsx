import { Route, Routes } from 'react-router-dom';
import { CaseWizardPage } from '../features/case-wizard/CaseWizardPage';
import { ConflictDialog } from '../features/case-wizard/ConflictDialog';
import { SupplementPage } from '../features/supplement/SupplementPage';
import { SignaturePlacementEditor } from '../features/signing/SignaturePlacementEditor';
export function AppRouter() { return <Routes><Route path="/case/:id/conflict" element={<ConflictDialog />} /><Route path="/case/:id/supplement" element={<SupplementPage reason="Additional information required" items={['Identity']} />} /><Route path="/case/:id/sign" element={<SignaturePlacementEditor />} /><Route path="*" element={<CaseWizardPage />} /></Routes>; }
