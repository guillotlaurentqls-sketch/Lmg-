'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Surface minimale exposée au lanceur : aucune API Node, uniquement ces commandes.
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('launcher', {
  getState: () => call('state:get'),
  open: (input, opts) => call('site:open', input, opts),
  activateTab: (id) => call('tab:activate', id),
  closeTab: (id) => call('tab:close', id),
  showView: (mosaic) => call('view:show', mosaic),
  toggleMosaic: () => call('mosaic:toggle'),
  home: () => call('nav:home'),
  back: () => call('nav:back'),
  forward: () => call('nav:forward'),
  reload: () => call('nav:reload'),
  zoomIn: () => call('zoom:in'),
  zoomOut: () => call('zoom:out'),
  zoomReset: () => call('zoom:reset'),
  toggleBlocking: () => call('block:toggle'),
  toggleFavorite: (url) => call('fav:toggle', url),
  updateEntry: (key, patch) => call('lib:update', key, patch),
  removeEntry: (key) => call('lib:remove', key),
  updateFilters: () => call('filters:update'),
  probeDrm: () => call('drm:probe'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusAddress: (cb) => ipcRenderer.on('focus-address', () => cb())
});
