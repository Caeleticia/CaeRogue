/* CaeRogue - runtime localization.
   The locale files are the source of every UI string. i18n.js is loaded before
   the application modules and performs a small synchronous preload so that
   top-level labels and lookup tables are localized before they are built.
   Switching language in Settings saves the preference and reloads the page. */
'use strict';

const I18n = {
  locale: 'zh_cn',
  localeName: '',
  supported: [],
  phrases: {},
  source: {},
  legacy: {},
  loadError: null,

  readSavedLocale() {
    try {
      const raw = localStorage.getItem('caerogue.state.v1');
      if (!raw) return 'zh_cn';
      const saved = JSON.parse(raw);
      const locale = saved && saved.settings && saved.settings.locale;
      return locale === 'en_us' ? 'en_us' : 'zh_cn';
    } catch (error) {
      return 'zh_cn';
    }
  },

  requestJson(url) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now(), false);
      xhr.send(null);
      if (xhr.status < 200 || xhr.status >= 300) throw new Error('HTTP ' + xhr.status);
      return JSON.parse(xhr.responseText);
    } catch (error) {
      this.loadError = url + ': ' + error.message;
      return null;
    }
  },

  preload() {
    const zhData = this.requestJson('data/lan/zh_cn.json');
    if (!zhData || !zhData.phrases) return false;
    this.source = zhData.phrases;
    this.locale = this.readSavedLocale();
    this.supported = Array.isArray(zhData.locales) && zhData.locales.length
      ? zhData.locales.slice()
      : [];
    if (this.locale === 'en_us') {
      const enData = this.requestJson('data/lan/en_us.json');
      if (enData && enData.phrases) {
        this.phrases = enData.phrases;
        this.localeName = enData.name || 'English';
      } else {
        this.locale = 'zh_cn';
        this.phrases = zhData.phrases;
        this.localeName = zhData.name || '';
      }
    } else {
      this.phrases = zhData.phrases;
      this.localeName = zhData.name || '';
    }
    this.buildLegacy();
    return true;
  },

  buildLegacy() {
    this.legacy = {};
    if (this.locale === 'zh_cn') return;
    for (const key of Object.keys(this.source)) {
      const from = this.source[key];
      const to = this.phrases[key];
      if (typeof from !== 'string' || typeof to !== 'string' || from === to) continue;
      if (from.indexOf('<') >= 0 || from.length < 2) continue;
      this.legacy[from] = to;
    }
  },

  resolve(key) {
    if (key == null) return '';
    if (Object.prototype.hasOwnProperty.call(this.phrases, key)) return this.phrases[key];
    if (Object.prototype.hasOwnProperty.call(this.source, key)) return this.source[key];
    return key;
  },

  t(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.phrases, key)) return this.phrases[key];
    if (Object.prototype.hasOwnProperty.call(this.source, key)) return this.source[key];
    return fallback == null ? key : fallback;
  },

  translate(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || !Object.prototype.hasOwnProperty.call(this.legacy, trimmed)) return value;
    const start = value.match(/^\s*/)[0];
    const end = value.match(/\s*$/)[0];
    return start + this.legacy[trimmed] + end;
  },

  apply(root) {
    if (!root || !this.legacy || !Object.keys(this.legacy).length) return;
    const skip = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CANVAS']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        let parent = node.parentNode;
        while (parent && parent !== root) {
          if (parent.nodeType === 1 && skip.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          parent = parent.parentNode;
        }
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const next = this.translate(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('[placeholder], [title], [aria-label]')) {
        for (const attr of ['placeholder', 'title', 'aria-label']) {
          if (!el.hasAttribute(attr)) continue;
          const value = el.getAttribute(attr);
          const next = this.translate(value);
          if (next !== value) el.setAttribute(attr, next);
        }
      }
    }
  },

  applyStatic() {
    document.documentElement.lang = this.locale === 'en_us' ? 'en' : 'zh-CN';
    for (const el of document.querySelectorAll('[data-locale-key]')) {
      el.textContent = this.resolve(el.getAttribute('data-locale-key'));
    }
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', this.resolve('boot.meta'));
    if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#/home') {
      document.title = this.resolve('boot.title');
    }
    this.apply(document.body);
  }
};

function L(key, vars) {
  let text = I18n.resolve(key);
  if (vars && typeof vars === 'object') {
    text = String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match);
  }
  return text;
}

window.I18n = I18n;
window.L = L;

I18n.preload();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => I18n.applyStatic());
} else {
  I18n.applyStatic();
}
