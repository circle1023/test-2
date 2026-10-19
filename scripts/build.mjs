import { cp, mkdir, readdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const name of await readdir('public')) await cp(`public/${name}`, `dist/${name}`, { recursive: true });
console.log('Static client built in dist/. Vercel deploys api/*.js as Node.js functions.');
