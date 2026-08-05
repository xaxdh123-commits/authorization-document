import { render, screen } from '@testing-library/react'; import { PdfPreviewStep } from './PdfPreviewStep';
test('shows PDF preview digest', () => { render(<PdfPreviewStep digest="abc123" />); expect(screen.getByRole('heading', { name: 'Preview & sign' })).toBeInTheDocument(); expect(screen.getByText('abc123')).toBeInTheDocument(); });
