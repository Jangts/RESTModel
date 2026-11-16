import DefaultTheme from 'vitepress/theme';
import './style.css';
export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', (event) => {
      const link = (event.target as Element)?.closest?.('a');
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const locale = /\/(zh|en)\//.exec(url.pathname)?.[1];
      if (locale) {
        try {
          localStorage.setItem('restmodel-docs-language', locale);
        } catch {}
      }
    });
  },
};
