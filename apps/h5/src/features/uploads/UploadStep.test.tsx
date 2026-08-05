import { render, screen } from '@testing-library/react'; import { UploadStep } from './UploadStep';
test('renders dynamic requirements and upload controls', () => { render(<UploadStep requirements={['Identity', 'Address']} />); expect(screen.getByText('Identity')).toBeInTheDocument(); expect(screen.getByLabelText('Upload Identity')).toBeInTheDocument(); });
