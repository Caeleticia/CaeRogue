/* CaeRogue - deterministic, single-threaded battle engine.
   No async functions mutate battle data. Skills run as an interpreted step chain,
   and all pending defeats are resolved at the end of the current action batch. */
'use strict';

const ENGINE_LIMITS = {
  triggerDepth: 18,
  stepDepth: 10,
  loopIterations: 40,
  summonCount: 6,
  pendingDefeats: 40,
  logs: 220
};

const LOG_KIND_LABELS = {
  system: '系统', round: '回合', turn: '行动', entry: '入场', skill: '技能',
  passive: '被动', trigger: '触发', damage: '伤害', heal: '回复',
  effect: '效果', count: '计数', defeat: '退场', retreat: '退场',
  summon: '召唤', formula: '公式', victory: '结算', extra: '附加'
};

class FormulaError extends Error {}

function tokenizeFormula(source) {
  const tokens = [];
  const text = String(source);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '$') {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) j += 1;
      if (j === i + 1) throw new FormulaError('变量缺少名称');
      tokens.push({ type: 'var', value: text.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j += 1;
      let percent = false;
      if (text[j] === '%') { percent = true; j += 1; }
      tokens.push({ type: 'number', value: Number(text.slice(i, percent ? j - 1 : j)) / (percent ? 100 : 1) });
      i = j;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', value: two }); i += 2; continue;
    }
    if (ch === '>' || ch === '<') { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    if ('+-*/(),'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      tokens.push({ type: 'name', value: text.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError('无法识别的字符：' + ch);
  }
  return tokens;
}

class FormulaParser {
  constructor(tokens, resolver) {
    this.tokens = tokens;
    this.pos = 0;
    this.resolver = resolver;
  }
  peek() { return this.tokens[this.pos]; }
  take(value) {
    const token = this.peek();
    if (!token) return null;
    if (value !== undefined && token.value !== value) return null;
    this.pos += 1;
    return token;
  }
  expect(value) {
    const token = this.take(value);
    if (!token) throw new FormulaError('缺少符号 ' + value);
    return token;
  }
  parse() {
    const value = this.parseComparison();
    if (this.pos < this.tokens.length) throw new FormulaError('表达式存在多余内容');
    return value;
  }
  parseComparison() {
    let left = this.parseExpression();
    while (this.peek() && ['>', '<', '>=', '<=', '==', '!='].includes(this.peek().value)) {
      const op = this.take().value;
      const right = this.parseExpression();
      if (op === '>') left = left > right ? 1 : 0;
      else if (op === '<') left = left < right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '==') left = left === right ? 1 : 0;
      else left = left !== right ? 1 : 0;
    }
    return left;
  }
  parseExpression() {
    let left = this.parseTerm();
    while (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.take().value;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  parseTerm() {
    let left = this.parseUnary();
    while (this.peek() && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.take().value;
      const right = this.parseUnary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  parseUnary() {
    if (this.peek() && this.peek().value === '-') { this.take(); return -this.parseUnary(); }
    if (this.peek() && this.peek().value === '+') { this.take(); return this.parseUnary(); }
    return this.parsePrimary();
  }
  parsePrimary() {
    const token = this.peek();
    if (!token) throw new FormulaError('表达式不完整');
    if (token.type === 'number') { this.take(); return token.value; }
    if (token.type === 'var') { this.take(); return Number(this.resolver(token.value)) || 0; }
    if (token.type === 'name') {
      this.take();
      if (token.value === 'min' || token.value === 'max') {
        this.expect('(');
        const args = [this.parseExpression()];
        while (this.take(',')) args.push(this.parseExpression());
        this.expect(')');
        return token.value === 'min' ? Math.min(...args) : Math.max(...args);
      }
      if (token.value === 'floor' || token.value === 'ceil' || token.value === 'round' || token.value === 'abs') {
        this.expect('(');
        const arg = this.parseExpression();
        this.expect(')');
        return Math[token.value](arg);
      }
      throw new FormulaError('未知函数：' + token.value);
    }
    if (token.value === '(') {
      this.take();
      const value = this.parseExpression();
      this.expect(')');
      return value;
    }
    throw new FormulaError('无法解析的符号：' + token.value);
  }
}

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const QUALITY_RANK = { rainbow: 4, gold: 3, blue: 2, white: 1 };

class Battle {
  constructor(config) {
    config = config || {};
    this.config = config;
    this.mode = config.mode || 'versus';
    this.rules = Object.assign({}, DEFAULT_RULES, config.rules || {});
    this.rules.maxField = Math.max(1, Number(this.rules.maxField) || 3);
    this.rules.initialDraw = Math.max(0, Number(this.rules.initialDraw) || 0);
    this.controllers = Object.assign({ A: 'human', B: 'human' }, config.controllers || {});
    this.modifiers = config.modifiers || {};
    this.content = Store.content();
    this.maps = this.content.maps;
    this.logs = [];
    this.logSeq = 0;
    this.round = 1;
    this.phase = 'setup';
    this.status = 'active';
    this.winner = null;
    this.started = false;
    this.firstSide = 'B';
    this.currentSide = null;
    this.pendingDefeats = [];
    this.batchDepth = 0;
    this.triggerDepth = 0;
    this.stepDepth = 0;
    this.damageFeed = [];
    this.damageSeq = 0;
    this.visualFeed = [];
    this.visualSeq = 0;
    this.triggerFeed = [];
    this.actionStartedFor = null;
    this.turnSerial = 0;
    this.lastHitTargets = [];
    this.lastSkill = null;
    this.globalCounts = {};
    this.aiThinking = false;
    this.uidSeq = 0;
    this.endedAt = null;
    this.finishCallback = config.onEnd || null;
    this.log('system', '战斗建立，正在抽取初始手牌与整备入场。');
    this.sides = {
      A: this.createSide('A', config.loadouts && config.loadouts.A),
      B: this.createSide('B', config.loadouts && config.loadouts.B)
    };
    this.start();
  }

  createSide(id, rawLoadout) {
    const loadout = rawLoadout || (id === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    const name = id === 'A' ? '我方' : '敌方';
    const side = {
      id, name,
      controller: this.controllers[id] || 'human',
      deck: [],
      hand: [],
      discard: [],
      retreat: [],
      units: [],
      counts: {},
      runes: [],
      equipmentPool: []
    };
    const unitIds = (loadout.units || []).filter(item => this.maps.units.has(item));
    side.deck = shuffle(unitIds);
    side.equipmentPool = (loadout.equipment || []).filter(item => this.maps.equipment.has(item));
    const runeIds = [...new Set((loadout.runes || []).filter(item => this.maps.runes.has(item)))];
    side.runePool = runeIds.map(item => this.maps.runes.get(item));
    const requestedActive = Array.isArray(loadout.activeRunes)
      ? loadout.activeRunes.filter(item => runeIds.includes(item))
      : runeIds.slice(0, 3);
    side.runes = [...new Set(requestedActive)].slice(0, 3).map(item => this.maps.runes.get(item));
    return side;
  }

  get externalModsForSide() {
    return this.modifiers || {};
  }

  getSide(id) { return this.sides[id]; }
  getOpposingSide(id) { return this.sides[id === 'A' ? 'B' : 'A']; }
  getSideOf(unit) { return this.sides[unit.side]; }
  getUnit(uid) {
    for (const sideId of ['A', 'B']) {
      const unit = this.sides[sideId].units.find(item => item.battleId === uid);
      if (unit) return unit;
    }
    return null;
  }

  log(kind, text, options) {
    const entry = {
      seq: ++this.logSeq,
      round: this.round,
      kind,
      label: LOG_KIND_LABELS[kind] || kind,
      text,
      side: options && options.side ? options.side : null
    };
    this.logs.push(entry);
    if (this.logs.length > ENGINE_LIMITS.logs) this.logs.shift();
    return entry;
  }

  pushTrigger(unit, sourceType, name, eventName) {
    const entry = {
      id: this.triggerFeed.length + 1,
      round: this.round,
      uid: unit ? unit.battleId : '',
      owner: unit ? unit.name : '状态',
      type: sourceType,
      name,
      event: getTriggerLabel(eventName)
    };
    this.triggerFeed.unshift(entry);
    this.triggerFeed = this.triggerFeed.slice(0, 24);
    return entry;
  }

  recordVisual(event) {
    const entry = Object.assign({ id: ++this.visualSeq, round: this.round }, event);
    this.visualFeed.push(entry);
    if (this.visualFeed.length > 260) this.visualFeed.shift();
    return entry;
  }

  pullMods(unit) {
    const acc = {};
    const add = (mods, scale) => {
      if (!mods) return;
      const factor = scale == null ? 1 : scale;
      for (const key of Object.keys(mods)) {
        const num = Number(mods[key]);
        if (!Number.isFinite(num)) continue;
        acc[key] = (acc[key] || 0) + num * factor;
      }
    };
    add(unit.card.mods, 1);
    for (const slot of ['weapon', 'accessory']) {
      const gear = unit.equipment[slot];
      if (gear) add(gear.mods, 1);
    }
    if (unit.tempMods) add(unit.tempMods, 1);
    for (const rune of this.getSideOf(unit).runes) {
      if (rune.faction === 'any' || rune.faction === unit.card.faction) add(rune.mods, 1);
    }
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (!def || !def.mods) continue;
      add(def.mods, def.stackable ? inst.stacks : 1);
    }
    const side = this.getSideOf(unit);
    for (const ally of side.units) {
      if (!ally.alive || !ally.onField) continue;
      for (const skill of this.getUnitSkills(ally)) {
        if (skill.type === 'passive' && skill.aura) add(skill.aura, 1);
      }
    }
    const sideMod = this.externalModsForSide[unit.side];
    if (sideMod) add({ dmgFlat: sideMod.dmgFlat || 0, hpFlat: sideMod.hpFlat || 0, dmgPct: sideMod.dmgPct || 0, takenFlat: sideMod.takenFlat || 0 }, 1);
    return acc;
  }

  getMods(unit) {
    return this.pullMods(unit);
  }

  recalcUnit(unit) {
    const mods = this.getMods(unit);
    const oldMax = unit.maxHp;
    unit.atk = Math.max(0, (Number(unit.card.attack) || 0) + (mods.atkFlat || 0));
    unit.atk = Math.max(0, unit.atk * (1 + (mods.atkPct || 0) / 100));
    const sideMod = this.externalModsForSide[unit.side] || {};
    unit.maxHp = Math.max(1, (Number(unit.card.hp) || 1) + (mods.maxHpFlat || 0) + (sideMod.hpFlat || 0));
    if (Number(unit.card.maxHpCap) > 0) unit.maxHp = Math.min(unit.maxHp, Number(unit.card.maxHpCap));
    if (unit.maxHp < oldMax) unit.hp = Math.min(unit.hp, unit.maxHp);
    unit.hp = Math.max(0, Math.min(unit.hp, unit.maxHp));
    unit.resistance.current = this.getResistance(unit, unit.card.resistance.type);
    return mods;
  }

  recalcSide(sideId) {
    const side = this.sides[sideId];
    if (!side) return;
    for (const unit of side.units) {
      if (unit.alive) this.recalcUnit(unit);
    }
  }

  createBattleUnit(card) {
    this.uidSeq += 1;
    const unit = {
      battleId: 'U' + String(this.uidSeq).padStart(3, '0'),
      cardId: card.id,
      card,
      name: card.name,
      side: null,
      quality: card.quality,
      counted: card.counted !== false,
      alive: true,
      onField: true,
      pendingDefeat: false,
      hp: Number(card.hp) || 1,
      maxHp: Number(card.hp) || 1,
      atk: Number(card.attack) || 0,
      resistance: { type: card.resistance && card.resistance.type || 'general', value: Number(card.resistance && card.resistance.value) || 0, current: 0 },
      effects: [],
      counts: {},
      equipment: { weapon: null, accessory: null },
      tempMods: {},
      acted: false,
      actionStarted: false,
      extraActionUsed: false,
      enteredRound: this.round
    };
    return unit;
  }

  getUnitSkills(unit) {
    const ids = [];
    for (const id of unit.card.skills || []) ids.push(id);
    for (const slot of ['weapon', 'accessory']) {
      const gear = unit.equipment[slot];
      if (gear) for (const id of gear.grantedSkills || []) ids.push(id);
    }
    for (const rune of this.getSideOf(unit).runes) {
      if (rune.faction === 'any' || rune.faction === unit.card.faction) {
        for (const id of rune.grantedSkills || []) ids.push(id);
      }
    }
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (def) for (const id of def.grantedSkills || []) ids.push(id);
    }
    return [...new Set(ids)].map(id => this.maps.skills.get(id)).filter(Boolean);
  }

  getActiveSkills(unit) { return this.getUnitSkills(unit).filter(skill => skill.type === 'active'); }
  getExtraSkills(unit) { return this.getUnitSkills(unit).filter(skill => skill.type === 'extra'); }

  getSkillForUnit(unit, skillId) {
    return this.getUnitSkills(unit).find(skill => skill.id === skillId) || null;
  }

  getFieldUnits(sideId, options) {
    return this.sides[sideId].units.filter(unit => unit.alive && unit.onField && (!options || options.includePending || !unit.pendingDefeat));
  }

  getEnemies(unit) { return this.getFieldUnits(unit.side === 'A' ? 'B' : 'A'); }
  getLivingAllies(unit) { return this.getFieldUnits(unit.side); }

  countLabel(id) {
    return (this.content.countDefs && this.content.countDefs[id]) || id;
  }

  getCount(unit, scope, countId) {
    if (!countId) return 0;
    if (scope === 'global') return Number(this.globalCounts[countId]) || 0;
    if (scope === 'side') return Number(this.sides[unit.side].counts[countId]) || 0;
    return Number(unit.counts[countId]) || 0;
  }

  setCount(unit, scope, countId, value) {
    const next = Math.max(0, Number(value) || 0);
    if (scope === 'global') this.globalCounts[countId] = next;
    else if (scope === 'side') this.sides[unit.side].counts[countId] = next;
    else unit.counts[countId] = next;
  }

  getEffectStacks(unit, effectId) {
    const inst = unit.effects.find(item => item.effectId === effectId);
    return inst ? inst.stacks : 0;
  }

  getResistance(unit, damageType) {
    if (damageType === 'true') return 0;
    const res = unit.card.resistance || { type: 'general', value: 0 };
    let value = 0;
    if (res.type === 'general' || res.type === damageType) value += Number(res.value) || 0;
    const mods = this.getMods(unit);
    value += mods.resistFlat || 0;
    if (damageType === 'physical') value += mods.physicalResist || 0;
    if (damageType === 'mental') value += mods.mentalResist || 0;
    value *= 1 + (mods.resistPct || 0) / 100;
    return Math.max(0, Math.round(value));
  }

  resistanceSummary(unit) {
    return {
      physical: this.getResistance(unit, 'physical'),
      mental: this.getResistance(unit, 'mental')
    };
  }

  evalFormula(formula, ctx) {
    if (formula === undefined || formula === null || formula === '') return 0;
    if (typeof formula === 'number') return formula;
    if (typeof formula === 'string' && /^-?\d+(\.\d+)?%?$/.test(formula.trim())) {
      const raw = formula.trim();
      return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    }
    const resolver = (token) => {
      const source = ctx.source || ctx.unit;
      if (!source) return 0;
      if (token === '$atk') return source.atk;
      if (token === '$hp') return source.hp;
      if (token === '$hpMax') return source.maxHp;
      if (token === '$resist') return source.resistance.current || this.getResistance(source, source.card.resistance.type);
      if (token === '$lastHitCount') return ctx.lastHitCount || 0;
      if (token === '$multiplier') return ctx.multiplier == null ? 1 : ctx.multiplier;
      if (token === '$targetCount') return (ctx.chosen || []).length;
      if (token === '$round') return this.round;
      if (token.startsWith('$count.')) return this.getCount(source, 'unit', token.slice(7));
      if (token.startsWith('$sideCount.')) return this.getCount(source, 'side', token.slice(11));
      if (token.startsWith('$globalCount.')) return this.getCount(source, 'global', token.slice(13));
      if (token.startsWith('$effect.')) return this.getEffectStacks(source, token.slice(8));
      if (token.startsWith('$var.')) return (ctx.vars && ctx.vars[token.slice(5)]) || 0;
      if (token.startsWith('$event.')) {
        const key = token.slice(7);
        return (ctx.eventData && ctx.eventData[key]) || 0;
      }
      if (token === '$target.hp') return (ctx.chosen && ctx.chosen[0] && ctx.chosen[0].hp) || 0;
      if (token === '$target.hpMax') return (ctx.chosen && ctx.chosen[0] && ctx.chosen[0].maxHp) || 0;
      return 0;
    };
    try {
      const tokens = tokenizeFormula(formula);
      return new FormulaParser(tokens, resolver).parse();
    } catch (error) {
      this.log('system', '公式解析失败：' + formula + '（' + error.message + '）');
      return 0;
    }
  }

  getTargetsForStep(unit, step, ctx) {
    const targets = [];
    const add = (list) => {
      for (const item of list || []) {
        if (item && item.alive && item.onField && !targets.includes(item)) targets.push(item);
      }
    };
    const mode = step.target || 'chosen';
    if (mode === 'chosen') add(ctx.chosen && ctx.chosen.length ? ctx.chosen : []);
    else if (mode === 'self') add([unit]);
    else if (mode === 'eventTarget') {
      const eventTarget = ctx.eventData && (ctx.eventData.target || (ctx.eventData.targets && ctx.eventData.targets[0]));
      add(eventTarget ? [eventTarget] : []);
    }
    else if (mode === 'eventTargets') add(ctx.eventData && ctx.eventData.targets ? ctx.eventData.targets : []);
    else if (mode === 'allEnemies') add(this.getEnemies(unit));
    else if (mode === 'allAllies') add(this.getLivingAllies(unit));
    else if (mode === 'item') add(ctx.item ? [ctx.item] : []);
    else if (mode === 'owner') add([ctx.owner || unit]);
    return targets;
  }

  resolveChosenTargets(unit, skill, targetUid) {
    const mode = skill.targetMode || 'none';
    const enemies = this.getEnemies(unit);
    const allies = this.getLivingAllies(unit);
    if (mode === 'allEnemies') return enemies;
    if (mode === 'allAllies') return allies;
    if (mode === 'self') return [unit];
    if (mode === 'none') return [];
    if (mode === 'enemy') {
      const target = enemies.find(item => item.battleId === targetUid) || (enemies.length === 1 ? enemies[0] : null);
      return target ? [target] : [];
    }
    if (mode === 'ally') {
      const target = allies.find(item => item.battleId === targetUid) || (allies.length === 1 ? allies[0] : null);
      return target ? [target] : [];
    }
    return [];
  }

  requirementResult(unit, skill) {
    for (const req of skill.requirements || []) {
      const current = this.getCount(unit, req.scope || 'unit', req.countId);
      const value = Number(req.value) || 0;
      let passed = false;
      switch (req.op) {
        case 'gt': passed = current > value; break;
        case 'gte': passed = current >= value; break;
        case 'lt': passed = current < value; break;
        case 'lte': passed = current <= value; break;
        case 'eq': passed = current === value; break;
        case 'neq': passed = current !== value; break;
        default: passed = current >= value;
      }
      if (!passed) {
        return {
          ok: false,
          reason: '需要' + COUNT_SCOPES[req.scope || 'unit'].label + '「' + this.countLabel(req.countId) + '」' + (req.label ? req.label : '满足条件') + '（当前 ' + current + '）'
        };
      }
    }
    if (skill.trigger && skill.trigger.condition) {
      const val = this.evalFormula(skill.trigger.condition, { unit, source: unit, chosen: [] });
      if (!val) return { ok: false, reason: '释放条件未满足' };
    }
    return { ok: true, reason: '' };
  }

  getSkillState(unit, skill) {
    if (!unit || !unit.alive || unit.pendingDefeat) return { usable: false, reason: '单位已退场', targets: [] };
    if (!skill) return { usable: false, reason: '技能不存在', targets: [] };
    if (this.status !== 'active') return { usable: false, reason: '战斗已结束', targets: [] };
    if (unit.side !== this.currentSide) return { usable: false, reason: '只能在当前行动方使用', targets: [] };
    if (skill.type === 'passive') return { usable: false, reason: '被动技自动触发', targets: [] };
    if (skill.type === 'active' && (unit.acted || this.phase !== 'awaiting')) return { usable: false, reason: unit.acted ? '该单位本回合已行动' : '正在结算', targets: [] };
    if (skill.type === 'extra' && this.phase !== 'awaiting') return { usable: false, reason: '正在结算', targets: [] };
    const req = this.requirementResult(unit, skill);
    if (!req.ok) return { usable: false, reason: req.reason, targets: [] };
    const targets = this.resolveTargetPreview(unit, skill);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !targets.length) return { usable: false, reason: '没有合法目标', targets: [] };
    if (mode === 'allEnemies' && !this.getEnemies(unit).length) return { usable: false, reason: '没有敌方单位', targets: [] };
    return { usable: true, reason: '', targets };
  }

  resolveTargetPreview(unit, skill) {
    const mode = skill.targetMode || 'none';
    if (mode === 'enemy') return this.getEnemies(unit);
    if (mode === 'ally') return this.getLivingAllies(unit);
    if (mode === 'allEnemies') return this.getEnemies(unit);
    if (mode === 'allAllies') return this.getLivingAllies(unit);
    if (mode === 'self') return [unit];
    return [];
  }

  beginBatch() {
    this.batchDepth += 1;
  }

  endBatch() {
    if (this.batchDepth > 0) this.batchDepth -= 1;
    if (this.batchDepth > 0) return;
    let guard = 0;
    while (this.pendingDefeats.length && guard < ENGINE_LIMITS.pendingDefeats) {
      guard += 1;
      const target = this.pendingDefeats.shift();
      if (!target || !target.alive) continue;
      if (target.hp > 0) { target.pendingDefeat = false; continue; }
      target.pendingDefeat = false;
      this.removeUnit(target, 'defeat');
    }
    if (this.status !== 'active') return;
    for (const sideId of ['A', 'B']) {
      if (this.sides[sideId].controller === 'ai') this.emergencyDeploy(sideId);
    }
    this.checkOutcome();
  }

  markPendingDefeat(unit) {
    if (!unit.pendingDefeat) {
      unit.pendingDefeat = true;
      this.pendingDefeats.push(unit);
      this.log('defeat', unit.name + ' 的生命归零，退场判定将在本次操作结算时执行。', { side: unit.side });
    }
  }

  start() {
    this.started = true;
    this.phase = 'muster';
    this.beginBatch();
    for (const sideId of ['A', 'B']) {
      const side = this.sides[sideId];
      if (this.config.noDraw) {
        side.hand = side.deck.slice();
        side.deck = [];
      } else {
        this.drawCards(sideId, this.rules.initialDraw, true);
      }
      this.musterSide(sideId);
    }
    this.log('round', '第 1 回合开始。', {});
    this.triggerEvent('roundStart', { round: this.round });
    this.endBatch();
    this.currentSide = this.firstSide;
    this.phase = this.status === 'active' ? 'awaiting' : 'ended';
    this.ensureActionable();
    if (this.status === 'active') this.log('system', '当前行动方：' + this.sides[this.currentSide].name + '。');
  }

  drawCards(sideId, count, silent) {
    const side = this.sides[sideId];
    const amount = Math.max(0, Number(count) || 0);
    let drawn = 0;
    for (let i = 0; i < amount; i += 1) {
      if (!side.deck.length) break;
      side.hand.push(side.deck.shift());
      drawn += 1;
    }
    if (drawn && !silent) this.log('system', side.name + ' 抽了 ' + drawn + ' 张角色牌。', { side: sideId });
    return drawn;
  }

  deckUnitCard(unitId) {
    return this.maps.units.get(unitId) || null;
  }

  handUnits(sideId) {
    return this.sides[sideId].hand.map(id => this.maps.units.get(id)).filter(Boolean);
  }

  musterSide(sideId) {
    const side = this.sides[sideId];
    while (side.units.length < this.rules.maxField) {
      const candidates = this.handUnits(sideId);
      if (!candidates.length) break;
      candidates.sort((a, b) => {
        const qa = QUALITY_RANK[a.quality] || 0;
        const qb = QUALITY_RANK[b.quality] || 0;
        if (qa !== qb) return qb - qa;
        return (b.counted !== false ? 1 : 0) - (a.counted !== false ? 1 : 0);
      });
      const chosen = candidates[0];
      this.deployUnit(sideId, chosen.id, true);
    }
  }

  drawAndEnterRound() {
    if (this.rules.drawDuringBattle && this.round > 1 && this.rules.drawInterval > 0) {
      if ((this.round - 1) % this.rules.drawInterval === 0) {
        for (const sideId of ['A', 'B']) {
          const side = this.sides[sideId];
          if (!side.deck.length && !side.discard.length) continue;
          if (!side.deck.length && side.discard.length) {
            side.deck = shuffle(side.discard);
            side.discard = [];
          }
          this.drawCards(sideId, this.rules.drawCount, false);
        }
      }
    }
    for (const sideId of ['A', 'B']) {
      if (this.sides[sideId].controller === 'ai') this.musterSide(sideId);
    }
  }

  deployUnit(sideId, cardId, fromHand) {
    const card = this.deckUnitCard(cardId);
    if (!card) return null;
    const side = this.sides[sideId];
    if (side.units.length >= this.rules.maxField) return null;
    if (fromHand !== false) {
      const idx = side.hand.indexOf(cardId);
      if (idx < 0) return null;
      side.hand.splice(idx, 1);
    }
    const unit = this.createBattleUnit(card);
    unit.side = sideId;
    unit.resistance.current = card.resistance.value;
    side.units.push(unit);
    this.recalcUnit(unit);
    unit.hp = unit.maxHp;
    this.recalcSide(sideId);
    const starting = ((this.modifiers[sideId] && this.modifiers[sideId].startingEffects) || []).filter(item => !item.unitId || item.unitId === cardId);
    for (const item of starting) {
      if (this.maps.effects.has(item.effectId)) {
        this.addEffect(unit, item.effectId, Number(item.stacks) || 1, null, { silent: true });
      }
    }
    const gearNames = ['weapon', 'accessory'].map(slot => unit.equipment[slot]).filter(Boolean).map(item => item.name);
    this.log('entry', side.name + ' 入场「' + card.name + '」' + (gearNames.length ? '，装备' + gearNames.join('、') : '') + '。', { side: sideId });
    this.triggerEvent('enterField', { unit }, { ownerOnly: true });
    return unit;
  }

  returnEquipment(unit) {
    const side = this.getSideOf(unit);
    for (const slot of ['weapon', 'accessory']) {
      if (unit.equipment[slot]) {
        side.equipmentPool.push(unit.equipment[slot].id);
        unit.equipment[slot] = null;
      }
    }
  }

  emergencyDeploy(sideId) {
    const side = this.sides[sideId];
    let counted = side.units.filter(unit => unit.alive && unit.counted).length;
    if (counted > 0) return;
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      const cardIds = side.hand.filter(id => {
        const card = this.deckUnitCard(id);
        return card && card.counted !== false;
      });
      if (!cardIds.length) break;
      if (side.units.length >= this.rules.maxField) {
        const uncounted = side.units.filter(unit => unit.alive && !unit.counted && !unit.pendingDefeat);
        if (!uncounted.length) break;
        const recalled = uncounted[uncounted.length - 1];
        side.units = side.units.filter(unit => unit !== recalled);
        side.hand.push(recalled.cardId);
        this.returnEquipment(recalled);
        this.log('retreat', '紧急轮换：' + recalled.name + ' 退回手牌，为计数单位腾出席位。', { side: sideId });
        continue;
      }
      const chosen = this.deckUnitCard(cardIds[0]);
      this.log('system', side.name + ' 场上已无计数单位，紧急入场。', { side: sideId });
      const entered = this.deployUnit(sideId, chosen.id, true);
      if (entered && this.phase !== 'muster' && this.phase !== 'setup') {
        entered.acted = true;
        this.log('turn', entered.name + ' 为紧急替补，本回合不追加行动。', { side: sideId });
      }
      counted = side.units.filter(unit => unit.alive && unit.counted).length;
      if (counted > 0) break;
    }
    this.checkOutcome();
  }

  manualDeployCard(sideId, handIndex) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: '当前无法补牌。' };
    const side = this.sides[sideId];
    const index = Number(handIndex);
    if (!side || !Number.isInteger(index) || index < 0 || index >= side.hand.length) return { ok: false, error: '这张手牌已不在手牌区。' };
    if (side.units.length >= this.rules.maxField) return { ok: false, error: '场上已经达到单位上限。' };
    const cardId = side.hand[index];
    this.beginBatch();
    const unit = this.deployUnit(sideId, cardId, true);
    this.endBatch();
    if (!unit) return { ok: false, error: '补牌失败。' };
    this.log('entry', side.name + ' 手动补入「' + unit.name + '」。', { side: sideId });
    return { ok: true, unit };
  }

  equipFromPool(sideId, unitUid, equipmentId) {
    if (this.status !== 'active') return { ok: false, error: '战斗已结束。' };
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: '阵营不存在。' };
    const index = side.equipmentPool.indexOf(equipmentId);
    if (index < 0) return { ok: false, error: '装备已不在整备区。' };
    const unit = this.getUnit(unitUid);
    if (!unit || unit.side !== sideId || !unit.alive || !unit.onField) return { ok: false, error: '目标单位不在场。' };
    const gear = this.maps.equipment.get(equipmentId);
    if (!gear) return { ok: false, error: '装备不存在。' };
    if (unit.equipment[gear.slot]) return { ok: false, error: '该单位的' + (gear.slot === 'weapon' ? '武器' : '饰品') + '栏已被占用。' };
    side.equipmentPool.splice(index, 1);
    unit.equipment[gear.slot] = gear;
    this.recalcUnit(unit);
    this.log('effect', unit.name + ' 装备「' + gear.name + '」。此操作不占用行动。', { side: sideId });
    return { ok: true, unit, gear };
  }

  destroyEquipmentFromPool(sideId, equipmentId) {
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: '阵营不存在。' };
    const index = side.equipmentPool.indexOf(equipmentId);
    if (index < 0) return { ok: false, error: '装备已不在整备区。' };
    const gear = this.maps.equipment.get(equipmentId);
    side.equipmentPool.splice(index, 1);
    this.log('effect', side.name + ' 销毁了「' + (gear ? gear.name : equipmentId) + '」。', { side: sideId });
    return { ok: true };
  }

  setActiveRunes(sideId, runeIds) {
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: '阵营不存在。' };
    const allowed = new Set((side.runePool || []).map(rune => rune.id));
    const selected = [...new Set((runeIds || []).filter(id => allowed.has(id)))];
    if (selected.length > 3) return { ok: false, error: '每个阵营最多启用三张符文。' };
    side.runes = selected.map(id => this.maps.runes.get(id)).filter(Boolean);
    for (const unit of side.units) this.recalcUnit(unit);
    this.log('effect', side.name + ' 的符文配置更新为：' + (side.runes.map(rune => rune.name).join('、') || '无') + '。', { side: sideId });
    return { ok: true };
  }

  removeUnit(unit, reason) {
    if (!unit || !unit.alive) return;
    unit.alive = false;
    unit.onField = false;
    unit.pendingDefeat = false;
    const side = this.getSideOf(unit);
    side.units = side.units.filter(item => item !== unit);
    this.recalcSide(unit.side);
    this.log('defeat', unit.name + (reason === 'retreat' ? ' 强制退场。' : ' 被击败，退场。'), { side: unit.side });
    const equipmentSnapshot = { weapon: unit.equipment.weapon, accessory: unit.equipment.accessory };
    this.triggerDefeated(unit);
    this.returnEquipment(unit);
    if (this.rules.defeatedToDeck) {
      side.deck.push(unit.cardId);
      this.log('system', unit.name + ' 返回可抽牌堆。', { side: unit.side });
    } else {
      side.retreat.push(unit.cardId);
    }
    if (unit.effects) unit.effects = [];
  }

  triggerDefeated(unit) {
    if (this.triggerDepth >= ENGINE_LIMITS.triggerDepth) return;
    this.triggerDepth += 1;
    try {
      const skills = this.getUnitSkills(unit).filter(skill => skill.type === 'passive' && skill.trigger && skill.trigger.event === 'defeated');
      for (const skill of skills) {
        this.pushTrigger(unit, '技能', skill.name, 'defeated');
        this.log('passive', unit.name + ' 触发被击败被动「' + skill.name + '」。', { side: unit.side });
        const ctx = this.createContext(unit, skill, [], { eventData: { target: unit }, allowDeadSource: true });
        this.executeSteps(skill.steps || [], ctx);
      }
      for (const inst of (unit.effects || []).slice()) {
        const def = this.maps.effects.get(inst.effectId);
        if (!def || !def.trigger || def.trigger.event !== 'defeated') continue;
        this.pushTrigger(unit, '效果', def.name, 'defeated');
        const ctx = this.createContext(unit, null, [], { eventData: { target: unit }, allowDeadSource: true, effectId: def.id });
        this.executeSteps(def.steps || [], ctx);
      }
    } finally {
      this.triggerDepth -= 1;
    }
  }

  triggerEvent(eventName, eventData, options) {
    options = options || {};
    if (this.triggerDepth >= ENGINE_LIMITS.triggerDepth) {
      this.log('system', '触发链达到上限，停止继续响应。');
      return;
    }
    this.triggerDepth += 1;
    try {
      const candidates = [];
      const sideOrder = eventName === 'allyAttack' && eventData.attacker ? [eventData.attacker.side, eventData.attacker.side === 'A' ? 'B' : 'A'] : ['A', 'B'];
      for (const sideId of sideOrder) {
        const side = this.sides[sideId];
        for (const unit of side.units.slice()) {
          if (!unit.alive) continue;
          if (options.ownerOnly && eventData.unit && unit !== eventData.unit) continue;
          if (eventName === 'allyAttack' && unit.side !== eventData.attacker.side) continue;
          if (eventName === 'selfAttack' && eventData.attacker && unit !== eventData.attacker) continue;
          if (eventName === 'selfAttacked' && eventData.target && unit !== eventData.target) continue;
          if (eventName === 'actionStart' && eventData.unit && unit !== eventData.unit) continue;
          if (eventName === 'enterField' && eventData.unit && unit !== eventData.unit) continue;
          const skills = this.getUnitSkills(unit).filter(skill => skill.type === 'passive' && skill.trigger && skill.trigger.event === eventName);
          for (const skill of skills) {
            if (skill.trigger.condition) {
              const check = this.evalFormula(skill.trigger.condition, { unit, source: unit, chosen: eventData.targets || [], eventData, multiplier: (skill.multiplier || 100) / 100 });
              if (!check) continue;
            }
            const req = this.requirementResult(unit, skill);
            if (!req.ok) continue;
            candidates.push({ kind: 'skill', unit, skill });
          }
          for (const inst of unit.effects.slice()) {
            const def = this.maps.effects.get(inst.effectId);
            if (!def || !def.trigger || def.trigger.event !== eventName) continue;
            if (def.trigger.condition && !this.evalFormula(def.trigger.condition, { unit, source: unit, chosen: eventData.targets || [], eventData })) continue;
            candidates.push({ kind: 'effect', unit, def });
          }
        }
      }
      for (const candidate of candidates) {
        if (!candidate.unit.alive) continue;
        if (candidate.kind === 'skill') {
          const skill = candidate.skill;
          this.pushTrigger(candidate.unit, '技能', skill.name, eventName);
          this.log('passive', candidate.unit.name + ' 触发被动「' + skill.name + '」。', { side: candidate.unit.side });
          const ctx = this.createContext(candidate.unit, skill, eventData.targets || [], { eventData, eventName });
          this.executeSteps(skill.steps || [], ctx);
        } else {
          const def = candidate.def;
          this.pushTrigger(candidate.unit, '效果', def.name, eventName);
          this.log('trigger', candidate.unit.name + ' 的效果「' + def.name + '」触发。', { side: candidate.unit.side });
          const ctx = this.createContext(candidate.unit, null, eventData.targets || [], { eventData, eventName, effectId: def.id });
          this.executeSteps(def.steps || [], ctx);
        }
        if (this.status !== 'active') break;
      }
    } finally {
      this.triggerDepth -= 1;
    }
  }

  createContext(unit, skill, chosen, extra) {
    extra = extra || {};
    return Object.assign({
      unit,
      source: unit,
      skill: skill || null,
      multiplier: skill ? (Number(skill.multiplier) || 100) / 100 : 1,
      chosen: chosen || [],
      vars: {},
      damageByTarget: {},
      lastHitTargets: [],
      lastHitCount: 0,
      eventData: extra.eventData || {},
      eventName: extra.eventName || '',
      effectId: extra.effectId || '',
      allowDeadSource: !!extra.allowDeadSource,
      fatalGuard: false,
      immune: false,
      stepsDepth: 0
    }, extra);
  }

  executeSkill(unit, skill, chosen, options) {
    options = options || {};
    if (!unit || !skill) return null;
    if (!unit.alive && !options.allowDeadSource) return null;
    this.log('skill', unit.name + ' 释放「' + skill.name + '」。', { side: unit.side });
    this.lastSkill = { unitId: unit.battleId, skillId: skill.id };
    const ctx = this.createContext(unit, skill, chosen, options);
    if ((skill.type === 'active' || skill.type === 'extra') && skill.op === 'support') {
      const supportTargets = (chosen || []).filter(item => item && item.side === unit.side);
      const visualTargets = supportTargets.length ? supportTargets : [unit];
      for (const target of visualTargets) {
        this.recordVisual({
          kind: 'support',
          sourceUid: unit.battleId,
          sourceName: unit.name,
          targetUid: target.battleId,
          targetName: target.name,
          self: target === unit
        });
      }
    }
    this.executeSteps(skill.steps || [], ctx);
    if (options.applyActionEffects) this.applyActionDamageRiders(unit, ctx);
    if (options.countAsAttack && skill.op === 'attack' && this.status === 'active') {
      const targets = ctx.lastHitTargets.length ? ctx.lastHitTargets : chosen;
      const livingTargets = targets.filter(item => item && item.onField);
      if (livingTargets.length) {
        this.triggerEvent('selfAttack', { attacker: unit, targets: livingTargets.slice() });
        this.triggerEvent('allyAttack', { attacker: unit, targets: livingTargets.slice() });
      }
    }
    return ctx;
  }

  applyActionDamageRiders(unit, ctx) {
    const riders = [];
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (def && def.damageRider) riders.push(def);
    }
    if (!riders.length) return;
    for (const def of riders) {
      const rider = def.damageRider;
      for (const [targetUid, total] of Object.entries(ctx.damageByTarget || {})) {
        if (!(total > 0)) continue;
        const target = this.getUnit(targetUid);
        if (!target || !target.alive || !target.onField) continue;
        if (!unit.alive) continue;
        const raw = total * (Number(rider.ratio) || 0.5);
        const extra = (rider.rounding === 'floor') ? Math.floor(raw) : Math.ceil(raw);
        if (extra <= 0) continue;
        this.pushTrigger(unit, '效果', def.name, 'action');
        this.log('trigger', unit.name + ' 的效果「' + def.name + '」对 ' + target.name + ' 追加 ' + extra + ' 点真实伤害。', { side: unit.side });
        this.dealDamage(unit, target, extra, rider.damageType || 'true', {
          isAttack: false,
          ignoreResistance: true,
          rider: true
        });
      }
    }
  }

  executeSteps(steps, ctx) {
    if (!Array.isArray(steps)) return ctx;
    if (ctx.stepsDepth >= ENGINE_LIMITS.stepDepth) {
      this.log('system', '步骤嵌套达到上限，停止执行。');
      return ctx;
    }
    ctx.stepsDepth += 1;
    try {
      for (const step of steps) {
        if (!step || !step.kind) continue;
        if (this.status !== 'active') break;
        this.executeStep(step, ctx);
      }
    } finally {
      ctx.stepsDepth -= 1;
    }
    return ctx;
  }

  executeStep(step, ctx) {
    try {
      switch (step.kind) {
        case 'damage': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          let hit = 0;
          const hitTargets = [];
          const isBonus = !!step.bonus;
          const formulaValue = this.evalFormula(step.formula, ctx);
          for (const target of targets) {
            if (!target.alive || !target.onField) continue;
            const result = this.dealDamage(ctx.unit, target, formulaValue, step.damageType || 'physical', {
              ignoreResistance: !!step.ignoreResistance || isBonus,
              isAttack: !isBonus && !!(ctx.skill && ctx.skill.op === 'attack' && (ctx.skill.type === 'active' || ctx.skill.type === 'extra')),
              bonus: isBonus,
              isBurn: !!step.burn
            });
            if (result.hit) {
              hit += 1;
              hitTargets.push(target);
              if (result.amount > 0) {
                ctx.damageByTarget[target.battleId] = (ctx.damageByTarget[target.battleId] || 0) + result.amount;
              }
            }
          }
          if (!isBonus) {
            ctx.lastHitCount = hit;
            if (hit) ctx.lastHitTargets = hitTargets;
          } else if (!ctx.lastHitTargets.length) {
            ctx.lastHitCount = hit;
            ctx.lastHitTargets = hitTargets;
          }
          break;
        }
        case 'heal': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const amount = this.evalFormula(step.formula, ctx);
          for (const target of targets) this.healUnit(ctx.unit, target, amount);
          break;
        }
        case 'addEffect': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const stacks = Math.max(0, Math.round(this.evalFormula(step.stacks || '1', ctx)));
          for (const target of targets) {
            if (stacks <= 0) continue;
            this.addEffect(target, step.effectId, stacks, ctx.unit);
          }
          break;
        }
        case 'removeEffect': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const amount = Math.max(0, Math.round(this.evalFormula(step.stacks || '9999', ctx)));
          for (const target of targets) {
            if (step.effectId) this.removeEffect(target, step.effectId, amount, step.force);
            else {
              for (const inst of target.effects.slice()) {
                const def = this.maps.effects.get(inst.effectId);
                if (def && (def.removable !== false || step.force)) this.removeEffect(target, inst.effectId, amount, step.force);
              }
            }
          }
          break;
        }
        case 'modifyCount': {
          const current = this.getCount(ctx.unit, step.scope || 'unit', step.countId);
          const value = this.evalFormula(step.formula || '0', ctx);
          const next = step.mode === 'set' ? value : current + value;
          const before = current;
          this.setCount(ctx.unit, step.scope || 'unit', step.countId, next);
          this.log('count', ctx.unit.name + ' 的「' + this.countLabel(step.countId) + '」从 ' + before + ' 变为 ' + Math.max(0, next) + '。', { side: ctx.unit.side });
          break;
        }
        case 'readCount': {
          const value = this.getCount(ctx.unit, step.scope || 'unit', step.countId);
          if (!ctx.vars) ctx.vars = {};
          ctx.vars[step.varName || 'value'] = value;
          this.log('count', ctx.unit.name + ' 读取「' + this.countLabel(step.countId) + '」= ' + value + '，写入临时变量 ' + (step.varName || 'value') + '。', { side: ctx.unit.side });
          break;
        }
        case 'branch': {
          const left = this.evalFormula(step.left || '0', ctx);
          const right = this.evalFormula(step.right || '0', ctx);
          const op = step.op || 'gte';
          const passed = op === 'gt' ? left > right : op === 'lt' ? left < right : op === 'lte' ? left <= right : op === 'eq' ? left === right : op === 'neq' ? left !== right : left >= right;
          this.executeSteps(passed ? step.then : step.elseSteps, ctx);
          break;
        }
        case 'selectTarget': {
          const mode = step.mode || 'allEnemies';
          const selected = this.getTargetsForStep(ctx.unit, { target: mode }, ctx);
          ctx.chosen = selected;
          if (step.varName) ctx.vars[step.varName] = selected.length;
          break;
        }
        case 'forEach': {
          const source = step.source || 'chosen';
          const list = this.getTargetsForStep(ctx.unit, { target: source }, ctx);
          let guard = 0;
          for (const item of list) {
            if (guard >= ENGINE_LIMITS.loopIterations) break;
            guard += 1;
            const child = Object.assign({}, ctx, { item, chosen: [item], vars: Object.assign({}, ctx.vars) });
            this.executeSteps(step.steps || [], child);
          }
          break;
        }
        case 'loop': {
          const times = Math.max(0, Math.min(ENGINE_LIMITS.loopIterations, Math.round(this.evalFormula(step.times || '1', ctx))));
          for (let i = 0; i < times; i += 1) this.executeSteps(step.steps || [], ctx);
          break;
        }
        case 'castSkill': {
          const skill = this.maps.skills.get(step.skillId);
          if (!skill) { this.log('system', '释放技能失败：技能 ID 不存在。'); break; }
          const targetMode = skill.targetMode || 'none';
          let chosen = [];
          if (targetMode === 'self') chosen = [ctx.unit];
          else if (targetMode === 'allEnemies') chosen = this.getEnemies(ctx.unit);
          else if (targetMode === 'allAllies') chosen = this.getLivingAllies(ctx.unit);
          else chosen = this.getTargetsForStep(ctx.unit, { target: step.target || 'chosen' }, ctx);
          this.executeSkill(ctx.unit, skill, chosen, { allowDeadSource: true });
          break;
        }
        case 'skipAction': {
          const targets = this.getTargetsForStep(ctx.unit, { target: step.target || 'self' }, ctx);
          for (const target of targets) {
            target.acted = true;
            this.log('effect', target.name + ' 被跳过本回合行动。', { side: target.side });
          }
          break;
        }
        case 'immuneDamage': {
          if (ctx.fatalGuard) { ctx.immune = true; this.log('effect', ctx.unit.name + ' 免疫了此次伤害。', { side: ctx.unit.side }); }
          else this.log('system', '免疫步骤仅在致命伤害或受伤触发中生效。');
          break;
        }
        case 'forceRetreat': {
          const targets = this.getTargetsForStep(ctx.unit, { target: step.target || 'self' }, ctx);
          for (const target of targets) {
            if (!target.alive) continue;
            const guards = this.getFatalGuardCandidates(target);
            for (const guard of guards) {
              this.runFatalGuard(guard, target, ctx.unit, { retreat: true });
            }
            if (target.alive) this.removeUnit(target, 'retreat');
          }
          break;
        }
        case 'summon': {
          const amount = Math.max(0, Math.min(ENGINE_LIMITS.summonCount, Math.round(this.evalFormula(step.count || '1', ctx))));
          const sideId = ctx.unit.side;
          for (let i = 0; i < amount; i += 1) {
            if (this.sides[sideId].units.length >= this.rules.maxField) {
              this.log('summon', '场地已满，召唤「' + ((this.maps.units.get(step.unitId) || {}).name || step.unitId) + '」被推迟。', { side: sideId });
              break;
            }
            const summoned = this.deploySummon(sideId, step.unitId);
            if (!summoned) break;
          }
          break;
        }
        case 'modifyStat': {
          const targets = this.getTargetsForStep(ctx.unit, { target: step.target || 'self' }, ctx);
          const amount = this.evalFormula(step.formula || '0', ctx);
          const stat = step.stat || 'atkFlat';
          for (const target of targets) {
            target.tempMods[stat] = (target.tempMods[stat] || 0) + amount;
            this.recalcUnit(target);
            this.log('effect', target.name + ' 的属性修正 ' + (STAT_KEYS[stat] || stat) + ' 变为 ' + target.tempMods[stat] + '。', { side: target.side });
          }
          break;
        }
        case 'setVar': {
          if (!ctx.vars) ctx.vars = {};
          const value = this.evalFormula(step.formula || '0', ctx);
          ctx.vars[step.varName || 'value'] = value;
          this.log('system', '临时变量 ' + (step.varName || 'value') + ' = ' + value + '。', { side: ctx.unit.side });
          break;
        }
        default:
          this.log('system', '未知步骤：' + step.kind);
      }
    } catch (error) {
      this.log('system', '步骤执行失败（' + step.kind + '）：' + error.message);
      console.error(error);
    }
  }

  deploySummon(sideId, unitId) {
    const card = this.maps.units.get(unitId);
    if (!card) { this.log('summon', '召唤失败：单位 ID 不存在。'); return null; }
    const side = this.sides[sideId];
    if (side.units.length >= this.rules.maxField) return null;
    const unit = this.createBattleUnit(card);
    unit.side = sideId;
    side.units.push(unit);
    this.recalcUnit(unit);
    unit.hp = unit.maxHp;
    this.recalcSide(sideId);
    unit.acted = true;
    this.log('summon', side.name + ' 召唤「' + card.name + '」。', { side: sideId });
    this.triggerEvent('enterField', { unit }, { ownerOnly: true });
    return unit;
  }

  getFatalGuardCandidates(unit) {
    const candidates = [];
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (def && def.trigger && def.trigger.event === 'fatalDamage') candidates.push({ kind: 'effect', def });
    }
    for (const skill of this.getUnitSkills(unit)) {
      if (skill.type === 'passive' && skill.trigger && skill.trigger.event === 'fatalDamage') candidates.push({ kind: 'skill', skill });
    }
    return candidates;
  }

  runFatalGuard(candidate, unit, source, options) {
    options = options || {};
    if (!unit.alive) return false;
    if (candidate.kind === 'skill') {
      this.pushTrigger(unit, '技能', candidate.skill.name, 'fatalDamage');
      this.log('passive', unit.name + ' 触发致命伤害被动「' + candidate.skill.name + '」。', { side: unit.side });
      const ctx = this.createContext(unit, candidate.skill, [unit], { eventData: { target: unit, source }, fatalGuard: true, eventName: 'fatalDamage' });
      ctx.fatalGuard = true;
      this.executeSteps(candidate.skill.steps || [], ctx);
      return !!ctx.immune;
    }
    this.pushTrigger(unit, '效果', candidate.def.name, 'fatalDamage');
    this.log('trigger', unit.name + ' 的效果「' + candidate.def.name + '」对致命伤害作出响应。', { side: unit.side });
    const ctx = this.createContext(unit, null, [unit], { eventData: { target: unit, source }, effectId: candidate.def.id, fatalGuard: true, eventName: 'fatalDamage' });
    ctx.fatalGuard = true;
    this.executeSteps(candidate.def.steps || [], ctx);
    return !!ctx.immune;
  }

  dealDamage(source, target, baseAmount, damageType, options) {
    options = options || {};
    if (!target || !target.alive || !target.onField) return { hit: false, amount: 0 };
    const type = DAMAGE_TYPES[damageType] ? damageType : 'physical';
    const isBonus = !!options.bonus;
    const isAttack = !!options.isAttack && !isBonus;
    const base = Math.max(0, Number(baseAmount) || 0);
    const beforeHp = target.hp;
    let finalAmount = 0;
    let resistance = 0;
    let mods = {};
    if (isBonus) {
      finalAmount = Math.max(0, Math.round(base));
    } else {
      mods = this.getMods(source);
      const outgoing1 = base * (1 + (mods.dmgPct || 0) / 100) + (mods.dmgFlat || 0);
      const outgoing2 = outgoing1 * (1 + (mods.finalDmgPct || 0) / 100) + (mods.finalDmgFlat || 0);
      resistance = options.ignoreResistance || type === 'true' ? 0 : this.getResistance(target, type);
      const targetMods = this.getMods(target);
      const takenScale = 1 - (targetMods.takenPct || 0) / 100;
      finalAmount = Math.max(0, Math.round(outgoing2 * takenScale - (targetMods.takenFlat || 0) - resistance));
    }
    let immune = false;
    if (finalAmount >= target.hp && finalAmount > 0 && !target.pendingDefeat) {
      const candidates = this.getFatalGuardCandidates(target);
      for (const candidate of candidates) {
        immune = this.runFatalGuard(candidate, target, source) || immune;
        if (immune) break;
      }
      if (immune) {
        this.log('damage', target.name + ' 免疫了致命伤害。', { side: target.side });
        return { hit: true, amount: 0, beforeHp, afterHp: target.hp, immune: true };
      }
    }
    target.hp = Math.max(0, target.hp - finalAmount);
    this.damageSeq += 1;
    const visual = {
      kind: 'damage',
      uid: target.battleId,
      targetUid: target.battleId,
      targetName: target.name,
      sourceUid: source ? source.battleId : '',
      sourceName: source ? source.name : '状态',
      amount: finalAmount,
      type,
      damageType: type,
      isAttack,
      bonus: isBonus,
      burn: !!options.isBurn || (!isAttack && !isBonus && !options.rider),
      rider: !!options.rider,
      sourceSide: source ? source.side : null,
      targetSide: target.side,
      round: this.round
    };
    this.damageFeed.unshift(Object.assign({ id: this.damageSeq, round: this.round }, visual));
    this.damageFeed = this.damageFeed.slice(0, 16);
    this.recordVisual(visual);
    if (isBonus) {
      this.log('damage', target.name + ' 受到 ' + finalAmount + ' 点附加' + DAMAGE_TYPES[type].label + '伤害（' + beforeHp + ' → ' + target.hp + '）。附加伤害不受增益、减伤与抗性影响，也不视作独立攻击。', { side: target.side });
      if (this.rules.showFormula !== false) {
        this.log('formula', '附加伤害结算：基础 ' + base + '，忽略全部伤害增益、减伤与抗性，实际 ' + finalAmount + '。', { side: target.side });
      }
    } else {
      this.log('damage', target.name + ' 受到 ' + finalAmount + ' 点' + DAMAGE_TYPES[type].label + '伤害（' + beforeHp + ' → ' + target.hp + '）。', { side: target.side });
      if (this.rules.showFormula !== false) {
        const modsText = [];
        if (mods.dmgFlat) modsText.push('伤害提升值 ' + mods.dmgFlat);
        if (mods.dmgPct) modsText.push('伤害提升 ' + mods.dmgPct + '%');
        if (mods.finalDmgPct) modsText.push('最终伤害 ' + mods.finalDmgPct + '%');
        if (resistance) modsText.push('抗性 -' + resistance);
        this.log('formula', '伤害结算：基础 ' + base + '，修正 ' + (modsText.length ? modsText.join('，') : '无') + '，实际 ' + finalAmount + '。', { side: target.side });
      }
    }
    if (target.alive && !target.pendingDefeat && isAttack) {
      this.triggerEvent('selfAttacked', { target, source, damage: finalAmount, isAttack: true, targets: [source].filter(Boolean) });
    }
    if (target.hp <= 0) this.markPendingDefeat(target);
    return { hit: true, amount: finalAmount, beforeHp, afterHp: target.hp, bonus: isBonus };
  }

  healUnit(source, target, baseAmount) {
    if (!target || !target.alive) return 0;
    const mods = source ? this.getMods(source) : {};
    let amount = Math.max(0, Number(baseAmount) || 0);
    amount = Math.max(0, Math.round(amount * (1 + (mods.healPct || 0) / 100) + (mods.healFlat || 0)));
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (target.pendingDefeat && target.hp > 0) {
      target.pendingDefeat = false;
      this.pendingDefeats = this.pendingDefeats.filter(item => item !== target);
    }
    this.log('heal', target.name + ' 回复 ' + healed + ' 点生命（' + before + ' → ' + target.hp + '）。', { side: target.side });
    if (healed > 0) {
      this.recordVisual({
        kind: 'heal',
        sourceUid: source ? source.battleId : null,
        sourceName: source ? source.name : '回复',
        targetUid: target.battleId,
        targetName: target.name,
        amount: healed,
        self: !!source && source === target
      });
    }
    return healed;
  }

  addEffect(target, effectId, stacks, sourceUnit, options) {
    options = options || {};
    const def = this.maps.effects.get(effectId);
    if (!def || !target || !target.alive) return null;
    const amount = Math.max(1, Number(stacks) || 1);
    let inst = target.effects.find(item => item.effectId === effectId);
    if (inst) {
      if (!def.stackable) {
        this.log('effect', target.name + ' 已持有「' + def.name + '」。', { side: target.side });
        return inst;
      }
      inst.stacks = Math.min(def.stackMax || 99, inst.stacks + amount);
    } else {
      inst = { effectId, stacks: Math.min(def.stackMax || 99, amount), sourceUid: sourceUnit ? sourceUnit.battleId : null, appliedRound: this.round };
      target.effects.push(inst);
    }
    this.recalcUnit(target);
    if (!options.silent) this.log('effect', target.name + ' 获得效果「' + def.name + '」' + (def.stackable ? ' ×' + inst.stacks : '') + '。', { side: target.side });
    return inst;
  }

  removeEffect(target, effectId, amount, force) {
    const def = this.maps.effects.get(effectId);
    if (!def || !target) return false;
    if (def.removable === false && !force) {
      this.log('effect', '「' + def.name + '」不可解除。', { side: target.side });
      return false;
    }
    const inst = target.effects.find(item => item.effectId === effectId);
    if (!inst) return false;
    inst.stacks -= Math.max(0, Number(amount) || 0);
    if (inst.stacks <= 0) {
      target.effects = target.effects.filter(item => item !== inst);
      this.log('effect', target.name + ' 的效果「' + def.name + '」被移除。', { side: target.side });
    } else {
      this.log('effect', target.name + ' 的效果「' + def.name + '」降为 ' + inst.stacks + ' 层。', { side: target.side });
    }
    this.recalcUnit(target);
    return true;
  }

  prepareUnit(unitId) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: '当前无法选择行动单位。' };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: '单位不存在。' };
    if (unit.side !== this.currentSide) return { ok: false, error: '不是当前行动方。' };
    if (unit.acted) return { ok: false, error: '该单位本回合已行动。' };
    if (unit.pendingDefeat || !unit.alive) return { ok: false, error: '单位已退场。' };
    if (!unit.actionStarted) {
      unit.actionStarted = true;
      this.actionStartedFor = unit.battleId;
      this.log('turn', unit.name + ' 进入行动。', { side: unit.side });
      this.beginBatch();
      this.triggerEvent('actionStart', { unit }, { ownerOnly: true });
      this.endBatch();
    }
    if (unit.acted || !unit.alive) {
      this.phase = 'awaiting';
      if (this.status === 'active') {
        this.advanceTurn();
      }
      return { ok: true, skipped: true, unit };
    }
    return { ok: true, unit };
  }

  useSkill(unitId, skillId, targetUid) {
    if (this.status !== 'active') return { ok: false, error: '战斗已结束。' };
    if (this.phase !== 'awaiting') return { ok: false, error: '正在结算，请稍候。' };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: '单位不存在。' };
    if (unit.side !== this.currentSide) return { ok: false, error: '不是当前行动单位。' };
    if (unit.acted) return { ok: false, error: '该单位本回合已行动。' };
    const skill = this.getSkillForUnit(unit, skillId);
    if (!skill) return { ok: false, error: '该单位没有此技能。' };
    if (skill.type !== 'active') return { ok: false, error: '这个技能不是主动技。' };
    const state = this.getSkillState(unit, skill);
    if (!state.usable) return { ok: false, error: state.reason };
    const chosen = this.resolveChosenTargets(unit, skill, targetUid);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !chosen.length) return { ok: false, error: '请选择一个合法目标。' };
    if ((mode === 'allEnemies') && !chosen.length) return { ok: false, error: '没有可攻击的敌方单位。' };
    if (!unit.alive || unit.acted) return { ok: false, error: '单位状态已变化。' };
    unit.acted = true;
    this.phase = 'resolving';
    this.turnSerial += 1;
    this.beginBatch();
    this.executeSkill(unit, skill, chosen, { countAsAttack: true, allowDeadSource: false, applyActionEffects: true });
    this.endBatch();
    this.phase = this.status === 'active' ? 'awaiting' : 'ended';
    if (this.status === 'active') this.advanceTurn();
    return { ok: true };
  }

  useExtraSkill(unitId, skillId, targetUid) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: '当前无法释放附加技。' };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: '单位不存在。' };
    const skill = this.getSkillForUnit(unit, skillId);
    if (!skill || skill.type !== 'extra') return { ok: false, error: '该单位没有此附加技。' };
    const state = this.getSkillState(unit, skill);
    if (!state.usable) return { ok: false, error: state.reason };
    const chosen = this.resolveChosenTargets(unit, skill, targetUid);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !chosen.length) return { ok: false, error: '请选择一个合法目标。' };
    this.phase = 'resolving';
    this.beginBatch();
    this.log('extra', unit.name + ' 释放附加技「' + skill.name + '」，不占用行动。', { side: unit.side });
    this.executeSkill(unit, skill, chosen, { countAsAttack: true, applyActionEffects: true });
    this.endBatch();
    this.phase = this.status === 'active' ? 'awaiting' : 'ended';
    if (this.status === 'active') this.ensureActionable();
    return { ok: true };
  }

  passAction(unitId) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: '当前无法待机。' };
    const unit = this.getUnit(unitId);
    if (!unit || unit.side !== this.currentSide || unit.acted) return { ok: false, error: '无法令该单位待机。' };
    if (!unit.actionStarted) {
      const prep = this.prepareUnit(unitId);
      if (!prep.ok) return prep;
      if (prep.skipped) return { ok: true };
    }
    unit.acted = true;
    this.log('turn', unit.name + ' 选择待机。', { side: unit.side });
    this.phase = 'awaiting';
    this.advanceTurn();
    return { ok: true };
  }

  advanceTurn() {
    if (this.status !== 'active') return;
    this.checkOutcome();
    if (this.status !== 'active') return;
    const sideId = this.currentSide;
    const otherId = sideId === 'A' ? 'B' : 'A';
    if (this.hasUnacted(otherId)) {
      this.currentSide = otherId;
    } else if (this.hasUnacted(sideId)) {
      this.currentSide = sideId;
    } else {
      this.endRound();
      return;
    }
    this.actionStartedFor = null;
    this.phase = 'awaiting';
    this.ensureActionable();
  }

  ensureActionable() {
    if (this.status !== 'active') return;
    let guard = 0;
    while (this.status === 'active' && guard < 8) {
      guard += 1;
      if (this.currentSide && this.hasUnacted(this.currentSide)) return;
      const other = this.currentSide === 'A' ? 'B' : 'A';
      if (this.hasUnacted(other)) { this.currentSide = other; continue; }
      this.endRound();
      return;
    }
    if (guard >= 8) this.log('system', '行动调度达到上限，等待手动继续。');
  }

  hasUnacted(sideId) {
    const side = this.sides[sideId];
    return side && side.units.some(unit => unit.alive && !unit.acted && !unit.pendingDefeat);
  }

  grantExtraActionsForRound() {
    const candidates = [];
    for (const sideId of ['A', 'B']) {
      for (const unit of this.sides[sideId].units) {
        if (!unit.alive || unit.extraActionUsed) continue;
        const eligible = unit.effects.some(inst => {
          const def = this.maps.effects.get(inst.effectId);
          return def && def.extraActionAtRoundEnd;
        });
        if (eligible) candidates.push(unit);
      }
    }
    if (!candidates.length) return false;
    for (const unit of candidates) {
      unit.acted = false;
      unit.actionStarted = false;
      unit.extraActionUsed = true;
      this.log('turn', '结束阶段：' + unit.name + ' 获得一次额外行动。', { side: unit.side });
      this.pushTrigger(unit, '效果', '额外行动', 'roundEnd');
    }
    const preferred = candidates.find(unit => unit.side === this.currentSide) || candidates[0];
    this.currentSide = preferred.side;
    this.phase = 'awaiting';
    this.actionStartedFor = null;
    this.ensureActionable();
    return true;
  }

  endRound() {
    if (this.endingRound || this.status !== 'active') return;
    if (this.grantExtraActionsForRound()) return;
    this.endingRound = true;
    this.phase = 'roundEnd';
    this.beginBatch();
    this.log('round', '第 ' + this.round + ' 回合结束，结算回合结束触发。', {});
    this.triggerEvent('roundEnd', { round: this.round });
    this.endBatch();
    if (this.status === 'active') {
      this.round += 1;
      for (const sideId of ['A', 'B']) {
        for (const unit of this.sides[sideId].units) {
          unit.acted = false;
          unit.actionStarted = false;
          unit.extraActionUsed = false;
        }
      }
      this.actionStartedFor = null;
      this.phase = 'muster';
      this.log('round', '第 ' + this.round + ' 回合开始。', {});
      this.beginBatch();
      this.drawAndEnterRound();
      this.triggerEvent('roundStart', { round: this.round });
      this.endBatch();
      if (this.status === 'active') {
        this.currentSide = this.firstSide;
        const otherSide = this.firstSide === 'A' ? 'B' : 'A';
        if (!this.hasUnacted(this.currentSide) && this.hasUnacted(otherSide)) this.currentSide = otherSide;
        this.phase = 'awaiting';
      }
    }
    this.endingRound = false;
    if (this.status === 'active') {
      this.log('system', '当前行动方：' + this.sides[this.currentSide].name + '。');
    }
  }

  checkOutcome() {
    if (this.status !== 'active' || !this.started) return;
    for (const sideId of ['A', 'B']) {
      const side = this.sides[sideId];
      const counted = side.units.filter(unit => unit.alive && unit.counted && !unit.pendingDefeat).length;
      if (counted > 0) continue;
      const handCounted = side.hand.some(id => {
        const card = this.deckUnitCard(id);
        return card && card.counted !== false;
      });
      if (handCounted) continue;
      const winnerSide = sideId === 'A' ? 'B' : 'A';
      this.finish(winnerSide, side.name + '场上已无计数单位，且没有可紧急入场的计数角色。');
      return;
    }
  }

  finish(winnerSide, reason) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.phase = 'ended';
    this.winner = winnerSide;
    this.endedAt = Date.now();
    const name = winnerSide ? this.sides[winnerSide].name : '平局';
    this.log('victory', '战斗结束：' + name + '胜利。' + (reason ? ' ' + reason : ''), { side: winnerSide });
    if (typeof this.finishCallback === 'function') {
      try { this.finishCallback({ winner: winnerSide, reason, round: this.round }); }
      catch (error) { console.error(error); }
    }
  }

  surrenderSide(sideId) {
    if (this.status !== 'active') return;
    const winner = sideId === 'A' ? 'B' : 'A';
    this.finish(winner, this.sides[sideId].name + '主动投降。');
  }

  aiPlan() {
    if (this.status !== 'active' || this.phase !== 'awaiting') return null;
    const sideId = this.currentSide;
    const units = this.sides[sideId].units.filter(unit => unit.alive && !unit.acted && !unit.pendingDefeat);
    if (!units.length) return null;
    const ordered = units.slice().sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0));
    for (const unit of ordered) {
      const skills = this.getActiveSkills(unit).filter(skill => {
        const state = this.getSkillState(unit, skill);
        return state.usable;
      });
      if (!skills.length) continue;
      const preferred = skills.slice().sort((a, b) => {
        const score = (skill) => {
          let total = 0;
          if (skill.op === 'attack') total += 20;
          if (skill.op === 'heal') total += 12;
          if (skill.op === 'debuff') total += 10;
          if (skill.op === 'support') total += 8;
          if (skill.op === 'special') total += 6;
          total += (skill.multiplier || 100) / 100;
          return total;
        };
        return score(b) - score(a);
      })[0];
      const targetMode = preferred.targetMode || 'none';
      let target = null;
      if (targetMode === 'enemy') {
        const enemies = this.getEnemies(unit);
        enemies.sort((a, b) => {
          const countedDelta = (b.counted ? 1 : 0) - (a.counted ? 1 : 0);
          if (countedDelta) return countedDelta;
          return a.hp - b.hp;
        });
        target = enemies[0] || null;
      } else if (targetMode === 'ally') {
        const allies = this.getLivingAllies(unit).filter(item => item !== unit);
        allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        target = allies[0] || unit;
      }
      return { unitId: unit.battleId, skillId: preferred.id, targetUid: target ? target.battleId : null };
    }
    return { unitId: units[0].battleId, skillId: null, targetUid: null };
  }

  currentSideState() {
    return this.currentSide ? this.sides[this.currentSide] : null;
  }

  drawCountdown() {
    if (!this.rules.drawDuringBattle) return null;
    const interval = Math.max(1, Number(this.rules.drawInterval) || 1);
    const remaining = (this.round - 1) % interval;
    return remaining === 0 ? interval : interval - remaining;
  }
}

window.Battle = Battle;
window.evalFormulaStandalone = function (formula, values) {
  try {
    return new FormulaParser(tokenizeFormula(formula), token => (values && values[token.replace(/^\$/, '')]) || 0).parse();
  } catch (error) { return 0; }
};
