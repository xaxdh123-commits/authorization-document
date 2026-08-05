import { render, screen } from '@testing-library/react'; import { CaseDetailPage } from './CaseDetailPage';
test('loads case details through typed client', async () => { render(<CaseDetailPage client={{ getCase: async () => ({ title: 'Acme case' }) }} />); expect(await screen.findByText('Acme case')).toBeInTheDocument(); });
