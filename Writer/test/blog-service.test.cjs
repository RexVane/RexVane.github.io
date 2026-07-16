const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
  BlogService,
  WriterError,
  parseMarkdown,
  serializeArticle,
  toPublishIso,
} = require('../electron/blog-service.cjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

async function createRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-writer-'));
  const repo = path.join(root, 'blog');
  const remote = path.join(root, 'remote.git');
  await fs.mkdir(path.join(repo, 'src', 'content', 'blog', 'zh'), { recursive: true });
  await fs.mkdir(path.join(repo, 'src', 'content', 'blog', 'en'), { recursive: true });
  await fs.mkdir(path.join(repo, 'public'), { recursive: true });
  await fs.writeFile(path.join(repo, 'README.md'), '# Test Blog\n');
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Writer Test']);
  git(repo, ['config', 'user.email', 'writer@example.com']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'Initial blog']);
  git(root, ['init', '--bare', remote]);
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '-u', 'origin', 'main']);
  return { root, repo, remote, service: new BlogService({ repoPath: repo, owner: 'tester', repository: 'tester.github.io', strictRemote: false }) };
}

async function removeRepository(root) {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function articleInput(overrides = {}) {
  return {
    title: '前端工程实践',
    description: '记录前端工程中的实际经验',
    slug: 'frontend-practice',
    language: 'zh',
    category: 'Blog',
    subcategory: 'Technology',
    tags: ['前端', '工程'],
    pubDate: '2026-07-15T22:30',
    heroImage: '',
    draft: false,
    body: '这里是正文。\n\n## 第一节\n\n具体内容。',
    originalPath: '',
    ...overrides,
  };
}

test('converts a China local minute to an explicit +08:00 timestamp', () => {
  assert.equal(toPublishIso('2026-07-15T22:30'), '2026-07-15T22:30:00+08:00');
  assert.throws(() => toPublishIso('2026/07/15 22:30'), WriterError);
});

test('serializes valid Astro frontmatter without duplicating the title heading', () => {
  const source = serializeArticle({
    ...articleInput(),
    pubDate: '2026-07-15T22:30:00+08:00',
  });
  const parsed = parseMarkdown(source);
  assert.equal(parsed.data.title, '前端工程实践');
  assert.equal(parsed.data.category, 'Blog');
  assert.equal(parsed.data.subcategory, 'Technology');
  assert.deepEqual(parsed.data.tags, ['前端', '工程']);
  assert.match(String(parsed.data.pubDate), /2026-07-15T22:30:00\+08:00/);
  assert.ok(parsed.content.trimStart().startsWith('这里是正文。'));
  assert.ok(!parsed.content.trimStart().startsWith('# 前端工程实践'));
});

test('parses GitHub-authored CRLF frontmatter with an inline tag array', () => {
  const source = [
    '---',
    "title: '前端个人见解'",
    "description: '对前端的一些知识的个人见解'",
    'pubDate: 2026-07-15',
    "category: 'Blog'",
    "subcategory: 'Technology'",
    "tags: ['技术']",
    '---',
    '',
  ].join('\r\n');
  const parsed = parseMarkdown(source);
  assert.equal(parsed.data.title, '前端个人见解');
  assert.deepEqual(parsed.data.tags, ['技术']);
  assert.equal(parsed.content.trim(), '');
});

test('saves and reloads an article with existing tags', async () => {
  const fixture = await createRepository();
  try {
    const result = await fixture.service.saveArticle(articleInput());
    assert.equal(result.relativePath, 'src/content/blog/zh/frontend-practice.md');
    const saved = await fs.readFile(path.join(fixture.repo, ...result.relativePath.split('/')), 'utf8');
    const parsed = parseMarkdown(saved);
    assert.equal(parsed.data.pubDate, '2026-07-15T22:30:00+08:00');

    const initial = await fixture.service.getInitialData();
    assert.equal(initial.articles.length, 1);
    assert.equal(initial.articles[0].slug, 'frontend-practice');
    assert.deepEqual(initial.tags, ['工程', '前端']);
    assert.equal(initial.repository.clean, false);
  } finally {
    await removeRepository(fixture.root);
  }
});

test('publishes only the article to a post branch and pushes it', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    const result = await fixture.service.publishArticle({
      articlePath: saved.relativePath,
      originalPath: '',
      heroImage: '',
      slug: 'frontend-practice',
      commitMessage: 'Add post: frontend practice',
    });
    assert.match(result.branch, /^post\/frontend-practice-/);
    assert.match(result.compareUrl, /compare\/main\.\.\.post%2Ffrontend-practice-/);
    assert.equal(result.repository.clean, true);
    const remoteBranches = git(fixture.repo, ['ls-remote', '--heads', 'origin', result.branch]);
    assert.match(remoteBranches, new RegExp(`refs/heads/${result.branch}$`));
    const committed = git(fixture.repo, ['show', '--name-only', '--format=', 'HEAD']);
    assert.equal(committed, 'src/content/blog/zh/frontend-practice.md');
  } finally {
    await removeRepository(fixture.root);
  }
});

