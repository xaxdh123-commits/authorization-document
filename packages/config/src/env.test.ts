import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';
const validEnv = { DATABASE_URL:'postgresql://user:password@localhost:5432/authorization', AUTH_GET_INFO_URL:'https://auth.example.test/getInfo', AUTH_TOKEN_HEADER:'Authorization', FILE_ROOT:'D:/authorization-data', PUBLIC_H5_URL:'https://h5.example.test', LINK_DEADLINE_POLICY:'CASE_DEADLINE', LOG_LEVEL:'info' };
describe('parseEnv',()=>{ it('parses defaults',()=>expect(parseEnv(validEnv)).toMatchObject({authTimeoutMs:3000,authCacheTtlSeconds:60})); it('rejects missing required values',()=>expect(()=>parseEnv({})).toThrow(/DATABASE_URL/)); it('rejects ttl > 60',()=>expect(()=>parseEnv({...validEnv,AUTH_CACHE_TTL_SECONDS:'61'})).toThrow(/AUTH_CACHE_TTL_SECONDS/)); });
