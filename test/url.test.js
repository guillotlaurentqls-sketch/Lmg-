'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeUrl, siteKey, isSameSite } = require('../src/url');

test('ajoute https et tolère les espaces', () => {
  assert.strictEqual(normalizeUrl('  www.arte.tv/fr/  ').url, 'https://www.arte.tv/fr/');
  assert.strictEqual(normalizeUrl('https://www.arte.tv/fr/\n').url, 'https://www.arte.tv/fr/');
  assert.strictEqual(normalizeUrl('https://www.france.tv/ séries').ok, true);
});
test('garde les paramètres', () => {
  assert.strictEqual(normalizeUrl('pluto.tv/fr/live-tv?a=1&b=2#x').url, 'https://pluto.tv/fr/live-tv?a=1&b=2#x');
});
test('refuse les schémas non http(s)', () => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.fr', 'data:text/html,hi', 'about:blank']) {
    assert.strictEqual(normalizeUrl(bad).ok, false, bad);
  }
});
test('refuse ce qui n’est pas une adresse', () => {
  assert.strictEqual(normalizeUrl('').ok, false);
  assert.strictEqual(normalizeUrl('bonjour').ok, false);
});
test('même site', () => {
  assert.strictEqual(siteKey('https://www.bbc.co.uk/x'), 'bbc.co.uk');
  assert.ok(isSameSite('https://player.arte.tv/a', 'https://www.arte.tv/fr/'));
  assert.ok(!isSameSite('https://example.com', 'https://www.arte.tv/'));
});
