import { render, screen } from '@testing-library/react'; import { SignaturePlacementEditor } from './SignaturePlacementEditor';
test('supports signature mode selection', () => { render(<SignaturePlacementEditor />); expect(screen.getByLabelText('Signature mode')).toBeInTheDocument(); });