test('blocks publishing when unrelated files are modified', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    await fs.writeFile(path.join(fixture.repo, 'README.md'), '# Changed\n');
    await assert.rejects(
      fixture.service.publishArticle({
        articlePath: saved.relativePath,
        slug: 'frontend-practice',
      }),
      (error) => error.code === 'UNRELATED_CHANGES' && error.details.includes('README.md'),
    );
    assert.equal(git(fixture.repo, ['branch', '--show-current']), 'main');
  } finally {
    await removeRepository(fixture.root);
  }
});

test('replacing a cover removes the stale untracked file and publishing allows the cover directory', async () => {
  const fixture = await createRepository();
  try {
    const sourceDir = path.join(fixture.root, 'pictures');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'first.png'), 'png-1');
    await fs.writeFile(path.join(sourceDir, 'second.png'), 'png-2');

    const first = await fixture.service.copyCover(path.join(sourceDir, 'first.png'), 'frontend-practice');
    const second = await fixture.service.copyCover(path.join(sourceDir, 'second.png'), 'frontend-practice', first);
    assert.equal(first, '/images/posts/frontend-practice/first.png');
    assert.equal(second, '/images/posts/frontend-practice/second.png');
    await assert.rejects(fs.access(path.join(fixture.repo, 'public', 'images', 'posts', 'frontend-practice', 'first.png')));

    // 即便有残留的未跟踪封面，也不该阻塞发布：整个封面目录都属于本文允许范围。
    await fs.writeFile(path.join(fixture.repo, 'public', 'images', 'posts', 'frontend-practice', 'stray.png'), 'png-x');
    const saved = await fixture.service.saveArticle(articleInput({ heroImage: second }));
    const result = await fixture.service.publishArticle({
      articlePath: saved.relativePath,
      heroImage: second,
      slug: 'frontend-practice',
    });
    assert.equal(result.repository.clean, true);
    const committed = git(fixture.repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').sort();
    assert.deepEqual(committed, [
      'public/images/posts/frontend-practice/second.png',
      'public/images/posts/frontend-practice/stray.png',
      'src/content/blog/zh/frontend-practice.md',
    ]);
  } finally {
    await removeRepository(fixture.root);
  }
});

test('recovers from a failed push by retrying on the existing post branch', async () => {
  const fixture = await createRepository();
  try {
    const hookPath = path.join(fixture.remote, 'hooks', 'pre-receive');
    await fs.writeFile(hookPath, '#!/bin/sh\nexit 1\n');
    await fs.chmod(hookPath, 0o755);

    const saved = await fixture.service.saveArticle(articleInput());
    await assert.rejects(
      fixture.service.publishArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'PUSH_FAILED',
    );
    const branch = git(fixture.repo, ['branch', '--show-current']);
    assert.match(branch, /^post\/frontend-practice-/);
    assert.equal(git(fixture.repo, ['status', '--porcelain']), '');

    await fs.rm(hookPath);
    const result = await fixture.service.publishArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' });
    assert.equal(result.branch, branch);
    const remoteBranches = git(fixture.repo, ['ls-remote', '--heads', 'origin', branch]);
    assert.match(remoteBranches, new RegExp(`refs/heads/${branch}$`));
  } finally {
    await removeRepository(fixture.root);
  }
});

test('rolls back to the original branch when nothing can be staged', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    git(fixture.repo, ['add', '--all']);
    git(fixture.repo, ['commit', '-m', 'Local commit outside the writer']);
    git(fixture.repo, ['push', 'origin', 'main:main']);
    git(fixture.repo, ['fetch', 'origin', 'main']);
    await assert.rejects(
      fixture.service.publishArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'NO_CHANGES',
    );
    assert.equal(git(fixture.repo, ['branch', '--show-current']), 'main');
    assert.equal(git(fixture.repo, ['branch', '--list', 'post/*']), '');
  } finally {
    await removeRepository(fixture.root);
  }
});

