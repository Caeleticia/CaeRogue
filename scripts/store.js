/* CaeRogue - persistence and content indexing. */
'use strict';

const STORAGE_KEY = 'caerogue.state.v1';

const DEFAULT_STATE = {
  version: 1,
  settings: {
    reduceMotion: false,
    compactLog: false,
    confirmAction: true,
    aiDelay: 650,
    showFormula: true,
    locale: 'zh_cn'
  },
  packs: [],
  enabledPacks: [CORE_PACK_ID],
  favorites: [],
  notes: {},
  decks: {
    A: deepClone(DEFAULT_LOADOUT_A),
    B: deepClone(DEFAULT_LOADOUT_B)
  },
  editorPack: null,
  coreOverride: null,
  customChallenges: [],
  tutorialCompleted: false,
  runs: { rogue: null, challenge: null, endless: null },
  history: []
};

function mergeState(base, saved) {
  const result = deepClone(base);
  if (!saved || typeof saved !== 'object') return result;
  for (const key of Object.keys(result)) {
    if (saved[key] === undefined) continue;
    if (key === 'settings' || key === 'decks' || key === 'runs') {
      if (saved[key] && typeof saved[key] === 'object') {
        result[key] = Object.assign(result[key], saved[key]);
      }
    } else {
      result[key] = saved[key];
    }
  }
  return result;
}

function normalizePack(raw) {
  if (!raw || typeof raw !== 'object') throw new Error(L('ui.d69ebf02573d'));
  if (raw.format && raw.format !== 'caerogue.expansion') {
    throw new Error(L('ui.0d9b1fa40159'));
  }
  const pack = deepClone(raw);
  pack.format = 'caerogue.expansion';
  pack.id = String(pack.id || '').trim();
  pack.name = String(pack.name || '').trim();
  pack.version = String(pack.version || '0.1.0');
  pack.author = String(pack.author || L('ui.9c5bde2a9e6b'));
  pack.description = String(pack.description || '');
  pack.dependencies = Array.isArray(pack.dependencies) ? pack.dependencies.map(String) : [];
  pack.countDefs = pack.countDefs && typeof pack.countDefs === 'object' ? pack.countDefs : {};
  const source = pack.content && typeof pack.content === 'object' ? pack.content : {};
  pack.content = {
    units: Array.isArray(source.units) ? source.units : [],
    skills: Array.isArray(source.skills) ? source.skills : [],
    effects: Array.isArray(source.effects) ? source.effects : [],
    equipment: Array.isArray(source.equipment) ? source.equipment : [],
    runes: Array.isArray(source.runes) ? source.runes : []
  };
  if (!pack.id) throw new Error(L('ui.6d127937d7c9'));
  if (!pack.name) throw new Error(L('ui.17a847915e0c'));
  if (pack.id === CORE_PACK_ID) throw new Error(L('ui.d32537a7cfc2'));
  return pack;
}

function packContentEntries(pack) {
  return Object.keys(pack.content).flatMap(category =>
    pack.content[category].map(item => ({ category, item }))
  );
}

function validatePackShape(pack, packs) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const allowedCategories = ['units', 'skills', 'effects', 'equipment', 'runes'];
  for (const category of Object.keys(pack.content)) {
    if (!allowedCategories.includes(category)) {
      errors.push(L('ui.1a207d574866') + category);
    }
  }
  for (const { category, item } of packContentEntries(pack)) {
    if (!item || typeof item !== 'object') { errors.push(category + L('ui.63e5b9af78a2')); continue; }
    if (!item.id || typeof item.id !== 'string') { errors.push(category + L('ui.b3525a7c5370')); continue; }
    if (seen.has(item.id)) {
      errors.push(L('ui.2496c2e19261') + item.id + L('ui.4b0bbcc0b17d') + seen.get(item.id) + L('ui.fd9fb52cb04d') + category + '。');
    } else {
      seen.set(item.id, category);
    }
    if (!item.packId) item.packId = pack.id;
    if (item.packId !== pack.id) {
      warnings.push(item.id + L('ui.d602932fcade'));
      item.packId = pack.id;
    }
    if (!item.name && category !== 'skills' && category !== 'effects') {
      errors.push(item.id + L('ui.896531bfcd14'));
    }
    if (!item.id.includes('.') && !item.id.startsWith(pack.id)) {
      warnings.push(item.id + L('ui.9b7c84f27d8b') + pack.id + '.' + item.id);
    }
  }
  const enabledIds = new Set([CORE_PACK_ID].concat((packs || []).filter(p => p.enabled !== false).map(p => p.id)));
  const duplicatesAgainstCore = [];
  for (const core of packContentEntries(CORE_PACK)) {
    if (seen.has(core.item.id)) duplicatesAgainstCore.push(core.item.id);
  }
  if (duplicatesAgainstCore.length) {
    errors.push(L('ui.0f9f4251bb16') + duplicatesAgainstCore.join('、'));
  }
  return { errors, warnings };
}

