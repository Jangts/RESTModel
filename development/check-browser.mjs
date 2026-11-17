/** 使用隔离 Chrome 进行实际 ESM/HTTP 回归；浏览器不可用时明确失败，不跳过。 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './process.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'restmodel-browser-'));
console.log(`Browser check artifacts: ${output}`);
let followed = 0;
/**
 * 只暴露当前检查需要的编译模块和合成 HTTP 数据，不提供任意文件访问。
 * @param {import('node:http').IncomingMessage} request 本机请求。
 * @param {import('node:http').ServerResponse} response 本机响应。
 * @returns {Promise<void>} 响应完成。
 */
async function serve(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/should-not-follow') {
    followed++;
    response.end('followed');
    return;
  }
  if (url.pathname === '/api/redirect') {
    response.writeHead(302, { location: '/should-not-follow' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    let text = '';
    for await (const chunk of request) text += chunk;
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/session')
      response.setHeader('set-cookie', 'restmodel-session=browser; Path=/; SameSite=Lax');
    const data =
      url.pathname === '/api/redirect-count'
        ? { followed }
        : request.method === 'POST'
          ? { id: 0, ...JSON.parse(text) }
          : url.pathname === '/api/users'
            ? [{ id: 0, path: request.url }]
            : { id: 0, path: request.url, cookie: request.headers.cookie ?? '' };
    response.end(JSON.stringify(data));
    return;
  }
  let filename;
  if (url.pathname === '/') filename = join(root, 'development/fixtures/browser.html');
  if (url.pathname === '/axios.js')
    filename = join(root, 'extensions/axios/node_modules/axios/dist/esm/axios.js');
  if (url.pathname === '/extension/index.js')
    filename = join(root, 'extensions/axios/dist/index.js');
  if (/^\/core\/[\w/-]+\.js$/u.test(url.pathname))
    filename = join(root, 'packages/restmodel/dist', url.pathname.slice(6));
  if (!filename) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader(
    'content-type',
    url.pathname === '/' ? 'text/html; charset=utf-8' : 'text/javascript',
  );
  response.end(await readFile(filename));
}
const server = createServer((request, response) => {
  void serve(request, response).catch(() => {
    response.writeHead(500);
    response.end('Test server error');
  });
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local test address');
  const browser =
    process.env.CHROME_BIN ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome');
  const version = await runCommand(browser, ['--version']);
  const result = await runCommand(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      `--user-data-dir=${join(output, 'profile')}`,
      '--virtual-time-budget=10000',
      '--dump-dom',
      `http://127.0.0.1:${address.port}`,
    ],
    { timeout: 45000 },
  );
  await writeFile(join(output, 'result.html'), result.stdout);
  await writeFile(join(output, 'browser.log'), result.stderr);
  const content = /<pre id="result">([\s\S]*?)<\/pre>/u.exec(result.stdout)?.[1];
  if (!content) throw new Error(`Missing browser result; artifacts: ${output}`);
  const decoded = content
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  const report = JSON.parse(decoded);
  if (report.status !== 'PASS')
    throw new Error(`Browser check failed: ${JSON.stringify(report)}; artifacts: ${output}`);
  console.log(`${version.stdout.trim()}: ${report.checks.length} browser checks passed`);
  console.log(`Artifacts: ${output}`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
