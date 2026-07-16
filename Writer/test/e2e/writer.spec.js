import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..', '..');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

test('writes and saves a blog article through the desktop UI', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rexvane-writer-e2e-'));
  const repo = path.join(root, 'blog');
  await fs.mkdir(path.join(repo, 'src', 'content', 'blog', 'zh'), { recursive: true });
  await fs.mkdir(path.join(repo, 'src', 'content', 'blog', 'en'), { recursive: true });
  await fs.mkdir(path.join(repo, 'public'), { recursive: true });
  await fs.writeFile(path.join(repo, 'README.md'), '# Test\n');
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Writer E2E']);
  git(repo, ['config', 'user.email', 'writer-e2e@example.com']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'Initial']);
  const initialMain = git(repo, ['rev-parse', 'HEAD']);
  const remote = path.join(root, 'remote.git');
  git(root, ['init', '--bare', remote]);
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '-u', 'origin', 'main']);

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      WRITER_E2E: '1',
      WRITER_REPO_PATH: repo,
      WRITER_USER_DATA_PATH: path.join(root, 'user-data'),
    },
  });

  try {
    const window = await electronApp.firstWindow();
    await expect(window.locator('#loading-overlay')).toHaveClass(/ready/);
    await window.locator('#title-input').fill('Electron 写作体验');
    await expect(window.locator('#slug-input')).toHaveValue('electron-xie-zuo-ti-yan');
    await window.locator('#description-input').fill('使用桌面工具完成博客文章编辑与发布。');
    await window.locator('#tag-dropdown-button').click();
    await window.locator('#tag-search-input').fill('桌面工具');
    await window.locator('#add-tag-button').click();
    await expect(window.locator('#selected-tags .tag-chip')).toHaveText(['#桌面工具']);
    await expect(window.locator('#pub-date-input')).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await window.locator('#body-input').fill('这是正文。\n\n## 使用体验\n\n写作和预览可以同时进行。');
    await expect(window.locator('#preview-content')).toContainText('写作和预览可以同时进行。');

    // 正文粘贴图片：合成一个带 PNG 文件的 paste 事件，应写入图片目录并插入 Markdown。
    await window.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'shot.png', { type: 'image/png' }));
      document.getElementById('body-input').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    });
    await expect(window.locator('#body-input')).toHaveValue(/!\[图片\]\(\/images\/posts\/electron-xie-zuo-ti-yan\/pasted-\d+\.png\)/);
    await fs.access(path.join(repo, 'public', 'images', 'posts', 'electron-xie-zuo-ti-yan'));
    await window.locator('#save-button').click();
    await expect(window.locator('#save-indicator')).toHaveText('已保存');
    await expect(window.locator('#save-button')).toBeEnabled();
    await expect(window.locator('#save-button')).toContainText('保存');
    await expect(window.locator('#article-count')).toHaveText('1');

    const articlePath = path.join(repo, 'src', 'content', 'blog', 'zh', 'electron-xie-zuo-ti-yan.md');
    const article = await fs.readFile(articlePath, 'utf8');
    expect(article).toContain("subcategory: 'Technology'");
    expect(article).toContain("pubDate: '20");
    expect(article).toContain('桌面工具');
    expect(article).toContain('写作和预览可以同时进行。');
    expect(article.trimEnd()).toMatch(/!\[图片\]\(\/images\/posts\/electron-xie-zuo-ti-yan\/pasted-\d+\.png\)$/);

    await fs.mkdir(path.join(appRoot, 'artifacts'), { recursive: true });
    await window.screenshot({ path: path.join(appRoot, 'artifacts', 'writer-e2e.png') });

    await window.locator('#publish-button').click();
    await expect(window.locator('#publish-modal')).toBeVisible();
    await window.locator('#confirm-publish-button').click();
    await expect(window.locator('#success-modal')).toBeVisible({ timeout: 20_000 });
    await expect(window.locator('#success-branch')).toHaveText(/^post\/electron-xie-zuo-ti-yan-/);
    const branch = await window.locator('#success-branch').textContent();
    expect(git(repo, ['ls-remote', '--heads', 'origin', branch])).toContain(`refs/heads/${branch}`);
    expect(git(repo, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0]).toBe(initialMain);
    await window.screenshot({ path: path.join(appRoot, 'artifacts', 'writer-success.png') });
    await window.locator('#success-modal [data-close-modal]').click();

    // 应用内确认弹窗：有未保存改动时新建文章先询问，取消保留内容，确认后清空表单。
    await window.locator('#title-input').fill('Electron 写作体验（改动）');
    await window.locator('#new-article-button').click();
    await expect(window.locator('#confirm-modal')).toBeVisible();
    await window.locator('#confirm-modal .command-button.secondary').click();
    await expect(window.locator('#confirm-modal')).toBeHidden();
    await expect(window.locator('#title-input')).toHaveValue('Electron 写作体验（改动）');
    await window.locator('#new-article-button').click();
    await window.locator('#confirm-accept-button').click();
    await expect(window.locator('#title-input')).toHaveValue('');

    // 删除文章：模拟 PR 已合并（post 分支进 main），同步后从 UI 删除，推送 delete 分支。
    git(repo, ['push', 'origin', `${branch}:main`]);
    await window.locator('#sync-main-button').click();
    await expect(window.locator('#article-count')).toHaveText('1');
    await window.locator('.article-item').first().click();
    await expect(window.locator('#delete-button')).toBeVisible();
    await window.locator('#delete-button').click();
    await expect(window.locator('#confirm-modal')).toBeVisible();
    await window.locator('#confirm-accept-button').click();
    await expect(window.locator('#success-modal')).toBeVisible({ timeout: 20_000 });
    await expect(window.locator('#success-modal-title')).toHaveText('删除分支已推送');
    const deleteBranch = await window.locator('#success-branch').textContent();
    expect(deleteBranch).toMatch(/^delete\/electron-xie-zuo-ti-yan-/);
    expect(git(repo, ['ls-remote', '--heads', 'origin', deleteBranch])).toContain(`refs/heads/${deleteBranch}`);
    await window.locator('#success-modal [data-close-modal]').click();
    await expect(window.locator('#article-count')).toHaveText('0');
  } finally {
    await electronApp.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
