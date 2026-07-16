import './styles.css';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { pinyin } from 'pinyin-pro';
import {
  AlertTriangle,
  ArrowRight,
  Bold,
  Check,
  ChevronDown,
  CircleCheckBig,
  Code2,
  Columns2,
  createIcons,
  ExternalLink,
  Eye,
  FilePlus2,
  GitCommitHorizontal,
  GitPullRequest,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  LoaderCircle,
  PenLine,
  PencilLine,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide';

const iconSet = {
  AlertTriangle,
  ArrowRight,
  Bold,
  Check,
  ChevronDown,
  CircleCheckBig,
  Code2,
  Columns2,
  ExternalLink,
  Eye,
  FilePlus2,
  GitCommitHorizontal,
  GitPullRequest,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  LoaderCircle,
  PenLine,
  PencilLine,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
};

function refreshIcons(root = document) {
  createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.8 }, root });
}

const elements = Object.fromEntries([
  'add-tag-button',
  'add-tag-label',
  'article-count',
  'article-list',
  'article-search',
  'body-input',
  'branch-preview',
  'brand-repo',
  'category-select',
  'choose-cover-button',
  'commit-message-input',
  'confirm-accept-button',
  'confirm-message',
  'confirm-modal',
  'confirm-modal-title',
  'confirm-publish-button',
  'delete-button',
  'description-count',
  'description-input',
  'document-kicker',
  'document-name',
  'draft-input',
  'editor-stage',
  'hero-image-input',
  'language-control',
  'loading-overlay',
  'loading-text',
  'markdown-toolbar',
  'new-article-button',
  'open-pr-button',
  'preview-category',
  'preview-content',
  'preview-date',
  'preview-description',
  'preview-hero',
  'preview-tags',
  'preview-title',
  'pub-date-input',
  'publish-button',
  'publish-modal',
  'read-time',
  'repo-branch',
  'repo-state-text',
  'repo-status-dot',
  'save-button',
  'save-indicator',
  'selected-tags',
  'slug-input',
  'slug-preview',
  'subcategory-select',
  'success-branch',
  'success-commit',
  'success-modal',
  'success-modal-title',
  'sync-main-button',
  'tag-dropdown',
  'tag-dropdown-button',
  'tag-options',
  'tag-search-input',
  'tag-trigger-text',
  'title-input',
  'toast-region',
  'view-switcher',
  'word-count',
].map((id) => [id, document.getElementById(id)]));

const state = {
  articles: [],
  knownTags: [],
  selectedTags: new Set(),
  currentPath: '',
  pendingOriginalPath: '',
  currentView: 'split',
  language: 'zh',
  dirty: false,
  slugTouched: false,
  compareUrl: '',
  now: '',
  renderTimer: null,
  autosaveTimer: null,
};

marked.setOptions({ gfm: true, breaks: false });

