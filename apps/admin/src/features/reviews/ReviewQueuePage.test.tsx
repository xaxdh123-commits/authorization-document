import { render, screen } from '@testing-library/react';
import { ReviewQueuePage } from './ReviewQueuePage';
test('renders review queue and actions', async () => { render(<ReviewQueuePage client={{ listReviews: async () => [{ id: 'R1', caseTitle: 'Acme', status: 'PENDING_REVIEW' }] }} />); expect(await screen.findByText('Acme')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Open review' })).toBeInTheDocument(); });
