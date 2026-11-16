/** 监听正式来源重新生成，VitePress 负责页面热更新。 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pages } from './pages.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = fileURLToPath(new URL('../', import.meta.url));
function generate() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/generate.mjs'], { cwd: app, stdio: 'inherit' });
    child.once('exit', (code) => resolve(code === 0));
  });
}
if (!(await generate())) process.exit(1);
const vitepress = fileURLToPath(
  new URL('../../../node_modules/vitepress/bin/vitepress.js', import.meta.url),
);
const server = spawn(process.execPath, [vitepress, 'dev', '.', '--host', '127.0.0.1'], {
  cwd: app,
  stdio: 'inherit',
});
let timer;
let running = false;
let pending = false;
async function regenerate() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  do {
    pending = false;
    await generate();
  } while (pending);
  running = false;
}
const sources = [
  ...new Set(pages.flatMap((page) => [page.source, page.enSource])),
  'apps/docs/content',
  'docs/assets/branding',
  'packages/restmodel/src',
  ...['axios', 'mock', 'pinia'].map((name) => `extensions/${name}/src`),
];
async function fingerprint(source) {
  const location = path.join(root, source);
  const info = await stat(location);
  if (!info.isDirectory()) return `${source}:${info.mtimeMs}:${info.size}`;
  const entries = (await readdir(location)).sort();
  return (await Promise.all(entries.map((name) => fingerprint(path.join(source, name))))).join('|');
}
let last = await Promise.all(sources.map(fingerprint));
let scanning = false;
const polling = setInterval(async () => {
  if (scanning) return;
  scanning = true;
  try {
    const next = await Promise.all(sources.map(fingerprint));
    if (next.join('|') !== last.join('|')) {
      last = next;
      clearTimeout(timer);
      timer = setTimeout(regenerate, 150);
    }
  } catch (error) {
    console.error('Source scan failed:', error.message);
  } finally {
    scanning = false;
  }
}, 800);
function close() {
  clearTimeout(timer);
  clearInterval(polling);
  server.kill('SIGTERM');
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
server.once('exit', (code) => {
  close();
  process.exitCode = code ?? 1;
});
