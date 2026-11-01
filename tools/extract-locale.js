#!/usr/bin/env node
/* Extract UI string literals into data/lan/*.json and replace them with L() keys.
   Run after editing user-facing strings: node tools/extract-locale.js
   Existing L() keys are left untouched; old en_us translations are reused by value. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['data.js', 'loader.js', 'store.js', 'engine.js', 'fx.js', 'editor.js', 'modes.js', 'app.js'];
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

function keyFor(value) {
  return 'ui.' + crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function decodeLiteral(raw) {
  try { return Function('return (' + raw + ');')(); } catch (error) { return null; }
}

function scan(source) {
  const strings = [];
  let i = 0;
  let prev = null;

  function setPrev(type, value) { prev = { type, value }; }

  function regexCanStart() {
    if (!prev) return true;
    if (prev.type === 'punct') return '([{=,:;!&|?+-*%^~<>'.includes(prev.value);
    if (prev.type === 'ident') return ['return', 'case', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'yield', 'await'].includes(prev.value);
    return false;
  }

  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === '/' && regexCanStart()) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < source.length) {
        const ch = source[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') { inClass = true; j += 1; continue; }
        if (ch === ']') { inClass = false; j += 1; continue; }
        if (ch === '/' && !inClass) { closed = true; j += 1; break; }
        if (ch === '\n') break;
        j += 1;
      }
      if (closed) {
        while (j < source.length && /[a-z]/.test(source[j])) j += 1;
        setPrev('regex', '/');
        i = j;
        continue;
      }
    }
    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      let j = i + 1;
      let closed = false;
      while (j < source.length) {
        const ch = source[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === quote) { j += 1; closed = true; break; }
        if (ch === '\n' || ch === '\r') break;
        j += 1;
      }
      if (!closed) { i += 1; setPrev('punct', c); continue; }
      const raw = source.slice(start, j);
      const value = decodeLiteral(raw);
      strings.push({ start, end: j, raw, value, quote });
      setPrev('string', value);
      i = j;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '`') { j += 1; break; }
        j += 1;
      }
      setPrev('template', '`');
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_$]/.test(source[j])) j += 1;
      setPrev('ident', source.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_.]/.test(source[j])) j += 1;
      setPrev('number', source.slice(i, j));
      i = j;
      continue;
    }
    setPrev('punct', c);
    i += 1;
  }
  return strings;
}

function isPropertyKey(source, token) {
  let after = token.end;
  while (after < source.length && /\s/.test(source[after])) after += 1;
  if (source[after] !== ':') return false;
  let before = token.start - 1;
  while (before >= 0 && /\s/.test(source[before])) before -= 1;
  return before >= 0 && (source[before] === '{' || source[before] === ',');
}

function main() {
  const oldZh = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lan/zh_cn.json'), 'utf8'));
  let oldEn = { phrases: {} };
  try { oldEn = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lan/en_us.json'), 'utf8')); } catch (error) {}
  const oldEnMap = oldEn.phrases || {};

  const values = new Map(); // key -> value
  const usedKeys = new Set();
  const skipped = [];
  let replaced = 0;
  const fileReports = [];

  // Preserve already-extracted keys that are still referenced by the source.
  for (const file of TARGETS) {
    const source = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    for (const match of source.matchAll(/L\('(ui\.[0-9a-f]{12})'\)/g)) usedKeys.add(match[1]);
  }
  for (const key of usedKeys) {
    if (oldZh.phrases[key] != null) values.set(key, oldZh.phrases[key]);
  }

  for (const file of TARGETS) {
    const filePath = path.join(ROOT, 'scripts', file);
    let source = fs.readFileSync(filePath, 'utf8');
    const strings = scan(source);
    const edits = [];
    for (const token of strings) {
      if (typeof token.value !== 'string' || !CJK.test(token.value)) continue;
      if (isPropertyKey(source, token)) {
        skipped.push({ file, line: source.slice(0, token.start).split('\n').length, raw: token.raw.slice(0, 80) });
        continue;
      }
      const key = keyFor(token.value);
      const existing = values.get(key);
      if (existing != null && existing !== token.value) throw new Error('Hash collision for ' + key);
      values.set(key, token.value);
      edits.push({ start: token.start, end: token.end, text: "L('" + key + "')" });
    }
    // Replace from the end so offsets stay valid.
    edits.sort((a, b) => b.start - a.start);
    for (const edit of edits) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    fs.writeFileSync(filePath, source);
    replaced += edits.length;
    fileReports.push({ file, strings: strings.length, replaced: edits.length });
  }

  // Bootstrap/meta strings live in index.html rather than the scripts.
  const boot = {
    'boot.loadingTitle': '正在装载战术档案',
    'boot.loadingDesc': '首次打开会在本地建立基础牌组与设置。',
    'boot.noscript': '本项目需要启用 JavaScript 才能运行。',
    'boot.meta': 'CaeRogue：基于 HTML、CSS 与本地资产的卡牌战斗、技能流程设计实验场。',
    'boot.title': 'CaeRogue · 卡牌战术实验场'
  };
  const enBoot = {
    'boot.loadingTitle': 'Loading tactical archive',
    'boot.loadingDesc': 'The first launch creates a base deck and settings locally.',
    'boot.noscript': 'JavaScript is required to run this project.',
    'boot.meta': 'CaeRogue: a local-first tactical card game and visual skill-flow workshop.',
    'boot.title': 'CaeRogue · Tactical Card Lab'
  };
  for (const [key, value] of Object.entries(boot)) values.set(key, value);

  const oldTranslations = oldEnMap;
  const zhPhrases = {};
  const enPhrases = {};
  for (const key of [...values.keys()].sort()) {
    const value = values.get(key);
    zhPhrases[key] = value;
    if (oldEn.phrases && Object.prototype.hasOwnProperty.call(oldEn.phrases, key)) enPhrases[key] = oldEn.phrases[key];
    else if (key.startsWith('boot.')) enPhrases[key] = enBoot[key] || value;
    else enPhrases[key] = Object.prototype.hasOwnProperty.call(oldTranslations, value) ? oldTranslations[value] : value;
  }
  // Preserve any old English translations for strings that are still stored under legacy Chinese keys.
  for (const [value, translation] of Object.entries(oldTranslations)) {
    const matched = [...values.entries()].find(([, v]) => v === value);
    if (matched) enPhrases[matched[0]] = translation;
  }

  const locales = [
    { id: 'zh_cn', name: '简体中文' },
    { id: 'en_us', name: 'English' }
  ];
  const zhOut = { locale: 'zh_cn', name: '简体中文', locales, phrases: zhPhrases };
  const enOut = { locale: 'en_us', name: 'English', locales, phrases: enPhrases };
  fs.writeFileSync(path.join(ROOT, 'data/lan/zh_cn.json'), JSON.stringify(zhOut, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/lan/en_us.json'), JSON.stringify(enOut, null, 2) + '\n');

  console.log(JSON.stringify({ replaced, uniqueKeys: values.size, reports: fileReports, skipped }, null, 2));
  if (skipped.length) process.exitCode = 2;
}

main();
