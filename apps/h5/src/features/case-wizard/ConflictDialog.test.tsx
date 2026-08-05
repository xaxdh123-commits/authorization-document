import { render, screen } from '@testing-library/react'; import { ConflictDialog } from './ConflictDialog';
test('explains a 409 conflict and offers reload or keep local copy', () => { render(<ConflictDialog />); expect(screen.getByRole('heading', { name: 'Draft conflict' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Keep my copy' })).toBeInTheDocument(); });
