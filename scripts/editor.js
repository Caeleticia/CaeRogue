/* CaeRogue - visual skill and advanced effect editor. */
'use strict';

const EDITOR_STEP_TARGETS = [
  { value: 'chosen', label: '技能选定目标' },
  { value: 'self', label: '自身' },
  { value: 'eventTarget', label: '事件目标' },
  { value: 'eventTargets', label: '事件目标组' },
  { value: 'allEnemies', label: '全体敌方' },
  { value: 'allAllies', label: '全体友方' },
  { value: 'item', label: '遍历中的当前项' },
  { value: 'owner', label: '效果持有者' }
];

const EDITOR_CONDITION_OPS = [
  { value: 'gte', label: '大于等于 ≥' }, { value: 'gt', label: '大于 >' },
  { value: 'lte', label: '小于等于 ≤' }, { value: 'lt', label: '小于 <' },
  { value: 'eq', label: '等于 =' }, { value: 'neq', label: '不等于 ≠' }
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
      status.textContent = '有未保存的修改';
    }
  },

  save(app, silent) {
    Store.saveEditorPack();
    this.dirty = false;
    if (!silent) {
      app.toast('设计草稿已保存到本地。', 'success');
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
      name: '新的技能',
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
      name: '新的高级效果',
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
    clone.name = item.name + ' 副本';
    pack.content[isEffect ? 'effects' : 'skills'].push(clone);
    this.selectedId = clone.id;
    this.dirty = true;
    Store.saveEditorPack();
    app.render();
    app.toast('已复制为可编辑草稿。', 'success');
  },

  deleteCurrent(app) {
    const pack = Store.getEditorPack();
    const isEffect = this.mode === 'effects';
    const list = pack.content[isEffect ? 'effects' : 'skills'];
    const pos = list.findIndex(item => item.id === this.selectedId);
    if (pos < 0) return;
    const removed = list[pos];
    app.confirm({
      title: '删除草稿内容',
      message: '确认删除「' + removed.name + '」？引用它的步骤会保留引用 ID，并在校验中提示缺失。',
      confirmLabel: '删除',
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
    if (current && !exists) html += '<option value="' + attr(current) + '" selected>' + esc(current) + '（未找到）</option>';
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
          this.fieldRow('目标', targetSelect(step.target)) +
          this.fieldRow('伤害类型', this.stepInput(listPath, index, 'damageType', step.damageType || 'physical', { type: 'select', options: Object.keys(DAMAGE_TYPES).map(key => ({ value: key, label: DAMAGE_TYPES[key].label })), disabled })) +
          this.fieldRow('伤害公式', this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), '支持 $atk、$multiplier、$lastHitCount、min()') +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'ignoreResistance', !!step.ignoreResistance, '无视对应属性抗性（真实伤害本身忽略抗性）', disabled) + '</div>' +
          '<div class="step-field full">' + this.stepCheckbox(listPath, index, 'bonus', !!step.bonus, '附加伤害：不受增益与减伤，无视抗性，不视作独立攻击，使用独立飞弹与爆炸', disabled) + '</div>' +
        '</div>';
      case 'heal':
        return '<div class="step-fields">' + this.fieldRow('目标', targetSelect(step.target)) + this.fieldRow('回复公式', this.stepInput(listPath, index, 'formula', step.formula || '1', { mono: true, disabled }), '例如 $hpMax - $hp') + '</div>';
      case 'addEffect':
        return '<div class="step-fields">' + this.fieldRow('目标', targetSelect(step.target)) + this.fieldRow('高级效果', this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: '选择一个效果', disabled })) + this.fieldRow('层数公式', this.stepInput(listPath, index, 'stacks', step.stacks || '1', { mono: true, disabled })) + '</div>';
      case 'removeEffect':
        return '<div class="step-fields">' + this.fieldRow('目标', targetSelect(step.target)) + this.fieldRow('效果', this.stepInput(listPath, index, 'effectId', step.effectId || '', { type: 'select', options: effectOptions, placeholder: '全部可解除效果', disabled })) + this.fieldRow('移除层数', this.stepInput(listPath, index, 'stacks', step.stacks || '9999', { mono: true, disabled })) + '</div>';
      case 'modifyCount':
        return '<div class="step-fields">' +
          this.fieldRow('计数范围', this.stepInput(listPath, index, 'scope', step.scope || 'unit', { type: 'select', options: Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), disabled })) +
          this.fieldRow('计数 ID', this.stepInput(listPath, index, 'countId', step.countId || '', { mono: true, disabled })) +
          this.fieldRow('修改方式', this.stepInput(listPath, index, 'mode', step.mode || 'add', { type: 'select', options: [{ value: 'add', label: '增加 / 减少' }, { value: 'set', label: '设为' }], disabled })) +
          this.fieldRow('数值公式', this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled }), '例如 $lastHitCount 或 -3') +
        '</div>';
      case 'readCount':
        return '<div class="step-fields">' +
          this.fieldRow('计数范围', this.stepInput(listPath, index, 'scope', step.scope || 'unit', { type: 'select', options: Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), disabled })) +
          this.fieldRow('计数 ID', this.stepInput(listPath, index, 'countId', step.countId || '', { mono: true, disabled })) +
          this.fieldRow('写入变量名', this.stepInput(listPath, index, 'varName', step.varName || 'value', { disabled }), '通过 $var.变量名 读取') +
        '</div>';
      case 'branch':
        return '<div class="step-fields">' +
          this.fieldRow('左侧表达式', this.stepInput(listPath, index, 'left', step.left || '0', { mono: true, disabled })) +
          this.fieldRow('比较', this.stepInput(listPath, index, 'op', step.op || 'gte', { type: 'select', options: EDITOR_CONDITION_OPS.map(op => ({ value: op.value, label: op.label })), disabled })) +
          this.fieldRow('右侧表达式', this.stepInput(listPath, index, 'right', step.right || '0', { mono: true, disabled })) +
        '</div>' + this.renderNested(item, step.then, listPath + '.' + index + '.then', '条件为真', readOnly, 'then') + this.renderNested(item, step.elseSteps, listPath + '.' + index + '.elseSteps', '条件为假', readOnly, 'elseSteps');
      case 'selectTarget':
        return '<div class="step-fields">' + this.fieldRow('目标集合', this.stepInput(listPath, index, 'mode', step.mode || 'allEnemies', { type: 'select', options: targetOptions, disabled })) + this.fieldRow('记录数量到变量', this.stepInput(listPath, index, 'varName', step.varName || '', { disabled })) + '</div>';
      case 'forEach':
        return '<div class="step-fields">' + this.fieldRow('遍历来源', this.stepInput(listPath, index, 'source', step.source || 'chosen', { type: 'select', options: targetOptions, disabled })) + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', '循环子步骤', readOnly, 'steps');
      case 'loop':
        return '<div class="step-fields">' + this.fieldRow('循环次数公式', this.stepInput(listPath, index, 'times', step.times || '1', { mono: true, disabled }), '最多按引擎上限截断') + '</div>' + this.renderNested(item, step.steps, listPath + '.' + index + '.steps', '循环子步骤', readOnly, 'steps');
      case 'castSkill':
        return '<div class="step-fields">' + this.fieldRow('技能', this.stepInput(listPath, index, 'skillId', step.skillId || '', { type: 'select', options: skillOptions, placeholder: '选择技能', disabled })) + this.fieldRow('目标来源', this.stepInput(listPath, index, 'target', step.target || 'chosen', { type: 'select', options: targetOptions, disabled })) + '</div>';
      case 'skipAction':
        return '<div class="step-fields">' + this.fieldRow('目标', targetSelect(step.target || 'self')) + '<div class="step-field full"><span class="step-note">跳过目标本回合剩余行动。通常在持有者行动开始时触发。</span></div></div>';
      case 'immuneDamage':
        return '<div class="step-fields"><div class="step-field full"><span class="step-note">仅在致命伤害或受伤相关触发中生效。普通流程中会记录但不会生效。</span></div></div>';
      case 'forceRetreat':
        return '<div class="step-fields">' + this.fieldRow('目标', targetSelect(step.target || 'self')) + '</div>';
      case 'summon':
        return '<div class="step-fields">' + this.fieldRow('角色卡', this.stepInput(listPath, index, 'unitId', step.unitId || '', { type: 'select', options: unitOptions, placeholder: '选择角色', disabled })) + this.fieldRow('数量公式', this.stepInput(listPath, index, 'count', step.count || '1', { mono: true, disabled })) + '</div>';
      case 'modifyStat':
        return '<div class="step-fields">' +
          this.fieldRow('属性', this.stepInput(listPath, index, 'stat', step.stat || 'atkFlat', { type: 'select', options: Object.keys(STAT_KEYS).map(key => ({ value: key, label: STAT_KEYS[key] })), disabled })) +
          this.fieldRow('目标', targetSelect(step.target || 'self')) +
          this.fieldRow('数值公式', this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled })) +
        '</div>';
      case 'setVar':
        return '<div class="step-fields">' + this.fieldRow('变量名', this.stepInput(listPath, index, 'varName', step.varName || 'value', { disabled })) + this.fieldRow('公式', this.stepInput(listPath, index, 'formula', step.formula || '0', { mono: true, disabled })) + '</div>';
      default:
        return '<div class="step-note">未识别的步骤类型：' + esc(step.kind) + '</div>';
    }
  },

  renderNested(item, steps, listPath, label, readOnly, key) {
    const list = Array.isArray(steps) ? steps : [];
    return '<div class="nested-wrap"><div class="nested-label">' + esc(label) + '</div><div class="step-list nested" data-step-list="' + attr(listPath) + '">' +
      (list.length ? list.map((step, index) => this.renderStep(item, step, listPath, index, readOnly, 1)).join('') : '<div class="step-list-empty">这里还没有子步骤。</div>') +
    '</div>' + (readOnly ? '' : '<button class="nested-add" type="button" data-action="ed-step-add" data-list-path="' + attr(listPath) + '">+ 添加子步骤</button>') + '</div>';
  },

  renderStep(item, step, listPath, index, readOnly, depth) {
    const meta = STEP_LIBRARY.find(entry => entry.kind === step.kind) || { name: step.kind, group: '流程' };
    const displayName = step.kind === 'damage' && step.bonus ? '附加伤害' : meta.name;
    const isBranch = ['branch', 'forEach', 'loop'].includes(step.kind);
    return '<div class="step-block' + (isBranch ? ' branch-step' : '') + '" data-step-block data-list-path="' + attr(listPath) + '" data-index="' + index + '" draggable="' + (!readOnly ? 'true' : 'false') + '">' +
      '<div class="step-head">' +
        '<button class="drag-handle" type="button" aria-label="拖拽排序" title="拖拽或使用上下按钮排序"' + (readOnly ? ' disabled' : '') + '>≡</button>' +
        '<span class="step-num">' + (depth ? String(index + 1) : String(index + 1)) + '</span>' +
        '<span class="step-title">' + esc(displayName) + '</span>' +
        '<span class="step-kind">' + esc(meta.group) + '</span>' +
        '<div class="step-actions">' +
          (readOnly ? '' : '<button type="button" data-action="ed-step-up" data-list-path="' + attr(listPath) + '" data-index="' + index + '" title="上移">↑</button><button type="button" data-action="ed-step-down" data-list-path="' + attr(listPath) + '" data-index="' + index + '" title="下移">↓</button><button type="button" data-action="ed-step-dup" data-list-path="' + attr(listPath) + '" data-index="' + index + '" title="复制步骤">⧉</button><button class="del" type="button" data-action="ed-step-delete" data-list-path="' + attr(listPath) + '" data-index="' + index + '" title="删除步骤">×</button>') +
        '</div>' +
      '</div>' +
      '<div class="step-body">' + this.stepFields(item, step, listPath, index, readOnly) + '</div>' +
    '</div>';
  },

  renderStepList(item, listPath, steps, readOnly, label) {
    const list = Array.isArray(steps) ? steps : [];
    return '<div class="step-list" data-step-list="' + attr(listPath) + '">' +
      (list.length ? list.map((step, index) => this.renderStep(item, step, listPath, index, readOnly, 0)).join('') : '<div class="step-list-empty">还没有步骤。按顺序添加造成伤害、附加效果、修改计数或条件分支。</div>') +
    '</div>' +
    (readOnly ? '' : '<div class="step-add-row"><button class="btn btn-sm" type="button" data-action="ed-step-add" data-list-path="' + attr(listPath) + '">+ 添加步骤</button><span class="field-hint">步骤按从上到下的顺序执行。可拖拽或使用箭头排序。</span></div>');
  },

  renderRequirements(skill, readOnly) {
    const reqs = Array.isArray(skill.requirements) ? skill.requirements : [];
    return '<div class="requirement-list">' +
      (reqs.length ? reqs.map((req, index) => '<div class="requirement-row">' +
        '<select class="select" data-req-index="' + index + '" data-req-field="scope"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(COUNT_SCOPES).map(key => ({ value: key, label: COUNT_SCOPES[key].label })), req.scope || 'unit') + '</select>' +
        '<input class="input" value="' + attr(req.countId || '') + '" placeholder="计数 ID" data-req-index="' + index + '" data-req-field="countId"' + (readOnly ? ' disabled' : '') + '>' +
        '<select class="select" data-req-index="' + index + '" data-req-field="op"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(EDITOR_CONDITION_OPS, req.op || 'gte') + '</select>' +
        '<input class="input" value="' + attr(req.value == null ? '1' : req.value) + '" placeholder="数值" data-req-index="' + index + '" data-req-field="value"' + (readOnly ? ' disabled' : '') + '>' +
        (readOnly ? '<span></span>' : '<button class="icon-btn small danger" type="button" data-action="ed-req-remove" data-index="' + index + '" title="移除条件">×</button>') +
      '</div>').join('') : '<div class="requirement-empty">暂无释放条件。主动技按默认行动规则释放；附加技应由条件触发。</div>') +
      (readOnly ? '' : '<div class="btn-row"><button class="btn btn-sm btn-quiet" type="button" data-action="ed-req-add">添加释放条件</button></div>') +
    '</div>';
  },

  renderMetadata(app, item, readOnly) {
    const skill = this.mode === 'skills';
    const triggerOptions = [{ value: 'none', label: '无触发（仅作为状态记录）' }].concat(Object.keys(TRIGGER_EVENTS).filter(key => key !== 'none').map(key => ({ value: key, label: TRIGGER_EVENTS[key].label })));
    return '<div class="form-grid">' +
      '<div class="form-row span-2"><label class="field-label">名字 <small>自然语言显示名</small></label><input class="input" value="' + attr(item.name || '') + '" data-meta-field="name"' + (readOnly ? ' disabled' : '') + ' placeholder="技能或效果名称"></div>' +
      '<div class="form-row"><label class="field-label">ID</label><input class="input mono" value="' + attr(item.id) + '" readonly><div class="field-hint">引用 ID。扩展草稿使用包命名空间。</div></div>' +
      (skill ? '<div class="form-row"><label class="field-label">品质</label><div class="editor-quality-picker" role="group" aria-label="品质">' + Object.keys(QUALITIES).map(key => '<button class="quality-choice ' + qualityClass(key) + ((item.quality || 'white') === key ? ' active' : '') + '" type="button" data-action="ed-set-quality" data-quality="' + key + '" aria-label="品质 ' + QUALITIES[key].label + '"' + (readOnly ? ' disabled' : '') + '></button>').join('') + '</div></div>' : '<div class="form-row"><label class="field-label">效果类型</label><select class="select" data-meta-field="type"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(EFFECT_TYPES).map(key => ({ value: key, label: EFFECT_TYPES[key].label })), item.type || 'special') + '</select></div>') +
      (skill ? '<div class="form-row"><label class="field-label">技能类型</label><select class="select" data-meta-field="type"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_TYPES).map(key => ({ value: key, label: SKILL_TYPES[key].label })), item.type || 'active') + '</select><div class="field-hint">' + esc((SKILL_TYPES[item.type] || SKILL_TYPES.active).hint) + '</div></div>' +
        '<div class="form-row"><label class="field-label">操作分类 <small>触发判定标准</small></label><select class="select" data-meta-field="op"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(SKILL_OPS).map(key => ({ value: key, label: SKILL_OPS[key].label })), item.op || 'attack') + '</select></div>' : '') +
      '<div class="form-row"><label class="field-label">触发事件</label><select class="select" data-meta-field="triggerEvent"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(triggerOptions, item.trigger && item.trigger.event || 'manual') + '</select><div class="field-hint">' + (skill && item.type === 'active' ? '主动技默认只能在自身行动时手动释放。' : skill && item.type === 'extra' ? '附加技需要可主动释放的条件。' : '被动技必须配置触发事件。') + '</div></div>' +
      (skill ? '<div class="form-row"><label class="field-label">目标模式</label><select class="select" data-meta-field="targetMode"' + (readOnly ? ' disabled' : '') + '>' + this.optionList(Object.keys(TARGET_MODES).map(key => ({ value: key, label: TARGET_MODES[key].label })), item.targetMode || 'none') + '</select></div>' +
        '<div class="form-row"><label class="field-label">技能倍率 <small>供 $multiplier 使用</small></label><input class="input mono" type="number" min="0" max="9999" value="' + attr(item.multiplier == null ? 100 : item.multiplier) + '" data-meta-field="multiplier"' + (readOnly ? ' disabled' : '') + '><div class="field-hint">100 表示 1 倍。公式中需显式使用。</div></div>' : '') +
      (skill ? '<div class="form-row"><label class="field-label">触发条件表达式 <small>可选</small></label><input class="input mono" value="' + attr(item.trigger && item.trigger.condition || '') + '" data-meta-field="triggerCondition"' + (readOnly ? ' disabled' : '') + ' placeholder="例如 $count.ha >= 1"></div>' : '') +
      '<div class="form-row span-2"><label class="field-label">自然语言描述</label><textarea class="textarea" rows="3" data-meta-field="description"' + (readOnly ? ' disabled' : '') + ' placeholder="描述触发与流程结果">' + esc(item.description || '') + '</textarea></div>' +
      (!skill ? '<div class="form-row"><label class="field-label">层数规则</label><div class="row">' + this.effectToggle('stackable', item.stackable, '采用层数', readOnly) + '<input class="input compact mono" style="width:74px" type="number" min="1" max="99" value="' + attr(item.stackMax == null ? 1 : item.stackMax) + '" data-meta-field="stackMax"' + (readOnly ? ' disabled' : '') + ' aria-label="层数上限"></div></div>' +
        '<div class="form-row"><label class="field-label">解除规则</label><div class="row">' + this.effectToggle('removable', item.removable !== false, '可被解除', readOnly) + '</div><div class="field-hint">不可解除的效果不会被普通移除步骤移除。</div></div>' : '') +
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
    '</div>').join('') : '<div class="requirement-empty">暂无属性修正。</div>') +
    (readOnly ? '' : '<button class="btn btn-sm btn-quiet mt-1" type="button" data-action="ed-mod-add">添加属性修正</button>') + '</div>';
  },

  renderGrantedSkills(item, readOnly) {
    const skills = this.allSkillRefs();
    const selected = new Set(item.grantedSkills || []);
    return '<div class="effect-granted-list">' + (skills.length ? skills.map(skill => '<label class="form-check-inline"><input type="checkbox" data-granted-skill="' + attr(skill.id) + '"' + (selected.has(skill.id) ? ' checked' : '') + (readOnly ? ' disabled' : '') + '> ' + esc(skill.name) + '</label>').join('') : '<span class="faint tiny">没有可用技能</span>') + '</div>';
  },

  renderValidationPanel(app) {
    const node = document.getElementById('editor-validation');
    if (!node) return;
    const result = this.validateCurrent(app);
    this._lastValidation = result;
    node.innerHTML = this.renderValidationBox(result);
  },

  renderValidationBox(result) {
    if (!result) return '<div class="validation-box"><div class="validation-title"><span class="mark">—</span>未选择内容</div></div>';
    const issues = result.errors.concat(result.warnings);
    return '<div class="validation-box ' + (result.errors.length ? 'bad' : result.warnings.length ? 'warn' : 'ok') + '">' +
      '<div class="validation-title"><span class="mark">' + (result.errors.length ? '!' : result.warnings.length ? '—' : '过') + '</span>' + (result.errors.length ? '存在 ' + result.errors.length + ' 个问题' : result.warnings.length ? '通过，含 ' + result.warnings.length + ' 条提示' : '校验通过') + '</div>' +
      (issues.length ? '<ul class="validation-index-list">' + result.errors.map(error => '<li class="err">' + esc(error) + '</li>').join('') + result.warnings.map(warning => '<li>' + esc(warning) + '</li>').join('') + '</ul>' : '<div class="field-hint">主动技默认自身行动释放；被动技已配置触发；所有引用 ID 可在当前索引与草稿中找到。</div>') +
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
    if (!item.name || !String(item.name).trim()) errors.push('名字不能为空。');
    if (!item.id) errors.push('ID 不能为空。');
    if (item.id && !String(item.id).startsWith(pack.id + '.')) warnings.push('草稿 ID 未使用当前包命名空间前缀 ' + pack.id + '。');
    const externalIds = new Set();
    for (const category of ['skills', 'effects']) {
      for (const ext of Store.index[category]) {
        if (ext.packId !== pack.id) externalIds.add(ext.id);
      }
    }
    const draftAll = [...(pack.content.skills || []), ...(pack.content.effects || [])];
    const duplicate = draftAll.filter(entry => entry.id === item.id).length;
    if (duplicate > 1) errors.push('草稿内 ID 冲突：' + item.id);
    if (externalIds.has(item.id)) errors.push('ID 与已启用扩展冲突：' + item.id);
    if (skill) {
      if (!SKILL_TYPES[item.type]) errors.push('技能类型无效。');
      if (!SKILL_OPS[item.op]) errors.push('操作分类无效。');
      if (item.type === 'passive' && (!item.trigger || ['none', 'manual', ''].includes(item.trigger.event))) errors.push('被动技必须配置有效的触发事件。');
      if (item.type === 'extra' && !(item.requirements && item.requirements.length) && !(item.trigger && item.trigger.condition)) errors.push('附加技必须配置可主动释放的释放条件。');
      if (item.type === 'active' && item.trigger && item.trigger.event && !['manual', 'actionStart'].includes(item.trigger.event)) warnings.push('主动技默认只在自身行动时可释放，请确认额外触发事件符合规则。');
      if (!(item.steps || []).length) warnings.push('技能没有步骤，释放后不会产生效果。');
      if (!String(item.description || '').trim()) warnings.push('建议填写自然语言描述，便于在卡牌详情中阅读。');
      const referenced = Store.index.units.some(unit => (unit.skills || []).includes(item.id)) ||
        Store.index.equipment.some(gear => (gear.grantedSkills || []).includes(item.id)) ||
        Store.index.runes.some(rune => (rune.grantedSkills || []).includes(item.id)) ||
        Store.index.effects.some(effect => (effect.grantedSkills || []).includes(item.id)) ||
        (pack.content.effects || []).some(effect => (effect.grantedSkills || []).includes(item.id));
      if (!referenced && !readOnly) warnings.push('当前没有角色、装备或效果引用这个技能成立的新 ID。发布后可将它加入引用它们的扩展包。');
    } else {
      if (!EFFECT_TYPES[item.type]) errors.push('效果类型无效。');
      if (item.stackable && (!Number(item.stackMax) || Number(item.stackMax) < 1)) errors.push('采用层数时，层数上限必须大于零。');
      if (!(item.steps || []).length && (!item.mods || !Object.keys(item.mods).length) && !(item.grantedSkills || []).length) warnings.push('效果没有数值、技能或步骤。');
      if (!String(item.description || '').trim()) warnings.push('建议填写效果说明，便于在状态面板中查看。');
    }
    if (item.trigger && item.trigger.condition) {
      try {
        tokenizeFormula(item.trigger.condition);
      } catch (error) {
        errors.push('触发条件表达式无法解析：' + error.message);
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
        if (!step || !step.kind) { errors.push('步骤 ' + path + index + ' 缺少类型。'); return; }
        if (step.kind === 'addEffect') {
          if (!step.effectId) errors.push('步骤 ' + path + index + ' 缺少高级效果引用。');
          else if (!effectMap.has(step.effectId)) errors.push('步骤 ' + path + index + ' 引用了不存在的高级效果：' + step.effectId);
        }
        if (step.kind === 'castSkill') {
          if (!step.skillId) errors.push('步骤 ' + path + index + ' 缺少技能引用。');
          else if (!skillMap.has(step.skillId)) errors.push('步骤 ' + path + index + ' 引用了不存在的技能：' + step.skillId);
        }
        if (step.kind === 'summon') {
          if (!step.unitId) errors.push('步骤 ' + path + index + ' 缺少召唤角色引用。');
          else if (!unitMap.has(step.unitId)) errors.push('步骤 ' + path + index + ' 引用了不存在的角色：' + step.unitId);
        }
        for (const field of ['formula', 'times', 'left', 'right', 'stacks']) {
          if (step[field] !== undefined && step[field] !== '' && step[field] !== null) {
            try { tokenizeFormula(step[field]); }
            catch (error) { errors.push('步骤 ' + path + index + ' 的 ' + field + ' 表达式无法解析：' + error.message); }
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
      if (!skillMap.has(id)) errors.push('持有技能引用不存在：' + id);
    }
    for (const req of item.requirements || []) {
      if (!req.countId) errors.push('存在没有计数 ID 的释放条件。');
      if (!req.op) errors.push('存在没有比较符的释放条件。');
    }
    return { errors, warnings, readOnly };
  },

  renderList(app, pack, mode) {
    const draft = this.itemsForMode(pack, mode);
    const refs = this.referenceItems(mode, pack);
    const draftHtml = draft.length ? draft.map(item => this.renderListItem(item, false)) .join('') : '<div class="empty-state" style="min-height:90px;padding:12px 8px"><p>还没有草稿。新建一项，或从内置内容复制。</p></div>';
    const refHtml = refs.length ? refs.map(item => this.renderListItem(item, true)).join('') : '<div class="faint tiny" style="padding:8px 4px">没有可参考的内容。</div>';
    return '<div class="editor-list">' +
      '<div class="editor-list-sep">设计草稿 · ' + draft.length + '</div>' + draftHtml +
      '<div class="editor-list-sep">内置与已装载 · ' + refs.length + '</div>' + refHtml +
    '</div>';
  },

  renderListItem(item, reference) {
    const active = item.id === this.selectedId;
    const skill = this.mode === 'skills';
    const typeLabel = skill ? (SKILL_TYPES[item.type] || { label: item.type }).label : (EFFECT_TYPES[item.type] || { label: item.type }).label;
    return '<button class="editor-list-item' + (active ? ' active' : '') + '" type="button" data-action="ed-select" data-kind="' + (skill ? 'skill' : 'effect') + '" data-id="' + attr(item.id) + '">' +
      '<span class="eli-mark">' + (reference ? '藏' : '稿') + '</span>' +
      '<span class="eli-main"><strong>' + esc(item.name || item.id) + '</strong><small>' + esc(typeLabel) + ' · ' + esc(item.id) + '</small></span>' +
    '</button>';
  },

  renderWorkspace(app, item, readOnly) {
    const skill = this.mode === 'skills';
    const trigger = item && item.trigger ? item.trigger.event : '';
    const header = '<div class="editor-workspace-head"><div><div class="eyebrow">' + (readOnly ? 'REFERENCE / READ ONLY' : 'DRAFT / VISUAL FLOW') + '</div><h2>' + esc(item ? item.name : '尚未选择内容') + '</h2><p>' + (item ? esc(item.id) + ' · ' + (skill ? skillTypeLabel(item.type) : '高级效果') + ' · ' + (readOnly ? '内置参考内容' : '本地草稿') : '选择左侧内容开始设计') + '</p></div><div class="head-actions">' +
      (item ? '<button class="btn btn-sm" type="button" data-action="ed-export-item">导出当前项</button><button class="btn btn-sm" type="button" data-action="ed-copy">' + (readOnly ? '复制到草稿' : '复制为新草稿') + '</button>' : '') +
      (!readOnly && item ? '<button class="btn btn-sm btn-danger" type="button" data-action="ed-delete">删除草稿</button>' : '') +
      (!readOnly && item ? '<button class="btn btn-sm btn-primary" type="button" data-action="ed-save">保存草稿</button>' : '') +
      '</div></div>';
    if (!item) {
      return '<section class="panel editor-workspace">' + header + '<div class="editor-form"><div class="empty-state" style="min-height:300px"><img src="assets/icons/editor.svg" alt=""><h3>选择或新建内容</h3><p>左侧选择内置内容作为参考，或新建一项技能 / 高级效果。</p><div class="actions"><button class="btn btn-primary" type="button" data-action="ed-new-skill">新建技能</button><button class="btn" type="button" data-action="ed-new-effect">新建效果</button></div></div></div></section>';
    }
    return '<section class="panel editor-workspace">' + header +
      '<form class="editor-form" onsubmit="return false">' +
        '<section class="editor-form-section"><div class="section-heading"><div><h3>基础档案</h3><p>名字、类型与触发配置。ID 由系统生成并在引用中保持稳定。</p></div>' + (readOnly ? '<span class="chip">只读</span>' : '<span class="chip gold">草稿</span>') + '</div>' + this.renderMetadata(app, item, readOnly) + '</section>' +
        (skill ? '<section class="editor-form-section"><div class="section-heading"><div><h3>释放条件</h3><p>条件只在技能释放时检查一次。主动技还需要处于当前行动方且单位未行动。</p></div></div>' + this.renderRequirements(item, readOnly) + '</section>' : '') +
        (!skill ? '<section class="editor-form-section"><div class="section-heading"><div><h3>数值与持有技能</h3><p>效果层数按数值归属；属性修正会影响持有者。</p></div></div><div class="form-grid three"><div class="form-row"><label class="field-label">属性修正</label>' + this.renderMods(item, readOnly) + '</div><div class="form-row span-2"><label class="field-label">持有技能 <small>效果存在时授予</small></label>' + this.renderGrantedSkills(item, readOnly) + '</div></div></section>' : '') +
      '</form>' +
      '<div class="step-toolbar"><div class="st-left"><span>操作流程</span><b>' + (item.steps || []).length + '</b><span>个顶层步骤</span></div><div class="btn-row">' + (readOnly ? '<span class="faint tiny">内置内容不可直接修改</span>' : '<button class="btn btn-sm" type="button" data-action="ed-save">保存草稿</button>') + '</div></div>' +
      this.renderStepList(item, 'root', item.steps || [], readOnly, '顶层步骤') +
      '<div class="editor-savebar"><span class="autosave-status' + (this.dirty ? ' dirty' : '') + '">' + (readOnly ? '内置参考内容 · 只读' : this.dirty ? '有未保存的修改' : '草稿已保存') + '</span><div class="btn-row"><button class="btn btn-sm btn-quiet" type="button" data-action="ed-export-draft">导出整包草稿</button>' + (!readOnly ? '<button class="btn btn-sm btn-primary" type="button" data-action="ed-save">保存草稿</button>' : '') + '</div></div>' +
    '</section>';
  },

  renderAside(app, item, readOnly) {
    const validation = this.validateCurrent(app);
    const flow = item ? renderFlowTree(item.steps || []) : '';
    const variables = VARIABLE_PALETTE.map(variable => '<button class="palette-btn" type="button" data-action="ed-insert-token" data-token="' + attr(variable.token) + '" title="' + attr(variable.hint) + '">' + esc(variable.label) + '<code>' + esc(variable.token) + '</code></button>').join('');
    return '<aside class="editor-aside">' +
      '<section class="panel"><div class="panel-head"><h3>变量与目标</h3><span class="panel-count">插入</span></div><div class="panel-body">' +
        '<div class="palette-section"><div class="palette-title"><span>数值变量</span><small>先聚焦公式输入框</small></div><div class="palette-grid">' + variables + '</div><div class="palette-hint">点击变量会插入到最近聚焦的公式输入框。公式支持 + - * / 括号、min/max/floor/ceil 与百分比。</div></div>' +
        '<div class="palette-section"><div class="palette-title"><span>目标来源</span><small>步骤目标</small></div><div class="palette-grid">' + EDITOR_STEP_TARGETS.map(target => '<span class="palette-btn" style="cursor:default" title="步骤目标：' + attr(target.label) + '">' + esc(target.label) + '</span>').join('') + '</div></div>' +
        '<div class="palette-section"><div class="palette-title"><span>条件比较</span><small>流程分支</small></div><div class="palette-hint">' + EDITOR_CONDITION_OPS.map(op => esc(op.label)).join(' · ') + '</div><div class="callout mt-1">释放条件与触发条件在操作发生时判定一次；不会每帧轮询。步骤按顺序执行，勿把读取与写入并发处理。</div></div>' +
      '</div></section>' +
      '<section class="panel"><div class="panel-head"><h3>校验</h3><span class="panel-count">' + (validation.errors.length ? validation.errors.length + ' 问题' : '通过') + '</span></div><div class="panel-body" id="editor-validation">' + this.renderValidationBox(validation) + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h3>流程预览</h3><span class="panel-count">' + ((item && item.steps) || []).length + '</span></div><div class="panel-body">' + (flow || '<div class="rail-empty">选择内容后显示步骤结构。</div>') + '<div class="editor-helper-note mt-2">' + (readOnly ? '这是内置或已装载内容。复制到草稿后可修改并发布为本地扩展包。' : '草稿不直接修改内置卡牌。可导出整包，或在创意工坊把草稿发布为本地扩展。') + '</div></div></section>' +
    '</aside>';
  },

  render(app) {
    const pack = Store.getEditorPack();
    if (!pack) return app.renderMissingModule('编辑器草稿不可用');
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
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">VISUAL SKILL WORKBENCH / NO FUNCTIONS REQUIRED</div><h1>技能与效果编辑器</h1><p>用触发、目标、步骤和变量组合技能。内置内容可浏览与复制，草稿保存在本地；发布扩展包后即可被其他内容以 ID 引用。</p></div><div class="page-head-side"><span class="chip ' + (this.dirty ? 'gold' : 'green') + '">' + (this.dirty ? '有未保存修改' : '草稿已保存') + '</span><button class="btn" type="button" data-action="open-route" data-route="workshop">打开创意工坊</button><button class="btn btn-primary" type="button" data-action="ed-save">保存草稿</button></div></div>' +
        '<div class="editor-layout">' +
          '<aside class="editor-sidebar">' +
            '<div class="segmented editor-tabs"><button class="segment' + (this.mode === 'skills' ? ' active' : '') + '" type="button" data-action="ed-tab" data-mode="skills">技能</button><button class="segment' + (this.mode === 'effects' ? ' active' : '') + '" type="button" data-action="ed-tab" data-mode="effects">高级效果</button></div>' +
            '<section class="panel editor-panel"><div class="panel-head"><div><h3>' + (this.mode === 'skills' ? '技能列表' : '效果列表') + '</h3><div class="panel-sub">草稿 ' + draftCount + ' · 参考 ' + refCount + '</div></div></div><div class="panel-body"><div class="editor-list">' + this.renderList(app, pack, this.mode) + '</div></div></section>' +
            '<div class="editor-side-actions"><button class="btn btn-sm btn-primary" type="button" data-action="' + (this.mode === 'skills' ? 'ed-new-skill' : 'ed-new-effect') + '">新建' + (this.mode === 'skills' ? '技能' : '效果') + '</button><button class="btn btn-sm" type="button" data-action="ed-save">保存草稿</button></div>' +
            '<div class="pack-mini-info">草稿包：' + esc(pack.id) + '<br>' + (pack.content.skills || []).length + ' 个技能 · ' + (pack.content.effects || []).length + ' 个效果<br>使用包命名空间，避免与内置内容冲突。</div>' +
          '</aside>' +
          this.renderWorkspace(app, item, readOnly) +
          this.renderAside(app, item, readOnly) +
        '</div>' +
      '</div>';
  },

  afterRender(app) {
    if (this.dirty) {
      const status = document.querySelector('.autosave-status');
      if (status) { status.classList.add('dirty'); status.textContent = '有未保存的修改'; }
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
    app.openModal({ title: '添加流程步骤', subtitle: '步骤将添加到当前列表末尾，可继续拖拽或使用箭头排序。', size: 'large', body, foot: '<button class="btn" type="button" data-action="modal-close">取消</button>' });
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
        if (!list) { app.toast('找不到目标步骤列表。', 'error'); return true; }
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
        if (!input || !input.isConnected) { app.toast('先点击一个公式或数值输入框，再插入变量。', 'error'); return true; }
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
