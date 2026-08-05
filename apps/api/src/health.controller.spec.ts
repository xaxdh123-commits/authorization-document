import { HealthController } from './health.controller';
describe('HealthController', () => {
  it('returns an explicit healthy result', () => expect(new HealthController().getHealth()).toEqual({ status: 'ok' }));
});
