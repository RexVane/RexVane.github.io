# Blog Writer

**本地写文章、一键上传到博客的桌面程序**（Windows / macOS）。

在本地编辑 Markdown 文章、实时预览，点击“提交到分支”即可自动 commit 并 push 到你博客仓库的独立分支，在 GitHub 上合并 Pull Request 后文章正式发布。程序不会直接推送 `main`，也不会把与当前文章无关的文件加入 commit。

## 功能

- 中英文文章，标题自动生成拼音链接，标签、分类、封面一应俱全
- Markdown 实时预览，正文可直接粘贴图片（自动存入博客图片目录）
- 一键提交发布分支，一键打开 GitHub 合并页面
- 删除文章同样走分支 + PR 流程，本地与线上同步删除
- 合并 PR 后一键同步本地 `main`

## 使用前提

1. 本地安装 git，并配置好对自己博客仓库的推送权限。
2. 博客是 GitHub 仓库（如 GitHub Pages），文章为 Astro 内容集合结构：`src/content/blog/<语言>/*.md`，图片在 `public/images/`。
3. 把博客克隆到本地作为工作副本。程序按以下顺序定位它：
   - 配置文件 `writer-config.json` 中的 `repoPath`（Windows: `%APPDATA%\blog-writer\`，macOS: `~/Library/Application Support/blog-writer/`）；
   - 未配置时，自动探测用户主目录下的 `*.github.io` 文件夹。
4. 程序界面显示的仓库名和所有 GitHub 链接都来自你自己仓库的 `origin` 远程地址，不绑定任何固定账号。

## 使用流程

1. 从 [Releases](../../releases) 下载对应系统的版本（macOS 首次打开需右键 → 打开）。
2. 选择中文或英文，填写标题、摘要和正文；正文里可以直接粘贴图片。
3. 从下拉菜单选择标签，或直接输入新标签。
4. 发布时间无需手动设置：点击“提交到分支”时自动使用那一刻的北京时间（精确到分钟），重复提交会用最新时间覆盖。
5. 点击“保存”将 Markdown 写入博客工作副本。
6. 点击“提交到分支”，程序会创建 `post/...` 分支、commit 并 push。
7. 点击“打开 GitHub 合并页面”，由你创建 Pull Request 并合并到 `main`。
8. 合并后点击左下角同步按钮，程序会切回并更新本地 `main`。
9. 编辑已有文章时可点击“删除文章”：未发布的文章直接从本地移除；已发布的文章会推送 `delete/...` 分支，同样由你在 GitHub 合并后正式删除。

## 开发

```powershell
npm install
npm run dev
```

验证：

```powershell
npm test
npm run test:e2e
```

重新打包：

```powershell
npm run dist       # Windows（本机）
npm run dist:mac   # macOS（需要在 Mac 上执行）
```

发布 Windows + macOS 安装包：推送 `writer-v*` 标签（如 `writer-v1.3.0`），GitHub Actions 会在云端两个系统上构建并自动发布到 Releases。