function chinaNowLocal() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function slugifyTitle(title) {
  const source = String(title || '').trim();
  if (!source) return '';
  const romanized = pinyin(source, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('-');
  return romanized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function fallbackSlug() {
  return `post-${(elements['pub-date-input'].value || chinaNowLocal()).replace(/[-:T]/g, '').slice(0, 12)}`;
}

function getFormData() {
  return {
    title: elements['title-input'].value,
    description: elements['description-input'].value,
    slug: elements['slug-input'].value,
    language: state.language,
    category: elements['category-select'].value,
    subcategory: elements['subcategory-select'].disabled ? '' : elements['subcategory-select'].value,
    tags: [...state.selectedTags],
    pubDate: elements['pub-date-input'].value,
    heroImage: elements['hero-image-input'].value,
    draft: elements['draft-input'].checked,
    body: elements['body-input'].value,
    originalPath: state.currentPath,
  };
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  const span = button.querySelector('span');
  if (span) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = span.textContent;
    span.textContent = busy ? label : button.dataset.originalLabel;
  }
}

function showToast(title, message = '', type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.innerHTML = `
    <i data-lucide="${type === 'error' ? 'alert-triangle' : 'circle-check-big'}"></i>
    <div><strong></strong><span></span></div>
  `;
  toast.querySelector('strong').textContent = title;
  toast.querySelector('span').textContent = message;
  elements['toast-region'].append(toast);
  refreshIcons(toast);
  setTimeout(() => toast.remove(), 4200);
}

function formatError(error) {
  const details = Array.isArray(error?.details) && error.details.length ? `：${error.details.join('、')}` : '';
  return `${error?.message || '操作失败'}${details}`;
}

function setDirty(value = true) {
  state.dirty = value;
  elements['save-indicator'].textContent = value ? '有未保存改动' : '已保存';
  elements['save-indicator'].classList.toggle('dirty', value);
  if (value) scheduleAutosave();
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(writeAutosave, 650);
}

function writeAutosave() {
  localStorage.setItem('blog-writer-autosave', JSON.stringify({ form: getFormData(), savedAt: Date.now() }));
}

function clearAutosave() {
  clearTimeout(state.autosaveTimer);
  localStorage.removeItem('blog-writer-autosave');
}

function updateRepositoryStatus(repository) {
  elements['repo-branch'].textContent = repository.branch;
  elements['repo-status-dot'].className = `status-dot ${repository.clean ? 'clean' : 'dirty'}`;
  elements['repo-state-text'].textContent = repository.clean
    ? '工作区干净'
    : `${repository.changedPaths.length} 个待提交文件`;
  if (repository.remote) elements['brand-repo'].textContent = repository.remote;
}

function setLanguage(language) {
  state.language = language;
  for (const button of elements['language-control'].querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.language === language);
  }
  updateSlugPreview();
}

function updateSlugPreview() {
  const slug = elements['slug-input'].value || 'post';
  elements['slug-preview'].textContent = slug;
  elements['slug-preview'].parentElement.firstChild.textContent = state.language === 'en' ? '/en/blog/' : '/blog/';
}

function updateCategoryState() {
  const isBlog = elements['category-select'].value === 'Blog';
  elements['subcategory-select'].disabled = !isBlog;
  elements['subcategory-select'].closest('.field-group').style.opacity = isBlog ? '1' : '0.48';
  updatePreview();
}

function renderSelectedTags() {
  elements['selected-tags'].replaceChildren();
  for (const tag of state.selectedTags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = '<span></span><button type="button" aria-label="移除标签"><i data-lucide="x"></i></button>';
    chip.querySelector('span').textContent = `#${tag}`;
    chip.querySelector('button').addEventListener('click', () => {
      state.selectedTags.delete(tag);
      renderSelectedTags();
      renderTagOptions();
      setDirty();
      updatePreview();
    });
    elements['selected-tags'].append(chip);
    refreshIcons(chip);
  }
  elements['tag-trigger-text'].textContent = state.selectedTags.size ? `已选择 ${state.selectedTags.size} 个标签` : '选择标签';
}

function renderTagOptions() {
  const query = elements['tag-search-input'].value.trim().replace(/^#+/, '').toLowerCase();
  const options = [...new Set([...state.knownTags, ...state.selectedTags])]
    .filter((tag) => !query || tag.toLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  elements['tag-options'].replaceChildren();
  for (const tag of options) {
    const selected = state.selectedTags.has(tag);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-option';
    button.innerHTML = '<span></span>' + (selected ? '<i data-lucide="check"></i>' : '');
    button.querySelector('span').textContent = `#${tag}`;
    button.addEventListener('click', () => {
      if (selected) state.selectedTags.delete(tag);
      else if (state.selectedTags.size < 12) state.selectedTags.add(tag);
      else showToast('标签数量已达上限', '一篇文章最多选择 12 个标签', 'error');
      renderSelectedTags();
      renderTagOptions();
      setDirty();
      updatePreview();
    });
    elements['tag-options'].append(button);
  }
  refreshIcons(elements['tag-options']);

  const exactExists = [...state.knownTags, ...state.selectedTags].some((tag) => tag.toLowerCase() === query);
  const canAdd = query && !exactExists;
  elements['add-tag-button'].hidden = !canAdd;
  elements['add-tag-label'].textContent = canAdd ? `新增标签 “${elements['tag-search-input'].value.trim().replace(/^#+/, '')}”` : '';
}

function toggleTagDropdown(force) {
  const shouldOpen = typeof force === 'boolean' ? force : elements['tag-dropdown'].hidden;
  elements['tag-dropdown'].hidden = !shouldOpen;
  elements['tag-dropdown-button'].setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    elements['tag-search-input'].value = '';
    renderTagOptions();
    setTimeout(() => elements['tag-search-input'].focus(), 0);
  }
}

function updateDocumentIdentity() {
  const title = elements['title-input'].value.trim();
  elements['document-name'].textContent = title || '未命名文章';
  elements['document-kicker'].textContent = state.currentPath ? '编辑文章' : '新文章';
  elements['delete-button'].hidden = !state.currentPath;
}

function formatPreviewDate(localValue) {
  if (!localValue) return '';
  const date = new Date(`${localValue}:00+08:00`);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function countWords(value) {
  const source = String(value || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]()!-]/g, ' ');
  const cjk = source.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latin = source.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  return cjk + latin;
}

