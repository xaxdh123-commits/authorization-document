import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  it('lists, gets and updates safe display values', async () => {
    const service = { list: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ key: 'nas.password', value: '******' }), update: jest.fn().mockResolvedValue({ key: 'nas.password', value: '******' }) };
    const controller = new SettingsController(service as any);
    const request = { auth: { user: { userId: 'u1' } } } as any;
    await controller.update('nas.password', { value: 'secret', masked: true }, request);
    expect(service.update).toHaveBeenCalledWith('nas.password', { value: 'secret', masked: true }, 'u1');
  });

  it('guards every settings route with role abilities', () => {
    for (const name of ['list', 'get', 'update']) {
      expect(Reflect.getMetadata(REQUIRED_ABILITY, SettingsController.prototype[name as keyof SettingsController])).toBe('ROLE_MAPPING_MANAGE');
    }
  });
});

describe('SettingsService', () => {
  it('fails closed with a safe Chinese error when masked encryption is unavailable', async () => {
    const service = new SettingsService({ setAudited: jest.fn().mockRejectedValue(new Error('SETTINGS_ENCRYPTION_KEY_REQUIRED')) } as any);
    await expect(service.update('nas.password', { value: 'secret', masked: true }, 'u1')).rejects.toThrow('敏感设置加密配置不可用');
  });

  it('forces sensitive keys to encrypted write-only mode even when the client requests a downgrade', async () => {
    const repository = { setAudited: jest.fn().mockResolvedValue({ key: 'nas.password', value: '******', masked: true }) };
    const service = new SettingsService(repository as any);
    await service.update('nas.password', { value: 'secret', masked: false }, 'u1');
    expect(repository.setAudited).toHaveBeenCalledWith({ key: 'nas.password', value: 'secret', masked: true, actorUserId: 'u1' });
  });

  it('masks legacy sensitive values on read and validates typed public settings', async () => {
    const repository = { getForDisplay: jest.fn().mockResolvedValue({ key: 'evidence.apiSecret', value: 'legacy-plain', masked: false }), setAudited: jest.fn() };
    const service = new SettingsService(repository as any);
    await expect(service.get('evidence.apiSecret')).resolves.toMatchObject({ value: '******', masked: true });
    await expect(service.update('link.defaultExpiryHours', { value: '0', masked: false }, 'u1')).rejects.toThrow('设置项校验失败');
    await expect(service.update('unknown.key', { value: 'x', masked: false }, 'u1')).rejects.toThrow('不支持的设置项');
  });
});
