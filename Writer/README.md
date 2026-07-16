# My Blog

基于 Astro 的中英双语个人博客。线上地址：https://rexvane.github.io

## 快速开始

```bash
npm install
npm run dev      # 开发模式 http://localhost:4321（站内搜索仅生产构建可用）
npm run build    # 构建 + 生成 Pagefind 搜索索引
npm run preview  # 本地预览构建产物
```

## 项目结构

```
src/
├── assets/            # 构建时优化的图片（头像等）
├── content/blog/
│   ├── zh/            # 中文文章 (Markdown)
│   └── en/            # 英文文章 (Markdown)
├── i18n/              # 界面文案翻译表
├── layouts/
│   ├── BaseLayout.astro   # 全站骨架 + SEO head（OG/canonical/hreflang）
│   └── PostLayout.astro   # 文章页（目录 / 标签 / 发布与更新日期）
├── components/
│   ├── Header.astro       # 导航（含移动端汉堡菜单）
│   ├── Scene3D.astro      # Three.js 3D 背景（空闲时懒加载、按需渲染）
│   ├── SearchModal.astro  # Pagefind 搜索弹窗（点放大镜或 Ctrl/Cmd+K）
│   ├── ListPage.astro     # 文章列表页共享骨架
│   └── ProjectsGrid.astro # GitHub 项目卡片（构建时拉取 + 客户端刷新）
└── pages/             # 路由（en/ 下为英文站，tags/ 为标签页）
```

## 写文章

在 `src/content/blog/zh/`（或 `en/`）下新建 `.md` 文件，frontmatter 字段：

- `title`、`description`、`pubDate` 必填
- `updatedDate`、`heroImage`、`draft` 可选
- `category`: Blog / Project / Daily Life / Journal
- `subcategory`: AI / Technology / Insight
- `tags`: 字符串数组，自动生成标签页

## 部署

推送到 GitHub 的 main 分支，GitHub Actions 会自动构建并部署到 GitHub Pages。
站点地址在 `astro.config.mjs` 的 `site` 字段配置。
