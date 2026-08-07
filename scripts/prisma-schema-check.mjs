import { spawnSync } from 'node:child_process';

const action = process.argv[2];
if (!['validate', 'generate'].includes(action)) throw new Error('Expected validate or generate');
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL?.trim() || 'postgresql://schema:unused@127.0.0.1:5432/authorization_schema_test' };
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', action, '--schema', 'prisma/schema.prisma'], { stdio: 'inherit', env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
