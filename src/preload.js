'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Surface minimale exposée au lanceur : aucune API Node, uniquement ces commandes.
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('launcher', {
  getState: () => call('state:get'),
  open: (input) => call('site:open', input),
  home: () => call('nav:home'),
  back: () => call('nav:back'),
  forward: () => call('nav:forward'),
  reload: () => call('nav:reload'),
  zoomIn: () => call('zoom:in'),
  zoomOut: () => call('zoom:out'),
  zoomReset: () => call('zoom:reset'),
  toggleBlocking: () => call('block:toggle'),
  toggleFavorite: (url, title) => call('fav:toggle', url, title),
  removeHistory: (url) => call('history:remove', url),
  clearHistory: () => call('history:clear'),
  updateFilters: () => call('filters:update'),
  probeDrm: () => call('drm:probe'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusAddress: (cb) => ipcRenderer.on('focus-address', () => cb())
});