function validateReferences(pack, external, packs) {
  const errors = [];
  const warnings = [];
  const all = {
    units: new Map(), skills: new Map(), effects: new Map(), equipment: new Map(), runes: new Map()
  };
  for (const category of Object.keys(all)) {
    for (const item of CORE_PACK.content[category] || []) all[category].set(item.id, item);
    for (const p of (packs || [])) {
      if (p.id === pack.id) continue;
      for (const item of (p.content && p.content[category]) || []) all[category].set(item.id, item);
    }
    for (const item of pack.content[category] || []) all[category].set(item.id, item);
    if (external && external[category]) {
      for (const item of external[category]) all[category].set(item.id, item);
    }
  }
  const ref = (category, id, where) => {
    if (id && !all[category].has(id)) errors.push(where + L('ui.1e53a6f27849') + category + ' ID：' + id);
  };
  const inspectSteps = (steps, where) => {
    for (const step of steps || []) {
      if (!step || !step.kind) { errors.push(where + L('ui.d600afebbe1e')); continue; }
      if (step.kind === 'addEffect') ref('effects', step.effectId, where);
      if (step.kind === 'castSkill') ref('skills', step.skillId, where);
      if (step.kind === 'summon') ref('units', step.unitId, where);
      if (step.kind === 'branch') {
        inspectSteps(step.then, where);
        inspectSteps(step.elseSteps, where);
      }
      if (step.kind === 'forEach' || step.kind === 'loop') inspectSteps(step.steps, where);
    }
  };
  for (const unit of pack.content.units) {
    for (const id of unit.skills || []) ref('skills', id, L('ui.2daebba27c4b') + unit.id);
    for (const id of unit.equip || []) ref('equipment', id, L('ui.2daebba27c4b') + unit.id);
  }
  for (const skill of pack.content.skills) {
    inspectSteps(skill.steps, L('ui.ee24c1596501') + skill.id);
    for (const req of skill.requirements || []) {
      if (!req.countId) warnings.push(L('ui.ee24c1596501') + skill.id + L('ui.6fa83a8d9078'));
    }
  }
  for (const effect of pack.content.effects) {
    inspectSteps(effect.steps, L('ui.5db68ca5b9e1') + effect.id);
    for (const id of effect.grantedSkills || []) ref('skills', id, L('ui.5db68ca5b9e1') + effect.id);
  }
  for (const category of ['equipment', 'runes']) {
    for (const item of pack.content[category]) {
      for (const id of item.grantedSkills || []) ref('skills', id, category + ' ' + item.id);
    }
  }
  const deps = pack.dependencies || [];
  const known = new Set([CORE_PACK_ID].concat((packs || []).map(p => p.id)));
  for (const dep of deps) {
    if (!known.has(dep)) errors.push(L('ui.7e87033cc519') + dep);
    else if (dep !== CORE_PACK_ID) {
      const target = (packs || []).find(p => p.id === dep);
      if (target && target.enabled === false) warnings.push(L('ui.7ace1b38cf99') + dep + L('ui.b518b00a8750'));
    }
  }
  return { errors, warnings };
}