// 博客里的 /images/... 路径通过 writer-img 协议映射到工作副本的 public 目录。
function toPreviewImageUrl(value) {
  const source = String(value || '').trim();
  if (!source.startsWith('/images/') || source.includes('..')) return '';
  return `writer-img://${source.replace(/^\//, '')}`;
}

function updatePreviewHero() {
  const url = toPreviewImageUrl(elements['hero-image-input'].value);
  elements['preview-hero'].hidden = !url;
  const image = elements['preview-hero'].querySelector('img');
  if (url && image.getAttribute('src') !== url) image.src = url;
  if (!url) image.removeAttribute('src');
}

function updatePreview() {
  updateDocumentIdentity();
  updateSlugPreview();
  elements['description-count'].textContent = elements['description-input'].value.length;
  elements['preview-title'].textContent = elements['title-input'].value.trim() || '未命名文章';
  elements['preview-description'].textContent = elements['description-input'].value.trim() || '文章摘要会显示在这里。';
  elements['preview-category'].textContent = elements['subcategory-select'].disabled
    ? elements['category-select'].value
    : elements['subcategory-select'].value;
  elements['preview-date'].textContent = formatPreviewDate(elements['pub-date-input'].value);
  elements['preview-tags'].replaceChildren(...[...state.selectedTags].map((tag) => {
    const span = document.createElement('span');
    span.textContent = `#${tag}`;
    return span;
  }));
  updatePreviewHero();

  const words = countWords(elements['body-input'].value);
  elements['word-count'].textContent = String(words);
  elements['read-time'].textContent = String(Math.max(1, Math.ceil(words / 400)));

  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    const rendered = marked.parse(elements['body-input'].value || '');
    elements['preview-content'].innerHTML = DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
    });
    for (const image of elements['preview-content'].querySelectorAll('img[src^="/images/"]')) {
      const mapped = toPreviewImageUrl(image.getAttribute('src'));
      if (mapped) image.src = mapped;
    }
  }, 100);
}

function updateArticleList() {
  const query = elements['article-search'].value.trim().toLowerCase();
  const visible = state.articles.filter((article) => {
    const haystack = [article.title, article.slug, article.description, ...(article.tags || [])].join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });
  elements['article-count'].textContent = String(state.articles.length);
  elements['article-list'].replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'article-empty';
    empty.textContent = query ? '没有匹配的文章' : '还没有文章';
    elements['article-list'].append(empty);
    return;
  }
  for (const article of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `article-item ${state.currentPath === article.relativePath ? 'active' : ''}`;
    button.innerHTML = '<span class="article-item-title"></span><span class="article-item-meta"></span>';
    button.querySelector('.article-item-title').textContent = article.title;
    const draft = article.draft ? '草稿 · ' : '';
    button.querySelector('.article-item-meta').textContent = `${draft}${article.language.toUpperCase()} · ${article.pubDate.replace('T', ' ')}`;
    button.addEventListener('click', () => openArticle(article));
    elements['article-list'].append(button);
  }
}

