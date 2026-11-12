/** 独立 tarball 消费检查：使用工作区实际包体与已安装 peer，不借源码解析。 */
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './process.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'restmodel-packages-'));
const tarballs = join(output, 'tarballs');
const consumer = join(output, 'consumer');
await mkdir(tarballs);
await mkdir(consumer);
console.log(`Package check artifacts: ${output}`);

/** @returns {Promise<{directory: string, manifest: object}[]>} 真实工作区包及 manifest。 */
async function workspacePackages() {
  const packages = [];
  for (const domain of ['packages', 'extensions']) {
    for (const entry of await readdir(join(root, domain), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, domain, entry.name);
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      packages.push({ directory, manifest });
    }
  }
  return packages;
}

const packages = await workspacePackages();
const names = new Set(packages.map((item) => item.manifest.name));
const dependencies = {};
for (const { directory, manifest } of packages) {
  await runCommand('pnpm', ['pack', '--pack-destination', tarballs], { cwd: directory });
  const filename = `${manifest.name.replace(/^@/u, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
  dependencies[manifest.name] = `file:${join(tarballs, filename)}`;
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (names.has(name)) continue;
    const peer = JSON.parse(
      await readFile(join(directory, 'node_modules', name, 'package.json'), 'utf8'),
    );
    if (dependencies[name] && dependencies[name] !== peer.version)
      throw new Error(`Conflicting installed peer: ${name}`);
    dependencies[name] = peer.version;
  }
}
await writeFile(
  join(consumer, 'package.json'),
  JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
);
for (const [source, target] of [
  ['package-smoke.mjs', 'smoke.mjs'],
  ['package-consumer.mts', 'consumer.mts'],
]) {
  await copyFile(new URL(`./fixtures/${source}`, import.meta.url), join(consumer, target));
}
// pnpm 的生成文件记录本次真实缓存位置，不能凭当前目录猜另一份 store。
const modules = await readFile(join(root, 'node_modules', '.modules.yaml'), 'utf8');
const store = /^storeDir:\s*(.+)$/mu.exec(modules)?.[1]?.replace(/^['"]|['"]$/gu, '');
if (!store) throw new Error('pnpm store missing; run pnpm install first');
await runCommand('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', store], {
  cwd: consumer,
});
const smoke = await runCommand(process.execPath, [join(consumer, 'smoke.mjs')], { cwd: consumer });
await runCommand(
  process.execPath,
  [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    '--skipLibCheck',
    join(consumer, 'consumer.mts'),
  ],
  { cwd: consumer },
);
console.log(smoke.stdout.trim());
console.log(`Package/type checks passed for ${packages.length} tarballs. Artifacts: ${output}`);
