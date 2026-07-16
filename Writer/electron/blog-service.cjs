const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const matter = require('gray-matter');
const YAML = require('yaml');

const execFileAsync = promisify(execFile);

const LANGUAGES = new Set(['zh', 'en']);
const CATEGORIES = new Set(['Blog', 'Project', 'Daily Life', 'Journal']);
const SUBCATEGORIES = new Set(['AI', 'Technology', 'Insight']);
const ARTICLE_EXTENSIONS = new Set(['.md', '.mdx']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

class WriterError extends Error {
  constructor(message, code = 'WRITER_ERROR', details = undefined) {
    super(message);
    this.name = 'WriterError';
    this.code = code;
    this.details = details;
  }
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function splitNullList(value) {
  return value.split('\0').filter(Boolean).map(normalizePath);
}

function ensureInside(base, target, label = '路径') {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new WriterError(`${label}超出允许目录`, 'INVALID_PATH');
  }
  return resolvedTarget;
}

function parseMarkdown(source) {
  return matter(source, {
    engines: {
      yaml: (value) => YAML.parse(value.replace(/\r\n?/g, '\n')),
    },
  });
}

function getChinaLocalMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function dateForInput(value) {
  if (!value) return getChinaLocalMinute();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return value.slice(0, 16);
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? getChinaLocalMinute() : getChinaLocalMinute(parsed);
}

function toPublishIso(localMinute) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localMinute)) {
    throw new WriterError('发布时间格式无效', 'INVALID_DATE');
  }
  const parsed = new Date(`${localMinute}:00+08:00`);
  if (Number.isNaN(parsed.valueOf())) throw new WriterError('发布时间无效', 'INVALID_DATE');
  return `${localMinute}:00+08:00`;
}

function validateSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new WriterError('文章链接只能使用小写英文、数字和连字符', 'INVALID_SLUG');
  }
  return slug;
}

function sanitizeTag(value) {
  return String(value || '').trim().replace(/^#+/, '').slice(0, 30);
}

function validateArticle(input) {
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  if (!title || title.length > 120) throw new WriterError('标题不能为空且不能超过 120 个字符', 'INVALID_TITLE');
  if (!description || description.length > 240) throw new WriterError('摘要不能为空且不能超过 240 个字符', 'INVALID_DESCRIPTION');

  const language = String(input.language || 'zh');
  if (!LANGUAGES.has(language)) throw new WriterError('语言选项无效', 'INVALID_LANGUAGE');
  const category = String(input.category || 'Blog');
  if (!CATEGORIES.has(category)) throw new WriterError('主分类选项无效', 'INVALID_CATEGORY');

  const rawSubcategory = input.subcategory ? String(input.subcategory) : '';
  const subcategory = rawSubcategory && SUBCATEGORIES.has(rawSubcategory) ? rawSubcategory : undefined;
  if (rawSubcategory && !subcategory) throw new WriterError('子分类选项无效', 'INVALID_SUBCATEGORY');

  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map(sanitizeTag).filter(Boolean))];
  if (tags.length > 12) throw new WriterError('一篇文章最多选择 12 个标签', 'TOO_MANY_TAGS');

  const heroImage = String(input.heroImage || '').trim();
  if (heroImage && (!heroImage.startsWith('/images/') || heroImage.includes('..'))) {
    throw new WriterError('封面图片必须位于博客的 /images/ 目录', 'INVALID_HERO_IMAGE');
  }

  return {
    title,
    description,
    slug: validateSlug(input.slug),
    language,
    category,
    subcategory,
    tags,
    pubDate: toPublishIso(String(input.pubDate || '')),
    heroImage: heroImage || undefined,
    draft: Boolean(input.draft),
    body: String(input.body || '').replace(/\r\n/g, '\n').trim(),
  };
}

function serializeArticle(article) {
  const data = {
    title: article.title,
    description: article.description,
    pubDate: article.pubDate,
    category: article.category,
  };
  if (article.subcategory) data.subcategory = article.subcategory;
  data.tags = article.tags;
  if (article.heroImage) data.heroImage = article.heroImage;
  data.draft = article.draft;

  const document = new YAML.Document(data);
  for (const pair of document.contents.items) {
    const value = pair.value;
    if (YAML.isScalar(value) && typeof value.value === 'string') value.type = 'QUOTE_SINGLE';
    if (YAML.isSeq(value)) {
      for (const item of value.items) {
        if (YAML.isScalar(item) && typeof item.value === 'string') item.type = 'QUOTE_SINGLE';
      }
    }
  }
  const frontmatter = String(document).trimEnd();
  const body = article.body ? `\n\n${article.body}\n` : '\n';
  return `---\n${frontmatter}\n---${body}`;
}

