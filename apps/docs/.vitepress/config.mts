import { defineConfig } from 'vitepress';
import { pages, packages, locales } from '../scripts/pages.mjs';

const base = process.env.DOCS_BASE || '/';
const origin = process.env.DOCS_ORIGIN || 'https://restmodel-docs.pages.jangts.cafe';
const labels = {
  zh: [
    '指南',
    '参考',
    '开始使用',
    '核心参考',
    '扩展',
    '公开 API',
    '本页内容',
    '上一篇',
    '下一篇',
    '回到顶部',
    '目录',
    '切换主题',
    '面向 RESTful API 的模型化 HTTP 客户端',
  ],
  en: [
    'Guide',
    'Reference',
    'Get started',
    'Core reference',
    'Extensions',
    'Public API',
    'On this page',
    'Previous',
    'Next',
    'Back to top',
    'Menu',
    'Toggle theme',
    'A model-based HTTP client for RESTful APIs',
  ],
};
function themeFor(locale) {
  const t = labels[locale.key];
  const link = (route) => `/${locale.prefix}${route}`;
  return {
    nav: [
      { text: t[0], link: link('guide/getting-started') },
      { text: t[1], link: link('reference/client') },
      { text: 'API', link: link('api/restmodel') },
    ],
    sidebar: [
      ...['guide/', 'reference/', 'extensions/'].map((prefix, index) => ({
        text: t[index + 2],
        items: pages
          .filter((page) => page.path.startsWith(prefix))
          .map((page) => ({
            text: locale.key === 'en' ? page.enText : page.text,
            link: link(page.path),
          })),
      })),
      {
        text: t[5],
        items: packages.map((name) => ({ text: `@restmodel/${name}`, link: link(`api/${name}`) })),
      },
    ],
    outline: { label: t[6], level: [2, 3] },
    docFooter: { prev: t[7], next: t[8] },
    returnToTopLabel: t[9],
    sidebarMenuLabel: t[10],
    darkModeSwitchLabel: t[11],
    footer: { message: t[12], copyright: 'MIT © 2026 Ivan, Yang Chi' },
    search: {
      provider: 'local',
      options: {
        translations:
          locale.key === 'en'
            ? {}
            : {
                button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
                modal: {
                  displayDetails: '显示详细结果',
                  resetButtonTitle: '清除搜索',
                  backButtonTitle: '返回',
                  noResultsText: '没有找到相关结果',
                  footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
                },
              },
      },
    },
  };
}
const autoLanguage = `(() => {
  if (location.pathname !== ${JSON.stringify(base)}) return;
  let selected;
  try { selected = localStorage.getItem('restmodel-docs-language'); } catch {}
  const lang = selected === 'zh' || selected === 'en' ? selected : (/^zh\\b/i.test(navigator.language || '') ? 'zh' : 'en');
  location.replace(${JSON.stringify(base)} + lang + '/' + location.search + location.hash);
})();`;
export default defineConfig({
  lang: 'en',
  title: 'RESTModel',
  description: labels.en[12],
  srcDir: '.generated',
  outDir: 'dist',
  cleanUrls: false,
  base,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}branding/restmodel-icon.svg` }],
    ['script', {}, autoLanguage],
  ],
  sitemap: { hostname: origin + base },
  transformHead({ pageData }) {
    const relative = pageData.relativePath.replace(/^(zh|en)\//, '');
    const route = relative.replace(/index\.md$/, '').replace(/\.md$/, '.html');
    const current =
      pageData.relativePath === 'index.md'
        ? 'en/'
        : pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '.html');
    return [
      ['link', { rel: 'canonical', href: origin + base + current }],
      ...locales.map((locale) => [
        'link',
        { rel: 'alternate', hreflang: locale.lang, href: origin + base + locale.prefix + route },
      ]),
      ['link', { rel: 'alternate', hreflang: 'x-default', href: origin + base + 'en/' + route }],
    ];
  },
  locales: Object.fromEntries(
    locales.map((locale) => [
      locale.key,
      {
        label: locale.label,
        lang: locale.lang,
        link: `/${locale.prefix}`,
        title: 'RESTModel',
        description: labels[locale.key][12],
        themeConfig: themeFor(locale),
      },
    ]),
  ),
  themeConfig: {
    logo: '/branding/restmodel-icon.svg',
    siteTitle: 'RESTModel',
    ...themeFor(locales[1]),
  },
});
