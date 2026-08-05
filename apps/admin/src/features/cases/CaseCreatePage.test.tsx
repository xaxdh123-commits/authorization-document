import { render, screen } from '@testing-library/react';
import { CaseCreatePage } from './CaseCreatePage';
test('shows customer, multiple materials, template and requirement controls', () => { render(<CaseCreatePage />); expect(screen.getByLabelText('Customer')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Add material' })).toBeInTheDocument(); expect(screen.getByLabelText('Template')).toBeInTheDocument(); expect(screen.getByLabelText('Requirements')).toBeInTheDocument(); });