function applyForm(article) {
  elements['title-input'].value = article.title || '';
  elements['description-input'].value = article.description || '';
  elements['slug-input'].value = article.slug || '';
  setLanguage(article.language || 'zh');
  elements['category-select'].value = article.category || 'Blog';
  elements['subcategory-select'].value = article.subcategory || 'Technology';
  elements['pub-date-input'].value = article.pubDate || state.now || chinaNowLocal();
  elements['hero-image-input'].value = article.heroImage || '';
  elements['draft-input'].checked = Boolean(article.draft);
  elements['body-input'].value = article.body || '';
  state.selectedTags = new Set(article.tags || []);
  renderSelectedTags();
  updateCategoryState();
  updatePreview();
}

// Electron 的原生 window.confirm 在 Windows 上会破坏窗口焦点（弹过之后输入框点不动），
// 因此用应用内弹窗代替。
let confirmResolve = null;

function settleConfirm(result) {
  if (!confirmResolve) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  elements['confirm-modal'].hidden = true;
  resolve(result);
}

function showConfirm(message, { title = '放弃未保存改动？', confirmLabel = '放弃改动' } = {}) {
  return new Promise((resolve) => {
    settleConfirm(false);
    confirmResolve = resolve;
    elements['confirm-modal-title'].textContent = title;
    elements['confirm-message'].textContent = message;
    elements['confirm-accept-button'].querySelector('span').textContent = confirmLabel;
    elements['confirm-modal'].hidden = false;
    setTimeout(() => elements['confirm-accept-button'].focus(), 0);
  });
}

async function confirmDiscard() {
  return !state.dirty || showConfirm('当前文章有未保存改动，确定放弃吗？');
}

async function openArticle(article) {
  if (!(await confirmDiscard())) return;
  state.currentPath = article.relativePath;
  state.pendingOriginalPath = '';
  state.slugTouched = true;
  applyForm(article);
  setDirty(false);
  clearAutosave();
  updateArticleList();
}

async function newArticle({ restore = null } = {}) {
  if (!restore && !(await confirmDiscard())) return;
  if (!restore) clearAutosave();
  state.currentPath = '';
  state.pendingOriginalPath = '';
  state.slugTouched = false;
  applyForm(restore || {
    title: '',
    description: '',
    slug: '',
    language: 'zh',
    category: 'Blog',
    subcategory: 'Technology',
    tags: [],
    pubDate: chinaNowLocal(),
    heroImage: '',
    draft: false,
    body: '',
  });
  setDirty(Boolean(restore));
  updateArticleList();
}

function restoreAutosave() {
  try {
    const saved = JSON.parse(localStorage.getItem('blog-writer-autosave') || 'null');
    if (!saved?.form || Date.now() - saved.savedAt > 7 * 24 * 60 * 60 * 1000) return false;
    const article = {
      ...saved.form,
      language: saved.form.language || 'zh',
      pubDate: saved.form.pubDate || state.now,
      relativePath: saved.form.originalPath || '',
    };
    state.currentPath = saved.form.originalPath || '';
    state.slugTouched = Boolean(saved.form.slug);
    applyForm(article);
    setDirty(true);
    updateArticleList();
    showToast('已恢复未保存内容', '上次关闭前的草稿已恢复');
    return true;
  } catch {
    clearAutosave();
    return false;
  }
}

async function reloadRepositoryData() {
  const data = await window.writerApi.getInitialData();
  state.articles = data.articles;
  state.knownTags = data.tags;
  state.now = data.now;
  updateRepositoryStatus(data.repository);
  updateArticleList();
  return data;
}

async function saveCurrentArticle({ quiet = false } = {}) {
  if (!elements['slug-input'].value.trim()) {
    elements['slug-input'].value = slugifyTitle(elements['title-input'].value) || fallbackSlug();
  }
  setBusy(elements['save-button'], true, '保存中');
  try {
    const result = await window.writerApi.saveArticle(getFormData());
    state.pendingOriginalPath ||= result.originalPath;
    state.currentPath = result.relativePath;
    state.slugTouched = true;
    clearAutosave();
    setDirty(false);
    await reloadRepositoryData();
    if (!quiet) showToast('文章已保存', result.relativePath);
    return result;
  } catch (error) {
    showToast('保存失败', formatError(error), 'error');
    throw error;
  } finally {
    setBusy(elements['save-button'], false);
  }
}

