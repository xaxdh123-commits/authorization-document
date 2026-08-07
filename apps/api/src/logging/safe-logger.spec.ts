import { redactForLog, toSafeErrorResponse } from './safe-logger';

describe('safe structured logging', () => {
  it('recursively redacts credentials, identifiers, paths and stacks', () => {
    const output = redactForLog({
      token: 'secret-token', cookie: 'sid=secret', password: 'pw', authorization: 'Bearer x',
      userId: 'user-1', fileId: 'file-1', path: 'private/a.pdf', stack: 'internal stack',
      nested: { accessToken: 'nested-secret', ok: 'visible' },
    });
    expect(JSON.stringify(output)).not.toMatch(/secret|Bearer|user-1|file-1|private\/a\.pdf|internal stack/);
    expect(output).toEqual(expect.objectContaining({ token: '[REDACTED]', userId: '[REDACTED]' }));
    expect((output as any).nested.ok).toBe('visible');
  });

  it('does not expose stack or internal error messages to clients', () => {
    const error = Object.assign(new Error('database path C:\\private\\db'), { status: 500 });
    expect(toSafeErrorResponse(error, 'request-1')).toEqual({ statusCode: 500, message: 'Internal server error', requestId: 'request-1' });
  });
  it('redacts sensitive text even from a 4xx exception message',()=>expect(toSafeErrorResponse({status:400,message:'invalid token at private/fileId'},'r2')).toEqual({statusCode:400,message:'Request failed',requestId:'r2'}));

  it('redacts sensitive content hidden under benign keys and never serializes upload bytes', () => {
    const output = JSON.stringify(redactForLog({
      message: 'Authorization: Bearer marker-token Cookie: sid=marker-cookie C:\\private\\secret.pdf',
      detail: 'postgresql://admin:marker-password@db.internal:5432/app',
      data: Buffer.from('marker-upload-body'),
      requestId: 'request-safe',
      ok: 'visible',
    }));
    expect(output).not.toMatch(/marker-token|marker-cookie|marker-password|marker-upload-body|C:\\\\private|postgresql:\/\//i);
    expect(output).toContain('request-safe');
    expect(output).toContain('visible');
  });
});
