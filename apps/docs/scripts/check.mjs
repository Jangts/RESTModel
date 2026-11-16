import { readFile, access } from 'node:fs/promises';
import { pages, packages, locales } from './pages.mjs';
const output = new URL('../.generated/', import.meta.url);
for (const locale of locales) {
  await access(new URL(`${locale.prefix}index.md`, output));
  for (const page of pages) {
    const content = await readFile(new URL(`${locale.prefix}${page.path}.md`, output), 'utf8');
    if (locale.key === 'en' && /[\p{Script=Han}]/u.test(content))
      throw new Error(`Untranslated English page: ${page.path}`);
  }
}
for (const name of packages) {
  const location = name === 'restmodel' ? 'packages/restmodel' : `extensions/${name}`;
  const ts = (await import('typescript')).default;
  const entry = new URL(`../../../${location}/src/index.ts`, import.meta.url);
  const program = ts.createProgram([entry.pathname], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const checker = program.getTypeChecker();
  const symbols = checker.getExportsOfModule(
    checker.getSymbolAtLocation(program.getSourceFile(entry.pathname)),
  );
  for (const locale of locales) {
    const page = await readFile(new URL(`${locale.prefix}api/${name}.md`, output), 'utf8');
    if (locale.key === 'en' && /[\p{Script=Han}]/u.test(page))
      throw new Error(`Untranslated English API: ${name}`);
    for (const symbol of symbols)
      if (!page.includes(`## ${symbol.name}\n`))
        throw new Error(`Missing API: ${locale.key}/${name}/${symbol.name}`);
  }
}
for (const asset of ['restmodel-logo.svg', 'restmodel-icon.svg'])
  await access(new URL(`public/branding/${asset}`, output));
console.log('Documentation pages, branding and public export coverage checked.');
