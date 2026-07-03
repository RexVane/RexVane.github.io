# My Blog

基于 Astro 的中英双语个人博客。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:4321

## 项目结构

```
src/
├── content/blog/
│   ├── zh/          # 中文文章 (Markdown)
│   └── en/          # 英文文章 (Markdown)
├── i18n/            # 国际化配置
├── layouts/         # 布局组件
├── pages/
│   ├── index.astro        # 中文首页
│   ├── blog/[...slug].astro  # 中文文章页
│   └── en/                # 英文页面
│       ├── index.astro
│       └── blog/[...slug].astro
└── components/      # 你的自定义组件
```

## 部署

推送到 GitHub 的 main 分支，GitHub Actions 会自动构建并部署到 GitHub Pages。

记得在 `astro.config.mjs` 中把 `site` 改成你自己的域名。
