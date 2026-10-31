'use strict';
const fs = require('fs');
const path = require('path');

/** Petit stockage JSON (favoris, historique, réglages) dans le dossier utilisateur. */
class Store {
  constructor(file, defaults) {
    this.file = file;
    this.timer = null;
    let loaded = null;
    try {
      loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { /* premier lancement ou fichier illisible */ }
    this.isNew = loaded === null;
    this.data = { ...defaults, ...(loaded || {}) };
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] écriture impossible :', err.message);
    }
  }
}

module.exports = { Store };
