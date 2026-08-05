import { render, screen } from '@testing-library/react';
import { CaseDetailPage } from './CaseDetailPage';
test('renders detail tabs', () => { render(<CaseDetailPage />); expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument(); expect(screen.getByRole('tab', { name: 'Materials' })).toBeInTheDocument(); expect(screen.getByRole('tab', { name: 'Questionnaire' })).toBeInTheDocument(); expect(screen.getByRole('tab', { name: 'Files' })).toBeInTheDocument(); });