function buildIndex(packs, enabledIds) {
  const enabledSet = new Set(enabledIds || []);
  enabledSet.add(CORE_PACK_ID);
  const packMap = new Map();
  for (const pack of packs) packMap.set(pack.id, pack);
  const enabledPacks = [];
  const visiting = new Set();
  const visited = new Set();
  const orderErrors = [];
  const visit = (pack) => {
    if (!pack || visited.has(pack.id)) return;
    if (visiting.has(pack.id)) { orderErrors.push(L('ui.d5bb0291456b') + pack.id); return; }
    visiting.add(pack.id);
    for (const dep of pack.dependencies || []) {
      const target = packMap.get(dep);
      if (target && enabledSet.has(dep)) visit(target);
    }
    visiting.delete(pack.id);
    visited.add(pack.id);
    enabledPacks.push(pack);
  };
  visit(CORE_PACK);
  for (const pack of packs) {
    if (enabledSet.has(pack.id)) visit(pack);
  }
  const index = {
    packs: enabledPacks,
    disabledPacks: packs.filter(p => !enabledSet.has(p.id)),
    errors: orderErrors,
    warnings: [],
    units: [], skills: [], effects: [], equipment: [], runes: [],
    maps: { units: new Map(), skills: new Map(), effects: new Map(), equipment: new Map(), runes: new Map() },
    countDefs: {}
  };
  const globalIds = new Map();
  for (const pack of enabledPacks) {
    Object.assign(index.countDefs, pack.countDefs || {});
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const item of (pack.content && pack.content[category]) || []) {
        if (globalIds.has(item.id)) {
          index.errors.push(L('ui.b1bb158b9516') + item.id + '（' + globalIds.get(item.id) + ' / ' + pack.id + '）');
          continue;
        }
        globalIds.set(item.id, pack.id);
        const copy = item;
        copy.packId = pack.id;
        index[category].push(copy);
        index.maps[category].set(item.id, copy);
      }
    }
  }
  const check = validateReferences({ ...CORE_PACK, content: { units: [], skills: [], effects: [], equipment: [], runes: [] } }, {
    units: index.units, skills: index.skills, effects: index.effects, equipment: index.equipment, runes: index.runes
  }, enabledPacks.map(p => ({ ...p, enabled: true })));
  // The synthetic pack above only validates dependency state; run reference checks on enabled content.
  for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
    for (const item of index[category]) {
      const mini = {
        id: item.packId || CORE_PACK_ID,
        dependencies: [],
        content: { units: [], skills: [], effects: [], equipment: [], runes: [] }
      };
      mini.content[category] = [item];
      const result = validateReferences(mini, {
        units: index.units, skills: index.skills, effects: index.effects, equipment: index.equipment, runes: index.runes
      }, []);
      for (const error of result.errors) {
        if (!index.errors.includes(error)) index.errors.push(error);
      }
      for (const warning of result.warnings) {
        if (!index.warnings.includes(warning)) index.warnings.push(warning);
      }
    }
  }
  for (const error of check.errors) {
    if (!index.errors.includes(error)) index.errors.push(error);
  }
  index.cards = index.units.length + index.equipment.length + index.runes.length;
  index.packCount = enabledPacks.length;
  return index;
}

