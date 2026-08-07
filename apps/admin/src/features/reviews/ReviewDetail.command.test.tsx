import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewDetailPage } from './ReviewDetailPage';

test('确认全部通过后调用审核客户端', async () => {
  const approve = vi.fn(async () => undefined);
  const user = userEvent.setup();
  render(<ReviewDetailPage client={{ approve }} />);
  for (let index = 0; index < 4; index += 1) {
    await user.click(screen.getByRole('button', { name: /资料通过/ }));
    if (index < 3) await user.click(screen.getByRole('button', { name: new RegExp(`^${index + 2} `) }));
  }
  await user.click(screen.getByRole('button', { name: '确认本次审核' }));
  expect(approve).toHaveBeenCalled();
});
