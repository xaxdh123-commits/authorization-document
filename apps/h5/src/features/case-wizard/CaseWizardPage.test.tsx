import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseWizardPage } from './CaseWizardPage';

test('walks through four wizard steps', async () => {
  const user = userEvent.setup();
  render(<CaseWizardPage />);
  expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Uploads' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Preview & sign' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Submit' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Submit application' })).toBeInTheDocument();
});