async function listFilesRecursive(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return entry.isFile() ? [fullPath] : [];
  }));
  return nested.flat();
}

class BlogService {
  constructor({
    repoPath,
    owner = 'RexVane',
    repository = 'RexVane.github.io',
    strictRemote = true,
    now = () => new Date(),
  }) {
    this.repoPath = path.resolve(repoPath);
    this.contentRoot = path.join(this.repoPath, 'src', 'content', 'blog');
    this.publicRoot = path.join(this.repoPath, 'public');
    this.owner = owner;
    this.repository = repository;
    this.strictRemote = strictRemote;
    this.now = now;
  }

  async git(args, { allowFailure = false } = {}) {
    try {
      const result = await execFileAsync('git', args, {
        cwd: this.repoPath,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });
      return result.stdout.trim();
    } catch (error) {
      if (allowFailure) return '';
      const detail = String(error.stderr || error.message || '').trim();
      throw new WriterError(detail || 'Git 操作失败', 'GIT_ERROR');
    }
  }

  async assertRepository() {
    const root = await this.git(['rev-parse', '--show-toplevel']);
    // macOS 的临时目录经由符号链接（/var -> /private/var），必须先解析真实路径再比较。
    const [resolvedRoot, resolvedRepo] = await Promise.all([
      fs.realpath(path.resolve(root)).catch(() => path.resolve(root)),
      fs.realpath(this.repoPath).catch(() => this.repoPath),
    ]);
    if (resolvedRoot.toLowerCase() !== resolvedRepo.toLowerCase()) {
      throw new WriterError('博客仓库路径不正确', 'INVALID_REPOSITORY');
    }
    if (this.strictRemote) {
      const remote = await this.git(['remote', 'get-url', 'origin']);
      const normalized = remote.toLowerCase();
      if (!normalized.includes(`${this.owner}/${this.repository}`.toLowerCase())) {
        throw new WriterError('origin 不是 RexVane 博客仓库', 'INVALID_REMOTE');
      }
    }
  }

  async getChangedPaths() {
    const [unstaged, staged, untracked] = await Promise.all([
      this.git(['diff', '--name-only', '-z']),
      this.git(['diff', '--cached', '--name-only', '-z']),
      this.git(['ls-files', '--others', '--exclude-standard', '-z']),
    ]);
    return [...new Set([...splitNullList(unstaged), ...splitNullList(staged), ...splitNullList(untracked)])].sort();
  }

  async getRepositoryStatus() {
    await this.assertRepository();
    const [branch, changedPaths] = await Promise.all([
      this.git(['branch', '--show-current']),
      this.getChangedPaths(),
    ]);
    return {
      repoPath: this.repoPath,
      branch: branch || '(detached)',
      changedPaths,
      clean: changedPaths.length === 0,
    };
  }

