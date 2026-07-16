const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload);
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }
  return result.data;
}

contextBridge.exposeInMainWorld('writerApi', {
  getInitialData: () => invoke('writer:initial-data'),
  saveArticle: (article) => invoke('writer:save-article', article),
  publishArticle: (article) => invoke('writer:publish-article', article),
  deleteArticle: (payload) => invoke('writer:delete-article', payload),
  pasteImage: (payload) => invoke('writer:paste-image', payload),
  syncMain: () => invoke('writer:sync-main'),
  chooseCover: (slug, previousHeroImage) => invoke('writer:choose-cover', { slug, previousHeroImage }),
  openExternal: (url) => invoke('writer:open-external', { url }),
  openGithub: (url) => invoke('writer:open-github', { url }),
});

