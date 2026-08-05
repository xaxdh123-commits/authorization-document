import { render, screen } from '@testing-library/react'; import { SupplementPage } from './SupplementPage';
test('shows supplement reason and rejected items', () => { render(<SupplementPage reason="Missing identity" items={['Identity']}/>); expect(screen.getByText('Missing identity')).toBeInTheDocument(); expect(screen.getByText('Identity')).toBeInTheDocument(); });
