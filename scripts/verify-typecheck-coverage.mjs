import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const projects = JSON.parse(execFileSync(pnpm, ['list','-r','--depth','-1','--json'], { encoding:'utf8', shell:process.platform === 'win32' }));
const missing = projects.filter(project => !JSON.parse(readFileSync(join(project.path,'package.json'),'utf8')).scripts?.typecheck);
if (missing.length) throw new Error(`TYPECHECK_COVERAGE_MISSING ${missing.map(project=>project.name).join(',')}`);
console.log(`TYPECHECK_COVERAGE ${projects.length}/${projects.length}`);
