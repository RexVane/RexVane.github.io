const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const { BlogService, WriterError } = require('./blog-service.cjs');

const PRODUCTION_REPO = 'C:\\Users\\guica\\RexVane.github.io';
const repoPath = process.env.WRITER_E2E === '1' && process.env.WRITER_REPO_PATH
  ? process.env.WRITER_REPO_PATH
  : PRODUCTION_REPO;
if (process.env.WRITER_E2E === '1' && process.env.WRITER_USER_DATA_PATH) {
  app.setPath('userData', process.env.WRITER_USER_DATA_PATH);
}
const service = new BlogService({ repoPath, strictRemote: process.env.WRITER_E2E !== '1' });

function toClientError(error) {
  if (error instanceof WriterError) {
    return { message: error.message, code: error.code, details: error.details };
  }
  return { message: error?.message || '发生未知错误', code: 'UNKNOWN_ERROR' };
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return { ok: true, data: await callback(payload, event) };
    } catch (error) {
      return { ok: false, error: toClientError(error) };
    }
  });
}

function isAppUrl(url) {
  if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return true;
  return url.startsWith('file://');
}

// 把博客 public 目录下的图片映射进渲染进程，预览里 /images/... 的封面和插图才能显示。
function registerImageProtocol() {
  protocol.handle('writer-img', (request) => {
    const relative = decodeURIComponent(request.url.replace(/^writer-img:\/\//, '').split(/[?#]/)[0]);
    const base = path.resolve(service.publicRoot);
    const target = path.resolve(base, relative);
    const contained = path.relative(base, target);
    if (contained.startsWith('..') || path.isAbsolute(contained)) {
      return new Response(null, { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#e8ece8',
    title: 'RexVane Writer',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 预览区的普通链接点击会触发窗口内导航，必须拦下来交给系统浏览器。
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }

  if (process.env.WRITER_CAPTURE_PATH) {
    const capturePath = path.resolve(process.env.WRITER_CAPTURE_PATH);
    await fs.mkdir(path.dirname(capturePath), { recursive: true });
    setTimeout(async () => {
      const image = await window.webContents.capturePage();
      await fs.writeFile(capturePath, image.toPNG());
      app.quit();
    }, 1800);
  } else if (process.env.WRITER_E2E !== '1') {
    window.show();
  }
}

app.whenReady().then(async () => {
  registerImageProtocol();
  handle('writer:initial-data', () => service.getInitialData());
  handle('writer:save-article', (payload) => service.saveArticle(payload));
  handle('writer:publish-article', (payload) => service.publishArticle(payload));
  handle('writer:delete-article', (payload) => service.deleteArticle(payload));
  handle('writer:paste-image', (payload) => service.pasteImage(payload));
  handle('writer:sync-main', () => service.syncMain());
  handle('writer:choose-cover', async (payload, event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: '选择文章封面',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return service.copyCover(result.filePaths[0], payload.slug, payload.previousHeroImage);
  });
  handle('writer:open-external', async (payload) => {
    const url = String(payload?.url || '');
    if (!url.startsWith('https://')) {
      throw new WriterError('只能打开 https 链接', 'INVALID_URL');
    }
    await shell.openExternal(url);
    return true;
  });
  handle('writer:open-github', async (payload) => {
    const url = String(payload?.url || '');
    if (!url.startsWith('https://github.com/RexVane/RexVane.github.io/')) {
      throw new WriterError('只能打开当前博客的 GitHub 页面', 'INVALID_URL');
    }
    await shell.openExternal(url);
    return true;
  });

  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