function openPublishModal() {
  const slug = elements['slug-input'].value || fallbackSlug();
  const time = chinaNowLocal().replace(/[-:T]/g, '');
  elements['branch-preview'].textContent = `post/${slug}-${time}`;
  elements['commit-message-input'].value = `Add post: ${elements['title-input'].value.trim() || slug}`;
  elements['publish-modal'].hidden = false;
  setTimeout(() => elements['commit-message-input'].focus(), 0);
}

function closeModal(id) {
  // 推送进行中不允许关闭发布弹窗，避免任务在后台悄悄继续。
  if (id === 'publish-modal' && elements['confirm-publish-button'].disabled) return;
  if (id === 'confirm-modal') {
    settleConfirm(false);
    return;
  }
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
}

async function preparePublish() {
  if (elements['draft-input'].checked) {
    showToast('文章仍是草稿', '关闭“保存为草稿”后再提交分支', 'error');
    return;
  }
  // 发布时间以提交那一刻为准：每次提交分支都刷新为当前北京时间，重复提交用最新时间覆盖。
  elements['pub-date-input'].value = chinaNowLocal();
  updatePreview();
  try {
    await saveCurrentArticle({ quiet: true });
    openPublishModal();
  } catch {
    // Save already surfaced the validation error.
  }
}

async function confirmPublish() {
  setBusy(elements['confirm-publish-button'], true, '正在推送');
  try {
    const result = await window.writerApi.publishArticle({
      articlePath: state.currentPath,
      originalPath: state.pendingOriginalPath,
      heroImage: elements['hero-image-input'].value,
      slug: elements['slug-input'].value,
      commitMessage: elements['commit-message-input'].value,
    });
    state.pendingOriginalPath = '';
    state.compareUrl = result.compareUrl;
    updateRepositoryStatus(result.repository);
    elements['success-modal-title'].textContent = '文章分支已推送';
    elements['success-branch'].textContent = result.branch;
    elements['success-commit'].textContent = result.commit;
    // 直接关闭而不走 closeModal：此刻按钮仍是 busy 态，closeModal 的推送中守卫会拦截。
    elements['publish-modal'].hidden = true;
    elements['success-modal'].hidden = false;
  } catch (error) {
    showToast('提交失败', formatError(error), 'error');
  } finally {
    setBusy(elements['confirm-publish-button'], false);
  }
}

async function chooseCover() {
  if (!elements['slug-input'].value.trim()) {
    elements['slug-input'].value = slugifyTitle(elements['title-input'].value) || fallbackSlug();
    updateSlugPreview();
  }
  setBusy(elements['choose-cover-button'], true);
  try {
    const result = await window.writerApi.chooseCover(
      elements['slug-input'].value,
      elements['hero-image-input'].value.trim(),
    );
    if (result) {
      elements['hero-image-input'].value = result;
      setDirty();
      updatePreview();
      showToast('封面已加入文章', result);
    }
  } catch (error) {
    showToast('封面处理失败', formatError(error), 'error');
  } finally {
    setBusy(elements['choose-cover-button'], false);
  }
}

async function deleteCurrentArticle() {
  if (!state.currentPath) return;
  const title = elements['title-input'].value.trim() || elements['slug-input'].value || '当前文章';
  const accepted = await showConfirm(
    `确定删除「${title}」吗？封面图片会一并删除；已发布的文章会推送删除分支，由你在 GitHub 合并后正式删除。`,
    { title: '删除这篇文章？', confirmLabel: '删除文章' },
  );
  if (!accepted) return;
  setBusy(elements['delete-button'], true, '删除中');
  try {
    const result = await window.writerApi.deleteArticle({
      articlePath: state.currentPath,
      slug: elements['slug-input'].value,
    });
    clearAutosave();
    state.dirty = false;
    state.currentPath = '';
    state.pendingOriginalPath = '';
    await reloadRepositoryData();
    await newArticle();
    if (result.remote) {
      state.compareUrl = result.compareUrl;
      elements['success-modal-title'].textContent = '删除分支已推送';
      elements['success-branch'].textContent = result.branch;
      elements['success-commit'].textContent = result.commit;
      elements['success-modal'].hidden = false;
    } else {
      showToast('文章已删除', '该文章尚未发布，已从本地移除');
    }
  } catch (error) {
    showToast('删除失败', formatError(error), 'error');
  } finally {
    setBusy(elements['delete-button'], false);
  }
}