  async readArticles() {
    const files = (await listFilesRecursive(this.contentRoot))
      .filter((file) => ARTICLE_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const articles = [];
    for (const file of files) {
      const relativeToContent = normalizePath(path.relative(this.contentRoot, file));
      const [language] = relativeToContent.split('/');
      if (!LANGUAGES.has(language)) continue;
      const source = await fs.readFile(file, 'utf8');
      const parsed = parseMarkdown(source);
      const relativePath = normalizePath(path.relative(this.repoPath, file));
      const slug = normalizePath(path.relative(path.join(this.contentRoot, language), file)).replace(/\.(md|mdx)$/i, '');
      articles.push({
        relativePath,
        language,
        slug,
        title: String(parsed.data.title || slug),
        description: String(parsed.data.description || ''),
        pubDate: dateForInput(parsed.data.pubDate),
        category: String(parsed.data.category || 'Blog'),
        subcategory: parsed.data.subcategory ? String(parsed.data.subcategory) : '',
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
        heroImage: parsed.data.heroImage ? String(parsed.data.heroImage) : '',
        draft: Boolean(parsed.data.draft),
        body: parsed.content.trim(),
        extension: path.extname(file).toLowerCase(),
      });
    }
    articles.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    return articles;
  }

  async getInitialData() {
    const [repository, articles] = await Promise.all([
      this.getRepositoryStatus(),
      this.readArticles(),
    ]);
    const tags = [...new Set(articles.flatMap((article) => article.tags))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return {
      repository,
      articles,
      tags,
      now: getChinaLocalMinute(this.now()),
    };
  }

  resolveArticlePath(relativePath) {
    const fullPath = ensureInside(this.contentRoot, path.join(this.repoPath, relativePath), '文章路径');
    if (!ARTICLE_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
      throw new WriterError('文章文件扩展名无效', 'INVALID_ARTICLE_PATH');
    }
    return fullPath;
  }

  async saveArticle(input) {
    await this.assertRepository();
    const article = validateArticle(input);
    const relativePath = normalizePath(path.join('src', 'content', 'blog', article.language, `${article.slug}.md`));
    const targetPath = this.resolveArticlePath(relativePath);
    const originalRelativePath = input.originalPath ? normalizePath(String(input.originalPath)) : '';
    const originalPath = originalRelativePath ? this.resolveArticlePath(originalRelativePath) : null;

    if ((!originalPath || originalPath.toLowerCase() !== targetPath.toLowerCase()) && await fs.access(targetPath).then(() => true).catch(() => false)) {
      throw new WriterError('该文章链接已经存在，请更换链接', 'ARTICLE_EXISTS');
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, serializeArticle(article), 'utf8');
    if (originalPath && originalPath.toLowerCase() !== targetPath.toLowerCase()) {
      await fs.rm(originalPath, { force: true });
    }

    return {
      relativePath,
      originalPath: originalRelativePath && originalRelativePath !== relativePath ? originalRelativePath : '',
      url: `${article.language === 'en' ? '/en' : ''}/blog/${article.slug}/`,
      article: {
        ...article,
        pubDate: dateForInput(article.pubDate),
        relativePath,
      },
    };
  }

  async copyCover(sourcePath, slugValue, previousHeroImage = '') {
    const slug = validateSlug(slugValue);
    const extension = path.extname(sourcePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new WriterError('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片', 'INVALID_IMAGE');
    const rawName = path.basename(sourcePath, extension).toLowerCase();
    const safeName = rawName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover';
    const relativeDirectory = normalizePath(path.join('images', 'posts', slug));
    const directory = ensureInside(this.publicRoot, path.join(this.publicRoot, relativeDirectory), '图片路径');
    await fs.mkdir(directory, { recursive: true });

    let fileName = `${safeName}${extension}`;
    let counter = 2;
    while (await fs.access(path.join(directory, fileName)).then(() => true).catch(() => false)) {
      fileName = `${safeName}-${counter}${extension}`;
      counter += 1;
    }
    await fs.copyFile(sourcePath, path.join(directory, fileName));
    const heroImage = `/${relativeDirectory}/${fileName}`;
    await this.removeReplacedCover(previousHeroImage, slug, heroImage);
    return heroImage;
  }

  // 正文里粘贴的图片：写入当前文章的图片目录，返回 /images/... 路径供 Markdown 引用。
  async pasteImage({ slug: slugValue, extension: rawExtension, data }) {
    const slug = validateSlug(slugValue);
    const extension = String(rawExtension || '.png').toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new WriterError('只支持 JPG、PNG、WebP、GIF 或 AVIF 图片', 'INVALID_IMAGE');
    const buffer = Buffer.from(data || []);
    if (!buffer.length) throw new WriterError('剪贴板里没有图片数据', 'EMPTY_IMAGE');
    if (buffer.length > 20 * 1024 * 1024) throw new WriterError('图片不能超过 20MB', 'IMAGE_TOO_LARGE');

    const relativeDirectory = normalizePath(path.join('images', 'posts', slug));
    const directory = ensureInside(this.publicRoot, path.join(this.publicRoot, relativeDirectory), '图片路径');
    await fs.mkdir(directory, { recursive: true });

    const stamp = getChinaLocalMinute(this.now()).replace(/[-:T]/g, '');
    let fileName = `pasted-${stamp}${extension}`;
    let counter = 2;
    while (await fs.access(path.join(directory, fileName)).then(() => true).catch(() => false)) {
      fileName = `pasted-${stamp}-${counter}${extension}`;
      counter += 1;
    }
    await fs.writeFile(path.join(directory, fileName), buffer);
    return `/${relativeDirectory}/${fileName}`;
  }

  // 换封面时清理上一张：仅限当前 slug 目录下、且未被 git 跟踪的文件，避免脏文件阻塞发布。
  async removeReplacedCover(previousHeroImage, slug, currentHeroImage) {
    const previous = String(previousHeroImage || '');
    const prefix = `/images/posts/${slug}/`;
    if (!previous.startsWith(prefix) || previous === currentHeroImage || previous.includes('..')) return;
    const relativePath = normalizePath(path.join('public', previous.replace(/^\//, '')));
    const fullPath = ensureInside(this.publicRoot, path.join(this.repoPath, relativePath), '图片路径');
    const tracked = await this.git(['ls-files', '--', relativePath], { allowFailure: true });
    if (tracked) return;
    await fs.rm(fullPath, { force: true });
  }

  heroImageToRelativePath(heroImage) {
    if (!heroImage) return '';
    const clean = String(heroImage).replace(/^\//, '');
    return normalizePath(path.join('public', clean));
  }

  publishResult(branch, commit, repository) {
    return {
      branch,
      commit,
      compareUrl: `https://github.com/${this.owner}/${this.repository}/compare/main...${encodeURIComponent(branch)}?expand=1`,
      repository,
    };
  }

  async publishArticle(input) {
    await this.assertRepository();
    const articlePath = normalizePath(String(input.articlePath || ''));
    const fullArticlePath = this.resolveArticlePath(articlePath);
    const parsed = parseMarkdown(await fs.readFile(fullArticlePath, 'utf8'));
    if (Boolean(parsed.data.draft)) throw new WriterError('文章仍标记为草稿，请关闭草稿后再发布', 'ARTICLE_IS_DRAFT');
    if (!parsed.content.trim()) throw new WriterError('正文为空，补充正文后再发布', 'EMPTY_ARTICLE');
    const slug = validateSlug(input.slug);

    await this.git(['fetch', 'origin', 'main']);
    const startBranch = await this.git(['branch', '--show-current']);
    const changedPaths = await this.getChangedPaths();

    // 上次 push 失败的恢复路径：工作区干净、停在该文章的 post 分支且提交尚未推送时，直接重试推送。
    if (!changedPaths.length && startBranch.startsWith(`post/${slug}-`)) {
      const unpushed = await this.git(['log', '--oneline', `origin/main..${startBranch}`], { allowFailure: true });
      const onRemote = await this.git(['ls-remote', '--heads', 'origin', startBranch]);
      if (unpushed && !onRemote) {
        await this.git(['push', '-u', 'origin', startBranch]);
        const commit = await this.git(['rev-parse', '--short', 'HEAD']);
        return this.publishResult(startBranch, commit, await this.getRepositoryStatus());
      }
    }

    const coverPrefix = `public/images/posts/${slug}/`;
    const allowed = new Set([articlePath]);
    if (input.originalPath) allowed.add(normalizePath(String(input.originalPath)));
    const imagePath = this.heroImageToRelativePath(input.heroImage);
    if (imagePath) allowed.add(imagePath);
    const isAllowed = (changed) => allowed.has(changed) || changed.startsWith(coverPrefix);

    const unexpected = changedPaths.filter((changed) => !isAllowed(changed));
    if (unexpected.length) {
      throw new WriterError('博客仓库还有与当前文章无关的改动，请先处理后再发布', 'UNRELATED_CHANGES', unexpected);
    }
    if (!changedPaths.length) throw new WriterError('文章没有需要提交的改动', 'NO_CHANGES');

    const commitMessage = String(input.commitMessage || '').trim() || `Add post: ${slug}`;
    if (commitMessage.length > 120) throw new WriterError('提交说明不能超过 120 个字符', 'INVALID_COMMIT_MESSAGE');

    const timestamp = getChinaLocalMinute(this.now()).replace(/[-:T]/g, '');
    let branch = `post/${slug}-${timestamp}`;
    let suffix = 2;
    while (
      await this.git(['branch', '--list', branch])
      || await this.git(['ls-remote', '--heads', 'origin', branch])
    ) {
      branch = `post/${slug}-${timestamp}-${suffix}`;
      suffix += 1;
    }

    await this.git(['switch', '-c', branch, 'origin/main']);
    try {
      await this.git(['add', '--all', '--', ...changedPaths]);
      const staged = splitNullList(await this.git(['diff', '--cached', '--name-only', '-z']));
      if (!staged.length) throw new WriterError('没有可提交的文章改动', 'NO_STAGED_CHANGES');
      await this.git(['commit', '-m', commitMessage]);
    } catch (error) {
      // commit 之前失败：带着未提交改动切回原分支并删除半成品分支。
      await this.git(['switch', startBranch || 'main'], { allowFailure: true });
      await this.git(['branch', '-D', branch], { allowFailure: true });
      throw error;
    }

    const commit = await this.git(['rev-parse', '--short', 'HEAD']);
    try {
      await this.git(['push', '-u', 'origin', branch]);
    } catch (error) {
      throw new WriterError(
        `推送失败：${error.message}。文章已提交到本地分支 ${branch}，恢复网络后再次点击“提交到分支”即可重试推送`,
        'PUSH_FAILED',
        [branch],
      );
    }

    return this.publishResult(branch, commit, await this.getRepositoryStatus());
  }

  // 删除文章：本地移除文章与封面目录；若文章已在 origin/main 上，
  // 走与发布相同的分支流程（delete/ 前缀），由用户在 GitHub 合并 PR 后 main 才真正删除。
  async deleteArticle(input) {
    await this.assertRepository();
    const articlePath = normalizePath(String(input.articlePath || ''));
    const fullArticlePath = this.resolveArticlePath(articlePath);
    const slug = validateSlug(input.slug);
    const coverPrefix = `public/images/posts/${slug}/`;

    const isAllowed = (changed) => changed === articlePath || changed.startsWith(coverPrefix);
    const unexpected = (await this.getChangedPaths()).filter((changed) => !isAllowed(changed));
    if (unexpected.length) {
      throw new WriterError('博客仓库还有与当前文章无关的改动，请先处理后再删除', 'UNRELATED_CHANGES', unexpected);
    }

    await this.git(['fetch', 'origin', 'main']);
    const onMain = await this.git(
      ['ls-tree', '-r', '--name-only', 'origin/main', '--', articlePath, coverPrefix],
      { allowFailure: true },
    );
    const trackedLocally = await this.git(['ls-files', '--', articlePath], { allowFailure: true });
    if (!onMain && trackedLocally) {
      throw new WriterError(
        '文章还在待合并的发布分支上，请先在 GitHub 合并或关闭对应 Pull Request，同步 main 后再删除',
        'ARTICLE_ON_PENDING_BRANCH',
      );
    }

    const coverDirectory = ensureInside(this.publicRoot, path.join(this.publicRoot, 'images', 'posts', slug), '图片路径');

    if (!onMain) {
      // 文章从未发布：直接删除本地文件即可，不需要动 git。
      await fs.rm(fullArticlePath, { force: true });
      await fs.rm(coverDirectory, { recursive: true, force: true });
      return { remote: false, branch: '', commit: '', compareUrl: '', repository: await this.getRepositoryStatus() };
    }

    const startBranch = await this.git(['branch', '--show-current']);
    const timestamp = getChinaLocalMinute(this.now()).replace(/[-:T]/g, '');
    let branch = `delete/${slug}-${timestamp}`;
    let suffix = 2;
    while (
      await this.git(['branch', '--list', branch])
      || await this.git(['ls-remote', '--heads', 'origin', branch])
    ) {
      branch = `delete/${slug}-${timestamp}-${suffix}`;
      suffix += 1;
    }

    await this.git(['switch', '-c', branch, 'origin/main']);
    try {
      await fs.rm(fullArticlePath, { force: true });
      await fs.rm(coverDirectory, { recursive: true, force: true });
      const changedPaths = await this.getChangedPaths();
      if (!changedPaths.length) throw new WriterError('没有可删除的文章改动', 'NO_CHANGES');
      await this.git(['add', '--all', '--', ...changedPaths]);
      await this.git(['commit', '-m', `Delete post: ${slug}`]);
    } catch (error) {
      // commit 之前失败：恢复被删除的文件，切回原分支并清掉半成品分支。
      await this.git(['checkout', '--', articlePath], { allowFailure: true });
      await this.git(['checkout', '--', coverPrefix], { allowFailure: true });
      await this.git(['switch', startBranch || 'main'], { allowFailure: true });
      await this.git(['branch', '-D', branch], { allowFailure: true });
      throw error;
    }

    const commit = await this.git(['rev-parse', '--short', 'HEAD']);
    try {
      await this.git(['push', '-u', 'origin', branch]);
    } catch (error) {
      // 推送失败时撤销本地删除分支，恢复到删除前的状态，用户恢复网络后重新点删除即可。
      await this.git(['switch', startBranch || 'main'], { allowFailure: true });
      await this.git(['branch', '-D', branch], { allowFailure: true });
      throw new WriterError(
        `推送失败：${error.message}。已恢复本地文章，网络恢复后重新点击“删除文章”即可`,
        'PUSH_FAILED',
      );
    }

    return { remote: true, ...this.publishResult(branch, commit, await this.getRepositoryStatus()) };
  }

  async syncMain() {
    await this.assertRepository();
    const changedPaths = await this.getChangedPaths();
    if (changedPaths.length) throw new WriterError('当前有未提交改动，不能切换到 main', 'DIRTY_REPOSITORY', changedPaths);
    await this.git(['fetch', 'origin', 'main']);
    await this.git(['switch', 'main']);
    await this.git(['pull', '--ff-only', 'origin', 'main']);
    return this.getInitialData();
  }
}

module.exports = {
  BlogService,
  WriterError,
  dateForInput,
  getChinaLocalMinute,
  parseMarkdown,
  serializeArticle,
  toPublishIso,
  validateArticle,
};
