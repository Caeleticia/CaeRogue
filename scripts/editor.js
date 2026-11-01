/* CaeRogue - visual skill and advanced effect editor. */
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

const EDITOR_CONDITION_OPS = [
  { value: 'gte', label: L('ui.6c2c5ef4dc66') }, { value: 'gt', label: L('ui.66f156cddca3') },
  { value: 'lte', label: L('ui.314d34856eca') }, { value: 'lt', label: L('ui.0511b2da735f') },
  { value: 'eq', label: L('ui.9653e1d99f01') }, { value: 'neq', label: L('ui.571002599134') }
];

function deepListClone(value) { return JSON.parse(JSON.stringify(value)); }

const EditorUI = {
  mode: 'skills',
  selectedId: null,
  dirty: false,
  _lastFormulaInput: null,
  _dragState: null,
  _lastValidation: null,

  reset() {
    this.mode = 'skills';
    this.selectedId = null;
    this.dirty = false;
    this._lastFormulaInput = null;
    this._dragState = null;
    this._lastValidation = null;
  },

  enter(app) {
    const pack = Store.getEditorPack();
    if (!pack) return;
    if (!['skills', 'effects'].includes(this.mode)) this.mode = 'skills';
    const items = this.itemsForMode(pack, this.mode);
    const external = this.referenceItems(this.mode, pack);
    if (!this.selectedId || !items.concat(external).some(item => item.id === this.selectedId)) {
      const fallback = items[0] || external[0];
      this.selectedId = fallback ? fallback.id : null;
    }
  },

  itemsForMode(pack, mode) {
    if (!pack) return [];
    return mode === 'skills' ? (pack.content.skills || []) : (pack.content.effects || []);
  },

  referenceItems(mode, pack) {
    const draftIds = new Set(this.itemsForMode(pack, mode).map(item => item.id));
    const source = mode === 'skills' ? Store.index.skills : Store.index.effects;
    return source.filter(item => !draftIds.has(item.id));
  },

  currentItem(app) {
    const pack = Store.getEditorPack();
    if (!pack || !this.selectedId) return null;
    const draft = this.itemsForMode(pack, this.mode).find(item => item.id === this.selectedId);
    if (draft) return draft;
    const map = this.mode === 'skills' ? Store.index.maps.skills : Store.index.maps.effects;
    return map.get(this.selectedId) || null;
  },

  isReadOnly(app) {
    const pack = Store.getEditorPack();
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
    Store.saveEditorPack();
    this.dirty = false;
    if (!silent) {
      app.toast(L('ui.bbc2b23814a9'), 'success');
      app.render();
    } else {
      this.renderValidationPanel(app);
    }
  },

  makeId(pack, kind) {
    const prefix = pack.id + '.' + kind + '.';
    const used = new Set();
    [...(pack.content.skills || []), ...(pack.content.effects || [])].forEach(item => used.add(item.id));
    Store.index.skills.concat(Store.index.effects).forEach(item => used.add(item.id));
    let index = 1;
    while (used.has(prefix + index)) index += 1;
    return prefix + index;
  },

  newSkill(app) {
    const pack = Store.getEditorPack();
    const item = {
      id: this.makeId(pack, 'skill'),
      packId: pack.id,
      name: L('ui.8af18deb9d99'),
      type: 'active',
      op: 'attack',
      quality: 'white',
      targetMode: 'enemy',
      multiplier: 100,
      description: '',
      trigger: { event: 'manual' },
      requirements: [],
      steps: [{ kind: 'damage', target: 'chosen', damageType: 'physical', formula: '1', ignoreResistance: false }]
    };
    pack.content.skills.push(item);
    this.mode = 'skills';
    this.selectedId = item.id;
    this.dirty = true;
    Store.saveEditorPack();
    app.render();
  },

  newEffect(app) {
    const pack = Store.getEditorPack();
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
    Store.saveEditorPack();
    app.render();
  },

  copyCurrent(app) {
    const pack = Store.getEditorPack();
    const item = this.currentItem(app);
    if (!item) return;
    const isEffect = this.mode === 'effects';
    const clone = deepListClone(item);
    clone.id = this.makeId(pack, isEffect ? 'effect' : 'skill');
    clone.packId = pack.id;
    clone.name = item.name + L('ui.21ddfa7fb7e7');
    pack.content[isEffect ? 'effects' : 'skills'].push(clone);
    this.selectedId = clone.id;
    this.dirty = true;
    Store.saveEditorPack();
    app.render();
    app.toast(L('ui.edd969b9461a'), 'success');
  },

  deleteCurrent(app) {
    const pack = Store.getEditorPack();
    const isEffect = this.mode === 'effects';
    const list = pack.content[isEffect ? 'effects' : 'skills'];
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
        Store.saveEditorPack();
        app.render();
      }
    });
  },

  selectItem(app, kind, id) {
    this.mode = kind === 'effect' ? 'effects' : 'skills';
    this.selectedId = id;
    app.render();
  },

  switchMode(app, mode) {
    this.mode = mode === 'effects' ? 'effects' : 'skills';
    const pack = Store.getEditorPack();
    const draft = this.itemsForMode(pack, this.mode);
    const refs = this.referenceItems(this.mode, pack);
    this.selectedId = (draft[0] || refs[0] || {}).id || null;
    app.render();
  },

  allEffectRefs() {
    const pack = Store.getEditorPack();
    const map = new Map(Store.index.effects.map(item => [item.id, item]));
    this.itemsForMode(pack, 'effects').forEach(item => map.set(item.id, item));
    return [...map.values()];
  },

  allSkillRefs() {
    const pack = Store.getEditorPack();
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

  stepFields(item, step, listPath, index, readOnly) {
    const targetOptions = EDITOR_STEP_TARGETS;
    const disabled = readOnly;
    const targetSelect = (value) => this.stepInput(listPath, index, 'target', value || 'chosen', { type: 'select', options: targetOptions, disabled });
    const effectOptions = this.allEffectRefs().map(effect => ({ value: effect.id, label: effect.name + ' · ' + effect.id }));
    const skillOptions = this.allSkillRefs().map(skill => ({ value: skill.id, label: skill.name + ' · ' + skill.id }));
    const unitOptions = Store.index.units.map(unit => ({ value: unit.id, label: unit.name + ' · ' + unit.id }));
    switch (step.kind) {
      case 'damage':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target)) +
          this.fieldRow(L('ui.c8078d8a7256'), this.stepInput(listPath, index, 'damageType', step.damageType || 'physical', { type: 'select', options: Object.keys(DAMAGE_TYPES).map(key => ({ value: key, label: DAMAGE_TYPES[key].label })), disabled })) +
          this.fieldRow(L('ui.edb1fa0b195a'), this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), L('ui.694cd528ea42')) +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'ignoreResistance', !!step.ignoreResistance, L('ui.63d383e14a49'), disabled) + '</div>' +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'bonus', !!step.bonus, L('ui.00e12d3558e4'), disabled) + '</div>' +
        '</div>';
      case 'heal':
        return '<div class="step-fields">' + this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target)) + this.fieldRow(L('ui.5ad1fb4006cf'), this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), L('ui.98a4c7619cff')) + '</div>';
      case 'addEffect':
        return '<div class="step-fields">' + this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target)) + this.fieldRow(L('ui.6a4f4be10d6e'), this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: L('ui.5fd18d1eb114'), disabled })) + this.fieldRow(L('ui.15e4c563f602'), this.stepInput(listPath, index, 'stacks', step.stacks || '1', { mono: true, disabled })) + '</div>';
      case 'removeEffect':
        return '<div class="step-fields">' + this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target)) + this.fieldRow(L('ui.151ddd4f1f9f'), this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: L('ui.5ac431ae3fea'), disabled })) + this.fieldRow(L('ui.90a0885a60a9'), this.stepInput(listPath, index, 'stacks', step.stacks || '9999', { mono: true, disabled })) + '</div>';
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
      case 'branch':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.adf0c6adb033'), this.stepInput(listPath, index, 'left', step.left || '0', { mono: true, disabled })) +
          this.fieldRow(L('ui.ea940279447b'), this.stepInput(listPath, index, 'op', step.op || 'gte', { type: 'select', options: EDITOR_CONDITION_OPS.map(op => ({ value: op.value, label: op.label })), disabled })) +
          this.fieldRow(L('ui.425f92eaa7c1'), this.stepInput(listPath, index, 'right', step.right || '0', { mono: true, disabled })) +
        '</div>' + this.renderNested(item, step.then, listPath + '.' + index + '.then', L('ui.5b36a4a467dd'), readOnly, 'then') + this.renderNested(item, step.elseSteps, listPath + '.' + index + '.elseSteps', L('ui.05fbede32616'), readOnly, 'elseSteps');
      case 'selectTarget':
        return '<div class="step-fields">' + this.fieldRow(L('ui.263cd7f8c7ef'), this.stepInput(listPath, index, 'mode', step.mode || 'allEnemies', { type: 'select', options: targetOptions, disabled })) + this.fieldRow(L('ui.60d0c801757c'), this.stepInput(listPath, index, 'varName', step.varName || '', { disabled })) + '</div>';
      case 'forEach':
        return '<div class="step-fields">' + this.fieldRow(L('ui.396c7421b532'), this.stepInput(listPath, index, 'source', step.source || 'chosen', { type: 'select', options: targetOptions, disabled })) + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', L('ui.b23b3f7a705d'), readOnly, 'steps');
      case 'loop':
        return '<div class="step-fields">' + this.fieldRow(L('ui.afc168b7d7ff'), this.stepInput(listPath, index, 'times', step.times || '1', { mono: true, disabled }), L('ui.fc8b3b99435d')) + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', L('ui.b23b3f7a705d'), readOnly, 'steps');
      case 'castSkill':
        return '<div class="step-fields">' + this.fieldRow(L('ui.53da139b6a5c'), this.stepInput(listPath, index, 'skillId', step.skillId || '', { type: 'select', options: skillOptions, placeholder: L('ui.af6ccc9dee69'), disabled })) + this.fieldRow(L('ui.60ed92dfe589'), this.stepInput(listPath, index, 'target', step.target || 'chosen', { type: 'select', options: targetOptions, disabled })) + '</div>';
      case 'skipAction':
        return '<div class="step-fields">' + this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target || 'self')) + L('ui.594414c28118');
      case 'immuneDamage':
        return L('ui.47e707f96348');
      case 'forceRetreat':
        return '<div class="step-fields">' + this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target || 'self')) + '</div>';
      case 'summon':
        return '<div class="step-fields">' + this.fieldRow(L('ui.5faece5e0845'), this.stepInput(listPath, index, 'unitId', step.unitId || '', { type: 'select', options: unitOptions, placeholder: L('ui.2150939fb166'), disabled })) + this.fieldRow(L('ui.d4d8e09af202'), this.stepInput(listPath, index, 'count', step.count || '1', { mono: true, disabled })) + '</div>';
      case 'modifyStat':
        return '<div class="step-fields">' +
          this.fieldRow(L('ui.7d3c35c29be1'), this.stepInput(listPath, index, 'stat', step.stat || 'atkFlat', { type: 'select', options: Object.keys(STAT_KEYS).map(key => ({ value: key, label: STAT_KEYS[key] })), disabled })) +
          this.fieldRow(L('ui.941f08313a1d'), targetSelect(step.target || 'self')) +
          this.fieldRow(L('ui.3fe475f7b233'), this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled })) +
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
    const displayName = step.kind === 'damage' && step.bonus ? L('ui.683a6ce05a97') : meta.name;
    const isBranch = ['branch', 'forEach', 'loop'].includes(step.kind);
    return '<div class="step-block' + (isBranch ? ' branch-step' : '') + '" data-step-block data-list-path="' + attr(listPath) + '" data-index="' + index + '" draggable="' + (!readOnly ? 'true' : 'false') + '">' +
      '<div class="step-head">' +
        L('ui.72ce12b6885f') + (readOnly ? ' disabled' : '') + '>≡</button>' +
        '<span class="step-num">' + (depth ? String(index + 1) : String(index + 1)) + '</span>' +
        '<span class="step-title">' + esc(displayName) + '</span>' +
        '<span class="step-kind">' + esc(meta.group) + '</span>' +
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
    const triggerOptions = [{ value: 'none', label: L('ui.15fe152362b1') }].concat(Object.keys(TRIGGER_EVENTS).filter(key => key !== 'none').map(key => ({ value: key, label: TRIGGER_EVENTS[key].label })));
    return '<div class="form-grid">' +
      L('ui.9d9af6dca809') + attr(item.name || '') + '" data-meta-field="name"' + (readOnly ? ' disabled' : '') + L('ui.34892b0d0d8f') +
      '<div class="form-row"><label class="field-label">ID</label><input class="input mono" value="' + attr(item.id) + L('ui.2697ab3b3046') +
      (skill ? L('ui.73c082a28e31') + Object.keys(QUALITIES).map(key => '<button class="quality-choice ' + qualityClass(key) + ((item.quality || 'white') === key ? ' active' : '') + '" type="button" data-action="ed-set-quality" data-quality="' + key + L('ui.f54702ea891c') + QUALITIES[key].label + '"' + (readOnly ? ' disabled' : '') + '></button>').join('') + '</div></div>' : L('ui.79318760094f') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(EFFECT_TYPES).map(key => ({ value: key, label: EFFECT_TYPES[key].label })), item.type || 'special') + '</select></div>') +
      (skill ? L('ui.1b71ccd319de') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_TYPES).map(key => ({ value: key, label: SKILL_TYPES[key].label })), item.type || 'active') + '</select><div class="field-hint">' + esc((SKILL_TYPES[item.type] || SKILL_TYPES.active).hint) + '</div></div>' +
        L('ui.bb2b328a8294') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_OPS).map(key => ({ value: key, label: SKILL_OPS[key].label })), item.op || 'attack') + '</select></div>' : '') +
      L('ui.9ff547a2306b') + (readOnly ? ' disabled' : '') + '>' + this.optionList(triggerOptions, item.trigger && item.trigger.event || 'manual') + '</select><div class="field-hint">' + (skill && item.type === 'active' ? L('ui.4ad699aba869') : skill && item.type === 'extra' ? L('ui.6c041caa42ff') : L('ui.8f4ebf634322')) + '</div></div>' +
      (skill ? L('ui.38835eff0bdb') + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(TARGET_MODES).map(key => ({ value: key, label: TARGET_MODES[key].label })), item.targetMode || 'none') + '</select></div>' +
        L('ui.e79e3118cc71') + attr(item.multiplier == null ? 100 : item.multiplier) + '" data-meta-field="multiplier"' + (readOnly ? ' disabled' : '') + L('ui.2fdfdf7b0297') : '') +
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
    const pack = Store.getEditorPack();
    const skill = this.mode === 'skills';
    if (!item.name || !String(item.name).trim()) errors.push(L('ui.bef8696071ea'));
    if (!item.id) errors.push(L('ui.8b116c26c58b'));
    if (item.id && !String(item.id).startsWith(pack.id + '.')) warnings.push(L('ui.1b1431afeade') + pack.id + '。');
    const externalIds = new Set();
    for (const category of ['skills', 'effects']) {
      for (const ext of Store.index[category]) {
        if (ext.packId !== pack.id) externalIds.add(ext.id);
      }
    }
    const draftAll = [...(pack.content.skills || []), ...(pack.content.effects || [])];
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
      if (!String(item.description || '').trim()) warnings.push(L('ui.a06a5f75494a'));
      const referenced = Store.index.units.some(unit => (unit.skills || []).includes(item.id)) ||
        Store.index.equipment.some(gear => (gear.grantedSkills || []).includes(item.id)) ||
        Store.index.runes.some(rune => (rune.grantedSkills || []).includes(item.id)) ||
        Store.index.effects.some(effect => (effect.grantedSkills || []).includes(item.id)) ||
        (pack.content.effects || []).some(effect => (effect.grantedSkills || []).includes(item.id));
      if (!referenced && !readOnly) warnings.push(L('ui.db54bdef9686'));
    } else {
      if (!EFFECT_TYPES[item.type]) errors.push(L('ui.79a0bd676e89'));
      if (item.stackable && (!Number(item.stackMax) || Number(item.stackMax) < 1)) errors.push(L('ui.e542b7f44585'));
      if (!(item.steps || []).length && (!item.mods || !Object.keys(item.mods).length) && !(item.grantedSkills || []).length) warnings.push(L('ui.ed884c417441'));
      if (!String(item.description || '').trim()) warnings.push(L('ui.d1ed3d82270f'));
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

  renderList(app, pack, mode) {
    const draft = this.itemsForMode(pack, mode);
    const refs = this.referenceItems(mode, pack);
    const draftHtml = draft.length ? draft.map(item => this.renderListItem(item, false)) .join('') : L('ui.c5bae88ea3b2');
    const refHtml = refs.length ? refs.map(item => this.renderListItem(item, true)).join('') : L('ui.175ba42cb7e4');
    return '<div class="editor-list">' +
      L('ui.e198308ea434') + draft.length + '</div>' + draftHtml +
      L('ui.1c14f56736f7') + refs.length + '</div>' + refHtml +
    '</div>';
  },

  renderListItem(item, reference) {
    const active = item.id === this.selectedId;
    const skill = this.mode === 'skills';
    const typeLabel = skill ? (SKILL_TYPES[item.type] || { label: item.type }).label : (EFFECT_TYPES[item.type] || { label: item.type }).label;
    return '<button class="editor-list-item' + (active ? ' active' : '') + '" type="button" data-action="ed-select" data-kind="' + (skill ? 'skill' : 'effect') + '" data-id="' + attr(item.id) + '">' +
      '<span class="eli-mark">' + (reference ? L('ui.a6c9557b8c29') : L('ui.e63d41bedeb6')) + '</span>' +
      '<span class="eli-main"><strong>' + esc(item.name || item.id) + '</strong><small>' + esc(typeLabel) + ' · ' + esc(item.id) + '</small></span>' +
    '</button>';
  },

  renderWorkspace(app, item, readOnly) {
    const skill = this.mode === 'skills';
    const trigger = item && item.trigger ? item.trigger.event : '';
    const header = '<div class="editor-workspace-head"><div><div class="eyebrow">' + (readOnly ? 'REFERENCE / READ ONLY' : 'DRAFT / VISUAL FLOW') + '</div><h2>' + esc(item ? item.name : L('ui.763694bdf43c')) + '</h2><p>' + (item ? esc(item.id) + ' · ' + (skill ? skillTypeLabel(item.type) : L('ui.6a4f4be10d6e')) + ' · ' + (readOnly ? L('ui.385ff977152d') : L('ui.8107ccd58593')) : L('ui.446abbfa06d9')) + '</p></div><div class="head-actions">' +
      (item ? L('ui.59934c503dbc') + (readOnly ? L('ui.198a314aa63f') : L('ui.a11534a1b557')) + '</button>' : '') +
      (!readOnly && item ? L('ui.c8b012e16e88') : '') +
      (!readOnly && item ? L('ui.4be89e8b92e1') : '') +
      '</div></div>';
    if (!item) {
      return '<section class="panel editor-workspace">' + header + L('ui.19bae5bef2d1');
    }
    return '<section class="panel editor-workspace">' + header +
      '<form class="editor-form" onsubmit="return false">' +
        L('ui.3ac4e05bace3') + (readOnly ? L('ui.8ec571a90d08') : L('ui.859ff39445de')) + '</div>' + this.renderMetadata(app, item, readOnly) + '</section>' +
        (skill ? L('ui.643d0ad0136b') + this.renderRequirements(item, readOnly) + '</section>' : '') +
        (!skill ? L('ui.0a663dfd7e81') + this.renderMods(item, readOnly) + L('ui.ef2137095ad8') + this.renderGrantedSkills(item, readOnly) + '</div></div></section>' : '') +
      '</form>' +
      L('ui.44a7a90a85a7') + (item.steps || []).length + L('ui.46fdc16ecadb') + (readOnly ? L('ui.34ba2d4c20d1') : L('ui.20b00484bcec')) + '</div></div>' +
      this.renderStepList(item, 'root', item.steps || [], readOnly, L('ui.351e2b1e5784')) +
      '<div class="editor-savebar"><span class="autosave-status' + (this.dirty ? ' dirty' : '') + '">' + (readOnly ? L('ui.a87449d09e88') : this.dirty ? L('ui.b035e280075e') : L('ui.9d84cfe84d8b')) + L('ui.2050d36799da') + (!readOnly ? L('ui.4be89e8b92e1') : '') + '</div></div>' +
    '</section>';
  },

  renderAside(app, item, readOnly) {
    const validation = this.validateCurrent(app);
    const flow = item ? renderFlowTree(item.steps || []) : '';
    const variables = VARIABLE_PALETTE.map(variable => '<button class="palette-btn" type="button" data-action="ed-insert-token" data-token="' + attr(variable.token) + '" title="' + attr(variable.hint) + '">' + esc(variable.label) + '<code>' + esc(variable.token) + '</code></button>').join('');
    return '<aside class="editor-aside">' +
      L('ui.64388ae940d7') +
        L('ui.62feaaa205e4') + variables + L('ui.d63d34238e70') +
        L('ui.514c600bc741') + EDITOR_STEP_TARGETS.map(target => L('ui.dce534653862') + attr(target.label) + '">' + esc(target.label) + '</span>').join('') + '</div></div>' +
        L('ui.d451d7ed9601') + EDITOR_CONDITION_OPS.map(op => esc(op.label)).join(' · ') + L('ui.d9b093f49744') +
      '</div></section>' +
      L('ui.5aede22d5dcf') + (validation.errors.length ? validation.errors.length + L('ui.c189fab0228a') : L('ui.dcc4233255ab')) + '</span></div><div class="panel-body" id="editor-validation">' + this.renderValidationBox(validation) + '</div></section>' +
      L('ui.ecc45e4b7216') + ((item && item.steps) || []).length + '</span></div><div class="panel-body">' + (flow || L('ui.565968446956')) + '<div class="editor-helper-note mt-2">' + (readOnly ? L('ui.8fa87032da75') : L('ui.90e31a82c675')) + '</div></div></section>' +
    '</aside>';
  },

  render(app) {
    const pack = Store.getEditorPack();
    if (!pack) return app.renderMissingModule(L('ui.25d2af3207d3'));
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
    const refCount = this.referenceItems(this.mode, pack).length;
    const draftCount = this.itemsForMode(pack, this.mode).length;
    return '' +
      '<div class="page-wrap editor-page">' +
        L('ui.ec83bb3da6c9') + (this.dirty ? 'gold' : 'green') + '">' + (this.dirty ? L('ui.b2680641e394') : L('ui.9d84cfe84d8b')) + L('ui.876abc17b1d6') +
        '<div class="editor-layout">' +
          '<aside class="editor-sidebar">' +
            '<div class="segmented editor-tabs"><button class="segment' + (this.mode === 'skills' ? ' active' : '') + L('ui.4269cfb7ff92') + (this.mode === 'effects' ? ' active' : '') + L('ui.58fb4d4cf2a9') +
            '<section class="panel editor-panel"><div class="panel-head"><div><h3>' + (this.mode === 'skills' ? L('ui.c0e4b0f5b0e1') : L('ui.7368fef6e84a')) + L('ui.65161b9afdfa') + draftCount + L('ui.4141f8660fac') + refCount + '</div></div></div><div class="panel-body"><div class="editor-list">' + this.renderList(app, pack, this.mode) + '</div></div></section>' +
            '<div class="editor-side-actions"><button class="btn btn-sm btn-primary" type="button" data-action="' + (this.mode === 'skills' ? 'ed-new-skill' : 'ed-new-effect') + L('ui.0552d39ccd0f') + (this.mode === 'skills' ? L('ui.53da139b6a5c') : L('ui.151ddd4f1f9f')) + L('ui.3c685d9972f8') +
            L('ui.7b3851aed094') + esc(pack.id) + '<br>' + (pack.content.skills || []).length + L('ui.c9d70a03539f') + (pack.content.effects || []).length + L('ui.c9d88257859d') +
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

  createStep(kind) {
    switch (kind) {
      case 'damage': return { kind, target: 'chosen', damageType: 'physical', formula: '1', ignoreResistance: false };
      case 'heal': return { kind, target: 'self', formula: '$hpMax - $hp' };
      case 'addEffect': return { kind, target: 'chosen', effectId: '', stacks: '1' };
      case 'removeEffect': return { kind, target: 'self', effectId: '', stacks: '9999' };
      case 'modifyCount': return { kind, scope: 'unit', countId: 'sakurafade', mode: 'add', formula: '1' };
      case 'readCount': return { kind, scope: 'unit', countId: 'sakurafade', varName: 'value' };
      case 'branch': return { kind, left: '$count.ha', op: 'gte', right: '1', then: [], elseSteps: [] };
      case 'selectTarget': return { kind, mode: 'allEnemies', varName: '' };
      case 'forEach': return { kind, source: 'chosen', steps: [] };
      case 'loop': return { kind, times: '1', steps: [] };
      case 'castSkill': return { kind, skillId: '', target: 'chosen' };
      case 'skipAction': return { kind, target: 'self' };
      case 'immuneDamage': return { kind };
      case 'forceRetreat': return { kind, target: 'self' };
      case 'summon': return { kind, unitId: '', count: '1' };
      case 'modifyStat': return { kind, stat: 'atkFlat', target: 'self', formula: '1' };
      case 'setVar': return { kind, varName: 'value', formula: '0' };
      default: return { kind };
    }
  },

  openStepPicker(app, listPath) {
    const groups = {};
    STEP_LIBRARY.forEach(step => { (groups[step.group] = groups[step.group] || []).push(step); });
    const body = '<div class="step-picker">' + Object.keys(groups).map(group => '<div class="step-picker-group"><h4>' + esc(group) + '</h4><div class="step-picker-grid">' + groups[group].map(step => '<button class="step-picker-card" type="button" data-action="ed-step-pick" data-kind="' + attr(step.kind) + '" data-list-path="' + attr(listPath) + '"><strong>' + esc(step.name) + '</strong><small>' + esc(step.hint) + '</small></button>').join('') + '</div></div>').join('') + '</div>';
    app.openModal({ title: L('ui.46090df7b8ed'), subtitle: L('ui.76620e08cc1e'), size: 'large', body, foot: L('ui.eb2ea2f437dc') });
  },

  validateDraftPack(app) {
    const pack = Store.getEditorPack();
    if (!pack) return { errors: [], warnings: [] };
    return { errors: [], warnings: [] };
  },

  handleAction(action, el, app, event) {
    if (!action || !action.startsWith('ed-')) return false;
    if (!app || app.route !== 'editor') return false;
    const pack = Store.getEditorPack();
    const item = this.currentItem(app);
    const readOnly = this.isReadOnly(app);
    const data = el.dataset;
    switch (action) {
      case 'ed-tab':
        this.switchMode(app, data.mode);
        return true;
      case 'ed-new-skill':
        this.newSkill(app);
        return true;
      case 'ed-new-effect':
        this.newEffect(app);
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
      case 'ed-step-pick': {
        const list = this.stepList(item, data.listPath || 'root');
        if (!list) { app.toast(L('ui.758de6f90c24'), 'error'); return true; }
        list.push(this.createStep(data.kind));
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
        app.downloadJson(item.id + '.caerogue-item.json', { kind: this.mode === 'skills' ? 'skill' : 'effect', item });
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
    const item = this.currentItem(app);
    if (!item || this.isReadOnly(app)) return;
    if (target.matches('[data-meta-field]')) {
      const field = target.dataset.metaField;
      if (field === 'triggerEvent') {
        item.trigger = item.trigger || {};
        item.trigger.event = target.value;
      } else if (field === 'triggerCondition') {
        item.trigger = item.trigger || {};
        item.trigger.condition = target.value;
      } else if (field === 'multiplier') {
        item.multiplier = Number(target.value) || 0;
      } else if (field === 'stackMax') {
        item.stackMax = Math.max(1, Number(target.value) || 1);
      } else {
        item[field] = target.value;
      }
      this.markDirty();
      if (event.type === 'change' && (target.tagName === 'SELECT' || target.type === 'checkbox')) app.render();
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