async function syncMain() {
  if (!(await confirmDiscard())) return;
  setBusy(elements['sync-main-button'], true);
  try {
    const data = await window.writerApi.syncMain();
    state.articles = data.articles;
    state.knownTags = data.tags;
    state.now = data.now;
    updateRepositoryStatus(data.repository);
    clearAutosave();
    state.dirty = false;
    newArticle();
    showToast('main 已同步', '已切换并拉取最新博客内容');
  } catch (error) {
    showToast('同步失败', formatError(error), 'error');
  } finally {
    setBusy(elements['sync-main-button'], false);
  }
}

function applyMarkdown(command) {
  const textarea = elements['body-input'];
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const commands = {
    bold: [`**${selected || '粗体文字'}**`, 2, selected ? selected.length : 4],
    italic: [`*${selected || '斜体文字'}*`, 1, selected ? selected.length : 4],
    heading: [`## ${selected || '标题'}`, 3, selected ? selected.length : 2],
    quote: [`> ${selected || '引用内容'}`, 2, selected ? selected.length : 4],
    code: selected.includes('\n')
      ? [`\`\`\`\n${selected || '代码'}\n\`\`\``, 4, selected ? selected.length : 2]
      : [`\`${selected || '代码'}\``, 1, selected ? selected.length : 2],
    link: [`[${selected || '链接文字'}](https://)`, 1, selected ? selected.length : 4],
    list: [`- ${selected || '列表项'}`, 2, selected ? selected.length : 3],
    'ordered-list': [`1. ${selected || '列表项'}`, 3, selected ? selected.length : 3],
  };
  const [replacement, selectionOffset, selectionLength] = commands[command] || ['', 0, 0];
  if (!replacement) return;
  textarea.setRangeText(replacement, start, end, 'end');
  textarea.focus();
  textarea.setSelectionRange(start + selectionOffset, start + selectionOffset + selectionLength);
  setDirty();
  updatePreview();
}

const PASTE_IMAGE_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

