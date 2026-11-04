/* CaeRogue - unified card editor for units, skills, effects, equipment and runes. */
'use strict';

const EDITOR_STEP_TARGETS = [
  { value: 'chosen', label: L('ui.0e2625da999f') },
  { value: 'self', label: L('ui.e60de50dcabc') },
  { value: 'eventTarget', label: L('ui.ac7be574b031') },
  { value: 'eventTargets', label: L('ui.97a21f874c8c') },
  { value: 'allEnemies', label: L('ui.426f21cc899b') },
  { value: 'allAllies', label: L('ui.59a3c70f7d7c') },
  { value: 'item', label: L('ui.71c2d1456d3c') },
  { value: 'owner', label: L('ui.9840e52ac1c6') }
];

const HIDDEN_STEP_KINDS = new Set(['selectTarget', 'readCount', 'setVar']);

const EDITOR_CONDITION_OPS = [
  { value: 'gte', label: L('ui.6c2c5ef4dc66') }, { value: 'gt', label: L('ui.66f156cddca3') },
  { value: 'lte', label: L('ui.314d34856eca') }, { value: 'lt', label: L('ui.0511b2da735f') },
  { value: 'eq', label: L('ui.9653e1d99f01') }, { value: 'neq', label: L('ui.571002599134') }
];

const EDITOR_MODES = [
  { id: 'units', kind: 'unit', collection: 'units', label: L('ui.6b26695e4dce'), newAction: 'ed-new-unit', card: true },
  { id: 'skills', kind: 'skill', collection: 'skills', label: L('ui.53da139b6a5c'), newAction: 'ed-new-skill', card: false },
  { id: 'effects', kind: 'effect', collection: 'effects', label: L('ui.151ddd4f1f9f'), newAction: 'ed-new-effect', card: false },
  { id: 'equipment', kind: 'equipment', collection: 'equipment', label: L('ui.1faf3321a84f'), newAction: 'ed-new-equipment', card: true },
  { id: 'runes', kind: 'rune', collection: 'runes', label: L('ui.52bd5ee23b8d'), newAction: 'ed-new-rune', card: true }
];

function deepListClone(value) { return JSON.parse(JSON.stringify(value)); }