const Store = {
  state: null,
  index: null,
  storageAvailable: true,

  init() {
    this.load();
    this.rebuild();
    return this;
  },

  setDefaultDecks(decks) {
    if (!decks) return;
    DEFAULT_STATE.decks = {
      A: deepClone(decks.A || { units: [], equipment: [], runes: [] }),
      B: deepClone(decks.B || { units: [], equipment: [], runes: [] })
    };
  },

  load() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (error) {
      this.storageAvailable = false;
      console.warn(L('ui.1bccc342da64'), error);
    }
    this.state = mergeState(DEFAULT_STATE, saved);
    if (this.state.coreOverride && this.state.coreOverride.content) {
      CORE_PACK.content = deepClone(this.state.coreOverride.content);
      if (this.state.coreOverride.countDefs) CORE_PACK.countDefs = deepClone(this.state.coreOverride.countDefs);
    }
    if (!Array.isArray(this.state.packs)) this.state.packs = [];
    if (!Array.isArray(this.state.enabledPacks)) this.state.enabledPacks = [CORE_PACK_ID];
    if (!this.state.enabledPacks.includes(CORE_PACK_ID)) this.state.enabledPacks.unshift(CORE_PACK_ID);
    if (!this.state.decks || !this.state.decks.A) this.state.decks = deepClone(DEFAULT_STATE.decks);
    if (!this.state.settings) this.state.settings = deepClone(DEFAULT_STATE.settings);
    if (!this.state.runs) this.state.runs = { rogue: null, challenge: null, endless: null };
    if (!Array.isArray(this.state.favorites)) this.state.favorites = [];
    if (!this.state.notes || typeof this.state.notes !== 'object') this.state.notes = {};
  },

  save() {
    if (!this.storageAvailable) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      return true;
    } catch (error) {
      this.storageAvailable = false;
      console.warn(L('ui.9f3f362e3e89'), error);
      return false;
    }
  },

  rebuild() {
    const packs = this.state.packs.slice();
    const draft = this.state.editorPack;
    if (draft && draft.content && ['units','skills','effects','equipment','runes'].some(key => (draft.content[key] || []).length) && !packs.some(pack => pack.id === draft.id)) {
      packs.push(draft);
    }
    const enabled = this.state.enabledPacks.slice();
    if (draft && packs.includes(draft) && !enabled.includes(draft.id)) enabled.push(draft.id);
    this.index = buildIndex(packs, enabled);
    return this.index;
  },

  clearEditorDraft() {
    const draft = this.state.editorPack;
    if (!draft) return;
    for (const category of ['units','skills','effects','equipment','runes']) {
      draft.content[category] = [];
    }
    draft.id = 'draft.' + Date.now().toString(36);
    draft.name = L('ui.927d996998e7');
    draft.description = L('ui.7711be7d78d6');
    this.save();
    this.rebuild();
  },

  content() {
    if (!this.index) this.rebuild();
    return this.index;
  },

  getPack(id) {
    if (id === CORE_PACK_ID) return CORE_PACK;
    if (this.state.editorPack && this.state.editorPack.id === id) return this.state.editorPack;
    return this.state.packs.find(p => p.id === id) || null;
  },

  allPacks() {
    return [CORE_PACK].concat(this.state.packs);
  },

  isEnabled(id) {
    return id === CORE_PACK_ID || this.state.enabledPacks.includes(id);
  },

  setEnabled(id, enabled) {
    if (id === CORE_PACK_ID) return { ok: false, error: L('ui.cfdaf0d50d9e') };
    const pack = this.getPack(id);
    if (!pack) return { ok: false, error: L('ui.97fc67a2516d') };
    if (enabled) {
      const missing = (pack.dependencies || []).filter(dep => dep !== CORE_PACK_ID && !this.state.enabledPacks.includes(dep));
      if (missing.length) return { ok: false, error: L('ui.3300cff25b58') + missing.join('、') };
      if (!this.state.enabledPacks.includes(id)) this.state.enabledPacks.push(id);
    } else {
      const dependents = this.state.packs.filter(p => p.enabled !== false && this.state.enabledPacks.includes(p.id) && (p.dependencies || []).includes(id));
      if (dependents.length) return { ok: false, error: L('ui.08fc02344a0a') + dependents.map(p => p.name).join('、') };
      this.state.enabledPacks = this.state.enabledPacks.filter(p => p !== id);
    }
    this.save();
    this.rebuild();
    return { ok: true };
  },

  validatePack(raw, options) {
    let pack;
    try {
      pack = normalizePack(raw);
    } catch (error) {
      return { ok: false, errors: [error.message], warnings: [] };
    }
    const errors = [];
    const warnings = [];
    const existing = this.state.packs.find(p => p.id === pack.id);
    if (existing && !(options && options.replace)) {
      errors.push(L('ui.82895873b489') + pack.id);
    }
    const shape = validatePackShape(pack, this.state.packs);
    errors.push(...shape.errors);
    warnings.push(...shape.warnings);
    // Global ID collision check against all other local packs, not just core.
    const existingIds = new Set();
    for (const other of this.state.packs) {
      if (options && options.replace && other.id === pack.id) continue;
      for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
        for (const item of (other.content && other.content[category]) || []) existingIds.add(item.id);
      }
    }
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const item of pack.content[category]) {
        if (existingIds.has(item.id)) errors.push(L('ui.7c7770ad73d4') + item.id);
        if (!item.packId) item.packId = pack.id;
      }
    }
    // Detect dependency cycles across the new pack and already imported packs.
    const graph = new Map();
    for (const other of this.state.packs) {
      if (options && options.replace && other.id === pack.id) continue;
      graph.set(other.id, (other.dependencies || []).slice());
    }
    graph.set(pack.id, (pack.dependencies || []).slice());
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) { errors.push(L('ui.eab82623234d') + id); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dep of graph.get(id) || []) {
        if (dep === CORE_PACK_ID) continue;
        if (!graph.has(dep)) { errors.push(L('ui.7e87033cc519') + dep); continue; }
        visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
    };
    visit(pack.id);
    const refs = validateReferences(pack, null, this.state.packs);
    errors.push(...refs.errors);
    warnings.push(...refs.warnings);
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const item of pack.content[category]) {
        if (!item.packId) item.packId = pack.id;
      }
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], pack };
  },

  importPack(raw, options) {
    const result = this.validatePack(raw, options);
    if (!result.ok) return result;
    const pack = result.pack;
    const idx = this.state.packs.findIndex(p => p.id === pack.id);
    if (idx >= 0) {
      this.state.packs[idx] = pack;
      if (!this.state.enabledPacks.includes(pack.id)) this.state.enabledPacks.push(pack.id);
    } else {
      this.state.packs.push(pack);
      if (options && options.disabled) {
        this.state.enabledPacks = this.state.enabledPacks.filter(id => id !== pack.id);
      } else if (!this.state.enabledPacks.includes(pack.id)) {
        this.state.enabledPacks.push(pack.id);
      }
    }
    // Loading by dependency order: enable known dependencies before dependent content.
    const enableDependencies = (target) => {
      for (const dep of target.dependencies || []) {
        if (dep === CORE_PACK_ID) continue;
        const dependency = this.state.packs.find(candidate => candidate.id === dep);
        if (dependency && !this.state.enabledPacks.includes(dep)) {
          this.state.enabledPacks.push(dep);
          enableDependencies(dependency);
        }
      }
    };
    if (!(options && options.disabled)) enableDependencies(pack);
    this.save();
    this.rebuild();
    return { ok: true, pack, warnings: result.warnings, errors: [] };
  },

  removePack(id) {
    if (id === CORE_PACK_ID) return { ok: false, error: L('ui.bdfd8f6d7236') };
    const dependents = this.state.packs.filter(p => (p.dependencies || []).includes(id));
    if (dependents.length) return { ok: false, error: L('ui.f68aad2478e4') + dependents.map(p => p.name).join('、') + L('ui.fa185c59f50f') };
    this.state.packs = this.state.packs.filter(p => p.id !== id);
    this.state.enabledPacks = this.state.enabledPacks.filter(p => p !== id);
    delete this.state.notes[id];
    this.state.favorites = this.state.favorites.filter(f => f !== id);
    this.save();
    this.rebuild();
    return { ok: true };
  },

  toggleFavorite(id) {
    const pos = this.state.favorites.indexOf(id);
    if (pos >= 0) this.state.favorites.splice(pos, 1);
    else this.state.favorites.push(id);
    this.save();
    return this.state.favorites.includes(id);
  },

  setNote(id, note) {
    this.state.notes[id] = String(note || '').slice(0, 2000);
    this.save();
  },

  getEditorPack() {
    if (!this.state.editorPack) {
      this.state.editorPack = emptyPack(L('ui.927d996998e7'), L('ui.21a877f585cc'));
      this.state.editorPack.id = 'draft.local';
      this.state.editorPack.description = L('ui.7711be7d78d6');
      this.save();
    }
    return this.state.editorPack;
  },

  saveEditorPack() {
    if (this.state.editorPack) {
      for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
        (this.state.editorPack.content[category] || []).forEach(item => { item.packId = this.state.editorPack.id; });
      }
      this.state.editorPack.description = L('ui.5bc7baa80a5f');
      this.save();
      this.rebuild();
    }
  },

  saveCoreOverride() {
    this.state.coreOverride = {
      content: deepClone(CORE_PACK.content),
      countDefs: deepClone(CORE_PACK.countDefs || {})
    };
    this.save();
    this.rebuild();
  },

  saveLocalPack(pack) {
    if (!pack || !pack.id) return false;
    const index = this.state.packs.findIndex(item => item.id === pack.id);
    if (index < 0) return false;
    this.state.packs[index] = pack;
    this.save();
    this.rebuild();
    return true;
  },

  saveDeck(side, deck) {
    this.state.decks[side] = deepClone(deck);
    this.save();
  },

  recordRun(mode, run) {
    this.state.runs[mode] = run;
    this.save();
  },

  archiveRun(entry) {
    this.state.history.unshift(Object.assign({ at: Date.now() }, entry));
    this.state.history = this.state.history.slice(0, 20);
    this.save();
  },

  resetAll() {
    this.state = deepClone(DEFAULT_STATE);
    if (window.CORE_PACK_BASE) {
      CORE_PACK.content = deepClone(window.CORE_PACK_BASE.content);
      CORE_PACK.countDefs = deepClone(window.CORE_PACK_BASE.countDefs || {});
    }
    this.save();
    this.rebuild();
  },

  toggleSetting(key) {
    this.state.settings[key] = !this.state.settings[key];
    this.save();
    return this.state.settings[key];
  }
};

function encodeShareCode(pack) {
  const json = JSON.stringify(pack);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return 'CAE1.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeShareCode(code) {
  const clean = String(code || '').trim().replace(/^CAE1\./, '').replace(/\s+/g, '');
  if (!clean) throw new Error(L('ui.2c423ba5c502'));
  const normalized = clean.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - clean.length % 4) % 4);
  let binary;
  try { binary = atob(normalized); } catch (error) { throw new Error(L('ui.18c918efdd0d')); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch (error) { throw new Error(L('ui.351fcba48c74')); }
  return parsed;
}
