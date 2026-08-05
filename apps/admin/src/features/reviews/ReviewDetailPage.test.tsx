import { render, screen } from '@testing-library/react';
import { ReviewDetailPage } from './ReviewDetailPage';
test('shows approve, reject, diff and PDF retry controls', () => { render(<ReviewDetailPage />); expect(screen.getByRole('button', { name: 'Approve item' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Reject item' })).toBeInTheDocument(); expect(screen.getByText('Supplement differences')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry PDF' })).toBeInTheDocument(); });
