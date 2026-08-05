import { Route, Routes } from 'react-router-dom';
import { CaseWizardPage } from '../features/case-wizard/CaseWizardPage';
import { ConflictDialog } from '../features/case-wizard/ConflictDialog';
import { SupplementPage } from '../features/supplement/SupplementPage';
import { SignaturePlacementEditor } from '../features/signing/SignaturePlacementEditor';
import { getPublicCaseContext } from '../api/client';
export function AppRouter() { const context = getPublicCaseContext(); return <Routes><Route path="/case/:id/conflict" element={<ConflictDialog />} /><Route path="/case/:id/supplement" element={<SupplementPage reason="Additional information required" items={context.requirements ?? ['Identity']} />} /><Route path="/case/:id/sign" element={<SignaturePlacementEditor />} /><Route path="*" element={<CaseWizardPage requirements={context.requirements} />} /></Routes>; }
