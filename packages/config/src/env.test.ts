import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';
const validEnv = { DATABASE_URL:'postgresql://user:password@localhost:5432/authorization', AUTH_GET_INFO_URL:'https://auth.example.test/getInfo', AUTH_TOKEN_HEADER:'Authorization', STORAGE_ROOT:'D:/authorization-data', H5_PUBLIC_BASE:'https://h5.example.test', CORS_ALLOWED_ORIGINS:'https://admin.example.test', CHROMIUM_EXECUTABLE_PATH:'C:/Chrome/chrome.exe', LINK_DEADLINE_POLICY:'CASE_DEADLINE', LOG_LEVEL:'info' };
describe('parseEnv',()=>{
  it('parses complete production dependencies',()=>expect(parseEnv(validEnv)).toMatchObject({authTimeoutMs:3000,authCacheTtlSeconds:60,storageRoot:'D:/authorization-data',h5PublicBase:'https://h5.example.test',corsAllowedOrigins:['https://admin.example.test'],chromiumExecutablePath:'C:/Chrome/chrome.exe'}));
  it('rejects missing required values',()=>expect(()=>parseEnv({})).toThrow(/DATABASE_URL/));
  it.each(['DATABASE_URL','AUTH_GET_INFO_URL','STORAGE_ROOT','H5_PUBLIC_BASE','CORS_ALLOWED_ORIGINS','CHROMIUM_EXECUTABLE_PATH'] as const)('rejects production startup without %s',(key)=>expect(()=>parseEnv({...validEnv,[key]:undefined})).toThrow(key));
  it('rejects ttl > 60',()=>expect(()=>parseEnv({...validEnv,AUTH_CACHE_TTL_SECONDS:'61'})).toThrow(/AUTH_CACHE_TTL_SECONDS/));
});
