import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { apiDescriptions } from './api-descriptions.mjs';
import { pages, packages, locales } from './pages.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'apps/docs/.generated');
const write = async (name, value) => {
  const file = path.join(output, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
};
await rm(output, { recursive: true, force: true });
for (const locale of locales) {
  const routes = new Map(
    pages.map((page) => [
      locale.key === 'en' ? page.enSource : page.source,
      `/${locale.prefix}${page.path}.md`,
    ]),
  );
  for (const name of packages) {
    const location = name === 'restmodel' ? 'packages/restmodel' : `extensions/${name}`;
    routes.set(`${location}/LICENSE`, '/LICENSE.txt');
  }
  for (const page of pages) {
    const pageSource = locale.key === 'en' ? page.enSource : page.source;
    let content = await readFile(path.join(root, pageSource), 'utf8');
    content = content.replace(/\]\(([^)]+)\)/g, (match, target) => {
      if (/^(https?:|#)/.test(target)) return match;
      const [file, anchor = ''] = target.split('#');
      const source = path.posix.normalize(path.posix.join(path.posix.dirname(pageSource), file));
      if (!routes.has(source)) throw new Error(`Unmapped link: ${pageSource} -> ${target}`);
      return `](${routes.get(source)}${anchor ? `#${anchor}` : ''})`;
    });
    await write(`${locale.prefix}${page.path}.md`, content);
  }
  const home = await readFile(path.join(root, locale.home), 'utf8');
  await write(
    `${locale.prefix}index.md`,
    locale.key === 'zh'
      ? home
          .replaceAll('link: /guide/', 'link: /zh/guide/')
          .replaceAll('link: /api/', 'link: /zh/api/')
          .replaceAll('](/guide/', '](/zh/guide/')
      : home,
  );
}
await write(
  'index.md',
  '---\nlayout: page\nsidebar: false\n---\n\n[简体中文](./zh/) · [English](./en/)\n',
);
for (const name of ['restmodel-logo.svg', 'restmodel-icon.svg']) {
  await mkdir(path.join(output, 'public/branding'), { recursive: true });
  await copyFile(
    path.join(root, 'docs/assets/branding', name),
    path.join(output, 'public/branding', name),
  );
}
await copyFile(path.join(root, 'LICENSE'), path.join(output, 'public/LICENSE.txt'));
const entries = packages.map((name) =>
  path.join(
    root,
    name === 'restmodel' ? 'packages/restmodel/src/index.ts' : `extensions/${name}/src/index.ts`,
  ),
);
const program = ts.createProgram(entries, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();
for (const locale of locales) {
  for (const [index, entry] of entries.entries()) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(entry));
    const exports = checker.getExportsOfModule(module);
    const intro =
      locale.key === 'en'
        ? 'Symbol index generated from the public entry. See the [client reference](/en/reference/client) and [operation declarations](/en/reference/operations) for parameters, defaults and behavior. Types do not replace runtime validation.'
        : '由公开入口自动生成的符号索引。函数参数、默认值和行为边界见[客户端参考](/zh/reference/client)与[操作声明](/zh/reference/operations)。类型不替代运行时响应校验。';
    let content = `# @restmodel/${packages[index]} API\n\n${intro}\n\n`;
    for (const exported of exports) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declaration = symbol.declarations?.[0];
      const type = declaration && checker.getTypeOfSymbolAtLocation(symbol, declaration);
      const signature =
        type && checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation);
      const comment =
        locale.key === 'en'
          ? apiDescriptions[exported.name]
          : ts.displayPartsToString(symbol.getDocumentationComment(checker));
      if (locale.key === 'en' && !comment)
        throw new Error(`Missing English API description: ${exported.name}`);
      content += `## ${exported.name}\n\n${comment ? `${comment}\n\n` : ''}`;
      if (signature && signature !== 'any')
        content += `\`\`\`ts\n${exported.name}: ${signature}\n\`\`\`\n\n`;
      else if (declaration)
        content += `\`\`\`ts\n${declaration
          .getText()
          .replace(/^export /, '')
          .replace(/\/\*\*[\s\S]*?\*\//g, '')}\n\`\`\`\n\n`;
    }
    await write(`${locale.prefix}api/${packages[index]}.md`, content);
  }
}
console.log(
  `Generated ${locales.length * (pages.length + packages.length + 1)} documentation pages.`,
);
