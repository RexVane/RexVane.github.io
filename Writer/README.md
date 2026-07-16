# RexVane Writer

专用于 `RexVane/RexVane.github.io` 的 Windows 桌面写作程序。

## 使用流程

1. 运行 `release/RexVane-Writer-1.2.0-x64.exe`。
2. 选择中文或英文，填写标题、摘要和正文；正文里可以直接粘贴图片，会自动存入 `public/images/posts/<链接>/` 并插入 Markdown 引用。
3. 从下拉菜单选择标签，或直接输入新标签。
4. 发布时间无需手动设置：点击“提交到分支”时自动使用那一刻的北京时间（精确到分钟），重复提交会用最新时间覆盖。
5. 点击“保存”将 Markdown 写入博客工作副本。
6. 点击“提交到分支”，程序会创建 `post/...` 分支、commit 并 push。
7. 点击“打开 GitHub 合并页面”，由你创建 Pull Request 并合并到 `main`。
8. 合并后点击左下角同步按钮，程序会切回并更新本地 `main`。
9. 编辑已有文章时可点击“删除文章”：未发布的文章直接从本地移除；已发布的文章会推送 `delete/...` 分支，同样由你在 GitHub 合并后正式删除。

程序不会直接推送 `main`，也不会把与当前文章无关的文件加入 commit。

## 固定配置

博客工作副本：

```text
C:\Users\guica\RexVane.github.io
```

远程仓库：

```text
https://github.com/RexVane/RexVane.github.io
```

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
npm run dist
```
