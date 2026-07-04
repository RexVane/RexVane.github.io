export const languages = {
  zh: '中文',
  en: 'English',
};

export const defaultLang = 'zh';

export const ui = {
  zh: {
    'site.title': "RexVane's Blog",
    'site.description': 'RexVane 的个人博客：技术、项目与生活记录',
    'post.toc': '目录',
    'post.updated': '更新于',
    'list.empty': '暂无文章',
    'search.title': '搜索',
    'search.close': '关闭',
    'search.devHint': '搜索索引仅在生产构建中可用，请运行 npm run build 后预览。',
  },
  en: {
    'site.title': "RexVane's Blog",
    'site.description': "RexVane's personal blog: tech, projects and everyday life.",
    'post.toc': 'On this page',
    'post.updated': 'Updated on',
    'list.empty': 'No posts yet.',
    'search.title': 'Search',
    'search.close': 'Close',
    'search.devHint': 'Search index is only available in production builds. Run npm run build to preview.',
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
