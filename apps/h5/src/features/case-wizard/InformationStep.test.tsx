import { render, screen } from '@testing-library/react'; import { InformationStep } from './InformationStep';
test('renders editable information fields', () => { render(<InformationStep />); expect(screen.getByLabelText(/联系人姓名/)).toBeInTheDocument(); expect(screen.getByLabelText(/手机号码/)).toBeInTheDocument(); });
