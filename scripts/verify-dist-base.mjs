import { readFileSync } from 'node:fs';

const checks = [
  ['apps/admin/dist/index.html', '/admin/'],
  ['apps/h5/dist/index.html', '/p/'],
];
for (const [file, base] of checks) {
  const html = readFileSync(file, 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  if (!urls.length || urls.some((url) => !url.startsWith(base))) throw new Error(`${file} contains asset URLs outside ${base}: ${urls.join(', ')}`);
}
console.log('dist asset base paths verified');
