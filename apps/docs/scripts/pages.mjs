const sources = [
  { source: 'docs/getting-started.md', path: 'guide/getting-started', text: '快速上手' },
  { source: 'docs/project-scope.md', path: 'guide/scope', text: '定位与边界' },
  { source: 'docs/client.md', path: 'reference/client', text: '客户端与 HTTP' },
  { source: 'docs/operations.md', path: 'reference/operations', text: '资源操作声明' },
  { source: 'docs/extensions.md', path: 'guide/extensions', text: '扩展选型' },
  ...['axios', 'mock', 'pinia'].map((name) => ({
    source: `extensions/${name}/README.md`,
    path: `extensions/${name}`,
    text: name === 'mock' ? 'HTTP Mock' : name === 'pinia' ? 'Pinia' : 'Axios',
  })),
];
export const packages = ['restmodel', 'axios', 'mock', 'pinia'];

const englishLabels = [
  'Getting started',
  'Scope and boundaries',
  'Client and HTTP',
  'Operation declarations',
  'Choosing extensions',
  'Axios',
  'HTTP Mock',
  'Pinia',
];
export const pages = sources.map((page, index) => ({
  ...page,
  enText: englishLabels[index],
  enSource: page.source.startsWith('extensions/')
    ? `docs/en/extensions/${page.source.split('/')[1]}.md`
    : page.source.replace('docs/', 'docs/en/'),
}));
export const locales = [
  {
    key: 'zh',
    prefix: 'zh/',
    lang: 'zh-CN',
    label: '简体中文',
    home: 'apps/docs/content/index.md',
  },
  { key: 'en', prefix: 'en/', lang: 'en', label: 'English', home: 'apps/docs/content/index.en.md' },
];
