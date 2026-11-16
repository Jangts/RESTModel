/** 独立 tarball 消费检查：使用工作区实际包体与已安装 peer，不借源码解析。 */
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
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

/** 核对真实包体的发布合同，不以工作区 manifest 代替打包结果。 */
async function verifyTarball(tarball, source) {
  const read = async (file) =>
    (await runCommand('tar', ['-xOf', tarball, `package/${file}`])).stdout;
  const files = new Set((await runCommand('tar', ['-tzf', tarball])).stdout.trim().split('\n'));
  const packed = JSON.parse(await read('package.json'));
  assert.equal(packed.name, source.name);
  assert.equal(packed.version, source.version);
  assert.equal(packed.private, undefined);
  assert.equal(packed.license, 'MIT');
  assert.equal(packed.publishConfig.access, 'public');
  assert.equal(packed.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.equal(await read('LICENSE'), await readFile(join(root, 'LICENSE'), 'utf8'));
  for (const entry of [
    packed.main,
    packed.types,
    packed.exports['.'].import,
    packed.exports['.'].types,
  ]) {
    assert.equal(typeof entry, 'string');
    assert.ok(files.has(`package/${entry.replace(/^\.\//u, '')}`), `Missing entry: ${entry}`);
  }
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]) {
    for (const [name, range] of Object.entries(packed[field] ?? {})) {
      assert.ok(!/^(workspace:|link:|file:)/u.test(range), `${name}: unresolved ${range}`);
      const local = packages.find((item) => item.manifest.name === name);
      if (local && source[field]?.[name] === 'workspace:^')
        assert.equal(range, `^${local.manifest.version}`);
    }
  }
  const readme = await read('README.md');
  for (const match of readme.matchAll(/\]\(([^)]+)\)/gu)) {
    if (/^(https?:|#)/u.test(match[1])) continue;
    assert.ok(files.has(`package/${match[1]}`), `Broken README link: ${match[1]}`);
  }
  for (const file of files)
    assert.ok(
      /^package\/(?:dist\/|src\/|package.json$|README.md$|LICENSE$)/u.test(file),
      `Unexpected file: ${file}`,
    );
  console.log(`${packed.name}: public metadata, entries, MIT, links and dependency ranges checked`);
}

const packages = await workspacePackages();
const names = new Set(packages.map((item) => item.manifest.name));
const dependencies = {};
for (const { directory, manifest } of packages) {
  await runCommand('pnpm', ['clean'], { cwd: directory });
  await runCommand('pnpm', ['pack', '--pack-destination', tarballs], { cwd: directory });
  const filename = `${manifest.name.replace(/^@/u, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
  await verifyTarball(join(tarballs, filename), manifest);
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
