import { render, screen } from '@testing-library/react'; import { SubmitStep } from './SubmitStep';
test('shows submission confirmation action', () => { render(<SubmitStep />); expect(screen.getByRole('heading', { name: 'Submit' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Submit application' })).toBeInTheDocument(); });
