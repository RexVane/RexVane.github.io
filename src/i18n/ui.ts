export const languages = {
  zh: '中文',
  en: 'English',
};

export const defaultLang = 'zh';

export const ui = {
  zh: {
    'nav.home': '首页',
    'nav.blog': '博客',
    'nav.about': '关于',
    'blog.readMore': '阅读全文',
    'blog.publishedOn': '发布于',
    'blog.tags': '标签',
  },
  en: {
    'nav.home': 'Home',
    'nav.blog': 'Blog',
    'nav.about': 'About',
    'blog.readMore': 'Read more',
    'blog.publishedOn': 'Published on',
    'blog.tags': 'Tags',
  },
} as const;

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}
