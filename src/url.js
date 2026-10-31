'use strict';

// Suffixes à deux niveaux les plus courants (heuristique « même site » sans dépendance).
const MULTI_SUFFIX = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz',
  'co.jp', 'com.br', 'com.mx', 'co.in', 'co.za', 'com.tr', 'com.cn', 'com.ar'
]);

// Fournisseurs d'identité : les connexions « Se connecter avec… » restent dans l'appli.
const AUTH_SITES = new Set([
  'google.com', 'microsoftonline.com', 'live.com', 'microsoft.com', 'apple.com',
  'facebook.com', 'okta.com', 'auth0.com', 'france.tv', 'francetelevisions.fr'
]);

const BLOCKED_SCHEME = /^(javascript|data|file|about|blob|chrome|view-source|mailto|tel|ftp|ws|wss|intent):/i;

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Transforme ce que l'utilisateur a collé en URL http(s) valide.
 * Retourne { ok: true, url } ou { ok: false, error }.
 */
function normalizeUrl(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Adresse vide.' };
  let s = input.trim().replace(/^[<"'`(]+|[>"'`),.;]+$/g, '');
  // Espaces ou retours à la ligne au milieu (lien copié sur plusieurs lignes)
  s = s.replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Adresse vide.' };
  if (s.length > 4096) return { ok: false, error: 'Adresse trop longue.' };

  if (BLOCKED_SCHEME.test(s) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s))) {
    return { ok: false, error: 'Seules les adresses http et https sont acceptées.' };
  }
  if (s.startsWith('//')) s = 'https:' + s;
  else if (!/^https?:\/\//i.test(s)) s = 'https://' + s;

  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'Cette adresse n’est pas valide.' };
  }
  const host = u.hostname;
  const looksLikeHost = host.includes('.') || host === 'localhost' || host.startsWith('[');
  if (!looksLikeHost || host.startsWith('.') || host.endsWith('..')) {
    return { ok: false, error: 'Cette adresse ne ressemble pas à un site web.' };
  }
  return { ok: true, url: u.href };
}

/** Domaine « enregistrable » approximatif : www.arte.tv → arte.tv, a.bbc.co.uk → bbc.co.uk. */
function siteKey(hostOrUrl) {
  let host = hostOrUrl;
  try {
    if (/^[a-z]+:\/\//i.test(hostOrUrl)) host = new URL(hostOrUrl).hostname;
  } catch { /* garde la valeur */ }
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost') return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join('.') : last2;
}

function isAuthSite(url) {
  return AUTH_SITES.has(siteKey(url));
}

/** Vrai si `target` appartient au même site que `reference` (sous-domaines compris). */
function isSameSite(target, reference) {
  if (!isHttpUrl(target) || !reference) return false;
  return siteKey(target) === siteKey(reference);
}

module.exports = { normalizeUrl, siteKey, isHttpUrl, isSameSite, isAuthSite };
