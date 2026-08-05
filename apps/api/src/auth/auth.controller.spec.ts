import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('returns local development session when no upstream is configured', async () => {
    delete process.env.AUTH_GET_INFO_URL;
    const result = await new AuthController().getInfo();
    expect(result.user.roles[0].roleKey).toBe('admin');
    expect(result.permissions).toContain('*:*:*');
  });
});