test('deletes an unpublished article locally without touching git', async () => {
  const fixture = await createRepository();
  try {
    const sourceDir = path.join(fixture.root, 'pictures');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'cover.png'), 'png');
    const saved = await fixture.service.saveArticle(articleInput());
    const cover = await fixture.service.copyCover(path.join(sourceDir, 'cover.png'), 'frontend-practice');

    const result = await fixture.service.deleteArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' });
    assert.equal(result.remote, false);
    assert.equal(result.repository.clean, true);
    await assert.rejects(fs.access(path.join(fixture.repo, ...saved.relativePath.split('/'))));
    await assert.rejects(fs.access(path.join(fixture.repo, 'public', cover.replace(/^\//, ''))));
    assert.equal(git(fixture.repo, ['branch', '--list', 'delete/*']), '');
  } finally {
    await removeRepository(fixture.root);
  }
});

test('deletes a published article through a delete branch without touching main', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    const published = await fixture.service.publishArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' });
    // 模拟在 GitHub 合并 PR：post 分支进入 main，然后同步。
    git(fixture.repo, ['push', 'origin', `${published.branch}:main`]);
    await fixture.service.syncMain();
    const mainBefore = git(fixture.repo, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];

    const result = await fixture.service.deleteArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' });
    assert.equal(result.remote, true);
    assert.match(result.branch, /^delete\/frontend-practice-/);
    assert.equal(result.repository.clean, true);
    await assert.rejects(fs.access(path.join(fixture.repo, ...saved.relativePath.split('/'))));
    const remoteBranches = git(fixture.repo, ['ls-remote', '--heads', 'origin', result.branch]);
    assert.match(remoteBranches, new RegExp(`refs/heads/${result.branch.replace('/', '\\/')}$`));
    const committed = git(fixture.repo, ['show', '--name-status', '--format=', 'HEAD']);
    assert.match(committed, /^D\s+src\/content\/blog\/zh\/frontend-practice\.md$/m);
    // main 保持不变，正式删除由用户在 GitHub 合并。
    assert.equal(git(fixture.repo, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], mainBefore);
  } finally {
    await removeRepository(fixture.root);
  }
});

test('blocks deleting an article that is only on a pending post branch', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    await fixture.service.publishArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' });
    await assert.rejects(
      fixture.service.deleteArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'ARTICLE_ON_PENDING_BRANCH',
    );
    await fs.access(path.join(fixture.repo, ...saved.relativePath.split('/')));
  } finally {
    await removeRepository(fixture.root);
  }
});

test('blocks deleting when unrelated files are modified', async () => {
  const fixture = await createRepository();
  try {
    const saved = await fixture.service.saveArticle(articleInput());
    await fs.writeFile(path.join(fixture.repo, 'README.md'), '# Changed\n');
    await assert.rejects(
      fixture.service.deleteArticle({ articlePath: saved.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'UNRELATED_CHANGES' && error.details.includes('README.md'),
    );
  } finally {
    await removeRepository(fixture.root);
  }
});

test('saves pasted image bytes under the article image directory with unique names', async () => {
  const fixture = await createRepository();
  try {
    const data = new Uint8Array([137, 80, 78, 71]);
    const first = await fixture.service.pasteImage({ slug: 'frontend-practice', extension: '.png', data });
    const second = await fixture.service.pasteImage({ slug: 'frontend-practice', extension: '.png', data });
    assert.match(first, /^\/images\/posts\/frontend-practice\/pasted-\d{12}\.png$/);
    assert.notEqual(first, second);
    const saved = await fs.readFile(path.join(fixture.repo, 'public', first.replace(/^\//, '')));
    assert.deepEqual([...saved], [137, 80, 78, 71]);
    await assert.rejects(
      fixture.service.pasteImage({ slug: 'frontend-practice', extension: '.txt', data }),
      (error) => error.code === 'INVALID_IMAGE',
    );
    await assert.rejects(
      fixture.service.pasteImage({ slug: 'frontend-practice', extension: '.png', data: new Uint8Array() }),
      (error) => error.code === 'EMPTY_IMAGE',
    );
  } finally {
    await removeRepository(fixture.root);
  }
});

test('blocks blank and draft articles from publishing', async () => {
  const blankFixture = await createRepository();
  try {
    const blank = await blankFixture.service.saveArticle(articleInput({ body: '' }));
    await assert.rejects(
      blankFixture.service.publishArticle({ articlePath: blank.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'EMPTY_ARTICLE',
    );
  } finally {
    await removeRepository(blankFixture.root);
  }

  const draftFixture = await createRepository();
  try {
    const draft = await draftFixture.service.saveArticle(articleInput({ draft: true }));
    await assert.rejects(
      draftFixture.service.publishArticle({ articlePath: draft.relativePath, slug: 'frontend-practice' }),
      (error) => error.code === 'ARTICLE_IS_DRAFT',
    );
  } finally {
    await removeRepository(draftFixture.root);
  }
});