async function pasteImageIntoBody(file) {
  if (!elements['slug-input'].value.trim()) {
    elements['slug-input'].value = slugifyTitle(elements['title-input'].value) || fallbackSlug();
    updateSlugPreview();
  }
  const imagePath = await window.writerApi.pasteImage({
    slug: elements['slug-input'].value,
    extension: PASTE_IMAGE_EXTENSIONS[file.type],
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const textarea = elements['body-input'];
  textarea.setRangeText(`![图片](${imagePath})`, textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.focus();
  setDirty();
  updatePreview();
  showToast('图片已插入', imagePath);
}

function setView(view) {
  state.currentView = view;
  elements['editor-stage'].className = `editor-stage ${view}`;
  for (const button of elements['view-switcher'].querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.view === view);
  }
}

function bindEvents() {
  const updateFields = [
    elements['description-input'],
    elements['hero-image-input'],
    elements['body-input'],
  ];
  for (const input of updateFields) {
    input.addEventListener('input', () => {
      setDirty();
      updatePreview();
    });
  }

  elements['title-input'].addEventListener('input', () => {
    if (!state.slugTouched) elements['slug-input'].value = slugifyTitle(elements['title-input'].value);
    setDirty();
    updatePreview();
  });
  elements['slug-input'].addEventListener('input', () => {
    state.slugTouched = true;
    elements['slug-input'].value = elements['slug-input'].value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setDirty();
    updateSlugPreview();
  });
  elements['category-select'].addEventListener('change', () => {
    updateCategoryState();
    setDirty();
  });
  elements['subcategory-select'].addEventListener('change', () => {
    updatePreview();
    setDirty();
  });
  elements['draft-input'].addEventListener('change', () => setDirty());

  elements['language-control'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-language]');
    if (!button) return;
    setLanguage(button.dataset.language);
    setDirty();
  });
  elements['view-switcher'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });
  elements['markdown-toolbar'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-command]');
    if (button) applyMarkdown(button.dataset.command);
  });

  // 正文支持直接粘贴图片：存入当前文章的图片目录并插入 Markdown 引用。
  elements['body-input'].addEventListener('paste', (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => PASTE_IMAGE_EXTENSIONS[item.type]);
    if (!file) return;
    event.preventDefault();
    pasteImageIntoBody(file).catch((error) => showToast('图片粘贴失败', formatError(error), 'error'));
  });

  elements['tag-dropdown-button'].addEventListener('click', () => toggleTagDropdown());
  elements['tag-search-input'].addEventListener('input', renderTagOptions);
  elements['tag-search-input'].addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!elements['add-tag-button'].hidden) {
      elements['add-tag-button'].click();
      return;
    }
    const first = elements['tag-options'].querySelector('.tag-option');
    if (first) first.click();
  });
  elements['add-tag-button'].addEventListener('click', () => {
    const tag = elements['tag-search-input'].value.trim().replace(/^#+/, '').slice(0, 30);
    if (!tag) return;
    if (state.selectedTags.size >= 12) {
      showToast('标签数量已达上限', '一篇文章最多选择 12 个标签', 'error');
      return;
    }
    state.knownTags = [...new Set([...state.knownTags, tag])];
    state.selectedTags.add(tag);
    renderSelectedTags();
    toggleTagDropdown(false);
    setDirty();
    updatePreview();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#tag-field')) toggleTagDropdown(false);
  });

  // 封面路径无效或文件缺失时收起预览图，避免显示破图。
  elements['preview-hero'].querySelector('img').addEventListener('error', () => {
    elements['preview-hero'].hidden = true;
  });

  elements['new-article-button'].addEventListener('click', () => newArticle());
  elements['article-search'].addEventListener('input', updateArticleList);
  elements['save-button'].addEventListener('click', () => saveCurrentArticle().catch(() => {}));
  elements['delete-button'].addEventListener('click', deleteCurrentArticle);
  elements['publish-button'].addEventListener('click', preparePublish);
  elements['confirm-accept-button'].addEventListener('click', () => settleConfirm(true));
  elements['confirm-publish-button'].addEventListener('click', confirmPublish);
  elements['choose-cover-button'].addEventListener('click', chooseCover);
  elements['sync-main-button'].addEventListener('click', syncMain);
  elements['open-pr-button'].addEventListener('click', async () => {
    if (!state.compareUrl) return;
    try {
      await window.writerApi.openGithub(state.compareUrl);
      closeModal('success-modal');
    } catch (error) {
      showToast('无法打开 GitHub', formatError(error), 'error');
    }
  });

  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close-modal]');
    if (close) closeModal(close.dataset.closeModal);
  });
  for (const modal of document.querySelectorAll('.modal-backdrop')) {
    modal.addEventListener('mousedown', (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  }

  // 预览区链接交给系统浏览器打开，避免应用窗口被导航走（主进程另有 will-navigate 兜底）。
  elements['preview-content'].addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') || '';
    if (/^https:\/\//i.test(href)) {
      window.writerApi.openExternal(href).catch((error) => showToast('无法打开链接', formatError(error), 'error'));
    }
  });

  // 关窗前把未保存内容立即写入 autosave，绕过防抖延迟。
  window.addEventListener('beforeunload', () => {
    clearTimeout(state.autosaveTimer);
    if (state.dirty) writeAutosave();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!elements['save-button'].disabled) saveCurrentArticle().catch(() => {});
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!elements['publish-modal'].hidden) {
        if (!elements['confirm-publish-button'].disabled) confirmPublish();
      } else if (!elements['publish-button'].disabled && !elements['save-button'].disabled) {
        preparePublish();
      }
    }
    if (event.key === 'Escape') {
      toggleTagDropdown(false);
      for (const modal of document.querySelectorAll('.modal-backdrop:not([hidden])')) closeModal(modal.id);
    }
  });
}

async function initialize() {
  refreshIcons();
  bindEvents();
  try {
    const data = await reloadRepositoryData();
    state.now = data.now;
    if (!restoreAutosave()) newArticle();
    elements['loading-overlay'].classList.add('ready');
  } catch (error) {
    elements['loading-text'].textContent = formatError(error);
    showToast('无法打开博客仓库', formatError(error), 'error');
  }
}

initialize();
