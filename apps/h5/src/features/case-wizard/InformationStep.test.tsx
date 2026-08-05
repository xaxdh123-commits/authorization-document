import { render, screen } from '@testing-library/react'; import { InformationStep } from './InformationStep';
test('renders editable information fields', () => { render(<InformationStep />); expect(screen.getByLabelText('Full name')).toBeInTheDocument(); expect(screen.getByLabelText('Phone')).toBeInTheDocument(); });