const EditorUI = {
  mode: 'units',
  targetPackId: null,
  selectedId: null,
  dirty: false,
  _lastFormulaInput: null,
  _dragState: null,
  _lastValidation: null,

  reset() {
    this.mode = 'units';
    this.targetPackId = null;
    this.selectedId = null;
    this.dirty = false;
    this._lastFormulaInput = null;
    this._dragState = null;
    this._lastValidation = null;
  },

  modeInfo(mode) {
    return EDITOR_MODES.find(item => item.id === (mode || this.mode)) || EDITOR_MODES[0];
  },

  resolvePack(id) {
    if (!id) return null;
    if (id === CORE_PACK_ID) return CORE_PACK;
    const editorPack = Store.getEditorPack();
    if (editorPack && editorPack.id === id) return editorPack;
    return (Store.state.packs || []).find(pack => pack.id === id) || null;
  },

  currentPack() {
    if (!this.targetPackId) this.targetPackId = Store.getEditorPack().id;
    const resolved = this.resolvePack(this.targetPackId);
    if (resolved) return resolved;
    this.targetPackId = Store.getEditorPack().id;
    return Store.getEditorPack();
  },

  persistPack() {
    const pack = this.currentPack();
    if (!pack) return;
    if (pack === Store.getEditorPack()) {
      Store.saveEditorPack();
    } else if (pack.id === CORE_PACK_ID) {
      Store.saveCoreOverride();
    } else {
      Store.saveLocalPack(pack);
    }
  },

  selectPack(app, id) {
    if (!this.resolvePack(id)) return;
    this.targetPackId = id;
    this.selectedId = null;
    this.dirty = false;
    app.render();
  },

  migrateFormulaText(value) {
    if (typeof value !== 'string' || !value) return value;
    let text = value;
    const replace = (pattern, replacement) => { text = text.replace(pattern, replacement); };
    replace(/\$target\.count\.([A-Za-z0-9_.-]+)/g, '{target}.count[$1]');
    replace(/\$target\.effect\.([A-Za-z0-9_.-]+)/g, '{target}.effect[$1].count');
    replace(/\$source\.effect\.([A-Za-z0-9_.-]+)/g, '{self}.effect[$1].count');
    replace(/\$effect\.([A-Za-z0-9_.-]+)/g, '{self}.effect[$1].count');
    replace(/\$target\.hpMax/g, '{target}.max_hp');
    replace(/\$target\.maxHp/g, '{target}.max_hp');
    replace(/\$target\.missingHp/g, '({target}.max_hp - {target}.hp)');
    replace(/\$target\.hpPct/g, '({target}.hp / {target}.max_hp * 100)');
    replace(/\$target\.hpRatio/g, '({target}.hp / {target}.max_hp)');
    replace(/\$target\.hp\b/g, '{target}.hp');
    replace(/\$target\.atk\b/g, '{target}.atk');
    replace(/\$target\.resist\b/g, '{target}.res');
    replace(/\$targetCount\b/g, '{target}.count');
    replace(/\$lastHitCount\b/g, '{self}.last_hit_count');
    replace(/\$hpMax\b/g, '{self}.max_hp');
    replace(/\$atk\b/g, '{self}.atk');
    replace(/\$hp\b/g, '{self}.hp');
    replace(/\$resist\b/g, '{self}.res');
    replace(/\$count\.([A-Za-z0-9_.-]+)/g, '{self}.count[$1]');
    replace(/\$sideCount\.([A-Za-z0-9_.-]+)/g, '{friendlyside}.count[$1]');
    replace(/\$globalCount\.([A-Za-z0-9_.-]+)/g, '{field}.count[$1]');
    return text;
  },

  migrateTargetText(value, step) {
    if (typeof value !== 'string' || !value) return value;
    if (/[{}\\]/.test(value) || /^\s*(choose|all|in|un|diff|with_effect|satisfy)\s*[\(<]/.test(value)) return value;
    const map = {
      chosen: '{target}',
      self: '{self}',
      allEnemies: 'all({enemy})',
      allAllies: 'all({friendly})',
      item: '{unit}',
      eventTarget: '{target}',
      eventTargets: 'all({target})',
      owner: step && step.ownerEffectId ? '{with_effect[' + step.ownerEffectId + ']}' : '{self}'
    };
    return map[value] || value;
  },

  migrateLegacyExpressions(app) {
    const pack = this.currentPack();
    if (!pack) return;
    let changed = 0;
    const targetKinds = ['damage', 'heal', 'addEffect', 'removeEffect', 'skipAction', 'forceRetreat', 'modifyStat', 'castSkill'];
    const migrateStep = (step) => {
      if (!step || typeof step !== 'object') return;
      if (targetKinds.includes(step.kind)) {
        const oldTarget = step.targetExpression || step.target || 'chosen';
        if (!step.legacyTarget) step.legacyTarget = this.isNewTargetText(step.target) ? 'chosen' : (step.target || 'chosen');
        step.targetExpression = this.migrateTargetText(step.targetExpression || step.target || '{target}', step);
        step.expressionMode = 'formula';
        changed += 1;
      }
      if (step.kind === 'forEach') {
        if (!step.legacySource) step.legacySource = this.isNewTargetText(step.source) ? 'chosen' : (step.source || 'chosen');
        step.sourceExpression = this.migrateTargetText(step.sourceExpression || step.source || '{target}', step);
        step.expressionMode = 'formula';
        changed += 1;
      }
      if (step.kind === 'branch') {
        if (!step.condition) {
          const opSymbols = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '==', neq: '!=' };
          step.condition = this.migrateFormulaText(String(step.left == null ? '0' : step.left)) + ' ' + (opSymbols[step.op] || '>=') + ' ' + this.migrateFormulaText(String(step.right == null ? '0' : step.right));
        }
        step.condition = this.migrateFormulaText(step.condition);
        step.expressionMode = 'formula';
        changed += 1;
      }
      for (const field of ['formula', 'times', 'stacks', 'condition']) {
        if (typeof step[field] === 'string' && step.kind !== 'branch') {
          const next = this.migrateFormulaText(step[field]);
          if (next !== step[field]) { step[field] = next; changed += 1; }
        }
      }
      for (const key of ['then', 'elseSteps', 'steps']) {
        if (Array.isArray(step[key])) step[key].forEach(migrateStep);
      }
    };
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const item of pack.content[category] || []) {
        if (item.trigger && typeof item.trigger.condition === 'string') {
          const next = this.migrateFormulaText(item.trigger.condition);
          if (next !== item.trigger.condition) { item.trigger.condition = next; changed += 1; }
        }
        for (const req of item.requirements || []) {
          if (typeof req.value === 'string') {
            const next = this.migrateFormulaText(req.value);
            if (next !== req.value) { req.value = next; changed += 1; }
          }
        }
        (item.steps || []).forEach(migrateStep);
      }
    }
    this.persistPack();
    this.dirty = false;
    app.render();
    app.toast(L('ui.0a1fdf9d6c50') + changed + L('ui.0bbb89db26ab'), 'success');
  },

  openPackIdEditor(app) {
    const pack = this.currentPack();
    if (!pack || pack.id === CORE_PACK_ID) { app.toast(L('ui.cad643af664c'), 'error'); return; }
    app.openModal({
      title: L('ui.9bedf391e1e4'),
      subtitle: L('ui.ad6faec4fc24'),
      body: L('ui.0e00c9587512') + attr(pack.id) + L('ui.aa6e3ea1d48c'),
      foot: L('ui.15e72c49d2b0')
    });
  },

  openItemIdEditor(app) {
    const item = this.currentItem(app);
    if (!item || this.isReadOnly(app)) return;
    const pack = this.currentPack();
    const type = this.modeInfo(this.mode).kind;
    app.openModal({
      title: L('ui.b3445fa500e9'),
      subtitle: L('ui.cbcc221c347b'),
      body: L('ui.add0743b1b3e') + attr(item.id) + L('ui.7acf3485abbc') + esc(pack.id + '_' + type + '_') + L('ui.bd69de8ecc5b'),
      foot: L('ui.82b5b141b1d5')
    });
  },

  rewriteReferences(mapping) {
    if (!mapping || !Object.keys(mapping).length) return;
    const replaceList = list => Array.isArray(list) ? list.map(id => mapping[id] || id) : list;
    const replaceFormula = value => {
      if (typeof value !== 'string' || !value) return value;
      let next = value;
      for (const [oldId, newId] of Object.entries(mapping)) {
        next = next.split('$effect.' + oldId).join('$effect.' + newId);
        next = next.split('$target.effect.' + oldId).join('$target.effect.' + newId);
        next = next.split('$source.effect.' + oldId).join('$source.effect.' + newId);
        next = next.split('effect[' + oldId + ']').join('effect[' + newId + ']');
        next = next.split('with_effect[' + oldId + ']').join('with_effect[' + newId + ']');
        next = next.split('[' + oldId + ']').join('[' + newId + ']');
      }
      return next;
    };
    const replaceSteps = steps => {
      if (!Array.isArray(steps)) return;
      for (const step of steps) {
        if (!step) continue;
        if (mapping[step.effectId]) step.effectId = mapping[step.effectId];
        if (mapping[step.skillId]) step.skillId = mapping[step.skillId];
        if (mapping[step.unitId]) step.unitId = mapping[step.unitId];
        for (const field of ['formula', 'times', 'left', 'right', 'stacks', 'condition', 'targetExpression', 'sourceExpression']) {
          if (step[field] !== undefined) step[field] = replaceFormula(step[field]);
        }
        replaceSteps(step.then);
        replaceSteps(step.elseSteps);
        replaceSteps(step.steps);
      }
    };
    const packs = [CORE_PACK, Store.getEditorPack()].concat(Store.state.packs || []);
    const seen = new Set();
    for (const pack of packs) {
      if (!pack || !pack.content || seen.has(pack.id)) continue;
      seen.add(pack.id);
      for (const event of pack.rogueEvents || []) {
        for (const choice of event.choices || []) {
          if (choice && mapping[choice.id]) choice.id = mapping[choice.id];
        }
      }
      const rewriteConfig = (value) => {
        if (Array.isArray(value)) return value.map(rewriteConfig);
        if (typeof value === 'string') return mapping[value] || value;
        if (value && typeof value === 'object') {
          const next = {};
          for (const key of Object.keys(value)) next[key] = rewriteConfig(value[key]);
          return next;
        }
        return value;
      };
      if (pack.rogueConfig) pack.rogueConfig = rewriteConfig(pack.rogueConfig);
      for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
        for (const item of pack.content[category] || []) {
          if (item.skills) item.skills = replaceList(item.skills);
          if (item.equip) item.equip = replaceList(item.equip);
          if (item.grantedSkills) item.grantedSkills = replaceList(item.grantedSkills);
          if (item.trigger && item.trigger.condition) item.trigger.condition = replaceFormula(item.trigger.condition);
          replaceSteps(item.steps);
        }
      }
    }
    const rewriteDeck = deck => {
      if (!deck) return;
      deck.units = replaceList(deck.units);
      deck.equipment = replaceList(deck.equipment);
      deck.runes = replaceList(deck.runes);
    };
    rewriteDeck(Store.state.decks.A);
    rewriteDeck(Store.state.decks.B);
    for (const run of Object.values(Store.state.runs || {})) {
      if (!run) continue;
      rewriteDeck(run.deck);
      run.activeUnits = replaceList(run.activeUnits);
      run.activeEquipment = replaceList(run.activeEquipment);
      run.activeRunes = replaceList(run.activeRunes);
      if (Array.isArray(run.characterShop)) run.characterShop.forEach(offer => { if (mapping[offer.unitId]) offer.unitId = mapping[offer.unitId]; });
      if (run.upgrades && Array.isArray(run.upgrades.startEffects)) {
        run.upgrades.startEffects.forEach(item => { if (mapping[item.effectId]) item.effectId = mapping[item.effectId]; });
      }
    }
    for (const challenge of Store.state.customChallenges || []) {
      for (const stage of challenge.stages || []) {
        if (stage.opponent) stage.opponent.units = replaceList(stage.opponent.units);
        if (stage.opponent) stage.opponent.equipment = replaceList(stage.opponent.equipment);
        if (stage.opponent) stage.opponent.runes = replaceList(stage.opponent.runes);
      }
    }
    DEFAULT_LOADOUT_A.units = replaceList(DEFAULT_LOADOUT_A.units);
    DEFAULT_LOADOUT_A.equipment = replaceList(DEFAULT_LOADOUT_A.equipment);
    DEFAULT_LOADOUT_A.runes = replaceList(DEFAULT_LOADOUT_A.runes);
    DEFAULT_LOADOUT_B.units = replaceList(DEFAULT_LOADOUT_B.units);
    DEFAULT_LOADOUT_B.equipment = replaceList(DEFAULT_LOADOUT_B.equipment);
    DEFAULT_LOADOUT_B.runes = replaceList(DEFAULT_LOADOUT_B.runes);
    for (const challenge of CHALLENGE_DEFINITIONS) {
      for (const stage of challenge.stages || []) {
        if (!stage.opponent) continue;
        stage.opponent.units = replaceList(stage.opponent.units);
        stage.opponent.equipment = replaceList(stage.opponent.equipment);
        stage.opponent.runes = replaceList(stage.opponent.runes);
        if (stage.rule && stage.rule.enemyStartEffect) {
          if (mapping[stage.rule.enemyStartEffect.target]) stage.rule.enemyStartEffect.target = mapping[stage.rule.enemyStartEffect.target];
          if (mapping[stage.rule.enemyStartEffect.effect]) stage.rule.enemyStartEffect.effect = mapping[stage.rule.enemyStartEffect.effect];
        }
      }
    }
  },

  applyPackId(app) {
    const input = document.getElementById('editor-pack-id');
    const pack = this.currentPack();
    if (!input || !pack || pack.id === CORE_PACK_ID) return;
    const newId = input.value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(newId)) { app.toast(L('ui.baf5993e420f'), 'error'); return; }
    if (newId === CORE_PACK_ID) { app.toast(L('ui.a204c5229054'), 'error'); return; }
    const collision = (Store.state.packs || []).some(item => item.id === newId && item !== pack) || (Store.getEditorPack().id === newId && Store.getEditorPack() !== pack);
    if (collision) { app.toast(L('ui.963d32e5f2dc'), 'error'); return; }
    const oldId = pack.id;
    const mapping = {};
    const typeMap = { units: 'unit', skills: 'skill', effects: 'effect', equipment: 'equipment', runes: 'rune' };
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const item of pack.content[category] || []) {
        let custom = item.id;
        for (const prefix of [oldId + '.', oldId + '_']) if (custom.startsWith(prefix)) custom = custom.slice(prefix.length);
        for (const prefix of [typeMap[category] + '.', typeMap[category] + '_']) if (custom.startsWith(prefix)) custom = custom.slice(prefix.length);
        custom = custom.replace(/[^A-Za-z0-9_.-]/g, '_') || 'item';
        const nextId = newId + '_' + typeMap[category] + '_' + custom;
        mapping[item.id] = nextId;
        item.id = nextId;
        item.packId = newId;
      }
    }
    pack.id = newId;
    if (pack === Store.getEditorPack()) {
      this.targetPackId = newId;
    } else {
      const enabledIndex = Store.state.enabledPacks.indexOf(oldId);
      if (enabledIndex >= 0) Store.state.enabledPacks[enabledIndex] = newId;
      for (const other of Store.state.packs) {
        if (!Array.isArray(other.dependencies)) continue;
        other.dependencies = other.dependencies.map(dep => dep === oldId ? newId : dep);
      }
      this.targetPackId = newId;
    }
    this.rewriteReferences(mapping);
    this.selectedId = mapping[this.selectedId] || null;
    this.persistPack();
    this.dirty = false;
    app.closeModal(true);
    app.render();
    app.toast(L('ui.de605339cd8c'), 'success');
  },

  applyItemId(app) {
    const input = document.getElementById('editor-item-id');
    const item = this.currentItem(app);
    const pack = this.currentPack();
    if (!input || !item || !pack) return;
    const newId = input.value.trim();
    const type = this.modeInfo(this.mode).kind;
    const required = pack.id + '_' + type + '_';
    if (!newId.startsWith(required) || newId.length <= required.length) { app.toast(L('ui.6b7be53b217c') + required + L('ui.c7e4cf6c4350'), 'error'); return; }
    if (!/^[A-Za-z0-9_.-]+$/.test(newId)) { app.toast(L('ui.772ddb498484'), 'error'); return; }
    const allIds = new Set();
    const seenPacks = new Set();
    for (const candidate of [CORE_PACK, Store.getEditorPack()].concat(Store.state.packs || [])) {
      if (!candidate || seenPacks.has(candidate.id)) continue;
      seenPacks.add(candidate.id);
      for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
        for (const entry of (candidate.content && candidate.content[category]) || []) {
          if (entry !== item) allIds.add(entry.id);
        }
      }
    }
    if (allIds.has(newId)) { app.toast(L('ui.af831f78e58f'), 'error'); return; }
    const mapping = { [item.id]: newId };
    item.id = newId;
    this.rewriteReferences(mapping);
    this.selectedId = newId;
    this.persistPack();
    this.dirty = false;
    app.closeModal(true);
    app.render();
    app.toast(L('ui.c5cee566ec03'), 'success');
  },

  enter(app) {
    if (!this.targetPackId || !this.resolvePack(this.targetPackId)) this.targetPackId = Store.getEditorPack().id;
    const pack = this.currentPack();
    if (!pack) return;
    if (!EDITOR_MODES.some(item => item.id === this.mode)) this.mode = 'units';
    const items = this.itemsForMode(pack, this.mode);
    const external = this.referenceItems(this.mode, pack);
    if (!this.selectedId || !items.concat(external).some(item => item.id === this.selectedId)) {
      const fallback = items[0] || external[0];
      this.selectedId = fallback ? fallback.id : null;
    }
  },

  itemsForMode(pack, mode) {
    if (!pack) return [];
    const info = this.modeInfo(mode);
    return (pack.content && pack.content[info.collection]) || [];
  },

  referenceItems(mode, pack) {
    const draftIds = new Set(this.itemsForMode(pack, mode).map(item => item.id));
    const info = this.modeInfo(mode);
    const source = Store.index[info.collection] || [];
    return source.filter(item => !draftIds.has(item.id));
  },

  currentItem(app) {
    const pack = this.currentPack();
    if (!pack || !this.selectedId) return null;
    const draft = this.itemsForMode(pack, this.mode).find(item => item.id === this.selectedId);
    if (draft) return draft;
    const map = Store.index.maps[this.modeInfo(this.mode).collection];
    return map ? (map.get(this.selectedId) || null) : null;
  },

  isReadOnly(app) {
    const pack = this.currentPack();
    if (!pack || !this.selectedId) return false;
    return !this.itemsForMode(pack, this.mode).some(item => item.id === this.selectedId);
  },

  markDirty() {
    this.dirty = true;
    const status = document.querySelector('.autosave-status');
    if (status) {
      status.classList.add('dirty');
      status.textContent = L('ui.b035e280075e');
    }
  },

  save(app, silent) {
    this.persistPack();
    this.dirty = false;
    if (!silent) {
      app.toast(L('ui.bbc2b23814a9'), 'success');
      app.render();
    } else {
      this.renderValidationPanel(app);
    }
  },

  makeId(pack, kind) {
    const prefix = pack.id + '_' + kind + '_';
    const used = new Set();
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      (pack.content[category] || []).forEach(item => used.add(item.id));
      (Store.index[category] || []).forEach(item => used.add(item.id));
    }
    let index = 1;
    while (used.has(prefix + index)) index += 1;
    return prefix + index;
  },

  newSkill(app) {
    const pack = this.currentPack();
    const item = {
      id: this.makeId(pack, 'skill'),
      packId: pack.id,
      name: L('ui.8af18deb9d99'),
      type: 'active',
      op: 'attack',
      quality: 'white',
      targetMode: 'enemy',
      multiplier: 250,
      element: 'physical',
      valueType: 'atk',
      valueFormula: '{self}.atk',
      description: '',
      trigger: { event: 'manual' },
      requirements: [],
      steps: [{ kind: 'damage', target: '{target}', damageType: 'physical', formula: '{self}.atk', useSkillValue: true, rawDamage: false, valueFormula: '{self}.atk', multiplier: 250, ignoreResistance: false }]
    };
    pack.content.skills.push(item);
    this.mode = 'skills';
    this.selectedId = item.id;
    this.dirty = true;
    this.persistPack();
    app.render();
  },

  newEffect(app) {
    const pack = this.currentPack();
    const item = {
      id: this.makeId(pack, 'effect'),
      packId: pack.id,
      name: L('ui.483a7483df91'),
      type: 'special',
      removable: true,
      stackable: true,
      stackMax: 5,
      mods: {},
      grantedSkills: [],
      trigger: { event: 'none' },
      steps: [],
      description: ''
    };
    pack.content.effects.push(item);
    this.mode = 'effects';
    this.selectedId = item.id;
    this.dirty = true;
    this.persistPack();
    app.render();
  },

  newUnit(app) {
    const pack = this.currentPack();
    const item = {
      id: this.makeId(pack, 'unit'),
      packId: pack.id,
      name: L('ui.6eb8bd65f93e'),
      quality: 'white',
      type: 'unit',
      faction: 'general',
      counted: true,
      level: 90,
      hp: 100,
      attack: 10,
      defense: 10,
      atkPct: 0,
      atkFlat: 0,
      defPct: 0,
      defFlat: 8,
      hpPct: 0,
      hpFlat: 0,
      damageBonus: 0,
      damageBonusFlat: 0,
      elementBonus: { physical: 0, mental: 0, true: 0 },
      critRate: 5,
      critDamage: 50,
      luckyRate: 0,
      luckyDamage: 100,
      resistances: { physical: 5, mental: 5, true: 5 },
      penetration: { physical: 0, mental: 0, true: 0 },
      defensePen: 0,
      resistanceReduction: 0,
      damageTakenBonus: 0,
      vulnerability: 0,
      resistance: { type: 'general', value: 5 },
      skills: [],
      equip: [],
      autoAttack: false,
      noFieldSlot: false,
      untargetable: false,
      invincible: false,
      obtainable: true,
      maxHpCap: 0,
      art: 'assets/pictures/brand-mark.svg',
      flavor: ''
    };
    pack.content.units = pack.content.units || [];
    pack.content.units.push(item);
    this.mode = 'units';
    this.selectedId = item.id;
    this.dirty = true;
    this.persistPack();
    app.render();
  },

  newEquipment(app) {
    const pack = this.currentPack();
    const item = {
      id: this.makeId(pack, 'equipment'),
      packId: pack.id,
      name: L('ui.fe6afac70942'),
      quality: 'white',
      type: 'equipment',
      slot: 'accessory',
      mods: { dmgFlat: 1 },
      grantedSkills: [],
      art: 'assets/pictures/equipment-soap.svg',
      description: ''
    };
    pack.content.equipment = pack.content.equipment || [];
    pack.content.equipment.push(item);
    this.mode = 'equipment';
    this.selectedId = item.id;
    this.dirty = true;
    this.persistPack();
    app.render();
  },

  newRune(app) {
    const pack = this.currentPack();
    const item = {
      id: this.makeId(pack, 'rune'),
      packId: pack.id,
      name: L('ui.aefdfb3b8d82'),
      quality: 'white',
      type: 'rune',
      faction: 'any',
      mods: { dmgFlat: 1 },
      grantedSkills: [],
      art: 'assets/pictures/rune-art.svg',
      description: ''
    };
    pack.content.runes = pack.content.runes || [];
    pack.content.runes.push(item);
    this.mode = 'runes';
    this.selectedId = item.id;
    this.dirty = true;
    this.persistPack();
    app.render();
  },

  copyCurrent(app) {
    const pack = this.currentPack();
    const info = this.modeInfo(this.mode);
    const item = this.currentItem(app);
    if (!item) return;
    const clone = deepListClone(item);
    clone.id = this.makeId(pack, info.kind);
    clone.packId = pack.id;
    clone.name = (item.name || item.id) + L('ui.69b8ea0a8ccb');
    pack.content[info.collection] = pack.content[info.collection] || [];
    pack.content[info.collection].push(clone);
    this.selectedId = clone.id;
    this.dirty = true;
    this.persistPack();
    app.render();
    app.toast(L('ui.edd969b9461a'), 'success');
  },

  deleteCurrent(app) {
    const pack = this.currentPack();
    const info = this.modeInfo(this.mode);
    const list = pack.content[info.collection] || [];
    const pos = list.findIndex(item => item.id === this.selectedId);
    if (pos < 0) return;
    const removed = list[pos];
    app.confirm({
      title: L('ui.1960db8499c4'),
      message: L('ui.c00714d938cd') + removed.name + L('ui.e26d412de228'),
      confirmLabel: L('ui.3755f56f2f83'),
      danger: true,
      onConfirm: () => {
        list.splice(pos, 1);
        this.dirty = true;
        const next = list[pos] || list[pos - 1] || this.referenceItems(this.mode, pack)[0];
        this.selectedId = next ? next.id : null;
        this.persistPack();
        app.render();
      }
    });
  },

  selectItem(app, kind, id) {
    const info = EDITOR_MODES.find(item => item.kind === kind) || this.modeInfo(this.mode);
    this.mode = info.id;
    this.selectedId = id;
    app.render();
  },

  switchMode(app, mode) {
    this.mode = EDITOR_MODES.some(item => item.id === mode) ? mode : 'units';
    const pack = this.currentPack();
    const draft = this.itemsForMode(pack, this.mode);
    const refs = this.referenceItems(this.mode, pack);
    this.selectedId = (draft[0] || refs[0] || {}).id || null;
    app.render();
  },

  allEffectRefs() {
    const pack = this.currentPack();
    const map = new Map(Store.index.effects.map(item => [item.id, item]));
    this.itemsForMode(pack, 'effects').forEach(item => map.set(item.id, item));
    return [...map.values()];
  },

  allSkillRefs() {
    const pack = this.currentPack();
    const map = new Map(Store.index.skills.map(item => [item.id, item]));
    this.itemsForMode(pack, 'skills').forEach(item => map.set(item.id, item));
    return [...map.values()];
  },

  stepList(item, listPath) {
    if (!item) return null;
    if (!listPath || listPath === 'root') return item.steps || (item.steps = []);
    const segments = String(listPath).split('.');
    if (segments[0] !== 'root') return null;
    let list = item.steps || (item.steps = []);
    for (let i = 1; i < segments.length; i += 2) {
      const index = Number(segments[i]);
      const key = segments[i + 1];
      if (!list || !list[index] || !['then', 'elseSteps', 'steps'].includes(key)) return null;
      if (!Array.isArray(list[index][key])) list[index][key] = [];
      list = list[index][key];
    }
    return list;
  },

  optionList(options, current, placeholder) {
    const exists = options.some(option => option.value === current);
    let html = placeholder ? '<option value=""' + (!current ? ' selected' : '') + '>' + esc(placeholder) + '</option>' : '';
    if (current && !exists) html += '<option value="' + attr(current) + '" selected>' + esc(current) + L('ui.6179f3beed2f');
    html += options.map(option => '<option value="' + attr(option.value) + '"' + (String(option.value) === String(current) ? ' selected' : '') + '>' + esc(option.label) + '</option>').join('');
    return html;
  },

  fieldRow(label, inputHtml, hint) {
    return '<div class="step-field"><label>' + esc(label) + '</label>' + inputHtml + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</div>';
  },

  stepInput(listPath, index, field, value, options) {
    options = options || {};
    const cls = 'input ' + (options.mono ? 'formula-input mono' : '') + (options.compact ? ' compact' : '');
    const attrs = 'data-list-path="' + attr(listPath) + '" data-step-index="' + index + '" data-step-field="' + attr(field) + '"' + (options.disabled ? ' disabled' : '');
    if (options.type === 'select') {
      return '<select class="select ' + (options.mono ? 'formula-input mono' : '') + '" ' + attrs + '>' + this.optionList(options.options || [], value, options.placeholder) + '</select>';
    }
    if (options.type === 'textarea') {
      return '<textarea class="textarea ' + (options.mono ? 'formula-input mono' : '') + '" rows="2" ' + attrs + '>' + esc(value == null ? '' : value) + '</textarea>';
    }
    return '<input class="' + cls + '" type="' + (options.type || 'text') + '" value="' + attr(value == null ? '' : value) + '" ' + attrs + '>';
  },

  stepCheckbox(listPath, index, field, checked, label, disabled) {
    return '<label class="form-check-inline"><input type="checkbox" data-list-path="' + attr(listPath) + '" data-step-index="' + index + '" data-step-field="' + attr(field) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '> ' + esc(label) + '</label>';
  },

  isNewTargetText(value) {
    return typeof value === 'string' && (/[{}\\]/.test(value) || /^\s*(choose|all|in|un|diff|with_effect|satisfy)\s*[\(<]/.test(value));
  },

  stepSupportsExpression(step) {
    if (!step || HIDDEN_STEP_KINDS.has(step.kind)) return false;
    return ['damage', 'heal', 'addEffect', 'removeEffect', 'skipAction', 'forceRetreat', 'modifyStat', 'castSkill', 'branch', 'forEach'].includes(step.kind);
  },

  stepExpressionMode(step) {
    if (step && (step.expressionMode === 'formula' || step.expressionMode === 'legacy')) return step.expressionMode;
    if (!step) return 'legacy';
    if (step.kind === 'branch') return step.condition != null && step.condition !== '' ? 'formula' : 'legacy';
    if (step.kind === 'forEach') return step.sourceExpression ? 'formula' : (this.isNewTargetText(step.source) ? 'formula' : 'legacy');
    if (step.targetExpression) return 'formula';
    return this.isNewTargetText(step.target) ? 'formula' : 'legacy';
  },

  legacyTargetValue(step) {
    if (!step) return 'chosen';
    if (step.legacyTarget) return step.legacyTarget;
    if (step.target && !this.isNewTargetText(step.target)) return step.target;
    return 'chosen';
  },

  formulaTargetValue(step) {
    if (!step) return '{target}';
    if (step.targetExpression) return step.targetExpression;
    if (step.target && this.isNewTargetText(step.target)) return step.target;
    return this.migrateTargetText(step.target || step.legacyTarget || 'chosen', step) || '{target}';
  },

  legacySourceValue(step) {
    if (!step) return 'chosen';
    if (step.legacySource) return step.legacySource;
    if (step.source && !this.isNewTargetText(step.source)) return step.source;
    return 'chosen';
  },

  formulaSourceValue(step) {
    if (!step) return '{target}';
    if (step.sourceExpression) return step.sourceExpression;
    if (step.source && this.isNewTargetText(step.source)) return step.source;
    return this.migrateTargetText(step.source || step.legacySource || 'chosen', step) || '{target}';
  },

  stepTargetField(step, listPath, index, readOnly) {
    const mode = this.stepExpressionMode(step);
    if (mode === 'formula') {
      return this.fieldRow(L('ui.941f08313a1d'), this.stepInput(listPath, index, 'targetExpression', this.formulaTargetValue(step), { mono: true, disabled: readOnly }), L('ui.1ccf91cb5c5c'));
    }
    return this.fieldRow(L('ui.941f08313a1d'), this.stepInput(listPath, index, 'legacyTarget', this.legacyTargetValue(step), { type: 'select', options: EDITOR_STEP_TARGETS, disabled: readOnly }), L('ui.61026d382dfb'));
  },

  stepSourceField(step, listPath, index, readOnly) {
    const mode = this.stepExpressionMode(step);
    if (mode === 'formula') {
      return this.fieldRow(L('ui.396c7421b532'), this.stepInput(listPath, index, 'sourceExpression', this.formulaSourceValue(step), { mono: true, disabled: readOnly }), L('ui.2de87ae6921f'));
    }
    return this.fieldRow(L('ui.396c7421b532'), this.stepInput(listPath, index, 'legacySource', this.legacySourceValue(step), { type: 'select', options: EDITOR_STEP_TARGETS, disabled: readOnly }), L('ui.21ea89b7eb0a'));
  },

  stepFields(item, step, listPath, index, readOnly) {
    const html = this.stepFieldsInner(item, step, listPath, index, readOnly);
    const effectiveLegacyTarget = step.expressionMode === 'legacy' ? (step.legacyTarget || step.target) : step.target;
    const ownerMode = effectiveLegacyTarget === 'owner' || step.mode === 'owner' || step.source === 'owner';
    if (!ownerMode || !html) return html;
    const effectOptions = this.allEffectRefs().map(effect => ({ value: effect.id, label: effect.name + ' · ' + effect.id }));
    const extra = this.fieldRow(L('ui.3571fa81f147'), this.stepInput(listPath, index, 'ownerEffectId', step.ownerEffectId || '', { type: 'select', options: effectOptions, placeholder: L('ui.8035adedbcd1'), disabled: readOnly }), L('ui.dae392f2b7f4'));
    const pos = html.lastIndexOf('</div>');
    return pos >= 0 ? html.slice(0, pos) + extra + html.slice(pos) : html + extra;
  },

  stepFieldsInner(item, step, listPath, index, readOnly) {
    const disabled = readOnly;
    const effectOptions = this.allEffectRefs().map(effect => ({ value: effect.id, label: effect.name + ' · ' + effect.id }));
    const skillOptions = this.allSkillRefs().map(skill => ({ value: skill.id, label: skill.name + ' · ' + skill.id }));
    const unitOptions = Store.index.units.map(unit => ({ value: unit.id, label: unit.name + ' · ' + unit.id }));
    switch (step.kind) {
      case 'damage': {
        const damageTypeField = this.fieldRow(L('ui.c8078d8a7256'), this.stepInput(listPath, index, 'damageType', step.damageType || 'physical', { type: 'select', options: Object.keys(DAMAGE_TYPES).map(key => ({ value: key, label: DAMAGE_TYPES[key].label })), disabled }));
        if (step.damageType === 'true') {
          return '<div class="step-fields">' +
            this.stepTargetField(step, listPath, index, readOnly) +
            damageTypeField +
            this.fieldRow(L('ui.1bc57d8190dc'), this.stepInput(listPath, index, 'formula', step.formula == null ? '0' : step.formula, { mono: true, disabled }), L('ui.628a66bc9b46')) +
            L('ui.75e7426ef98c') +
          '</div>';
        }
        return '<div class="step-fields">' +
          this.stepTargetField(step, listPath, index, readOnly) +
          damageTypeField +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'useSkillValue', !!step.useSkillValue, L('ui.61791f13fd80'), disabled) + '</div>' +
          this.fieldRow(L('ui.3fe475f7b233'), this.stepInput(listPath, index, 'valueFormula', step.valueFormula || '{self}.atk', { mono: true, disabled }), L('ui.389b292d27c0')) +
          this.fieldRow(L('ui.5e98c432057f'), this.stepInput(listPath, index, 'multiplier', step.multiplier == null ? '' : step.multiplier, { type: 'number', disabled }), L('ui.08c8a895638f')) +
          this.fieldRow(L('ui.edb1fa0b195a'), this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), L('ui.1b24c9b4ef8c')) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'ignoreResistance', !!step.ignoreResistance, L('ui.63d383e14a49'), disabled) + '</div>' +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'rawDamage', !!step.rawDamage, L('ui.a7a8c2ad57f3'), disabled) + '</div>' +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'bonus', !!step.bonus, L('ui.00e12d3558e4'), disabled) + '</div>' +
        '</div>';
      }
      case 'heal':
        return '<div class="step-fields">' + this.stepTargetField(step, listPath, index, readOnly) + this.fieldRow(L('ui.5ad1fb4006cf'), this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), L('ui.98a4c7619cff')) + '</div>';
      case 'addEffect':
        return '<div class="step-fields">' + this.stepTargetField(step, listPath, index, readOnly) + this.fieldRow(L('ui.6a4f4be10d6e'), this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: L('ui.5fd18d1eb114'), disabled })) + this.fieldRow(L('ui.15e4c563f602'), this.stepInput(listPath, index, 'stacks', step.stacks || '1', { mono: true, disabled })) + '</div>';
      case 'removeEffect':
        return '<div class="step-fields">' + this.stepTargetField(step, listPath, index, readOnly) + this.fieldRow(L('ui.151ddd4f1f9f'), this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: L('ui.5ac431ae3fea'), disabled })) + this.fieldRow(L('ui.90a0885a60a9'), this.stepInput(listPath, index, 'stacks', step.stacks || '9999', { mono: true, disabled })) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'force', !!step.force, L('ui.b778a2bd7c51'), disabled) + L('ui.d93883627dab') +
        '</div>';
      case 'removeNegativeOne':
      case 'removeNegativeAll':
      case 'removePositiveOne':
      case 'removePositiveAll':
        return '<div class="step-fields">' +
          this.stepTargetField(step, listPath, index, readOnly) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'force', !!step.force, L('ui.ffef974c1c09'), disabled) + '</div>' +
          '<div class="step-field full"><span class="field-hint">' + (step.kind.endsWith('All') ? L('ui.8ed688ce0936') : L('ui.69a8f078d6da')) + (step.kind.includes('Negative') ? L('ui.1814334f0ae2') : L('ui.70c2195016b7')) + L('ui.3a0e241f2316') +
        '</div>';
      case 'modifyCount':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.31618e13034d'), this.stepInput(listPath, index, 'scope', step.scope || 'unit', { type: 'select', options: Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), disabled })) +
          this.fieldRow(L('ui.27dc101a73b6'), this.stepInput(listPath, index, 'countId', step.countId || '', { mono: true, disabled })) +
          this.fieldRow(L('ui.1645ef4f7738'), this.stepInput(listPath, index, 'mode', step.mode || 'add', { type: 'select', options: [{ value: 'add', label: L('ui.469014b66495') }, { value: 'set', label: L('ui.f6ac7bb91fa7') }], disabled })) +
          this.fieldRow(L('ui.3fe475f7b233'), this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled }), L('ui.ca57b0fe29bb')) +
        '</div>';
      case 'readCount':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.31618e13034d'), this.stepInput(listPath, index, 'scope', step.scope || 'unit', { type: 'select', options: Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), disabled })) +
          this.fieldRow(L('ui.27dc101a73b6'), this.stepInput(listPath, index, 'countId', step.countId || '', { mono: true, disabled })) +
          this.fieldRow(L('ui.74e6096f270d'), this.stepInput(listPath, index, 'varName', step.varName || 'value', { disabled }), L('ui.c68f6c4dada6')) +
        '</div>';
      case 'branch': {
        const conditionFields = this.stepExpressionMode(step) === 'formula'
          ? this.fieldRow(L('ui.25290fa627bb'), this.stepInput(listPath, index, 'condition', step.condition || '1 == 1', { mono: true, disabled }), L('ui.6d97351c849d'))
          : this.fieldRow(L('ui.adf0c6adb033'), this.stepInput(listPath, index, 'left', step.left || '0', { mono: true, disabled })) +
            this.fieldRow(L('ui.ea940279447b'), this.stepInput(listPath, index, 'op', step.op || 'gte', { type: 'select', options: EDITOR_CONDITION_OPS.map(op => ({ value: op.value, label: op.label })), disabled })) +
            this.fieldRow(L('ui.425f92eaa7c1'), this.stepInput(listPath, index, 'right', step.right || '0', { mono: true, disabled }));
        return '<div class="step-fields">' + conditionFields + '</div>' + this.renderNested(item, step.then, listPath + '.' + index + '.then', L('ui.5b36a4a467dd'), readOnly, 'then') + this.renderNested(item, step.elseSteps, listPath + '.' + index + '.elseSteps', L('ui.05fbede32616'), readOnly, 'elseSteps');
      }
      case 'selectTarget':
        return '<div class="step-fields">' + this.fieldRow(L('ui.263cd7f8c7ef'), this.stepInput(listPath, index, 'mode', step.mode || 'all({enemy})', { mono: true, disabled }), L('ui.be5b11bba6e3')) + this.fieldRow(L('ui.60d0c801757c'), this.stepInput(listPath, index, 'varName', step.varName || '', { disabled })) + '</div>';
      case 'forEach':
        return '<div class="step-fields">' + this.stepSourceField(step, listPath, index, readOnly) + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', L('ui.b23b3f7a705d'), readOnly, 'steps');
      case 'loop':
        return '<div class="step-fields">' + this.fieldRow(L('ui.afc168b7d7ff'), this.stepInput(listPath, index, 'times', step.times || '1', { mono: true, disabled }), L('ui.fc8b3b99435d')) + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', L('ui.b23b3f7a705d'), readOnly, 'steps');
      case 'castSkill':
        return '<div class="step-fields">' + this.fieldRow(L('ui.53da139b6a5c'), this.stepInput(listPath, index, 'skillId', step.skillId || '', { type: 'select', options: skillOptions, placeholder: L('ui.af6ccc9dee69'), disabled })) + this.stepTargetField(step, listPath, index, readOnly) + '</div>';
      case 'skipAction':
        return '<div class="step-fields">' + this.stepTargetField(step, listPath, index, readOnly) + L('ui.594414c28118');
      case 'immuneDamage':
        return L('ui.47e707f96348');
      case 'forceRetreat':
        return '<div class="step-fields">' + this.stepTargetField(step, listPath, index, readOnly) + '</div>';
      case 'summon':
        return '<div class="step-fields">' + this.fieldRow(L('ui.5faece5e0845'), this.stepInput(listPath, index, 'unitId', step.unitId || '', { type: 'select', options: unitOptions, placeholder: L('ui.2150939fb166'), disabled })) + this.fieldRow(L('ui.d4d8e09af202'), this.stepInput(listPath, index, 'count', step.count || '1', { mono: true, disabled })) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'summonAsChild', !!step.summonAsChild, L('ui.1aac6ae98de5'), disabled) + L('ui.d77c5d6c6eb5') +
          this.fieldRow(L('ui.8b67957918c9'), this.stepInput(listPath, index, 'childId', step.childId || '', { mono: true, disabled }), L('ui.6dbe195b4718')) +
          this.fieldRow(L('ui.eabd1258ddc3'), this.stepInput(listPath, index, 'childTag', step.childTag || '', { mono: true, disabled }), L('ui.a9d3a94c8b8b')) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'ignoreFieldLimit', !!step.ignoreFieldLimit, L('ui.691e0721d2df'), disabled) + L('ui.25a490af5686') +
        '</div>';
      case 'modifyStat':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.7d3c35c29be1'), this.stepInput(listPath, index, 'stat', step.stat || 'atkFlat', { type: 'select', options: Object.keys(STAT_KEYS).map(key => ({ value: key, label: STAT_KEYS[key] })), disabled })) +
          this.stepTargetField(step, listPath, index, readOnly) +
          this.fieldRow(L('ui.3fe475f7b233'), this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled }), L('ui.e02ed032b906')) +
        '</div>';
      case 'setVar':
        return '<div class="step-fields">' + this.fieldRow(L('ui.63d5977de669'), this.stepInput(listPath, index, 'varName', step.varName || 'value', { disabled })) + this.fieldRow(L('ui.3f27035af46b'), this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled })) + '</div>';
      default:
        return L('ui.8361787c9741') + esc(step.kind) + '</div>';
    }
  },

  renderNested(item, steps, listPath, label, readOnly, key) {
    const list = Array.isArray(steps) ? steps : [];
    return '<div class="nested-wrap"><div class="nested-label">' + esc(label) + '</div><div class="step-list nested" data-step-list="' + attr(listPath) + '">' +
      (list.length ? list.map((step, index) => this.renderStep(item, step, listPath, index, readOnly, 1)).join('') : L('ui.c87b7b1ab964')) +
    '</div>' + (readOnly ? '' : '<button class="nested-add" type="button" data-action="ed-step-add" data-list-path="' + attr(listPath) + L('ui.f6c409cc739d')) + '</div>';
  },

  renderStep(item, step, listPath, index, readOnly, depth) {
    const meta = STEP_LIBRARY.find(entry => entry.kind === step.kind) || { name: step.kind, group: L('ui.09d316b96552') };
    if (HIDDEN_STEP_KINDS.has(step.kind)) {
      return L('ui.ab1f69fdd1dc') + esc(meta.name) + L('ui.87a2805dd343') +
        (readOnly ? '' : '<button class="icon-btn small danger" type="button" data-action="ed-step-delete" data-list-path="' + attr(listPath) + '" data-index="' + index + L('ui.2b99232466c2')) +
      '</div>';
    }
    const exprToggle = this.stepSupportsExpression(step)
      ? '<span class="step-expr-toggle"><button class="segment' + (this.stepExpressionMode(step) === 'legacy' ? ' active' : '') + '" type="button" data-action="ed-step-expression-mode" data-list-path="' + attr(listPath) + '" data-index="' + index + '" data-mode="legacy"' + (readOnly ? ' disabled' : '') + L('ui.0890d8aa7764') + (this.stepExpressionMode(step) === 'formula' ? ' active' : '') + '" type="button" data-action="ed-step-expression-mode" data-list-path="' + attr(listPath) + '" data-index="' + index + '" data-mode="formula"' + (readOnly ? ' disabled' : '') + L('ui.1168cdadf936')
      : '';
    const displayName = step.kind === 'damage' && step.bonus ? L('ui.683a6ce05a97') : meta.name;
    const isBranch = ['branch', 'forEach', 'loop'].includes(step.kind);
    return '<div class="step-block' + (isBranch ? ' branch-step' : '') + '" data-step-block data-list-path="' + attr(listPath) + '" data-index="' + index + '" draggable="' + (!readOnly ? 'true' : 'false') + '">' +
      '<div class="step-head">' +
        L('ui.72ce12b6885f') + (readOnly ? ' disabled' : '') + '>≡</button>' +
        '<span class="step-num">' + (depth ? String(index + 1) : String(index + 1)) + '</span>' +
        '<span class="step-title">' + esc(displayName) + '</span>' +
        '<span class="step-kind">' + esc(meta.group) + '</span>' +
        exprToggle +
        '<div class="step-actions">' +
          (readOnly ? '' : '<button type="button" data-action="ed-step-up" data-list-path="' + attr(listPath) + '" data-index="' + index + L('ui.a333ba0515d6') + attr(listPath) + '" data-index="' + index + L('ui.7504bd22acc6') + attr(listPath) + '" data-index="' + index + L('ui.beb772a2beb2') + attr(listPath) + '" data-index="' + index + L('ui.40ce48891ee4')) +
        '</div>' +
      '</div>' +
      '<div class="step-body">' + this.stepFields(item, step, listPath, index, readOnly) + '</div>' +
    '</div>';
  },

  renderStepList(item, listPath, steps, readOnly, label) {
    const list = Array.isArray(steps) ? steps : [];
    return '<div class="step-list" data-step-list="' + attr(listPath) + '">' +
      (list.length ? list.map((step, index) => this.renderStep(item, step, listPath, index, readOnly, 0)).join('') : L('ui.80695beabf09')) +
    '</div>' +
    (readOnly ? '' : '<div class="step-add-row"><button class="btn btn-sm" type="button" data-action="ed-step-add" data-list-path="' + attr(listPath) + L('ui.1655037c60f2'));
  },

  renderRequirements(skill, readOnly) {
    const reqs = Array.isArray(skill.requirements) ? skill.requirements : [];
    return '<div class="requirement-list">' +
      (reqs.length ? reqs.map((req, index) => '<div class="requirement-row">' +
        '<select class="select" data-req-index="' + index + '" data-req-field="scope"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), req.scope || 'unit') + '</select>' +
        '<input class="input" value="' + attr(req.countId || '') + L('ui.831b82443dd1') + index + '" data-req-field="countId"' + (readOnly ? ' disabled' : '') + '>' +
        '<select class="select" data-req-index="' + index + '" data-req-field="op"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(EDITOR_CONDITION_OPS, req.op || 'gte') + '</select>' +
        '<input class="input" value="' + attr(req.value == null ? '1' : req.value) + L('ui.4827c3c136d8') + index + '" data-req-field="value"' + (readOnly ? ' disabled' : '') + '>' +
        (readOnly ? '<span></span>' : '<button class="icon-btn small danger" type="button" data-action="ed-req-remove" data-index="' + index + L('ui.b40a2ca4d7e1')) +
      '</div>').join('') : L('ui.0f3d9470a081')) +
      (readOnly ? '' : L('ui.568e7fb4cd77')) +
    '</div>';
  },

  renderMetadata(app, item, readOnly) {
    const skill = this.mode === 'skills';
    const triggerOptions = [{ value: 'none', label: L('ui.15fe152362b1') }].concat(Object.keys(TRIGGER_EVENTS).filter(key => key !== 'none' && !(skill && key === 'immediate')).map(key => ({ value: key, label: TRIGGER_EVENTS[key].label })));
    return '<div class="form-grid">' +
      L('ui.9d9af6dca809') + attr(item.name || '') + '" data-meta-field="name"' + (readOnly ? ' disabled' : '') + L('ui.34892b0d0d8f') +
      '<div class="form-row"><label class="field-label">ID</label><input class="input mono" value="' + attr(item.id) + L('ui.2697ab3b3046') +
      (skill ? L('ui.73c082a28e31') + Object.keys(QUALITIES).map(key => '<button class="quality-choice ' + qualityClass(key) + ((item.quality || 'white') === key ? ' active' : '') + '" type="button" data-action="ed-set-quality" data-quality="' + key + L('ui.f54702ea891c') + QUALITIES[key].label + '"' + (readOnly ? ' disabled' : '') + '></button>').join('') + '</div></div>' : L('ui.79318760094f') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(EFFECT_TYPES).map(key => ({ value: key, label: EFFECT_TYPES[key].label })), item.type || 'special') + '</select></div>') +
      (skill ? L('ui.1b71ccd319de') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_TYPES).map(key => ({ value: key, label: SKILL_TYPES[key].label })), item.type || 'active') + '</select><div class="field-hint">' + esc((SKILL_TYPES[item.type] || SKILL_TYPES.active).hint) + '</div></div>' +
        L('ui.bb2b328a8294') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_OPS).map(key => ({ value: key, label: SKILL_OPS[key].label })), item.op || 'attack') + '</select></div>' : '') +
      L('ui.9ff547a2306b') + (readOnly ? ' disabled' : '') + '>' + this.optionList(triggerOptions, item.trigger && item.trigger.event || 'manual') + '</select><div class="field-hint">' + (skill && item.type === 'active' ? L('ui.4ad699aba869') : skill && item.type === 'extra' ? L('ui.6c041caa42ff') : L('ui.8f4ebf634322')) + '</div></div>' +
      (skill ? L('ui.38835eff0bdb') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(TARGET_MODES).map(key => ({ value: key, label: TARGET_MODES[key].label })), item.targetMode || 'none') + '</select></div>' +
        L('ui.e79e3118cc71') + attr(item.multiplier == null ? 100 : item.multiplier) + '" data-meta-field="multiplier"' + (readOnly ? ' disabled' : '') + L('ui.2fdfdf7b0297') : '') +
        L('ui.29723f6b797e') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(DAMAGE_TYPES).map(key => ({ value: key, label: DAMAGE_TYPES[key].label })), item.element || 'physical') + '</select></div>' +
        L('ui.b6137bfb41d6') + (readOnly ? ' disabled' : '') + '>' + this.optionList([{ value: 'atk', label: L('ui.ef28aed2341d') }, { value: 'formula', label: L('ui.64b12d5550b8') }], item.valueType || 'atk') + '</select></div>' +
        L('ui.ef73633f571d') + attr(item.valueFormula || '{self}.atk') + '" data-meta-field="valueFormula"' + (readOnly ? ' disabled' : '') + '></div>' +
      (skill ? this.renderToggleRow(L('ui.e1685b370a52'), 'negativeImmune', !!item.negativeImmune, readOnly, L('ui.b27d05d6e02a')) : '') +
      (skill ? L('ui.4727c405de40') + attr(item.trigger && item.trigger.condition || '') + '" data-meta-field="triggerCondition"' + (readOnly ? ' disabled' : '') + L('ui.e50e8d596a73') : '') +
      L('ui.ccf99943ddb0') + (readOnly ? ' disabled' : '') + L('ui.3087d3d543a2') + esc(item.description || '') + '</textarea></div>' +
      (!skill ? L('ui.096f09158028') + this.effectToggle('stackable', item.stackable, L('ui.9fcbcbc1d6b5'), readOnly) + '<input class="input compact mono" style="width:74px" type="number" min="1" max="99" value="' + attr(item.stackMax == null ? 1 : item.stackMax) + '" data-meta-field="stackMax"' + (readOnly ? ' disabled' : '') + L('ui.567df4920729') +
        L('ui.209064a4e70f') + this.effectToggle('removable', item.removable !== false, L('ui.52ba1b7ebdb0'), readOnly) + L('ui.63757c0abb85') : '') +
    '</div>';
  },

  effectToggle(field, value, label, readOnly) {
    return '<button class="toggle' + (value ? ' on' : '') + '" type="button" aria-pressed="' + (value ? 'true' : 'false') + '" data-action="ed-toggle-meta" data-field="' + attr(field) + '"' + (readOnly ? ' disabled' : '') + ' aria-label="' + attr(label) + '"></button><span class="small">' + esc(label) + '</span>';
  },

  renderMods(item, readOnly) {
    const mods = item.mods || {};
    const keys = Object.keys(mods);
    return '<div>' + (keys.length ? keys.map(key => '<div class="mod-row">' +
      '<select class="select" data-mod-key="' + attr(key) + '" data-mod-field="key"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(STAT_KEYS).map(stat => ({ value: stat, label: STAT_KEYS[stat] })), key) + '</select>' +
      '<input class="input mono" type="number" step="0.01" value="' + attr(mods[key]) + '" data-mod-key="' + attr(key) + '" data-mod-field="value"' + (readOnly ? ' disabled' : '') + '>' +
      (readOnly ? '<span></span>' : '<button class="icon-btn small danger" type="button" data-action="ed-mod-remove" data-stat="' + attr(key) + '">×</button>') +
    '</div>').join('') : L('ui.4c3f5e430fc7')) +
    (readOnly ? '' : L('ui.a548fa329f30')) + '</div>';
  },

  renderGrantedSkills(item, readOnly) {
    const skills = this.allSkillRefs();
    const selected = new Set(item.grantedSkills || []);
    return '<div class="effect-granted-list">' + (skills.length ? skills.map(skill => '<label class="form-check-inline"><input type="checkbox" data-granted-skill="' + attr(skill.id) + '"' + (selected.has(skill.id) ? ' checked' : '') + (readOnly ? ' disabled' : '') + '> ' + esc(skill.name) + '</label>').join('') : L('ui.0e77467fd865')) + '</div>';
  },

  renderValidationPanel(app) {
    const node = document.getElementById('editor-validation');
    if (!node) return;
    const result = this.validateCurrent(app);
    this._lastValidation = result;
    node.innerHTML = this.renderValidationBox(result);
  },

  renderValidationBox(result) {
    if (!result) return L('ui.de381fa64548');
    const issues = result.errors.concat(result.warnings);
    return '<div class="validation-box ' + (result.errors.length ? 'bad' : result.warnings.length ? 'warn' : 'ok') + '">' +
      '<div class="validation-title"><span class="mark">' + (result.errors.length ? '!' : result.warnings.length ? '—' : L('ui.e19e218cd9c6')) + '</span>' + (result.errors.length ? L('ui.76a2ac2d133d') + result.errors.length + L('ui.d1a26b083c74') : result.warnings.length ? L('ui.eb126b0fd738') + result.warnings.length + L('ui.78cb87625436') : L('ui.7035f86dd0f0')) + '</div>' +
      (issues.length ? '<ul class="validation-index-list">' + result.errors.map(error => '<li class="err">' + esc(error) + '</li>').join('') + result.warnings.map(warning => '<li>' + esc(warning) + '</li>').join('') + '</ul>' : L('ui.0df63923177e')) +
    '</div>';
  },

  validateCurrent(app) {
    const item = this.currentItem(app);
    const readOnly = this.isReadOnly(app);
    if (!item) return { errors: [], warnings: [], readOnly };
    if (readOnly) return { errors: [], warnings: [], readOnly: true, reference: true };
    const errors = [];
    const warnings = [];
    const pack = this.currentPack();
    const mode = this.mode;
    const skill = mode === 'skills';
    const effect = mode === 'effects';
    if (!item.name || !String(item.name).trim()) errors.push(L('ui.bef8696071ea'));
    if (!item.id) errors.push(L('ui.8b116c26c58b'));
    if (item.id && !String(item.id).startsWith(pack.id + '_')) warnings.push(L('ui.1b1431afeade') + pack.id + '。');
    if (item.quality && !QUALITIES[item.quality]) errors.push(L('ui.f07f0ab2803c'));
    const externalIds = new Set();
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      for (const ext of Store.index[category] || []) {
        if (ext.packId !== pack.id) externalIds.add(ext.id);
      }
    }
    const draftAll = [];
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) draftAll.push(...(pack.content[category] || []));
    const duplicate = draftAll.filter(entry => entry.id === item.id).length;
    if (duplicate > 1) errors.push(L('ui.9a66a2d28de4') + item.id);
    if (externalIds.has(item.id)) errors.push(L('ui.e643bf84f170') + item.id);
    if (skill) {
      if (!SKILL_TYPES[item.type]) errors.push(L('ui.9abd54c06a44'));
      if (!SKILL_OPS[item.op]) errors.push(L('ui.d27510405fa5'));
      if (item.type === 'passive' && (!item.trigger || ['none', 'manual', ''].includes(item.trigger.event))) errors.push(L('ui.4c792159ebce'));
      if (item.type === 'extra' && !(item.requirements && item.requirements.length) && !(item.trigger && item.trigger.condition)) errors.push(L('ui.f4f8eab6af0b'));
      if (item.type === 'active' && item.trigger && item.trigger.event && !['manual', 'actionStart'].includes(item.trigger.event)) warnings.push(L('ui.3c6c401f098e'));
      if (!(item.steps || []).length) warnings.push(L('ui.dc09ef254881'));
      const hasDamageStep = (list) => (list || []).some(step => step.kind === 'damage' || ['then','elseSteps','steps'].some(key => Array.isArray(step[key]) && hasDamageStep(step[key])));
      const hasDamage = hasDamageStep(item.steps || []);
      if (hasDamage && !DAMAGE_TYPES[item.element || 'physical']) errors.push(L('ui.0a0f5e6d2f98'));
      if (!Number.isFinite(Number(item.multiplier)) || Number(item.multiplier) < 0) errors.push(L('ui.46cbcd699466'));
      if (hasDamage && !String(item.valueFormula || '').trim()) errors.push(L('ui.97e359f41150'));
      if (!String(item.description || '').trim()) warnings.push(L('ui.a06a5f75494a'));
      const referenced = Store.index.units.some(unit => (unit.skills || []).includes(item.id)) ||
        Store.index.equipment.some(gear => (gear.grantedSkills || []).includes(item.id)) ||
        Store.index.runes.some(rune => (rune.grantedSkills || []).includes(item.id)) ||
        Store.index.effects.some(effectItem => (effectItem.grantedSkills || []).includes(item.id)) ||
        (pack.content.effects || []).some(effectItem => (effectItem.grantedSkills || []).includes(item.id));
      if (!referenced && !readOnly) warnings.push(L('ui.db54bdef9686'));
    } else if (effect) {
      if (!EFFECT_TYPES[item.type]) errors.push(L('ui.79a0bd676e89'));
      if (item.stackable && (!Number(item.stackMax) || Number(item.stackMax) < 1)) errors.push(L('ui.e542b7f44585'));
      if (!(item.steps || []).length && (!item.mods || !Object.keys(item.mods).length) && !(item.grantedSkills || []).length) warnings.push(L('ui.ed884c417441'));
      if (!String(item.description || '').trim()) warnings.push(L('ui.d1ed3d82270f'));
    } else if (mode === 'units') {
      const hp = Number(item.hp);
      const attack = Number(item.attack);
      const resist = item.resistance || {};
      if (!Number.isFinite(hp) || hp < 1 || !Number.isInteger(hp)) errors.push(L('ui.17ed8d9d076b'));
      if (!Number.isFinite(attack) || attack < 0) errors.push(L('ui.4c6dfc0d69c0'));
      if (item.defense != null && (!Number.isFinite(Number(item.defense)) || Number(item.defense) < 0)) errors.push(L('ui.895a1dc96a4b'));
      if (item.level != null && (!Number.isFinite(Number(item.level)) || Number(item.level) < 1)) errors.push(L('ui.257a8341e07c'));
      const statFields = ['atkPct','atkFlat','defPct','defFlat','hpPct','hpFlat','damageBonus','damageBonusFlat','critRate','critDamage','luckyRate','luckyDamage','defensePen','resistanceReduction','damageTakenBonus','vulnerability'];
      for (const field of statFields) {
        if (item[field] != null && item[field] !== '' && !Number.isFinite(Number(item[field]))) errors.push(L('ui.8814d56646a1') + field);
      }
      for (const mapField of ['elementBonus','resistances','penetration']) {
        for (const key of Object.keys(item[mapField] || {})) {
          if (!Number.isFinite(Number(item[mapField][key]))) errors.push(L('ui.8814d56646a1') + mapField + '.' + key);
        }
      }
      if (!RESISTANCE_TYPES[resist.type]) errors.push(L('ui.9775dc9eb377'));
      if (!Number.isFinite(Number(resist.value)) || Number(resist.value) < 0) errors.push(L('ui.a901a114c657'));
      if (item.maxHpCap != null && item.maxHpCap !== '' && (!Number.isFinite(Number(item.maxHpCap)) || Number(item.maxHpCap) < 0)) errors.push(L('ui.962ed3551b34'));
      const knownSkills = new Set(this.allSkillRefs().map(entry => entry.id));
      for (const skillId of item.skills || []) {
        if (!knownSkills.has(skillId)) errors.push(L('ui.bc5a9193ee77') + skillId);
      }
      if (!(item.skills || []).length) errors.push(L('ui.c22b06c7c6a4'));
      if (!String(item.flavor || '').trim()) warnings.push(L('ui.b7eaa3a782f8'));
      if (!String(item.art || '').trim()) warnings.push(L('ui.c267ba04684d'));
    } else if (mode === 'equipment') {
      if (!['weapon', 'accessory'].includes(item.slot)) errors.push(L('ui.8900ab1e49a0'));
      if ((!item.mods || !Object.keys(item.mods).length) && !(item.grantedSkills || []).length) warnings.push(L('ui.a29d379ad387'));
      if (!String(item.description || '').trim()) warnings.push(L('ui.0bf9b9110726'));
      if (!String(item.art || '').trim()) warnings.push(L('ui.17ffd1ee1dbd'));
    } else if (mode === 'runes') {
      if (!String(item.faction || '').trim()) errors.push(L('ui.95d07294c2f7'));
      if ((!item.mods || !Object.keys(item.mods).length) && !(item.grantedSkills || []).length) warnings.push(L('ui.afc03faa59f6'));
      if (!String(item.description || '').trim()) warnings.push(L('ui.a0e56cddcd56'));
      if (!String(item.art || '').trim()) warnings.push(L('ui.674a45621083'));
    }
    if (item.trigger && item.trigger.condition) {
      try {
        tokenizeFormula(item.trigger.condition);
      } catch (error) {
        errors.push(L('ui.1411ff3655e4') + error.message);
      }
    }
    const effectMap = new Map(Store.index.effects.map(entry => [entry.id, entry]));
    for (const effect of pack.content.effects || []) effectMap.set(effect.id, effect);
    const skillMap = new Map(Store.index.skills.map(entry => [entry.id, entry]));
    for (const skillItem of pack.content.skills || []) skillMap.set(skillItem.id, skillItem);
    const unitMap = new Map(Store.index.units.map(entry => [entry.id, entry]));
    const inspectSteps = (steps, path) => {
      if (!Array.isArray(steps)) return;
      steps.forEach((step, index) => {
        if (!step || !step.kind) { errors.push(L('ui.54a7e2e458de') + path + index + L('ui.daf1289d91ac')); return; }
        if (step.kind === 'addEffect') {
          if (!step.effectId) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.4602e3320be2'));
          else if (!effectMap.has(step.effectId)) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.ef8a350ba1a8') + step.effectId);
        }
        if (step.kind === 'castSkill') {
          if (!step.skillId) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.9d5e84a857c4'));
          else if (!skillMap.has(step.skillId)) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.bd297ebc88ce') + step.skillId);
        }
        if (step.kind === 'summon') {
          if (!step.unitId) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.c3b49448ec8f'));
          else if (!unitMap.has(step.unitId)) errors.push(L('ui.54a7e2e458de') + path + index + L('ui.4852d5f66dcc') + step.unitId);
        }
        for (const field of ['formula', 'times', 'left', 'right', 'stacks']) {
          if (step[field] !== undefined && step[field] !== '' && step[field] !== null) {
            try { tokenizeFormula(step[field]); }
            catch (error) { errors.push(L('ui.54a7e2e458de') + path + index + L('ui.246cfa4efb1a') + field + L('ui.03355ef179ef') + error.message); }
          }
        }
        if (step.kind === 'branch') {
          inspectSteps(step.then, path + index + '.then.');
          inspectSteps(step.elseSteps, path + index + '.else.');
        }
        if (step.kind === 'forEach' || step.kind === 'loop') inspectSteps(step.steps, path + index + '.steps.');
      });
    };
    inspectSteps(item.steps || [], '');
    for (const id of item.grantedSkills || []) {
      if (!skillMap.has(id)) errors.push(L('ui.a0e4885cc72c') + id);
    }
    for (const req of item.requirements || []) {
      if (!req.countId) errors.push(L('ui.e47f525dd025'));
      if (!req.op) errors.push(L('ui.e698a8b02468'));
    }
    return { errors, warnings, readOnly };
  },

  cardTypeLabel(item) {
    if (this.mode === 'units') return L('ui.11d4fcf2be9c') + (item.hp == null ? 0 : item.hp) + ' · ' + (item.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26'));
    if (this.mode === 'equipment') return (item.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + ' · ' + (modSummary(item.mods, true) || L('ui.d9f936d25fe4'));
    if (this.mode === 'runes') return (item.faction === 'any' ? L('ui.d13a98752b5d') : (item.faction || L('ui.8c577dc72c73'))) + ' · ' + (modSummary(item.mods, true) || L('ui.d9f936d25fe4'));
    if (this.mode === 'skills') return (SKILL_TYPES[item.type] || { label: item.type }).label;
    return (EFFECT_TYPES[item.type] || { label: item.type }).label;
  },

  renderList(app, pack, mode) {
    const draft = this.itemsForMode(pack, mode);
    const refs = this.referenceItems(mode, pack);
    const draftHtml = draft.length ? draft.map(item => this.renderListItem(item, false)).join('') : L('ui.7e18916636f6');
    const refHtml = refs.length ? refs.map(item => this.renderListItem(item, true)).join('') : L('ui.e5a096c67afc');
    return '<div class="editor-list">' +
      L('ui.3f2f120f4735') + draft.length + '</div>' + draftHtml +
      L('ui.9d6819d24aca') + refs.length + '</div>' + refHtml +
    '</div>';
  },

  renderListItem(item, reference) {
    const info = this.modeInfo(this.mode);
    return '<button class="editor-list-item' + (item.id === this.selectedId ? ' active' : '') + '" type="button" data-action="ed-select" data-kind="' + attr(info.kind) + '" data-id="' + attr(item.id) + '">' +
      '<span class="eli-mark">' + (reference ? L('ui.a6c9557b8c29') : L('ui.e63d41bedeb6')) + '</span>' +
      '<span class="eli-main"><strong>' + esc(item.name || item.id) + '</strong><small>' + esc(this.cardTypeLabel(item)) + ' · ' + esc(item.id) + '</small></span>' +
    '</button>';
  },

  renderQualityPicker(item, readOnly) {
    return L('ui.73c082a28e31') +
      Object.keys(QUALITIES).map(key => '<button class="quality-choice ' + qualityClass(key) + ((item.quality || 'white') === key ? ' active' : '') + '" type="button" data-action="ed-set-quality" data-quality="' + key + L('ui.f54702ea891c') + QUALITIES[key].label + '"' + (readOnly ? ' disabled' : '') + '></button>').join('') +
    '</div></div>';
  },

  renderToggleRow(label, field, active, readOnly, hint) {
    return '<div class="form-row span-2"><div class="toggle-row"><div class="toggle-copy"><strong>' + esc(label) + '</strong>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</div><button class="toggle' + (active ? ' on' : '') + '" type="button" aria-pressed="' + (active ? 'true' : 'false') + '" data-action="ed-toggle-meta" data-field="' + attr(field) + '" aria-label="' + attr(label) + '"' + (readOnly ? ' disabled' : '') + '></button></div></div>';
  },

  metaPathValue(item, path) {
    let value = item;
    for (const key of String(path).split('.')) {
      if (!value || typeof value !== 'object') return undefined;
      value = value[key];
    }
    return value;
  },

  setMetaPathValue(item, path, value) {
    const parts = String(path).split('.');
    let target = item;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    target[parts[parts.length - 1]] = value;
  },

  unitStatField(item, field, label, readOnly, options) {
    options = options || {};
    const value = this.metaPathValue(item, field);
    const min = options.min == null ? 0 : options.min;
    return '<div class="form-row"><label class="field-label">' + esc(label) + '</label><input class="input mono" type="number" step="' + attr(options.step || '1') + '" min="' + attr(min) + '" value="' + attr(value == null ? (options.fallback == null ? 0 : options.fallback) : value) + '" data-meta-field="' + attr(field) + '"' + (readOnly ? ' disabled' : '') + '></div>';
  },

  renderCardMetadata(app, item, readOnly) {
    const disabled = readOnly ? ' disabled' : '';
    const mode = this.mode;
    const skills = this.allSkillRefs();
    const selectedSkills = new Set(item.skills || []);
    const commonTop = L('ui.7635c36819fd') + attr(item.name || '') + '" data-meta-field="name"' + disabled + '></div>' +
      '<div class="form-row"><label class="field-label">ID</label><input class="input mono" value="' + attr(item.id) + '" readonly></div>' +
      this.renderQualityPicker(item, readOnly);
    const artRow = L('ui.2772217f8945') + attr(item.art || '') + '" data-meta-field="art" placeholder="assets/pictures/..."' + disabled + L('ui.953655b0d171');
    if (mode === 'units') {
      return '<div class="form-grid stat-grid">' + commonTop +
        L('ui.8e3232d487ca') + attr(item.faction || '') + '" data-meta-field="faction"' + disabled + L('ui.fe2506bc3ef0') +
        L('ui.b6ee21a2d52b') + attr(item.hp == null ? 100 : item.hp) + '" data-meta-field="hp"' + disabled + '></div>' +
        L('ui.3405d40e7f81') + attr(item.attack == null ? 10 : item.attack) + '" data-meta-field="attack"' + disabled + '></div>' +
        L('ui.8a82aca45a19') + attr(item.defense == null ? 10 : item.defense) + '" data-meta-field="defense"' + disabled + '></div>' +
        this.unitStatField(item, 'level', L('ui.5c42c048ea24'), readOnly, { fallback: 90, min: 1 }) +
        this.unitStatField(item, 'critRate', L('ui.1f12be66bf59'), readOnly, { step: '0.01', fallback: 5 }) +
        this.unitStatField(item, 'critDamage', L('ui.f9752740590f'), readOnly, { step: '0.01', fallback: 50 }) +
        this.unitStatField(item, 'luckyRate', L('ui.6fa3c17fa62e'), readOnly, { step: '0.01' }) +
        this.unitStatField(item, 'luckyDamage', L('ui.00eb79354774'), readOnly, { step: '0.01', fallback: 100 }) +
        this.unitStatField(item, 'resistances.physical', L('ui.eec072596024'), readOnly, { step: '0.01', fallback: 5 }) +
        this.unitStatField(item, 'resistances.mental', L('ui.cf2b8b83b627'), readOnly, { step: '0.01', fallback: 5 }) +
        artRow +
        this.renderToggleRow(L('ui.64e904249960'), 'counted', item.counted !== false, readOnly, L('ui.f8a1ac1d6b1d')) +
        this.renderToggleRow(L('ui.9456ff9f51bf'), 'autoAttack', !!item.autoAttack, readOnly, L('ui.ed09a5fcb674')) +
        this.renderToggleRow(L('ui.40393c785c89'), 'noFieldSlot', !!item.noFieldSlot, readOnly, L('ui.b9d2acf63ec7')) +
        this.renderToggleRow(L('ui.04a2ef4abcbc'), 'untargetable', !!item.untargetable, readOnly, L('ui.e47d6456f82b')) +
        this.renderToggleRow(L('ui.6c4b667376c5'), 'invincible', !!item.invincible, readOnly, L('ui.75d35a3c710f')) +
        this.renderToggleRow(L('ui.91d9253dfe4f'), 'obtainable', item.obtainable !== false, readOnly, L('ui.65f3e6e0fc70')) +
        L('ui.37e3e7d1a038') + disabled + '>' + esc(item.flavor || '') + '</textarea></div>' +
        L('ui.defbed68f4ea') +
          (skills.length ? skills.map(skill => '<label class="form-check-inline"><input type="checkbox" data-unit-skill="' + attr(skill.id) + '"' + (selectedSkills.has(skill.id) ? ' checked' : '') + (readOnly ? ' disabled' : '') + '> ' + esc(skill.name) + '</label>').join('') : L('ui.441b15fec097')) +
        '</div></div>' +
      '</div>';
    }
    if (mode === 'equipment') {
      return '<div class="form-grid">' + commonTop +
        L('ui.e0c46cffcc1d') + disabled + '>' + this.optionList([{ value: 'weapon', label: L('ui.6f0f16e0c098') }, { value: 'accessory', label: L('ui.2074803effdd') }], item.slot || 'accessory') + '</select></div>' +
        artRow +
        L('ui.a40181527e3e') + disabled + '>' + esc(item.description || '') + '</textarea></div>' +
        L('ui.a5e44b83cd98') + this.renderMods(item, readOnly) + '</div>' +
        L('ui.cc87a927efe9') + this.renderGrantedSkills(item, readOnly) + '</div>' +
      '</div>';
    }
    return '<div class="form-grid">' + commonTop +
      L('ui.b9714b320651') + attr(item.faction || 'any') + '" data-meta-field="faction" placeholder="any"' + disabled + L('ui.bea421529ada') +
      artRow +
      L('ui.47beac9b6150') + disabled + '>' + esc(item.description || '') + '</textarea></div>' +
      L('ui.a5e44b83cd98') + this.renderMods(item, readOnly) + '</div>' +
      L('ui.cc87a927efe9') + this.renderGrantedSkills(item, readOnly) + '</div>' +
    '</div>';
  },

  renderCardWorkspace(app, item, readOnly) {
    const info = this.modeInfo(this.mode);
    const header = '<div class="editor-workspace-head"><div><div class="eyebrow">' + (readOnly ? 'REFERENCE / READ ONLY' : 'CARD DRAFT / LOCAL ARCHIVE') + '</div><h2>' + esc(item ? item.name : L('ui.763694bdf43c')) + '</h2><p>' + (item ? esc(item.id) + ' · ' + esc(info.label) + ' · ' + (readOnly ? L('ui.1c45c2cec410') : L('ui.8107ccd58593')) : L('ui.0135635b14c7')) + '</p></div><div class="head-actions">' +
      (item ? '<button class="btn btn-sm" type="button" data-action="ed-copy">' + (readOnly ? L('ui.198a314aa63f') : L('ui.a11534a1b557')) + '</button>' : '') +
      (item ? L('ui.561bc81a124a') : '') +
      (!readOnly && item ? L('ui.59d7d27fd1ef') : '') +
      (!readOnly && item ? L('ui.c8b012e16e88') : '') +
      '</div></div>';
    if (!item) return '<section class="panel editor-workspace">' + header + L('ui.59eec00d41a0');
    return '<section class="panel editor-workspace">' + header +
      '<form class="editor-form" onsubmit="return false">' +
        '<div class="editor-savebar"><span class="autosave-status' + (this.dirty ? ' dirty' : '') + '">' + (readOnly ? L('ui.a87449d09e88') : this.dirty ? L('ui.b035e280075e') : L('ui.9d84cfe84d8b')) + '</span><div class="btn-row">' +
          (!readOnly ? L('ui.4be89e8b92e1') : '') +
        '</div></div>' +
        L('ui.29f92cd1b3c2') + this.renderCardMetadata(app, item, readOnly) + '</div>' +
      '</form></section>';
  },

  renderCardAside(app, item, readOnly) {
    const info = this.modeInfo(this.mode);
    const validation = this.validateCurrent(app);
    const usedDecks = ['A', 'B'].filter(side => {
      const deck = (Store.state.decks && Store.state.decks[side]) || {};
      if (this.mode === 'units') return (deck.units || []).includes(item.id);
      if (this.mode === 'equipment') return (deck.equipment || []).includes(item.id);
      if (this.mode === 'runes') return (deck.runes || []).includes(item.id);
      return false;
    }).map(side => side === 'A' ? L('ui.914cb0429d9d') : L('ui.1c1b9fdb0e3f'));
    return '<aside class="editor-aside">' +
      L('ui.5aede22d5dcf') + (validation.errors.length ? validation.errors.length + L('ui.c189fab0228a') : L('ui.dcc4233255ab')) + '</span></div><div class="panel-body" id="editor-validation">' + this.renderValidationBox(validation) + (readOnly ? L('ui.ffdcae5464e6') : '') + '</div></section>' +
      L('ui.740747e0c1a3') +
        L('ui.f306b423ed45') + esc(info.label) + '</span></div>' +
        '<div class="kv"><span class="k">ID</span><span class="v mono">' + esc(item.id) + '</span></div>' +
        L('ui.4fa3034b9a9a') + (readOnly ? L('ui.1c45c2cec410') : L('ui.8107ccd58593')) + '</span></div>' +
        (this.mode === 'units' ? L('ui.f9272d04e7a6') + esc(item.hp) + ' / ' + esc(item.attack) + '</span></div>' : '') +
        (this.mode === 'equipment' ? L('ui.11b5cc2a4750') + (item.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + '</span></div>' : '') +
        (this.mode === 'runes' ? L('ui.cb04068af037') + esc(item.faction === 'any' ? L('ui.b19d3ebfba21') : item.faction) + '</span></div>' : '') +
      '</div>' + (usedDecks.length ? L('ui.515b35a7b67a') + esc(usedDecks.join('、')) + L('ui.2e1c27c26835') : '') + '</div></section>' +
      L('ui.51aa8216881b') +
    '</aside>';
  },

  renderWorkspace(app, item, readOnly) {
    if (this.modeInfo(this.mode).card) return this.renderCardWorkspace(app, item, readOnly);
    const skill = this.mode === 'skills';
    const trigger = item && item.trigger ? item.trigger.event : '';
    const header = '<div class="editor-workspace-head"><div><div class="eyebrow">' + (readOnly ? 'REFERENCE / READ ONLY' : 'DRAFT / VISUAL FLOW') + '</div><h2>' + esc(item ? item.name : L('ui.763694bdf43c')) + '</h2><p>' + (item ? esc(item.id) + ' · ' + (skill ? skillTypeLabel(item.type) : L('ui.6a4f4be10d6e')) + ' · ' + (readOnly ? L('ui.385ff977152d') : L('ui.8107ccd58593')) : L('ui.446abbfa06d9')) + '</p></div><div class="head-actions">' +
      (item ? L('ui.59934c503dbc') + (readOnly ? L('ui.198a314aa63f') : L('ui.a11534a1b557')) + '</button>' : '') +
      (!readOnly && item ? L('ui.59d7d27fd1ef') : '') +
      (!readOnly && item ? L('ui.c8b012e16e88') : '') +
      '</div></div>';
    if (!item) {
      return '<section class="panel editor-workspace">' + header + L('ui.19bae5bef2d1');
    }
    return '<section class="panel editor-workspace">' + header +
      '<div class="editor-savebar"><span class="autosave-status' + (this.dirty ? ' dirty' : '') + '">' + (readOnly ? L('ui.a87449d09e88') : this.dirty ? L('ui.b035e280075e') : L('ui.9d84cfe84d8b')) + L('ui.2050d36799da') + (!readOnly ? L('ui.4be89e8b92e1') : '') + '</div></div>' +
      '<form class="editor-form" onsubmit="return false">' +
        L('ui.3ac4e05bace3') + (readOnly ? L('ui.8ec571a90d08') : L('ui.859ff39445de')) + '</div>' + this.renderMetadata(app, item, readOnly) + '</section>' +
        (skill ? L('ui.643d0ad0136b') + this.renderRequirements(item, readOnly) + '</section>' : '') +
        (!skill ? L('ui.0a663dfd7e81') + this.renderMods(item, readOnly) + L('ui.ef2137095ad8') + this.renderGrantedSkills(item, readOnly) + '</div></div></section>' : '') +
      '</form>' +
      L('ui.44a7a90a85a7') + (item.steps || []).length + L('ui.46fdc16ecadb') + (readOnly ? L('ui.34ba2d4c20d1') : L('ui.20b00484bcec')) + '</div></div>' +
      this.renderStepList(item, 'root', item.steps || [], readOnly, L('ui.351e2b1e5784')) +
    '</section>';
  },

  renderAside(app, item, readOnly) {
    if (this.modeInfo(this.mode).card) return this.renderCardAside(app, item, readOnly);
    const validation = this.validateCurrent(app);
    const flow = item ? renderFlowTree(item.steps || []) : '';
    const variables = VARIABLE_PALETTE.map(variable => '<button class="palette-btn" type="button" data-action="ed-insert-token" data-token="' + attr(variable.token) + '" title="' + attr(variable.hint) + '">' + esc(variable.label) + '<code>' + esc(variable.token) + '</code></button>').join('');
    const help = L('ui.fb52ff72a21f') +
      L('ui.f6dfe937aa00') +
      '<ul>' +
        L('ui.9afe1406f9f4') +
        L('ui.bcb8384b7e52') +
        L('ui.2ee354c6a46c') +
        L('ui.7a3d2ea7694e') +
        L('ui.4b78e26fd6f7') +
        L('ui.1c8cb2a9e315') +
        L('ui.c4967af2adaf') +
      '</ul>' +
      L('ui.724d7fc966fe') +
      '<ul>' +
        '<li><code>{target}.atk</code>、<code>.hp</code>、<code>.max_hp</code>、<code>.res</code>、<code>.last_hit_count</code>、<code>.name</code>、<code>.id</code>。</li>' +
        L('ui.a8f8570f5a23') +
        L('ui.cb948a6aa1cd') +
        L('ui.99f907fe8aa4') +
        L('ui.eba23850a1bc') +
        L('ui.61c3189e7d57') +
        L('ui.7f3926af18ab') +
      '</ul>' +
      L('ui.426f02826aa2') +
      L('ui.1dc3edfba1c0') +
      L('ui.b8801b19e44e') +
      L('ui.868a6e971afc') +
    '</div>';
    return '<aside class="editor-aside">' +
      L('ui.64388ae940d7') +
        L('ui.62feaaa205e4') + variables + L('ui.d63d34238e70') +
        help +
      '</div></section>' +
      L('ui.5aede22d5dcf') + (validation.errors.length ? validation.errors.length + L('ui.c189fab0228a') : L('ui.dcc4233255ab')) + '</span></div><div class="panel-body" id="editor-validation">' + this.renderValidationBox(validation) + '</div></section>' +
      L('ui.ecc45e4b7216') + ((item && item.steps) || []).length + '</span></div><div class="panel-body">' + (flow || L('ui.565968446956')) + '<div class="editor-helper-note mt-2">' + (readOnly ? L('ui.8fa87032da75') : L('ui.90e31a82c675')) + '</div></div></section>' +
    '</aside>';
  },

  render(app) {
    const pack = this.currentPack();
    if (!pack) return app.renderMissingModule(L('ui.25d2af3207d3'));
    const info = this.modeInfo(this.mode);
    let item = this.currentItem(app);
    if (!item) {
      const draft = this.itemsForMode(pack, this.mode);
      const refs = this.referenceItems(this.mode, pack);
      const fallback = draft[0] || refs[0];
      if (fallback) {
        this.selectedId = fallback.id;
        item = this.currentItem(app);
      }
    }
    const readOnly = this.isReadOnly(app);
    const tabs = EDITOR_MODES.map(modeInfo => '<button class="segment' + (this.mode === modeInfo.id ? ' active' : '') + '" type="button" data-action="ed-tab" data-mode="' + modeInfo.id + '">' + esc(modeInfo.label) + '</button>').join('');
    const counts = EDITOR_MODES.map(modeInfo => '<span class="chip tiny">' + esc(modeInfo.label) + ' ' + ((pack.content[modeInfo.collection] || []).length) + '</span>').join(' ');
    const draftPack = Store.getEditorPack();
    const packChoices = [draftPack].concat((Store.index.packs || []).filter(item => item.id !== draftPack.id));
    const uniqueChoices = [];
    const seenPacks = new Set();
    for (const choice of packChoices) {
      if (!choice || seenPacks.has(choice.id)) continue;
      seenPacks.add(choice.id);
      uniqueChoices.push(choice);
    }
    const packBar = L('ui.06faadfb55ed') + uniqueChoices.map(choice => '<option value="' + attr(choice.id) + '"' + (choice.id === pack.id ? ' selected' : '') + '>' + esc(choice === draftPack ? L('ui.0f436818c0b4') : (choice.builtin ? L('ui.d7d67f212822') : choice.name)) + '</option>').join('') + '</select><button class="btn btn-sm" type="button" data-action="ed-edit-pack-id"' + (pack.id === CORE_PACK_ID ? ' disabled' : '') + L('ui.f94066dba58c') + esc(pack.id) + '</span></div>';
    const isDraftTarget = pack === draftPack;
    return '' +
      '<div class="page-wrap editor-page">' +
        L('ui.ef25c30b7a80') + (this.dirty ? 'gold' : 'green') + '">' + (this.dirty ? L('ui.b035e280075e') : L('ui.9d84cfe84d8b')) + '</span><span class="chip">' + esc(info.label) + '</span></div></div>' +
        '<div class="editor-layout">' +
          '<aside class="editor-sidebar">' +
            packBar +
            '<div class="segmented editor-tabs five">' + tabs + '</div>' +
            '<section class="panel editor-panel"><div class="panel-head"><div><h3>' + esc(info.label) + L('ui.cdf6fcfe0d03') + this.itemsForMode(pack, this.mode).length + L('ui.4141f8660fac') + this.referenceItems(this.mode, pack).length + '</div></div></div><div class="panel-body">' + this.renderList(app, pack, this.mode) + '</div></section>' +
            '<div class="editor-side-actions">' +
              '<button class="btn btn-sm btn-primary" type="button" data-action="' + info.newAction + L('ui.0552d39ccd0f') + esc(info.label) + '</button>' +
              '<button class="btn btn-sm" type="button" data-action="ed-copy">' + (readOnly ? L('ui.198a314aa63f') : L('ui.ff28b37bb58f')) + '</button>' +
              L('ui.96fd39a1ed4d') +
              (isDraftTarget ? L('ui.51cdf6c33786') : '') +
              (isDraftTarget ? L('ui.253166bf81f7') : '') +
            '</div>' +
            L('ui.7b3851aed094') + esc(pack.id) + '<br>' + counts + L('ui.21f156d0e82b') +
          '</aside>' +
          this.renderWorkspace(app, item, readOnly) +
          this.renderAside(app, item, readOnly) +
        '</div>' +
      '</div>';
  },

  afterRender(app) {
    if (this.dirty) {
      const status = document.querySelector('.autosave-status');
      if (status) { status.classList.add('dirty'); status.textContent = L('ui.b035e280075e'); }
    }
  },

  stepTargetOptions() { return EDITOR_STEP_TARGETS; },

  ensureStepExpressionDefaults(step) {
    if (!step || HIDDEN_STEP_KINDS.has(step.kind)) return step;
    const targetKinds = ['damage', 'heal', 'addEffect', 'removeEffect', 'skipAction', 'forceRetreat', 'modifyStat', 'castSkill'];
    if (targetKinds.includes(step.kind)) {
      step.expressionMode = step.expressionMode || 'formula';
      if (!step.targetExpression) step.targetExpression = this.isNewTargetText(step.target) ? step.target : this.formulaTargetValue(step);
      if (!step.legacyTarget) {
        const legacyMap = { '{target}': 'chosen', '{self}': 'self', 'all({enemy})': 'allEnemies', 'all({friendly})': 'allAllies', '{unit}': 'item' };
        step.legacyTarget = legacyMap[step.targetExpression] || this.legacyTargetValue(step);
      }
    } else if (step.kind === 'forEach') {
      step.expressionMode = step.expressionMode || 'formula';
      if (!step.sourceExpression) step.sourceExpression = this.isNewTargetText(step.source) ? step.source : this.formulaSourceValue(step);
      if (!step.legacySource) step.legacySource = step.sourceExpression === '{target}' || step.sourceExpression === '{unit}' ? 'chosen' : this.legacySourceValue(step);
    } else if (step.kind === 'branch') {
      step.expressionMode = step.expressionMode || 'formula';
      if (!step.condition) step.condition = '1 == 1';
    }
    return step;
  },

  createStep(kind) {
    switch (kind) {
      case 'damage': return { kind, target: '{target}', damageType: 'physical', formula: '0', useSkillValue: true, rawDamage: false, valueFormula: '{self}.atk', ignoreResistance: false };
      case 'heal': return { kind, target: '{self}', formula: '{self}.max_hp - {self}.hp' };
      case 'addEffect': return { kind, target: '{target}', effectId: '', stacks: '1' };
      case 'removeEffect': return { kind, target: '{self}', effectId: '', stacks: '9999', force: false };
      case 'modifyCount': return { kind, scope: 'unit', countId: 'sakurafade', mode: 'add', formula: '1' };
      case 'readCount': return { kind, scope: 'unit', countId: 'sakurafade', varName: 'value' };
      case 'branch': return { kind, condition: '{self}.count[ha] >= 1', then: [], elseSteps: [] };
      case 'selectTarget': return { kind, mode: 'all({enemy})', varName: '' };
      case 'forEach': return { kind, source: '{target}', steps: [] };
      case 'loop': return { kind, times: '1', steps: [] };
      case 'castSkill': return { kind, skillId: '', target: '{target}' };
      case 'skipAction': return { kind, target: '{self}' };
      case 'immuneDamage': return { kind };
      case 'forceRetreat': return { kind, target: '{self}' };
      case 'summon': return { kind, unitId: '', count: '1', ignoreFieldLimit: false, summonAsChild: false, childId: '', childTag: '' };
      case 'modifyStat': return { kind, stat: 'atkFlat', target: '{self}', formula: '1' };
      case 'removeNegativeOne':
      case 'removeNegativeAll':
      case 'removePositiveOne':
      case 'removePositiveAll': return { kind, target: '{self}', force: false };
      case 'setVar': return { kind, varName: 'value', formula: '0' };
      default: return { kind };
    }
  },

  openStepPicker(app, listPath) {
    const groups = {};
    STEP_LIBRARY.filter(step => !HIDDEN_STEP_KINDS.has(step.kind)).forEach(step => { (groups[step.group] = groups[step.group] || []).push(step); });
    const body = '<div class="step-picker">' + Object.keys(groups).map(group => '<div class="step-picker-group"><h4>' + esc(group) + '</h4><div class="step-picker-grid">' + groups[group].map(step => '<button class="step-picker-card" type="button" data-action="ed-step-pick" data-kind="' + attr(step.kind) + '" data-list-path="' + attr(listPath) + '"><strong>' + esc(step.name) + '</strong><small>' + esc(step.hint) + '</small></button>').join('') + '</div></div>').join('') + '</div>';
    app.openModal({ title: L('ui.46090df7b8ed'), subtitle: L('ui.76620e08cc1e'), size: 'large', body, foot: L('ui.eb2ea2f437dc') });
  },

  validateDraftPack(app) {
    const pack = this.currentPack();
    if (!pack) return { errors: [], warnings: [] };
    return { errors: [], warnings: [] };
  },

  handleAction(action, el, app, event) {
    if (!action || !action.startsWith('ed-')) return false;
    if (!app || app.route !== 'editor') return false;
    const pack = this.currentPack();
    const item = this.currentItem(app);
    const readOnly = this.isReadOnly(app);
    const data = el.dataset;
    switch (action) {
      case 'ed-tab':
        this.switchMode(app, data.mode);
        return true;
      case 'ed-edit-pack-id':
        this.openPackIdEditor(app);
        return true;
      case 'ed-apply-pack-id':
        this.applyPackId(app);
        return true;
      case 'ed-edit-item-id':
        this.openItemIdEditor(app);
        return true;
      case 'ed-apply-item-id':
        this.applyItemId(app);
        return true;
      case 'ed-new-skill':
        this.newSkill(app);
        return true;
      case 'ed-new-effect':
        this.newEffect(app);
        return true;
      case 'ed-new-unit':
        this.newUnit(app);
        return true;
      case 'ed-new-equipment':
        this.newEquipment(app);
        return true;
      case 'ed-new-rune':
        this.newRune(app);
        return true;
      case 'ed-select':
        this.selectItem(app, data.kind, data.id);
        return true;
      case 'ed-save':
        this.save(app, false);
        return true;
      case 'ed-copy':
        this.copyCurrent(app);
        return true;
      case 'ed-migrate-expressions':
        if (readOnly) return true;
        this.migrateLegacyExpressions(app);
        return true;
      case 'ed-delete':
        this.deleteCurrent(app);
        return true;
      case 'ed-toggle-meta':
        if (readOnly || !item) return true;
        item[data.field] = data.field === 'removable' ? item.removable === false : !item[data.field];
        this.markDirty();
        app.render();
        return true;
      case 'ed-req-add':
        if (readOnly || !item) return true;
        item.requirements = item.requirements || [];
        item.requirements.push({ scope: 'unit', countId: Object.keys(Store.index.countDefs)[0] || 'count', op: 'gte', value: '1', label: '' });
        this.markDirty();
        app.render();
        return true;
      case 'ed-req-remove':
        if (readOnly || !item) return true;
        item.requirements.splice(Number(data.index), 1);
        this.markDirty();
        app.render();
        return true;
      case 'ed-set-quality':
        if (readOnly || !item) return true;
        item.quality = data.quality || 'white';
        this.markDirty();
        app.render();
        return true;
      case 'ed-mod-add':
        if (readOnly || !item) return true;
        item.mods = item.mods || {};
        const availableStat = Object.keys(STAT_KEYS).find(key => !(key in item.mods)) || 'dmgFlat';
        item.mods[availableStat] = 1;
        this.markDirty();
        app.render();
        return true;
      case 'ed-mod-remove':
        if (readOnly || !item) return true;
        delete item.mods[data.stat];
        this.markDirty();
        app.render();
        return true;
      case 'ed-step-add':
        if (readOnly || !item) return true;
        this.openStepPicker(app, data.listPath || 'root');
        return true;
      case 'ed-step-expression-mode': {
        const list = this.stepList(item, data.listPath || 'root');
        const index = Number(data.index);
        const step = list && list[index];
        if (readOnly || !step) return true;
        step.expressionMode = data.mode === 'formula' ? 'formula' : 'legacy';
        if (step.expressionMode === 'formula') {
          if (!step.legacyTarget) step.legacyTarget = this.legacyTargetValue(step);
          if (step.kind === 'forEach') {
            if (!step.sourceExpression) step.sourceExpression = this.formulaSourceValue(step);
          } else if (step.kind === 'branch') {
            if (!step.condition) {
              const opSymbols = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '==', neq: '!=' };
              step.condition = this.migrateFormulaText(String(step.left == null ? '0' : step.left)) + ' ' + (opSymbols[step.op] || '>=') + ' ' + this.migrateFormulaText(String(step.right == null ? '0' : step.right));
            }
          } else if (!step.targetExpression) {
            step.targetExpression = this.formulaTargetValue(step);
          }
        } else {
          if (step.kind === 'forEach' && !step.legacySource) step.legacySource = this.legacySourceValue(step);
          else if (step.kind !== 'branch' && !step.legacyTarget) step.legacyTarget = this.legacyTargetValue(step);
        }
        this.markDirty();
        app.render();
        return true;
      }
      case 'ed-step-pick': {
        const list = this.stepList(item, data.listPath || 'root');
        if (!list) { app.toast(L('ui.758de6f90c24'), 'error'); return true; }
        list.push(this.ensureStepExpressionDefaults(this.createStep(data.kind)));
        this.markDirty();
        app.closeModal();
        app.render();
        return true;
      }
      case 'ed-step-delete': {
        const list = this.stepList(item, data.listPath);
        const index = Number(data.index);
        if (!list || !list[index]) return true;
        list.splice(index, 1);
        this.markDirty();
        app.render();
        return true;
      }
      case 'ed-step-up':
      case 'ed-step-down': {
        const list = this.stepList(item, data.listPath);
        const index = Number(data.index);
        const target = action === 'ed-step-up' ? index - 1 : index + 1;
        if (!list || !list[index] || target < 0 || target >= list.length) return true;
        const [moved] = list.splice(index, 1);
        list.splice(target, 0, moved);
        this.markDirty();
        app.render();
        return true;
      }
      case 'ed-step-dup': {
        const list = this.stepList(item, data.listPath);
        const index = Number(data.index);
        if (!list || !list[index]) return true;
        list.splice(index + 1, 0, deepListClone(list[index]));
        this.markDirty();
        app.render();
        return true;
      }
      case 'ed-insert-token': {
        const token = data.token || '';
        const input = this._lastFormulaInput;
        if (!input || !input.isConnected) { app.toast(L('ui.2ad3f2ece363'), 'error'); return true; }
        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
        input.value = input.value.slice(0, start) + token + input.value.slice(end);
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      case 'ed-export-item': {
        if (!item) return true;
        app.downloadJson(item.id + '.caerogue-item.json', { kind: this.modeInfo(this.mode).kind, item });
        return true;
      }
      case 'ed-export-draft':
        app.downloadJson((pack.id || 'draft') + '.caerogue.json', pack);
        return true;
      default:
        return false;
    }
  },

  handleInput(event, app) {
    if (!app || app.route !== 'editor') return;
    const target = event.target;
    if (!target) return;
    if (target.matches('[data-editor-pack]')) { this.selectPack(app, target.value); return; }
    const item = this.currentItem(app);
    if (!item || this.isReadOnly(app)) return;
    if (target.matches('[data-meta-field]')) {
      const field = target.dataset.metaField;
      const numericFields = ['multiplier', 'stackMax', 'hp', 'attack', 'defense', 'level', 'atkPct', 'atkFlat', 'defPct', 'defFlat', 'hpPct', 'hpFlat', 'damageBonus', 'damageBonusFlat', 'critRate', 'critDamage', 'luckyRate', 'luckyDamage', 'defensePen', 'resistanceReduction', 'damageTakenBonus', 'vulnerability', 'maxHpCap', 'resistanceValue'];
      if (field === 'triggerEvent') {
        item.trigger = item.trigger || {};
        item.trigger.event = target.value;
      } else if (field === 'triggerCondition') {
        item.trigger = item.trigger || {};
        item.trigger.condition = target.value;
      } else if (field === 'resistanceType') {
        item.resistance = item.resistance || { type: 'general', value: 0 };
        item.resistance.type = target.value;
      } else if (field === 'resistanceValue') {
        item.resistance = item.resistance || { type: 'general', value: 0 };
        item.resistance.value = Math.max(0, Number(target.value) || 0);
      } else if (numericFields.includes(field) || String(field).includes('.')) {
        const allowNegative = ['atkPct','atkFlat','defPct','defFlat','hpPct','hpFlat','damageBonus','damageBonusFlat','critDamage','luckyDamage','defensePen','resistanceReduction','damageTakenBonus','vulnerability'].includes(field) || String(field).includes('.');
        const minimum = field === 'hp' || field === 'stackMax' || field === 'level' ? 1 : (allowNegative ? -99999 : 0);
        const numeric = Number(target.value);
        const applied = Math.max(minimum, Number.isFinite(numeric) ? numeric : 0);
        if (String(field).includes('.')) this.setMetaPathValue(item, field, applied);
        else item[field] = applied;
      } else {
        item[field] = target.value;
      }
      this.markDirty();
      if (event.type === 'change' && (target.tagName === 'SELECT' || target.type === 'checkbox')) app.render();
      return;
    }
    if (target.matches('[data-unit-skill]')) {
      item.skills = item.skills || [];
      const id = target.dataset.unitSkill;
      if (target.checked && !item.skills.includes(id)) item.skills.push(id);
      if (!target.checked) item.skills = item.skills.filter(skillId => skillId !== id);
      this.markDirty();
      return;
    }
    if (target.matches('[data-req-field]')) {
      const index = Number(target.dataset.reqIndex);
      item.requirements = item.requirements || [];
      if (!item.requirements[index]) return;
      item.requirements[index][target.dataset.reqField] = target.value;
      this.markDirty();
      return;
    }
    if (target.matches('[data-mod-field]')) {
      item.mods = item.mods || {};
      const key = target.dataset.modKey;
      if (target.dataset.modField === 'key') {
        const value = item.mods[key];
        delete item.mods[key];
        item.mods[target.value] = value;
        this.markDirty();
        if (event.type === 'change') app.render();
      } else {
        item.mods[key] = Number(target.value) || 0;
        this.markDirty();
      }
      return;
    }
    if (target.matches('[data-granted-skill]')) {
      item.grantedSkills = item.grantedSkills || [];
      const id = target.dataset.grantedSkill;
      if (target.checked && !item.grantedSkills.includes(id)) item.grantedSkills.push(id);
      if (!target.checked) item.grantedSkills = item.grantedSkills.filter(itemId => itemId !== id);
      this.markDirty();
      return;
    }
    if (target.matches('[data-step-field]')) {
      const list = this.stepList(item, target.dataset.listPath);
      const index = Number(target.dataset.stepIndex);
      if (!list || !list[index]) return;
      const field = target.dataset.stepField;
      if (target.type === 'checkbox') list[index][field] = target.checked;
      else list[index][field] = target.value;
      this.markDirty();
      if (target.tagName === 'SELECT' && ['legacyTarget', 'legacySource', 'op'].includes(field)) app.render();
      return;
    }
  },

  handleFocus(event) {
    const target = event.target;
    if (!target || !target.matches('.formula-input, input.mono, textarea.mono')) return;
    this._lastFormulaInput = target;
  },

  onDragStart(event, app) {
    if (!app || app.route !== 'editor') return;
    const block = event.target.closest('.step-block');
    if (!block || this.isReadOnly(app)) return;
    this._dragState = { listPath: block.dataset.listPath, index: Number(block.dataset.index) };
    block.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.dataset.listPath + ':' + block.dataset.index);
    }
  },

  onDragOver(event, app) {
    if (!app || app.route !== 'editor' || !this._dragState) return;
    const block = event.target.closest('.step-block');
    if (!block) return;
    if (block.dataset.listPath !== this._dragState.listPath) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.step-block.drag-over').forEach(node => { if (node !== block) node.classList.remove('drag-over'); });
    block.classList.add('drag-over');
  },

  onDrop(event, app) {
    if (!app || app.route !== 'editor' || !this._dragState) return;
    const block = event.target.closest('.step-block');
    if (!block || block.dataset.listPath !== this._dragState.listPath) return;
    event.preventDefault();
    const item = this.currentItem(app);
    const list = this.stepList(item, this._dragState.listPath);
    const from = this._dragState.index;
    const to = Number(block.dataset.index);
    if (list && from !== to && list[from]) {
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      this.markDirty();
    }
    this.cleanupDrag();
    app.render();
  },

  onDragEnd(event, app) { this.cleanupDrag(); },

  cleanupDrag() {
    this._dragState = null;
    document.querySelectorAll('.step-block.dragging, .step-block.drag-over').forEach(node => node.classList.remove('dragging', 'drag-over'));
  }
};

document.addEventListener('focusin', (event) => EditorUI.handleFocus(event));
window.EditorUI = EditorUI;
