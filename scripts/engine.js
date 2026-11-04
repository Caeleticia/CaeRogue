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
  system: L('ui.1a1f6dff7826'), round: L('ui.52d27a21f811'), turn: L('ui.8af638bad2cb'), entry: L('ui.044f9d3198d2'), skill: L('ui.53da139b6a5c'),
  passive: L('ui.7992277d1c97'), trigger: L('ui.27eccf97850b'), damage: L('ui.69ace645512d'), heal: L('ui.ffc7850925e7'),
  effect: L('ui.151ddd4f1f9f'), count: L('ui.37802b1dfc26'), defeat: L('ui.165a6e98df84'), retreat: L('ui.165a6e98df84'),
  summon: L('ui.bf5e0242befc'), formula: L('ui.3f27035af46b'), victory: L('ui.4c506e4ef106'), extra: L('ui.6f5160294870')
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
      if (j === i + 1) throw new FormulaError(L('ui.a317c5a6c035'));
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
    if (two === '**') { tokens.push({ type: 'op', value: '^' }); i += 2; continue; }
    if (ch === '>' || ch === '<') { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    if ('+-*/^(),'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      tokens.push({ type: 'name', value: text.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(L('ui.9e887c5700a2') + ch);
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
    if (!token) throw new FormulaError(L('ui.8c4d60c048ed') + value);
    return token;
  }
  parse() {
    const value = this.parseComparison();
    if (this.pos < this.tokens.length) throw new FormulaError(L('ui.57976eb8f7ed'));
    if (!Number.isFinite(value)) throw new FormulaError(L('ui.5bd421f4a26b'));
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
    return this.parsePower();
  }

  parsePower() {
    let left = this.parsePrimary();
    if (this.peek() && this.peek().value === '^') {
      this.take();
      const right = this.parseUnary();
      left = Math.pow(left, right);
    }
    return left;
  }
  parsePrimary() {
    const token = this.peek();
    if (!token) throw new FormulaError(L('ui.d2466c57b658'));
    if (token.type === 'number') { this.take(); return token.value; }
    if (token.type === 'var') { this.take(); return Number(this.resolver(token.value)) || 0; }
    if (token.type === 'name') {
      this.take();
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'e') return Math.E;
      if (token.value === 'min' || token.value === 'max') {
        const args = this.parseArgs();
        return token.value === 'min' ? Math.min(...args) : Math.max(...args);
      }
      if (['floor', 'ceil', 'round', 'abs', 'sqrt', 'exp', 'ln', 'log10', 'log2'].includes(token.value)) {
        const args = this.parseArgs();
        const value = args[0] || 0;
        switch (token.value) {
          case 'floor': return Math.floor(value);
          case 'ceil': return Math.ceil(value);
          case 'round': return Math.round(value);
          case 'abs': return Math.abs(value);
          case 'sqrt': return Math.sqrt(value);
          case 'exp': return Math.exp(value);
          case 'ln': return Math.log(value);
          case 'log10': return Math.log10(value);
          case 'log2': return Math.log2(value);
          default: return 0;
        }
      }
      if (token.value === 'pow') {
        const args = this.parseArgs();
        return Math.pow(args[0] || 0, args[1] || 0);
      }
      if (token.value === 'log') {
        const args = this.parseArgs();
        if (args.length < 2) return Math.log10(args[0] || 0);
        return Math.log(args[0]) / Math.log(args[1]);
      }
      throw new FormulaError(L('ui.23571af050fb') + token.value);
    }
    if (token.value === '(') {
      this.take();
      const value = this.parseExpression();
      this.expect(')');
      return value;
    }
    throw new FormulaError(L('ui.01e7606db3f5') + token.value);
  }

  parseArgs() {
    this.expect('(');
    const args = [];
    if (this.peek() && this.peek().value === ')') { this.take(); return args; }
    args.push(this.parseExpression());
    while (this.take(',')) args.push(this.parseExpression());
    this.expect(')');
    return args;
  }
}

class FormulaParser2 {
  constructor(text, battle, ctx) {
    this.text = String(text || '').trim();
    this.battle = battle;
    this.ctx = ctx || {};
    this.pos = 0;
  }

  fail(message) { throw new FormulaError(message || L('ui.2fce10f3d424')); }
  skip() { while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos += 1; }
  peek() { return this.text[this.pos]; }
  eat(value) {
    this.skip();
    if (this.text.startsWith(value, this.pos)) { this.pos += value.length; return true; }
    return false;
  }
  expect(value) { if (!this.eat(value)) this.fail(L('ui.104a5c5ee326') + value); }
  readWord() {
    this.skip();
    const start = this.pos;
    while (this.pos < this.text.length && /[A-Za-z0-9_]/.test(this.text[this.pos])) this.pos += 1;
    return this.text.slice(start, this.pos);
  }
  matchWord(word) {
    this.skip();
    if (this.text.slice(this.pos, this.pos + word.length).toLowerCase() !== word) return false;
    const next = this.text[this.pos + word.length] || '';
    if (/[A-Za-z0-9_]/.test(next)) return false;
    this.pos += word.length;
    return true;
  }
  readBalanced(open, close) {
    this.skip();
    if (this.text[this.pos] !== open) this.fail(L('ui.104a5c5ee326') + open);
    let depth = 0;
    const start = this.pos + 1;
    for (let i = this.pos; i < this.text.length; i += 1) {
      const ch = this.text[i];
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          const content = this.text.slice(start, i);
          this.pos = i + 1;
          return content;
        }
      }
    }
    this.fail(L('ui.104a5c5ee326') + close);
  }
  splitArgs(text) {
    const args = [];
    let depthBrace = 0, depthParen = 0, depthBracket = 0, start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') depthBrace += 1;
      else if (ch === '}') depthBrace -= 1;
      else if (ch === '(') depthParen += 1;
      else if (ch === ')') depthParen -= 1;
      else if (ch === '[') depthBracket += 1;
      else if (ch === ']') depthBracket -= 1;
      else if (ch === ',' && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
        args.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    const tail = text.slice(start).trim();
    if (tail) args.push(tail);
    return args;
  }
  readCall(name) {
    this.skip();
    if (this.text.startsWith(name, this.pos)) this.pos += name.length;
    this.skip();
    const open = this.peek();
    let close = ')';
    if (open === '(') close = ')';
    else if (open === '<') close = '>';
    else this.fail(name + L('ui.f9292ddf2e12'));
    return this.splitArgs(this.readBalanced(open, close));
  }
  parse() {
    const value = this.parseOr();
    this.skip();
    if (this.pos < this.text.length) this.fail(L('ui.17ed4c668ac0'));
    if (typeof value === 'number' && !Number.isFinite(value)) this.fail(L('ui.b8fe69162928'));
    return value;
  }
  truthy(value) {
    if (typeof value === 'string') return value.length > 0;
    return Number(value) !== 0 && Number.isFinite(Number(value));
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.matchWord('or')) {
      const right = this.parseAnd();
      left = this.truthy(left) || this.truthy(right) ? 1 : 0;
    }
    return left;
  }
  parseAnd() {
    let left = this.parseNot();
    while (this.matchWord('and')) {
      const right = this.parseNot();
      left = this.truthy(left) && this.truthy(right) ? 1 : 0;
    }
    return left;
  }
  parseNot() {
    if (this.matchWord('not')) return this.truthy(this.parseNot()) ? 0 : 1;
    return this.parseComparison();
  }
  parseComparison() {
    let left = this.parseAdd();
    while (true) {
      this.skip();
      let op = '';
      for (const candidate of ['==', '!=', '<=', '>=', '<', '>', '=']) {
        if (this.text.startsWith(candidate, this.pos)) { op = candidate; break; }
      }
      if (!op) break;
      this.pos += op.length;
      const right = this.parseAdd();
      let result = false;
      if (op === '==' || op === '=') result = left === right;
      else if (op === '!=') result = left !== right;
      else if (typeof left === 'string' || typeof right === 'string') {
        const ls = String(left), rs = String(right);
        if (op === '<') result = ls < rs;
        else if (op === '>') result = ls > rs;
        else if (op === '<=') result = ls <= rs;
        else result = ls >= rs;
      } else {
        if (op === '<') result = left < right;
        else if (op === '>') result = left > right;
        else if (op === '<=') result = left <= right;
        else result = left >= right;
      }
      left = result ? 1 : 0;
    }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (true) {
      this.skip();
      const op = this.peek();
      if (op !== '+' && op !== '-') break;
      this.pos += 1;
      const right = this.parseMul();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (true) {
      this.skip();
      const two = this.text.slice(this.pos, this.pos + 2);
      if (two === '**') { this.pos += 2; left = Math.pow(left, this.parseUnary()); continue; }
      const op = this.peek();
      if (op !== '*' && op !== '/') break;
      this.pos += 1;
      const right = this.parseUnary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  parseUnary() {
    this.skip();
    if (this.peek() === '-') { this.pos += 1; return -this.parseUnary(); }
    if (this.peek() === '+') { this.pos += 1; return this.parseUnary(); }
    return this.parsePower();
  }
  parsePower() {
    let left = this.parsePrimary();
    this.skip();
    if (this.peek() === '^') {
      this.pos += 1;
      left = Math.pow(left, this.parseUnary());
    }
    return left;
  }
  parsePrimary() {
    this.skip();
    const ch = this.peek();
    if (ch === undefined) this.fail(L('ui.9493ec599c15'));
    if (ch === '<') return this.readAngleCondition();
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.text[this.pos + 1] || ''))) {
      let end = this.pos;
      while (end < this.text.length && /[0-9.]/.test(this.text[end])) end += 1;
      let percent = false;
      if (this.text[end] === '%') { percent = true; end += 1; }
      const value = Number(this.text.slice(this.pos, percent ? end - 1 : end)) / (percent ? 100 : 1);
      this.pos = end;
      return value;
    }
    if (ch === '{') {
      const content = this.readBalanced('{', '}');
      return this.parseSelectorValue(content);
    }
    if (ch === '[') return this.readBalanced('[', ']');
    if (ch === '\\') {
      this.pos += 1;
      const word = this.readWord();
      if (word === 'pi') return Math.PI;
      if (word === 'e') return Math.E;
      this.fail(L('ui.a8aae17bd63d') + word);
    }
    if (ch === '$') {
      this.pos += 1;
      const start = this.pos;
      while (this.pos < this.text.length && /[A-Za-z0-9_.]/.test(this.text[this.pos])) this.pos += 1;
      return this.battle.resolveFormulaToken('$' + this.text.slice(start, this.pos), this.ctx);
    }
    if (ch === '(') {
      this.pos += 1;
      const value = this.parseOr();
      this.expect(')');
      return value;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const name = this.readWord();
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      if (name === 'true') return 1;
      if (name === 'false') return 0;
      if (['min', 'max', 'log', 'pow', 'floor', 'ceil', 'round', 'abs', 'sqrt', 'ln', 'exp', 'log10', 'log2'].includes(name)) {
        const args = this.readCall(name);
        const values = args.map(arg => new FormulaParser2(arg, this.battle, this.ctx).parse());
        if (name === 'min') return values.length ? Math.min(...values) : 0;
        if (name === 'max') return values.length ? Math.max(...values) : 0;
        if (name === 'pow') return Math.pow(values[0] || 0, values[1] || 0);
        if (name === 'log') {
          if (values.length < 2) return Math.log10(values[0] || 0);
          return Math.log(values[0]) / Math.log(values[1]);
        }
        if (name === 'ln') return Math.log(values[0] || 0);
        if (name === 'exp') return Math.exp(values[0] || 0);
        if (name === 'log10') return Math.log10(values[0] || 0);
        if (name === 'log2') return Math.log2(values[0] || 0);
        if (name === 'sqrt') return Math.sqrt(values[0] || 0);
        if (name === 'floor') return Math.floor(values[0] || 0);
        if (name === 'ceil') return Math.ceil(values[0] || 0);
        if (name === 'round') return Math.round(values[0] || 0);
        return Math.abs(values[0] || 0);
      }
      return name;
    }
    const bareStart = this.pos;
    while (this.pos < this.text.length && !/[\s()+\-*\/%,<>=!&|\[\]{}]/.test(this.text[this.pos])) this.pos += 1;
    if (this.pos > bareStart) return this.text.slice(bareStart, this.pos);
    this.fail(L('ui.367ce0b08f68') + ch);
  }
  readAngleCondition() {
    this.skip();
    if (this.peek() !== '<') this.fail(L('ui.104a5c5ee326') + '<');
    const start = this.pos + 1;
    let brace = 0, paren = 0, bracket = 0;
    for (let i = start; i < this.text.length; i += 1) {
      const ch = this.text[i];
      if (ch === '{') brace += 1;
      else if (ch === '}') brace -= 1;
      else if (ch === '(') paren += 1;
      else if (ch === ')') paren -= 1;
      else if (ch === '[') bracket += 1;
      else if (ch === ']') bracket -= 1;
      else if (ch === '>' && brace === 0 && paren === 0 && bracket === 0) {
        const rest = this.text.slice(i + 1).trimStart();
        const closes = !rest || /^(and|or)\b/i.test(rest) || /^[),}]/.test(rest);
        if (closes) {
          const inner = this.text.slice(start, i);
          this.pos = i + 1;
          return new FormulaParser2(inner, this.battle, this.ctx).parse();
        }
      }
    }
    this.fail(L('ui.104a5c5ee326') + '>');
  }

  parseSelectorValue(content) {
    const marker = this.battle.resolveSelectorMarker(content, this.ctx);
    this.skip();
    if (this.peek() !== '.') this.fail(L('ui.10323b1be7ee'));
    this.pos += 1;
    const property = this.readWord();
    if (property === 'count' && String(content || '').trim() === 'target' && !this.ctx.__setResolution) {
      const chosen = Array.isArray(this.ctx.chosen) ? this.ctx.chosen.filter(Boolean) : [];
      if (chosen.length) return chosen.length;
    }
    if (marker.kind === 'side') {
      if (property !== 'count') this.fail(L('ui.d57035b94786'));
      const id = this.readBalanced('[', ']');
      return this.battle.selectorSideCount(marker.side, id, this.ctx);
    }
    const units = marker.units || [];
    if (property === 'count') {
      this.skip();
      if (this.peek() === '[') {
        const id = this.readBalanced('[', ']');
        return units.reduce((sum, unit) => sum + this.battle.getCount(unit, 'unit', id), 0);
      }
      return units.length;
    }
    if (property === 'effect') {
      const id = this.readBalanced('[', ']');
      this.expect('.');
      const suffix = this.readWord();
      if (suffix !== 'count') this.fail(L('ui.9497dbb49ae2'));
      return units.reduce((sum, unit) => sum + this.battle.getEffectStacks(unit, id), 0);
    }
    if (property === 'name') return units.length ? String(units[0].name || (units[0].card && units[0].card.name) || '') : '';
    if (property === 'id') return units.length ? String(units[0].cardId || (units[0].card && units[0].card.id) || '') : '';
    if (property === 'last_hit_count') return this.ctx.lastHitCount || 0;
    if (property === 'atk') return units.reduce((sum, unit) => sum + (unit.atk || 0), 0);
    if (property === 'hp') return units.reduce((sum, unit) => sum + (unit.hp || 0), 0);
    if (property === 'max_hp' || property === 'maxHp') return units.reduce((sum, unit) => sum + (unit.maxHp || 0), 0);
    if (property === 'res') return units.reduce((sum, unit) => {
      return sum + (unit.resistance.current || this.battle.getResistance(unit, (unit.card && unit.card.resistance && unit.card.resistance.type) || 'general'));
    }, 0);
    this.fail(L('ui.a3702a434596') + property);
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
    this.rules.maxField = Math.max(1, Number(this.rules.maxField) || 4);
    this.rules.initialDraw = Math.max(0, Number(this.rules.initialDraw) || 0);
    this.drawFromPool = !!(config.drawFromPool || this.rules.drawFromPool);
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
    this.inChangeTrigger = false;
    this.stepEventNotified = false;
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
    this.log('system', L('ui.30a797dff2ea'));
    this.sides = {
      A: this.createSide('A', config.loadouts && config.loadouts.A),
      B: this.createSide('B', config.loadouts && config.loadouts.B)
    };
    this.start();
  }

  createSide(id, rawLoadout) {
    const loadout = rawLoadout || (id === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    const bothHuman = this.controllers.A === 'human' && this.controllers.B === 'human';
    const name = bothHuman ? (id === 'A' ? L('ui.13d56d03d73a') : L('ui.4bdaf46d2363')) : (id === 'A' ? L('ui.da12da253948') : L('ui.99d2b5e44698'));
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
      equipmentPool: [],
      damageDealt: 0,
      damageTaken: 0
    };
    const unitIds = this.drawFromPool ? [] : (loadout.units || []).filter(item => this.maps.units.has(item));
    side.deck = shuffle(unitIds);
    side.equipmentPool = this.drawFromPool ? [] : (loadout.equipment || []).filter(item => this.maps.equipment.has(item));
    const runeIds = this.drawFromPool ? [] : [...new Set((loadout.runes || []).filter(item => this.maps.runes.has(item)))];
    side.runePool = runeIds.map(item => this.maps.runes.get(item));
    const requestedActive = this.drawFromPool ? [] : (Array.isArray(loadout.activeRunes)
      ? loadout.activeRunes.filter(item => runeIds.includes(item))
      : runeIds.slice(0, 3));
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
      owner: unit ? unit.name : L('ui.62e951a692ff'),
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
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (inst.mods) add(inst.mods, 1);
      if (!def || !def.mods) continue;
      add(def.mods, def.stackable ? inst.stacks : 1);
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
    const card = unit.card || {};
    const oldMax = unit.maxHp;
    const baseAtk = Number(card.attack) || 10;
    const baseDef = Number(card.defense) || 10;
    const baseHp = Number(card.hp) || 100;
    const atkPct = (Number(card.atkPct) || 0) + (Number(mods.atkPct) || 0);
    const atkFlat = (Number(card.atkFlat) || 0) + (Number(mods.atkFlat) || 0);
    const defPct = (Number(card.defPct) || 0) + (Number(mods.defPct) || 0);
    const defFlat = (Number(card.defFlat) || 0) + (Number(mods.defFlat) || 0);
    const hpPct = (Number(card.hpPct) || 0) + (Number(mods.hpPct) || 0);
    const hpFlat = (Number(card.hpFlat) || 0) + (Number(mods.hpFlat) || 0) + (Number(mods.maxHpFlat) || 0);
    const sideMod = this.externalModsForSide[unit.side] || {};
    unit.atk = Math.max(0, baseAtk * (1 + atkPct / 100) + atkFlat);
    unit.defense = Math.max(0, baseDef * (1 + defPct / 100) + defFlat);
    unit.maxHp = Math.max(1, baseHp * (1 + hpPct / 100) + hpFlat + (Number(sideMod.hpFlat) || 0));
    if (Number(card.maxHpCap) > 0) unit.maxHp = Math.min(unit.maxHp, Number(card.maxHpCap));
    if (unit.maxHp < oldMax) unit.hp = Math.min(unit.hp, unit.maxHp);
    unit.hp = Math.max(0, Math.min(unit.hp, unit.maxHp));
    unit.damageBonus = (Number(card.damageBonus) || 0) + (Number(mods.damageBonus) || 0) + (Number(mods.dmgPct) || 0) + (Number(mods.finalDmgPct) || 0);
    unit.damageBonusFlat = (Number(card.damageBonusFlat) || 0) + (Number(mods.damageBonusFlat) || 0) + (Number(mods.dmgFlat) || 0) + (Number(mods.finalDmgFlat) || 0);
    unit.elementBonus = Object.assign({ physical: 0, mental: 0 }, card.elementBonus || {});
    unit.elementBonus.physical += Number(mods.physicalDmgPct) || 0;
    unit.elementBonus.mental += Number(mods.mentalDmgPct) || 0;
    unit.critRate = Math.max(0, (Number(card.critRate) || 0) + (Number(mods.critRate) || 0));
    unit.critDamage = Math.max(0, (Number(card.critDamage) || 0) + (Number(mods.critDamage) || 0));
    unit.luckyRate = Math.max(0, (Number(card.luckyRate) || 0) + (Number(mods.luckyRate) || 0));
    unit.luckyDamage = Math.max(0, (Number(card.luckyDamage) || 0) + (Number(mods.luckyDamage) || 0));
    unit.resistances = Object.assign({ physical: 5, mental: 5 }, card.resistances || {});
    delete unit.resistances.true;
    unit.resistances.physical += Number(mods.physicalResist) || 0;
    unit.resistances.mental += Number(mods.mentalResist) || 0;
    unit.penetration = Object.assign({ physical: 0, mental: 0 }, card.penetration || {});
    delete unit.penetration.true;
    unit.penetration.physical += Number(mods.physicalPen) || 0;
    unit.penetration.mental += Number(mods.mentalPen) || 0;
    unit.defensePen = Math.max(0, (Number(card.defensePen) || 0) + (Number(mods.defensePen) || 0));
    unit.resistanceReduction = (Number(card.resistanceReduction) || 0) + (Number(mods.resistanceReduction) || 0);
    unit.damageTakenBonus = (Number(card.damageTakenBonus) || 0) + (Number(mods.damageTakenBonus) || 0) + (Number(mods.takenPct) || 0);
    unit.vulnerability = (Number(card.vulnerability) || 0) + (Number(mods.vulnerability) || 0);
    unit.level = Number(card.level) || 90;
    unit.resistance.current = this.getResistance(unit, 'physical');
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
      hp: Number(card.hp) || 100,
      maxHp: Number(card.hp) || 100,
      atk: Number(card.attack) || 10,
      defense: Number(card.defense) || 10,
      resistance: { type: card.resistance && card.resistance.type || 'general', value: Number(card.resistance && card.resistance.value) || 5, current: 0 },
      effects: [],
      counts: {},
      equipment: { weapon: null, accessory: null },
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

  unitNoFieldSlot(unit) {
    return !!(unit && ((unit.card && unit.card.noFieldSlot) || unit.noFieldSlot));
  }

  occupiedFieldCount(sideId) {
    return this.sides[sideId].units.filter(unit => unit.alive && unit.onField && !this.unitNoFieldSlot(unit)).length;
  }

  isInvincible(unit) {
    return !!(unit && ((unit.card && unit.card.invincible) || unit.invincible));
  }

  isNegativeImmune(unit) {
    if (!unit) return false;
    if (unit.card && unit.card.negativeImmune) return true;
    return this.getUnitSkills(unit).some(skill => skill.negativeImmune);
  }

  isUntargetable(unit) {
    if (!unit) return false;
    if (unit.untargetable || (unit.card && unit.card.untargetable)) return true;
    return this.getUnitSkills(unit).some(skill => skill.untargetable);
  }

  isTargetable(unit, actor) {
    return !!unit && (!this.isUntargetable(unit) || unit === actor);
  }

  getEnemies(unit) { return this.getFieldUnits(unit.side === 'A' ? 'B' : 'A').filter(item => this.isTargetable(item, unit)); }
  getLivingAllies(unit) { return this.getFieldUnits(unit.side).filter(item => this.isTargetable(item, unit)); }

  getAutoUnits(sideId) {
    return this.getFieldUnits(sideId).filter(unit => !unit.acted && unit.card && unit.card.autoAttack);
  }

  autoUnitPlan(unit) {
    if (!unit || !unit.alive || unit.acted || !unit.card || !unit.card.autoAttack) return null;
    const skills = this.getActiveSkills(unit).filter(skill => skill.op === 'attack');
    for (const skill of skills) {
      const state = this.getSkillState(unit, skill);
      if (!state.usable) continue;
      let targetUid = null;
      if ((skill.targetMode === 'enemy' || skill.targetMode === 'ally') && state.targets.length) {
        const picked = state.targets[Math.floor(Math.random() * state.targets.length)];
        targetUid = picked ? picked.battleId : null;
      }
      return { unitId: unit.battleId, skillId: skill.id, targetUid };
    }
    return { unitId: unit.battleId, skillId: null, targetUid: null };
  }

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

  effectDef(inst) {
    if (!inst) return null;
    return this.maps.effects.get(inst.effectId) || (inst.synthetic ? inst : null);
  }

  getResistance(unit, damageType) {
    const type = DAMAGE_TYPES[damageType] ? damageType : 'physical';
    if (type === 'true') return 0;
    const map = Object.assign({ physical: 5, mental: 5 }, (unit && (unit.resistances || (unit.card && unit.card.resistances))) || {});
    let value = Number(map[type]);
    if (!Number.isFinite(value)) value = 0;
    const mods = this.getMods(unit);
    if (type === 'physical') value += Number(mods.physicalResist) || 0;
    if (type === 'mental') value += Number(mods.mentalResist) || 0;
    return Math.max(0, value);
  }

  resistanceSummary(unit) {
    return {
      physical: this.getResistance(unit, 'physical'),
      mental: this.getResistance(unit, 'mental')
    };
  }

  formulaTarget(ctx) {
    if (!ctx) return null;
    return ctx.target || (ctx.chosen && ctx.chosen[0]) || (ctx.eventData && (ctx.eventData.target || (ctx.eventData.targets && ctx.eventData.targets[0]))) || ctx.unit || null;
  }

  resolveFormulaToken(token, ctx) {
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
    const target = this.formulaTarget(ctx);
    if (token === '$target.hp') return target ? target.hp : 0;
    if (token === '$target.hpMax' || token === '$target.maxHp') return target ? target.maxHp : 0;
    if (token === '$target.missingHp') return target ? Math.max(0, target.maxHp - target.hp) : 0;
    if (token === '$target.hpPct') return target && target.maxHp > 0 ? (target.hp / target.maxHp) * 100 : 0;
    if (token === '$target.hpRatio') return target && target.maxHp > 0 ? target.hp / target.maxHp : 0;
    if (token === '$target.atk') return target ? target.atk : 0;
    if (token === '$target.resist') return target ? (target.resistance.current || this.getResistance(target, (target.card && target.card.resistance && target.card.resistance.type) || 'general')) : 0;
    if (token === '$target.counted') return target && target.counted ? 1 : 0;
    if (token === '$target.effectCount') return target ? target.effects.length : 0;
    if (token.startsWith('$target.count.')) return target ? this.getCount(target, 'unit', token.slice('$target.count.'.length)) : 0;
    if (token.startsWith('$target.sideCount.')) return target ? this.getCount(target, 'side', token.slice('$target.sideCount.'.length)) : 0;
    if (token.startsWith('$target.effect.')) return target ? this.getEffectStacks(target, token.slice('$target.effect.'.length)) : 0;
    if (token.startsWith('$source.effect.')) return this.getEffectStacks(source, token.slice('$source.effect.'.length));
    return 0;
  }

  looksLikeNewExpression(formula) {
    if (typeof formula !== 'string') return false;
    return /[{}\\]/.test(formula) || /\[[^\]]+\]/.test(formula) || /\b(and|or|not)\b/.test(formula) || /^\s*(choose|all|in|un|diff)\s*\(/.test(formula) || /^\s*<[\s\S]+>\s*$/.test(formula);
  }

  evalNewExpression(expression, ctx) {
    try {
      return new FormulaParser2(expression, this, ctx || {}).parse();
    } catch (error) {
      this.log('system', L('ui.be62c0656ae6') + expression + '（' + error.message + '）');
      return 0;
    }
  }

  evalFormula(formula, ctx) {
    if (formula === undefined || formula === null || formula === '') return 0;
    if (typeof formula === 'number') return formula;
    if (typeof formula === 'string' && /^-?\d+(\.\d+)?%?$/.test(formula.trim())) {
      const raw = formula.trim();
      return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    }
    if (this.looksLikeNewExpression(formula)) return this.evalNewExpression(formula, ctx);
    const resolver = (token) => this.resolveFormulaToken(token, ctx || {});
    try {
      const tokens = tokenizeFormula(formula);
      return new FormulaParser(tokens, resolver).parse();
    } catch (error) {
      this.log('system', L('ui.be62c0656ae6') + formula + '（' + error.message + '）');
      return 0;
    }
  }

  fieldUnitsForSelector() {
    return ['A', 'B'].flatMap(sideId => this.getFieldUnits(sideId));
  }

  splitExpressionArgs(text) {
    return new FormulaParser2('', this, {}).splitArgs(text);
  }

  resolveSatisfySelector(content, ctx) {
    const parser = new FormulaParser2(content, this, ctx);
    const args = parser.readCall('satisfy');
    if (!args.length) throw new FormulaError(L('ui.20fc597fd5f3'));
    const set = args.length > 1 ? this.resolveSetExpression(args[0], ctx) : this.fieldUnitsForSelector();
    const condition = args.length > 1 ? args.slice(1).join(',') : args[0];
    return set.filter(unit => {
      const child = Object.assign({}, ctx, { item: unit });
      try {
        const childParser = new FormulaParser2(condition, this, child);
        return childParser.truthy(childParser.parse());
      } catch (error) {
        return false;
      }
    });
  }

  resolveSelectorMarker(content, ctx) {
    ctx = ctx || {};
    let text = String(content || '').trim();
    if (/^satisfy\s*<[\s\S]*>$/.test(text)) {
      text = 'satisfy(' + text.replace(/^satisfy\s*</, '').replace(/>$/, '') + ')';
    }
    if (/^satisfy\s*\(/.test(text)) {
      return { kind: 'units', units: this.resolveSatisfySelector(text, ctx) };
    }
    const effectMatch = /^with_effect\s*\[([\s\S]+)\]\s*$/.exec(text);
    if (effectMatch) {
      const effectId = effectMatch[1].trim();
      return { kind: 'units', units: this.fieldUnitsForSelector().filter(unit => this.getEffectStacks(unit, effectId) > 0) };
    }
    if (/^(in|un|diff)\s*\(/.test(text)) {
      return { kind: 'units', units: this.resolveSetExpression(text, ctx) };
    }
    if (text === 'enemyside' || text === 'friendlyside' || text === 'field') {
      return { kind: 'side', side: text };
    }
    const actor = ctx.unit || ctx.source;
    const childOwner = ctx.item || actor;
    if (text === 'parent') {
      const parent = childOwner ? this.getParentUnit(childOwner) : null;
      return { kind: 'units', units: parent && parent.alive ? [parent] : [] };
    }
    if (text === 'child') {
      return { kind: 'units', units: childOwner ? this.getChildUnits(childOwner) : [] };
    }
    const childIdMatch = /^\{child\}\.id\[([\s\S]+)\]\s*$/.exec(text);
    if (childIdMatch) {
      const id = childIdMatch[1].trim();
      const children = childOwner ? this.getChildUnits(childOwner) : [];
      return { kind: 'units', units: children.filter(unit => unit.childId === id) };
    }
    const childTagMatch = /^\{child\}\.tag\[([\s\S]+?)\](?:\.\((\d+)\))?\s*$/.exec(text);
    if (childTagMatch) {
      const tag = childTagMatch[1].trim();
      const children = (childOwner ? this.getChildUnits(childOwner) : []).filter(unit => unit.childTag === tag);
      const index = childTagMatch[2] ? Number(childTagMatch[2]) : 0;
      if (index > 0) return { kind: 'units', units: children[index - 1] ? [children[index - 1]] : [] };
      return { kind: 'units', units: children };
    }
    if (text === 'eventTarget') {
      const target = ctx.eventData && ctx.eventData.target;
      return { kind: 'units', units: target && target.alive ? [target] : [] };
    }
    if (text === 'eventTargets') {
      const targets = (ctx.eventData && ctx.eventData.targets) || [];
      return { kind: 'units', units: targets.filter(unit => unit && unit.alive) };
    }
    if (text === 'target') {
      if (ctx.target && !ctx.__setResolution) return { kind: 'units', units: [ctx.target] };
      const chosen = Array.isArray(ctx.chosen) ? ctx.chosen.slice() : [];
      return { kind: 'units', units: chosen.filter(Boolean) };
    }
    if (text === 'enemy') return { kind: 'units', units: actor ? this.getEnemies(actor) : [] };
    if (text === 'friendly') return { kind: 'units', units: actor ? this.getLivingAllies(actor) : [] };
    if (text === 'self') return { kind: 'units', units: actor ? [actor] : [] };
    if (text === 'unit') {
      const current = ctx.item || actor;
      return { kind: 'units', units: current ? [current] : [] };
    }
    throw new FormulaError(L('ui.b3c4e2aa0090') + text + '}');
  }

  resolveSetExpression(expression, ctx) {
    const text = String(expression || '').trim();
    if (!text) return [];
    const setCtx = Object.assign({}, ctx, { __setResolution: true });
    if (text.startsWith('{')) {
      const parser = new FormulaParser2(text, this, setCtx);
      const content = parser.readBalanced('{', '}');
      parser.skip();
      if (parser.pos < parser.text.length) throw new FormulaError(L('ui.ec0e31467041'));
      const marker = this.resolveSelectorMarker(content, setCtx);
      if (marker.kind !== 'units') throw new FormulaError(L('ui.e6e2006787b0'));
      return marker.units;
    }
    if (/^choose\s*\(/.test(text)) {
      const args = new FormulaParser2(text, this, setCtx).readCall('choose');
      const set = this.resolveSetExpression(args[0] || '', setCtx);
      const count = Math.max(0, Math.floor(Number(this.evalNewExpression(args[1] || '0', ctx)) || 0));
      const chosen = (ctx.chosen || []).filter(unit => set.includes(unit));
      const result = [];
      for (const unit of chosen) if (result.length < count && !result.includes(unit)) result.push(unit);
      for (const unit of set) if (result.length < count && !result.includes(unit)) result.push(unit);
      return result;
    }
    if (/^all\s*\(/.test(text)) {
      const args = new FormulaParser2(text, this, setCtx).readCall('all');
      return this.resolveSetExpression(args[0] || '', setCtx);
    }
    if (/^(in|un|diff)\s*\(/.test(text)) {
      const name = /^(in|un|diff)/.exec(text)[1];
      const args = new FormulaParser2(text, this, setCtx).readCall(name);
      const left = this.resolveSetExpression(args[0] || '', setCtx);
      const right = this.resolveSetExpression(args[1] || '', setCtx);
      if (name === 'in') return left.filter(unit => right.includes(unit));
      if (name === 'un') return [...new Set(left.concat(right))];
      return left.filter(unit => !right.includes(unit));
    }
    if (/^with_effect\s*\[/.test(text) || /^satisfy\s*[\(<]/.test(text)) {
      const marker = this.resolveSelectorMarker(text, setCtx);
      return marker.units || [];
    }
    throw new FormulaError(L('ui.b264195d7084'));
  }

  selectorSideCount(sideKey, countId, ctx) {
    if (sideKey === 'field') return this.globalCounts[countId] || 0;
    const actor = ctx.unit || ctx.source;
    const actorSide = actor ? actor.side : 'A';
    const sideId = sideKey === 'enemyside' ? (actorSide === 'A' ? 'B' : 'A') : actorSide;
    const side = this.sides[sideId];
    return (side && side.counts && side.counts[countId]) || 0;
  }

  isNewTargetExpression(value) {
    if (typeof value !== 'string') return false;
    return /[{}\\]/.test(value) || /^\s*(choose|all|in|un|diff|with_effect|satisfy)\s*[\(<]/.test(value) || /^\s*satisfy\s*</.test(value);
  }

  stepTargetExpression(step) {
    if (!step) return 'chosen';
    if (step.expressionMode === 'formula') return step.targetExpression || step.target || '{target}';
    if (step.expressionMode === 'legacy') return step.legacyTarget || step.target || 'chosen';
    return step.targetExpression || step.target || 'chosen';
  }

  getTargetsForStep(unit, step, ctx) {
    const targets = [];
    const add = (list) => {
      for (const item of list || []) {
        if (item && item.alive && item.onField && this.isTargetable(item, unit) && !targets.includes(item)) targets.push(item);
      }
    };
    const mode = this.stepTargetExpression(step);
    if (this.isNewTargetExpression(mode)) {
      try {
        add(this.resolveSetExpression(mode, ctx));
      } catch (error) {
        this.log('system', L('ui.be62c0656ae6') + mode + '（' + error.message + '）');
      }
      return targets;
    }
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
    else if (mode === 'owner') {
      if (step.ownerEffectId) {
        const holders = [];
        for (const sideId of ['A', 'B']) {
          for (const candidate of this.getFieldUnits(sideId)) {
            if (this.getEffectStacks(candidate, step.ownerEffectId) > 0) holders.push(candidate);
          }
        }
        add(holders);
      } else {
        add([ctx.owner || unit]);
      }
    }
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

  requirementResult(unit, skill, context) {
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
          reason: L('ui.d6e5de1933b4') + COUNT_SCOPES[req.scope || 'unit'].label + '「' + this.countLabel(req.countId) + '」' + (req.label ? req.label : L('ui.1ff52df7741c')) + L('ui.c7b01cbc210c') + current + '）'
        };
      }
    }
    if (skill.trigger && skill.trigger.condition) {
      const val = this.evalFormula(skill.trigger.condition, Object.assign({ unit, source: unit, chosen: [] }, context || {}));
      if (!val) return { ok: false, reason: L('ui.357cb11ee45a') };
    }
    return { ok: true, reason: '' };
  }

  getSkillState(unit, skill) {
    if (!unit || !unit.alive || unit.pendingDefeat) return { usable: false, reason: L('ui.9bfdfd617653'), targets: [] };
    if (!skill) return { usable: false, reason: L('ui.cf795b395428'), targets: [] };
    if (this.status !== 'active') return { usable: false, reason: L('ui.d50a65e1aba3'), targets: [] };
    if (unit.side !== this.currentSide) return { usable: false, reason: L('ui.1b6e6a13bc5b'), targets: [] };
    if (skill.type === 'passive') return { usable: false, reason: L('ui.fb6841882b6a'), targets: [] };
    if (skill.type === 'active' && (unit.acted || this.phase !== 'awaiting')) return { usable: false, reason: unit.acted ? L('ui.b2da28e7a8be') : L('ui.311618603a09'), targets: [] };
    if (skill.type === 'extra' && this.phase !== 'awaiting') return { usable: false, reason: L('ui.311618603a09'), targets: [] };
    const req = this.requirementResult(unit, skill);
    if (!req.ok) return { usable: false, reason: req.reason, targets: [] };
    const targets = this.resolveTargetPreview(unit, skill);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !targets.length) return { usable: false, reason: L('ui.d9d5d8495c8e'), targets: [] };
    if (mode === 'allEnemies' && !this.getEnemies(unit).length) return { usable: false, reason: L('ui.81ddf5539357'), targets: [] };
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
      this.log('defeat', unit.name + L('ui.8502e4abdc5b'), { side: unit.side });
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
      if (!this.drawFromPool) this.musterSide(sideId);
    }
    this.log('round', L('ui.68af3e7446ba'), {});
    this.triggerEvent('roundStart', { round: this.round });
    this.endBatch();
    if (this.drawFromPool) {
      this.currentSide = null;
      this.beginBatch();
      for (const sideId of ['A', 'B']) {
        if (this.sides[sideId].controller === 'ai') this.musterSide(sideId);
      }
      this.endBatch();
      this.phase = 'muster';
      this.log('system', L('ui.dfaf9ea041a5'));
      return;
    }
    this.currentSide = this.firstSide;
    this.phase = this.status === 'active' ? 'awaiting' : 'ended';
    this.ensureActionable();
    if (this.status === 'active') this.log('system', L('ui.f47b4af92082') + this.sides[this.currentSide].name + '。');
  }

  drawPoolCard() {
    const units = (this.content && this.content.units) || [];
    if (!units.length) return null;
    const roll = Math.random();
    const quality = roll < 0.5 ? 'white' : roll < 0.9 ? 'blue' : 'gold';
    let pool = units.filter(unit => unit.quality === quality);
    if (!pool.length) pool = units;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  drawPoolCards(sideId, count, silent) {
    const side = this.sides[sideId];
    const amount = Math.max(0, Number(count) || 0);
    let drawn = 0;
    for (let i = 0; i < amount; i += 1) {
      const card = this.drawPoolCard();
      if (!card) break;
      side.hand.push(card.id);
      drawn += 1;
    }
    if (drawn && !silent) this.log('system', side.name + L('ui.fb5662e4fa98') + drawn + L('ui.8a5923356f1b'), { side: sideId });
    return drawn;
  }

  beginMuster() {
    if (this.status !== 'active' || this.phase !== 'muster') return { ok: false, error: L('ui.6f5882bd9048') };
    for (const sideId of ['A', 'B']) {
      const counted = this.getFieldUnits(sideId).filter(unit => unit.counted).length;
      if (!counted) return { ok: false, error: L('ui.ba45b06fb181') };
    }
    this.phase = 'awaiting';
    this.currentSide = this.firstSide;
    for (const side of Object.values(this.sides)) {
      for (const unit of side.units) {
        unit.acted = false;
        unit.actionStarted = false;
        unit.extraActionUsed = false;
      }
    }
    this.actionStartedFor = null;
    this.ensureActionable();
    this.log('round', L('ui.26b4c77aae28') + this.sides[this.firstSide].name + L('ui.027c22f27415'));
    return { ok: true };
  }

  drawCards(sideId, count, silent) {
    if (this.drawFromPool) return this.drawPoolCards(sideId, count, silent);
    const side = this.sides[sideId];
    const amount = Math.max(0, Number(count) || 0);
    let drawn = 0;
    for (let i = 0; i < amount; i += 1) {
      if (!side.deck.length) break;
      side.hand.push(side.deck.shift());
      drawn += 1;
    }
    if (drawn && !silent) this.log('system', side.name + L('ui.fb5662e4fa98') + drawn + L('ui.8a5923356f1b'), { side: sideId });
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
    while (this.occupiedFieldCount(sideId) < this.rules.maxField) {
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
    if (this.drawFromPool) {
      if (this.rules.drawDuringBattle && this.round > 1 && this.rules.drawInterval > 0 && (this.round - 1) % this.rules.drawInterval === 0) {
        for (const sideId of ['A', 'B']) this.drawPoolCards(sideId, this.rules.drawCount, false);
      }
      for (const sideId of ['A', 'B']) {
        if (this.sides[sideId].controller === 'ai') this.musterSide(sideId);
      }
      return;
    }
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
    if (!this.unitNoFieldSlot({ card }) && this.occupiedFieldCount(sideId) >= this.rules.maxField) return null;
    if (fromHand !== false) {
      const idx = side.hand.indexOf(cardId);
      if (idx < 0) return null;
      side.hand.splice(idx, 1);
    }
    const unit = this.createBattleUnit(card);
    unit.side = sideId;
    unit.resistance.current = card.resistance.value;
    side.units.push(unit);
    this.applyModBundle(unit, 'card:' + card.id, card.name, card.mods, { silent: true });
    this.applyRuneEffects(unit, { silent: true });
    this.syncAuraEffects(sideId);
    this.recalcUnit(unit);
    unit.hp = unit.maxHp;
    this.recalcSide(sideId);
    const starting = ((this.modifiers[sideId] && this.modifiers[sideId].startingEffects) || []).filter(item => !item.unitId || item.unitId === cardId);
    for (const item of starting) {
      if (this.maps.effects.has(item.effectId)) {
        const applied = this.addEffect(unit, item.effectId, Number(item.stacks) || 1, null, { silent: true });
        if (applied) {
          const def = this.maps.effects.get(item.effectId);
          this.recordVisual({
            kind: 'effect',
            action: 'apply',
            sourceUid: unit.battleId,
            targetUid: unit.battleId,
            sourceName: unit.name,
            targetName: unit.name,
            self: true,
            name: def ? def.name : item.effectId,
            effectType: def ? (def.type || 'special') : 'special',
            sourceSide: unit.side,
            targetSide: unit.side
          });
        }
      }
    }
    const gearNames = ['weapon', 'accessory'].map(slot => unit.equipment[slot]).filter(Boolean).map(item => item.name);
    this.log('entry', side.name + L('ui.a9d0024d5701') + card.name + '」' + (gearNames.length ? L('ui.a4932f828552') + gearNames.join('、') : '') + '。', { side: sideId });
    this.triggerEvent('enterField', { unit }, { ownerOnly: true });
    this.notifyUnitChanged(unit, 'enter');
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
      if (this.occupiedFieldCount(sideId) >= this.rules.maxField) {
        const uncounted = side.units.filter(unit => unit.alive && !unit.counted && !unit.pendingDefeat);
        if (!uncounted.length) break;
        const recalled = uncounted[uncounted.length - 1];
        side.units = side.units.filter(unit => unit !== recalled);
        side.hand.push(recalled.cardId);
        this.returnEquipment(recalled);
        this.log('retreat', L('ui.06e152363ae2') + recalled.name + L('ui.acfcf84b82b4'), { side: sideId });
        continue;
      }
      const chosen = this.deckUnitCard(cardIds[0]);
      this.log('system', side.name + L('ui.cf71379c6d15'), { side: sideId });
      const entered = this.deployUnit(sideId, chosen.id, true);
      if (entered && this.phase !== 'muster' && this.phase !== 'setup') {
        entered.acted = true;
        this.log('turn', entered.name + L('ui.e3c95c106266'), { side: sideId });
      }
      counted = side.units.filter(unit => unit.alive && unit.counted).length;
      if (counted > 0) break;
    }
    this.checkOutcome();
  }

  manualDeployCard(sideId, handIndex) {
    if (this.status !== 'active' || (this.phase !== 'awaiting' && this.phase !== 'muster')) return { ok: false, error: L('ui.93b74f0abd4d') };
    const side = this.sides[sideId];
    const index = Number(handIndex);
    if (!side || !Number.isInteger(index) || index < 0 || index >= side.hand.length) return { ok: false, error: L('ui.a46924a9796e') };
    const cardId = side.hand[index];
    const card = this.deckUnitCard(cardId);
    if (card && !this.unitNoFieldSlot({ card }) && this.occupiedFieldCount(sideId) >= this.rules.maxField) return { ok: false, error: L('ui.61a07d811cd8') };
    this.beginBatch();
    const unit = this.deployUnit(sideId, cardId, true);
    this.endBatch();
    if (!unit) return { ok: false, error: L('ui.1b2a93da4f54') };
    this.log('entry', side.name + L('ui.fc9c5a56d8e6') + unit.name + '」。', { side: sideId });
    return { ok: true, unit };
  }

  equipFromPool(sideId, unitUid, equipmentId) {
    if (this.status !== 'active') return { ok: false, error: L('ui.7e003f486821') };
    if (this.phase !== 'awaiting' || this.currentSide !== sideId) return { ok: false, error: L('ui.ddfec482ade3') };
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: L('ui.470cfed65424') };
    const index = side.equipmentPool.indexOf(equipmentId);
    if (index < 0) return { ok: false, error: L('ui.e0e1344587da') };
    const unit = this.getUnit(unitUid);
    if (!unit || unit.side !== sideId || !unit.alive || !unit.onField) return { ok: false, error: L('ui.036b5546ad8c') };
    const gear = this.maps.equipment.get(equipmentId);
    if (!gear) return { ok: false, error: L('ui.702511181715') };
    if (unit.equipment[gear.slot]) return { ok: false, error: L('ui.0d92e1a6a3b2') + (gear.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + L('ui.51a181a1f18f') };
    side.equipmentPool.splice(index, 1);
    unit.equipment[gear.slot] = gear;
    this.applyModBundle(unit, 'equip:' + gear.id, gear.name, gear.mods, { silent: true });
    this.recalcUnit(unit);
    this.log('effect', unit.name + L('ui.76124baa7f69') + gear.name + L('ui.a8f34e4831b8'), { side: sideId });
    return { ok: true, unit, gear };
  }

  unequipFromUnit(sideId, unitUid, slot) {
    if (this.status !== 'active') return { ok: false, error: L('ui.7e003f486821') };
    if (this.phase !== 'awaiting' || this.currentSide !== sideId) return { ok: false, error: L('ui.028defe15dc9') };
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: L('ui.470cfed65424') };
    const unit = this.getUnit(unitUid);
    if (!unit || unit.side !== sideId || !unit.alive || !unit.onField) return { ok: false, error: L('ui.036b5546ad8c') };
    if (!['weapon', 'accessory'].includes(slot)) return { ok: false, error: L('ui.9fae33288867') };
    const gear = unit.equipment[slot];
    if (!gear) return { ok: false, error: L('ui.df0e2794bdb5') };
    this.removeSourceEffects(unit, 'equip:' + gear.id);
    unit.equipment[slot] = null;
    side.equipmentPool.push(gear.id);
    this.recalcUnit(unit);
    this.log('effect', unit.name + L('ui.e1f258864861') + gear.name + L('ui.4b2c5092fba2'), { side: sideId });
    return { ok: true, unit, gear };
  }

  destroyEquipmentFromPool(sideId, equipmentId) {
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: L('ui.470cfed65424') };
    if (this.status !== 'active' || this.phase !== 'awaiting' || this.currentSide !== sideId) return { ok: false, error: L('ui.ddfec482ade3') };
    const index = side.equipmentPool.indexOf(equipmentId);
    if (index < 0) return { ok: false, error: L('ui.e0e1344587da') };
    const gear = this.maps.equipment.get(equipmentId);
    side.equipmentPool.splice(index, 1);
    this.log('effect', side.name + L('ui.e730db2a99ed') + (gear ? gear.name : equipmentId) + '」。', { side: sideId });
    return { ok: true };
  }

  setActiveRunes(sideId, runeIds) {
    const side = this.sides[sideId];
    if (!side) return { ok: false, error: L('ui.470cfed65424') };
    if (this.status !== 'active' || this.phase !== 'awaiting' || this.currentSide !== sideId) return { ok: false, error: L('ui.ccc41ad407a6') };
    const allowed = new Set((side.runePool || []).map(rune => rune.id));
    const selected = [...new Set((runeIds || []).filter(id => allowed.has(id)))];
    if (selected.length > 3) return { ok: false, error: L('ui.98e100fd718b') };
    side.runes = selected.map(id => this.maps.runes.get(id)).filter(Boolean);
    this.syncRuneEffects(sideId);
    this.syncAuraEffects(sideId);
    this.log('effect', side.name + L('ui.632583ffd105') + (side.runes.map(rune => rune.name).join('、') || L('ui.72077749f794')) + '。', { side: sideId });
    return { ok: true };
  }

  removeUnit(unit, reason, options) {
    options = options || {};
    if (!unit || !unit.alive) return;
    if (this.isInvincible(unit)) {
      this.log('effect', unit.name + L('ui.1150e54ba90b'), { side: unit.side });
      unit.pendingDefeat = false;
      unit.hp = Math.max(1, unit.hp);
      return;
    }
    if (reason === 'defeat') {
      const protector = this.getDamageRedirectProtector(unit);
      if (protector && protector !== unit) {
        unit.pendingDefeat = false;
        unit.hp = Math.max(1, unit.hp);
        this.log('effect', protector.name + L('ui.abf48a53b802') + unit.name + L('ui.6d850a6891f2'), { side: protector.side });
        return;
      }
    }
    if (!options.skipGuards && !options.force && this.runRetreatGuards(unit, null)) {
      unit.pendingDefeat = false;
      this.log('effect', unit.name + L('ui.a324f653ff74'), { side: unit.side });
      return;
    }
    unit.alive = false;
    unit.onField = false;
    unit.pendingDefeat = false;
    const side = this.getSideOf(unit);
    side.units = side.units.filter(item => item !== unit);
    this.syncAuraEffects(unit.side);
    this.recalcSide(unit.side);
    const children = this.getChildUnits(unit, true).slice();
    for (const child of children) {
      if (child && child.alive) this.removeUnit(child, 'retreat', { force: true });
    }
    this.log('defeat', unit.name + (reason === 'retreat' ? L('ui.cd7e8d1e52bf') : L('ui.2bbd49a1eca3')), { side: unit.side });
    const equipmentSnapshot = { weapon: unit.equipment.weapon, accessory: unit.equipment.accessory };
    if (!options.skipDefeated) this.triggerDefeated(unit);
    this.returnEquipment(unit);
    if (this.rules.defeatedToDeck) {
      side.deck.push(unit.cardId);
      this.log('system', unit.name + L('ui.b48411013123'), { side: unit.side });
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
        this.pushTrigger(unit, L('ui.53da139b6a5c'), skill.name, 'defeated');
        this.log('passive', unit.name + L('ui.9e6aa3762ddb') + skill.name + '」。', { side: unit.side });
        const visualStart = this.visualSeq;
        const ctx = this.createContext(unit, skill, [], { eventData: { target: unit }, allowDeadSource: true, eventName: 'defeated' });
        this.executeSteps(skill.steps || [], ctx);
        this.notifyGlobalEvent('passive', { unit, skillId: skill.id, sourceEvent: 'defeated' });
        if (this.visualSeq === visualStart) {
          this.recordVisual({
            kind: 'skill', sourceUid: unit.battleId, targetUid: unit.battleId,
            sourceName: unit.name, targetName: unit.name, self: true,
            name: skill.name, op: skill.op || 'special', skillType: 'passive',
            sourceSide: unit.side, targetSide: unit.side
          });
        }
      }
      for (const inst of (unit.effects || []).slice()) {
        const def = this.maps.effects.get(inst.effectId);
        if (!def || !def.trigger || def.trigger.event !== 'defeated') continue;
        this.pushTrigger(unit, L('ui.151ddd4f1f9f'), def.name, 'defeated');
        const visualStart = this.visualSeq;
        const ctx = this.createContext(unit, null, [], { eventData: { target: unit }, allowDeadSource: true, effectId: def.id, eventName: 'defeated' });
        this.executeSteps(def.steps || [], ctx);
        this.notifyGlobalEvent('effect', { unit, effectId: def.id, sourceEvent: 'defeated' });
        if (this.visualSeq === visualStart) {
          this.recordVisual({
            kind: 'effect', action: 'trigger', sourceUid: unit.battleId, targetUid: unit.battleId,
            sourceName: unit.name, targetName: unit.name, self: true,
            name: def.name, effectType: def.type || 'special',
            sourceSide: unit.side, targetSide: unit.side
          });
        }
      }
    } finally {
      this.triggerDepth -= 1;
    }
  }

  notifyGlobalEvent(eventName, detail) {
    if (this.inChangeTrigger) return;
    if (this.triggerDepth >= ENGINE_LIMITS.triggerDepth) return;
    this.stepEventNotified = true;
    this.inChangeTrigger = true;
    try {
      this.triggerEvent('continuous', Object.assign({ eventName }, detail || {}), {});
    } finally {
      this.inChangeTrigger = false;
    }
  }

  notifyUnitChanged(unit, changeType, detail) {
    if (!unit || !unit.alive || !unit.onField) return;
    this.notifyGlobalEvent('change', Object.assign({ unit, changeType }, detail || {}));
  }

  triggerEvent(eventName, eventData, options) {
    options = options || {};
    if (this.triggerDepth >= ENGINE_LIMITS.triggerDepth) {
      this.log('system', L('ui.08cd765267ea'));
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
          if (eventName === 'allyHpChange' && eventData.target && unit.side !== eventData.target.side) continue;
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
            const req = this.requirementResult(unit, skill, { eventData, eventName, chosen: eventData.targets || [] });
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
          this.pushTrigger(candidate.unit, L('ui.53da139b6a5c'), skill.name, eventName);
          this.log('passive', candidate.unit.name + L('ui.65e907be7f03') + skill.name + '」。', { side: candidate.unit.side });
          const visualStart = this.visualSeq;
          const ctx = this.createContext(candidate.unit, skill, eventData.targets || [], { eventData, eventName });
          this.executeSteps(skill.steps || [], ctx);
          this.notifyGlobalEvent('passive', { unit: candidate.unit, skillId: skill.id, sourceEvent: eventName });
          if (this.visualSeq === visualStart) {
            this.recordVisual({
              kind: 'skill',
              sourceUid: candidate.unit.battleId,
              targetUid: candidate.unit.battleId,
              sourceName: candidate.unit.name,
              targetName: candidate.unit.name,
              self: true,
              name: skill.name,
              op: skill.op || 'special',
              skillType: 'passive',
              sourceSide: candidate.unit.side,
              targetSide: candidate.unit.side
            });
          }
        } else {
          const def = candidate.def;
          this.pushTrigger(candidate.unit, L('ui.151ddd4f1f9f'), def.name, eventName);
          this.log('trigger', candidate.unit.name + L('ui.cfb26dec4e12') + def.name + L('ui.2b81ee152797'), { side: candidate.unit.side });
          const visualStart = this.visualSeq;
          const ctx = this.createContext(candidate.unit, null, eventData.targets || [], { eventData, eventName, effectId: def.id });
          this.executeSteps(def.steps || [], ctx);
          this.notifyGlobalEvent('effect', { unit: candidate.unit, effectId: def.id, sourceEvent: eventName });
          if (this.visualSeq === visualStart) {
            this.recordVisual({
              kind: 'effect',
              action: 'trigger',
              sourceUid: candidate.unit.battleId,
              targetUid: candidate.unit.battleId,
              sourceName: candidate.unit.name,
              targetName: candidate.unit.name,
              self: true,
              name: def.name,
              effectType: def.type || 'special',
              sourceSide: candidate.unit.side,
              targetSide: candidate.unit.side
            });
          }
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
    this.log('skill', unit.name + L('ui.da885de6b6e3') + skill.name + '」。', { side: unit.side });
    this.lastSkill = { unitId: unit.battleId, skillId: skill.id };
    const visualStart = this.visualSeq;
    const ctx = this.createContext(unit, skill, chosen, options);
    if (skill.type === 'active' && unit.alive) {
      this.triggerEvent('selfActiveSkill', { unit, skill, targets: (chosen || []).slice() }, { ownerOnly: true });
      if (!unit.alive) return ctx;
    }
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
        this.notifyGlobalEvent('attack', { unit, attacker: unit, skill, targets: livingTargets.slice() });
      }
    }
    if (this.visualSeq === visualStart) {
      this.recordVisual({
        kind: 'skill',
        sourceUid: unit.battleId,
        targetUid: unit.battleId,
        sourceName: unit.name,
        targetName: unit.name,
        self: true,
        name: skill.name,
        op: skill.op || 'special',
        skillType: skill.type || 'active',
        sourceSide: unit.side,
        targetSide: unit.side
      });
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
        this.pushTrigger(unit, L('ui.151ddd4f1f9f'), def.name, 'action');
        this.log('trigger', unit.name + L('ui.cfb26dec4e12') + def.name + L('ui.a2cfa7950322') + target.name + L('ui.b7e43b346376') + extra + L('ui.d19c86fbdfae'), { side: unit.side });
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
      this.log('system', L('ui.7d3b0ffa63b7'));
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
    const priorStepEvent = this.stepEventNotified;
    this.stepEventNotified = false;
    try {
      switch (step.kind) {
        case 'damage': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          let hit = 0;
          const hitTargets = [];
          const isBonus = !!step.bonus;
          for (const target of targets) {
            if (!target.alive || !target.onField) continue;
            let formulaValue;
            const damageType = step.damageType || (ctx.skill && ctx.skill.element) || 'physical';
            if (damageType === 'true') {
              const trueFormula = step.formula != null ? step.formula : (step.fixedValue != null ? String(step.fixedValue) : '0');
              formulaValue = this.evalFormula(trueFormula, Object.assign({}, ctx, { target }));
            } else if (step.useSkillValue) {
              const skill = ctx.skill || {};
              const valueFormula = step.valueFormula || skill.valueFormula || '{self}.atk';
              const rawValue = this.evalFormula(valueFormula, Object.assign({}, ctx, { target }));
              const multiplier = Number(step.multiplier != null ? step.multiplier : (skill.multiplier != null ? skill.multiplier : 100)) || 100;
              formulaValue = rawValue * multiplier / 100;
            } else {
              formulaValue = this.evalFormula(step.formula, Object.assign({}, ctx, { target }));
            }
            const result = this.dealDamage(ctx.unit, target, formulaValue, damageType, {
              ignoreResistance: !!step.ignoreResistance || isBonus,
              isAttack: !isBonus && !!(ctx.skill && ctx.skill.op === 'attack' && (ctx.skill.type === 'active' || ctx.skill.type === 'extra')),
              bonus: isBonus,
              rawDamage: !!step.rawDamage,
              isBurn: !!step.burn
            });
            if (result.hit) {
              hit += 1;
              const actualTarget = result.target || target;
              hitTargets.push(actualTarget);
              if (result.amount > 0) {
                ctx.damageByTarget[actualTarget.battleId] = (ctx.damageByTarget[actualTarget.battleId] || 0) + result.amount;
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
          for (const target of targets) {
            const amount = this.evalFormula(step.formula, Object.assign({}, ctx, { target }));
            this.healUnit(ctx.unit, target, amount);
          }
          break;
        }
        case 'addEffect': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const def = this.maps.effects.get(step.effectId);
          for (const target of targets) {
            const stacks = Math.max(0, Math.round(this.evalFormula(step.stacks || '1', Object.assign({}, ctx, { target }))));
            if (stacks <= 0) continue;
            const applied = this.addEffect(target, step.effectId, stacks, ctx.unit);
            if (applied) {
              this.recordVisual({
                kind: 'effect',
                action: 'apply',
                sourceUid: ctx.unit.battleId,
                targetUid: target.battleId,
                sourceName: ctx.unit.name,
                targetName: target.name,
                self: target === ctx.unit,
                name: def ? def.name : step.effectId,
                effectType: def ? (def.type || 'special') : 'special',
                sourceSide: ctx.unit.side,
                targetSide: target.side
              });
            }
          }
          break;
        }
        case 'removeEffect': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const recordRemoval = (target, def) => {
            this.recordVisual({
              kind: 'effect',
              action: 'remove',
              sourceUid: ctx.unit.battleId,
              targetUid: target.battleId,
              sourceName: ctx.unit.name,
              targetName: target.name,
              self: target === ctx.unit,
              name: def ? def.name : (step.effectId || L('ui.151ddd4f1f9f')),
              effectType: def ? (def.type || 'special') : 'special',
              sourceSide: ctx.unit.side,
              targetSide: target.side
            });
          };
          for (const target of targets) {
            const amount = Math.max(0, Math.round(this.evalFormula(step.stacks || '9999', Object.assign({}, ctx, { target }))));
            if (step.effectId) {
              const def = this.maps.effects.get(step.effectId);
              if (this.removeEffect(target, step.effectId, amount, step.force)) recordRemoval(target, def);
            } else {
              for (const inst of target.effects.slice()) {
                const def = this.maps.effects.get(inst.effectId) || (inst.synthetic ? inst : null);
                if (def && (def.removable !== false || step.force) && this.removeEffect(target, inst.effectId, amount, step.force)) {
                  recordRemoval(target, def);
                }
              }
            }
          }
          break;
        }
        case 'removeNegativeOne':
        case 'removeNegativeAll':
        case 'removePositiveOne':
        case 'removePositiveAll': {
          const targets = this.getTargetsForStep(ctx.unit, step, ctx);
          const effectType = step.kind.includes('Negative') ? 'negative' : 'positive';
          const all = step.kind.endsWith('All');
          for (const target of targets) {
            const removed = this.removeTypedEffects(target, effectType, all, !!step.force);
            for (const entry of removed) {
              this.recordVisual({
                kind: 'effect',
                action: 'remove',
                sourceUid: ctx.unit.battleId,
                targetUid: target.battleId,
                sourceName: ctx.unit.name,
                targetName: target.name,
                self: target === ctx.unit,
                name: entry.def.name || (effectType === 'negative' ? L('ui.e174a4a385d6') : L('ui.bbf71aea630d')),
                effectType: entry.def.type || 'special',
                sourceSide: ctx.unit.side,
                targetSide: target.side
              });
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
          const actual = this.getCount(ctx.unit, step.scope || 'unit', step.countId);
          this.log('count', ctx.unit.name + L('ui.4ac21152b1ea') + this.countLabel(step.countId) + L('ui.5dadd90a0d00') + before + L('ui.94e935dbc13d') + Math.max(0, next) + '。', { side: ctx.unit.side });
          if (actual !== before) this.notifyUnitChanged(ctx.unit, 'count', { scope: step.scope || 'unit', countId: step.countId, before, after: actual });
          break;
        }
        case 'readCount': {
          const value = this.getCount(ctx.unit, step.scope || 'unit', step.countId);
          if (!ctx.vars) ctx.vars = {};
          ctx.vars[step.varName || 'value'] = value;
          this.log('count', ctx.unit.name + L('ui.82730939af93') + this.countLabel(step.countId) + '」= ' + value + L('ui.2d4ff0ce0e72') + (step.varName || 'value') + '。', { side: ctx.unit.side });
          break;
        }
        case 'branch': {
          let passed;
          const useCondition = step.expressionMode === 'formula' || (step.expressionMode !== 'legacy' && typeof step.condition === 'string' && step.condition.trim());
          if (useCondition && typeof step.condition === 'string' && step.condition.trim()) {
            const value = this.evalFormula(step.condition, ctx);
            passed = typeof value === 'string' ? value.length > 0 : Number(value) !== 0;
          } else {
            const left = this.evalFormula(step.left || '0', ctx);
            const right = this.evalFormula(step.right || '0', ctx);
            const op = step.op || 'gte';
            passed = op === 'gt' ? left > right : op === 'lt' ? left < right : op === 'lte' ? left <= right : op === 'eq' ? left === right : op === 'neq' ? left !== right : left >= right;
          }
          this.executeSteps(passed ? step.then : step.elseSteps, ctx);
          break;
        }
        case 'selectTarget': {
          const mode = step.mode || 'allEnemies';
          const selected = this.getTargetsForStep(ctx.unit, { target: mode, ownerEffectId: step.ownerEffectId }, ctx);
          ctx.chosen = selected;
          if (step.varName) ctx.vars[step.varName] = selected.length;
          break;
        }
        case 'forEach': {
          const source = step.expressionMode === 'formula'
            ? (step.sourceExpression || step.source || '{target}')
            : step.expressionMode === 'legacy'
              ? (step.legacySource || step.source || 'chosen')
              : (step.sourceExpression || step.source || 'chosen');
          const list = this.getTargetsForStep(ctx.unit, { target: source, ownerEffectId: step.ownerEffectId }, ctx);
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
          if (!skill) { this.log('system', L('ui.d948ecca7e7c')); break; }
          const targetMode = skill.targetMode || 'none';
          let chosen = [];
          if (targetMode === 'self') chosen = [ctx.unit];
          else if (targetMode === 'allEnemies') chosen = this.getEnemies(ctx.unit);
          else if (targetMode === 'allAllies') chosen = this.getLivingAllies(ctx.unit);
          else chosen = this.getTargetsForStep(ctx.unit, { target: this.stepTargetExpression(step), ownerEffectId: step.ownerEffectId }, ctx);
          this.executeSkill(ctx.unit, skill, chosen, { allowDeadSource: true });
          break;
        }
        case 'skipAction': {
          const targets = this.getTargetsForStep(ctx.unit, { target: this.stepTargetExpression(step), ownerEffectId: step.ownerEffectId }, ctx);
          for (const target of targets) {
            target.acted = true;
            this.log('effect', target.name + L('ui.24aa02f4b605'), { side: target.side });
          }
          break;
        }
        case 'immuneDamage': {
          if (ctx.fatalGuard) { ctx.immune = true; this.log('effect', ctx.unit.name + L('ui.bba95015644f'), { side: ctx.unit.side }); }
          else this.log('system', L('ui.4a1c47520080'));
          break;
        }
        case 'forceRetreat': {
          const targets = this.getTargetsForStep(ctx.unit, { target: this.stepTargetExpression(step), ownerEffectId: step.ownerEffectId }, ctx);
          for (const target of targets) {
            if (!target.alive || this.isInvincible(target)) continue;
            const guards = this.getFatalGuardCandidates(target);
            for (const guard of guards) {
              this.runFatalGuard(guard, target, ctx.unit, { retreat: true });
            }
            if (!target.alive) continue;
            if (this.runRetreatGuards(target, ctx.unit)) continue;
            this.triggerDefeated(target);
            if (target.alive) this.removeUnit(target, 'retreat', { skipGuards: true, skipDefeated: true });
          }
          break;
        }
        case 'summon': {
          const amount = Math.max(0, Math.min(ENGINE_LIMITS.summonCount, Math.round(this.evalFormula(step.count || '1', ctx))));
          const sideId = ctx.unit.side;
          const ignoreFieldLimit = !!step.ignoreFieldLimit;
          const fromDefeat = !!(ctx.unit && (!ctx.unit.alive || ctx.unit.hp <= 0));
          for (let i = 0; i < amount; i += 1) {
            const summonCard = this.maps.units.get(step.unitId);
            if (!ignoreFieldLimit && !this.unitNoFieldSlot({ card: summonCard }) && this.occupiedFieldCount(sideId) >= this.rules.maxField) {
              this.log('summon', L('ui.3b5c6b31cd32') + ((this.maps.units.get(step.unitId) || {}).name || step.unitId) + L('ui.2a30f9f06957'), { side: sideId });
              break;
            }
            const summoned = this.deploySummon(sideId, step.unitId, {
              ignoreFieldLimit,
              asChild: !!step.summonAsChild,
              parentUid: ctx.unit ? ctx.unit.battleId : null,
              childId: step.childId || '',
              childTag: step.childTag || '',
              notActed: !!step.notActed,
              sourceUid: ctx.unit ? ctx.unit.battleId : null,
              sourceName: ctx.unit ? ctx.unit.name : side.name,
              summonIndex: i,
              summonCount: amount,
              fromDefeat
            });
            if (!summoned) break;
          }
          break;
        }
        case 'modifyStat': {
          const targets = this.getTargetsForStep(ctx.unit, { target: this.stepTargetExpression(step), ownerEffectId: step.ownerEffectId }, ctx);
          const stat = step.stat || 'atkFlat';
          for (const target of targets) {
            const amount = this.evalFormula(step.formula || '0', Object.assign({}, ctx, { target }));
            this.applyStatEffect(target, stat, amount, step.effectSourceId || (ctx.effectId || (ctx.skill && ctx.skill.id) || 'system'), step.effectSourceName || '');
          }
          break;
        }
        case 'setVar': {
          if (!ctx.vars) ctx.vars = {};
          const value = this.evalFormula(step.formula || '0', ctx);
          ctx.vars[step.varName || 'value'] = value;
          this.log('system', L('ui.154784eb4966') + (step.varName || 'value') + ' = ' + value + '。', { side: ctx.unit.side });
          break;
        }
        default:
          this.log('system', L('ui.3c93b9fe06a1') + step.kind);
      }
    } catch (error) {
      this.log('system', L('ui.1b71939b72ca') + step.kind + '）：' + error.message);
      console.error(error);
    }
    const notified = this.stepEventNotified;
    this.stepEventNotified = priorStepEvent || notified;
    if (!notified) this.notifyGlobalEvent('step', { unit: ctx.unit, stepKind: step.kind, step });
  }

  getChildUnits(parent, includeAll) {
    if (!parent) return [];
    return this.getSideOf(parent).units.filter(unit => unit.parentBattleId === parent.battleId && (includeAll || (unit.alive && unit.onField)));
  }

  getParentUnit(unit) {
    return unit && unit.parentBattleId ? this.getUnit(unit.parentBattleId) : null;
  }

  uniqueChildId(parent, base) {
    const used = new Set(this.getChildUnits(parent, true).map(unit => unit.childId).filter(Boolean));
    let candidate = String(base || '').trim() || ('child-' + (used.size + 1));
    if (!used.has(candidate)) return candidate;
    let n = 2;
    while (used.has(candidate + '#' + n)) n += 1;
    return candidate + '#' + n;
  }

  deploySummon(sideId, unitId, options) {
    options = options || {};
    const card = this.maps.units.get(unitId);
    if (!card) { this.log('summon', L('ui.0f7d4b2e2528')); return null; }
    const side = this.sides[sideId];
    if (!options.ignoreFieldLimit && !this.unitNoFieldSlot({ card }) && this.occupiedFieldCount(sideId) >= this.rules.maxField) return null;
    const unit = this.createBattleUnit(card);
    unit.side = sideId;
    let parent = null;
    let childId = '';
    if (options.asChild && options.parentUid) {
      parent = this.getUnit(options.parentUid);
      if (parent && parent.alive) childId = this.uniqueChildId(parent, options.childId);
    }
    if (parent && childId) {
      unit.parentBattleId = parent.battleId;
      unit.childId = childId;
      unit.childTag = String(options.childTag || '');
    }
    side.units.push(unit);
    this.recalcUnit(unit);
    unit.hp = unit.maxHp;
    this.recalcSide(sideId);
    unit.acted = options.notActed ? false : true;
    this.log('summon', side.name + L('ui.33c221414492') + card.name + '」。', { side: sideId });
    this.recordVisual({
      kind: 'summon',
      action: 'summon',
      sourceUid: options.sourceUid || unit.battleId,
      targetUid: unit.battleId,
      sourceName: options.sourceName || unit.name,
      targetName: unit.name,
      name: card.name,
      unitId: card.id,
      summonIndex: options.summonIndex == null ? 0 : options.summonIndex,
      summonCount: options.summonCount == null ? 1 : options.summonCount,
      fromDefeat: !!options.fromDefeat,
      sourceSide: sideId,
      targetSide: sideId
    });
    this.triggerEvent('enterField', { unit }, { ownerOnly: true });
    this.notifyUnitChanged(unit, 'enter');
    return unit;
  }

  getRetreatGuardCandidates(unit) {
    const candidates = [];
    for (const skill of this.getUnitSkills(unit)) {
      if (skill.type === 'passive' && skill.trigger && skill.trigger.event === 'retreat') candidates.push({ kind: 'skill', skill });
    }
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (def && def.trigger && def.trigger.event === 'retreat') candidates.push({ kind: 'effect', def });
    }
    return candidates;
  }

  runRetreatGuards(unit, source) {
    const guards = this.getRetreatGuardCandidates(unit);
    if (!guards.length) return false;
    let immune = false;
    for (const guard of guards) {
      if (this.runFatalGuard(guard, unit, source, { eventName: 'retreat', retreat: true })) immune = true;
    }
    return immune && unit.alive && unit.hp > 0;
  }

  getFatalGuardCandidates(unit) {
    const candidates = [];
    for (const skill of this.getUnitSkills(unit)) {
      if (skill.type === 'passive' && skill.trigger && skill.trigger.event === 'fatalDamage') candidates.push({ kind: 'skill', skill });
    }
    for (const inst of unit.effects) {
      const def = this.maps.effects.get(inst.effectId);
      if (def && def.trigger && def.trigger.event === 'fatalDamage') candidates.push({ kind: 'effect', def });
    }
    return candidates;
  }

  runFatalGuard(candidate, unit, source, options) {
    options = options || {};
    if (!unit.alive) return false;
    const eventName = options.eventName || 'fatalDamage';
    if (candidate.kind === 'skill') {
      this.pushTrigger(unit, L('ui.53da139b6a5c'), candidate.skill.name, eventName);
      this.log('passive', unit.name + L('ui.33bd881406f7') + candidate.skill.name + '」。', { side: unit.side });
      const ctx = this.createContext(unit, candidate.skill, [unit], { eventData: { target: unit, source }, fatalGuard: true, eventName });
      ctx.fatalGuard = true;
      this.executeSteps(candidate.skill.steps || [], ctx);
      this.notifyGlobalEvent('passive', { unit, skillId: candidate.skill.id, sourceEvent: eventName });
      return !!ctx.immune;
    }
    this.pushTrigger(unit, L('ui.151ddd4f1f9f'), candidate.def.name, eventName);
    this.log('trigger', unit.name + L('ui.cfb26dec4e12') + candidate.def.name + L('ui.b76289a5db6d'), { side: unit.side });
    const ctx = this.createContext(unit, null, [unit], { eventData: { target: unit, source }, effectId: candidate.def.id, fatalGuard: true, eventName });
    ctx.fatalGuard = true;
    this.executeSteps(candidate.def.steps || [], ctx);
    this.notifyGlobalEvent('effect', { unit, effectId: candidate.def.id, sourceEvent: eventName });
    return !!ctx.immune;
  }

  getDamageRedirectProtector(target) {
    if (!target || !target.alive || !target.onField) return null;
    const side = this.sides[target.side];
    if (!side) return null;
    for (const unit of side.units) {
      if (unit === target || !unit.alive || !unit.onField) continue;
      if (this.getUnitSkills(unit).some(skill => skill.damageRedirect)) return unit;
    }
    return null;
  }

  dealProtectedDamage(source, target, protector, baseAmount, damageType, options) {
    const redirectSkill = this.getUnitSkills(protector).find(skill => skill.damageRedirect) || {};
    const ratio = Math.max(1, Number(redirectSkill.damageRedirectRatio) || 5);
    const floor = Math.max(0, Number(redirectSkill.damageRedirectFloor) || 1);
    const atOne = target.hp <= floor;
    const first = this.dealDamage(source, target, baseAmount, damageType, Object.assign({}, options, { skipIntercept: true, hpFloor: floor }));
    if (!first.hit) return first;
    if (!atOne) return first;
    const cost = Math.max(0, Math.round(first.amount * ratio));
    let protectorResult = null;
    if (cost > 0 && protector.alive && protector.onField) {
      this.log('effect', protector.name + L('ui.84b0a0e5244a') + target.name + L('ui.c60b211a9036') + cost + L('ui.b0e9f94aada5'), { side: protector.side });
      protectorResult = this.dealDamage(source, protector, cost, 'true', { skipIntercept: true, ignoreResistance: true, isAttack: false, bonus: false, interceptCost: true });
    }
    first.intercepted = true;
    first.protector = protector;
    first.protectorCost = cost;
    first.protectorResult = protectorResult;
    return first;
  }

  dealDamage(source, target, baseAmount, damageType, options) {
    options = options || {};
    if (!target || !target.alive || !target.onField) return { hit: false, amount: 0 };
    const type = DAMAGE_TYPES[damageType] ? damageType : 'physical';
    if (this.isInvincible(target)) {
      this.log('effect', target.name + L('ui.fb5cabb9a748'), { side: target.side });
      return { hit: true, target, amount: 0, actualAmount: 0, invincible: true };
    }
    if (!options.skipIntercept && type !== 'true') {
      const protector = this.getDamageRedirectProtector(target);
      if (protector) return this.dealProtectedDamage(source, target, protector, baseAmount, damageType, options);
    }
    const isBonus = !!options.bonus;
    const raw = !!(options.rawDamage || isBonus || type === 'true');
    const isAttack = !!options.isAttack && !isBonus;
    const base = Math.max(0, Number(baseAmount) || 0);
    const beforeHp = target.hp;
    const maxHp = target.maxHp;
    const attacker = source || target;
    const mods = attacker ? this.getMods(attacker) : {};
    let finalAmount = 0;
    let resistance = 0;
    let crit = false;
    let lucky = false;
    let defenseMultiplier = 1;
    let vulnerabilityRate = 0;
    if (raw) {
      finalAmount = Math.max(0, Math.round(base));
    } else {
      let damageValue = base + (Number(attacker.damageBonusFlat) || 0);
      damageValue *= 1 + (Number(attacker.damageBonus) || 0) / 100;
      damageValue *= 1 + (Number(attacker.elementBonus && attacker.elementBonus[type]) || 0) / 100;
      crit = Math.random() * 100 < (Number(attacker.critRate) || 0);
      lucky = Math.random() * 100 < (Number(attacker.luckyRate) || 0);
      if (crit) damageValue *= 1 + (Number(attacker.critDamage) || 0) / 100;
      if (lucky) damageValue *= 1 + (Number(attacker.luckyDamage) || 0) / 100;
      const level = Number(attacker.level) || 90;
      const defense = Math.max(0, Number(target.defense) || 0);
      const defensePen = Math.max(0, Number(attacker.defensePen) || 0);
      defenseMultiplier = options.ignoreDefense ? 1 : (level + 10) / (level + 10 + defense * (1 - defensePen / 100));
      resistance = options.ignoreResistance ? 0 : this.getResistance(target, type) / 100;
      const targetReduction = Math.max(0, Number(target.resistanceReduction) || 0) / 100;
      const penetration = Math.max(0, Number(attacker.penetration && attacker.penetration[type]) || 0) / 100;
      resistance = resistance * (1 - targetReduction) - penetration;
      const taken = (Number(target.damageTakenBonus) || 0) / 100;
      const vulnerable = (Number(target.vulnerability) || 0) / 100;
      vulnerabilityRate = taken * vulnerable;
      finalAmount = Math.max(0, Math.round(damageValue * defenseMultiplier * (1 - resistance) * (1 + vulnerabilityRate)));
    }

    // Apply the hit first so hits on fatal-guard units still produce a visible
    // damage number and HP drop before the guard heals them back.
    const hpFloor = Math.max(0, Number(options.hpFloor) || 0);
    target.hp = Math.min(target.hp, Math.max(hpFloor, Math.max(0, target.hp - finalAmount)));
    const afterDamageHp = target.hp;
    const actualAmount = Math.max(0, beforeHp - afterDamageHp);
    const targetSide = this.sides[target.side];
    if (targetSide) targetSide.damageTaken = (targetSide.damageTaken || 0) + actualAmount;
    if (source && source.side && source.side !== target.side) {
      const sourceSide = this.sides[source.side];
      if (sourceSide) sourceSide.damageDealt = (sourceSide.damageDealt || 0) + actualAmount;
    }
    this.damageSeq += 1;
    const visual = {
      kind: 'damage',
      uid: target.battleId,
      targetUid: target.battleId,
      targetName: target.name,
      sourceUid: source ? source.battleId : '',
      sourceName: source ? source.name : L('ui.62e951a692ff'),
      amount: finalAmount,
      actualAmount,
      type,
      damageType: type,
      isAttack,
      bonus: isBonus,
      raw,
      fixedTrue: type === 'true',
      crit,
      lucky,
      defenseMultiplier,
      resistanceRate: resistance,
      vulnerabilityRate,
      burn: !!options.isBurn || (!isAttack && !isBonus && !options.rider),
      rider: !!options.rider,
      sourceSide: source ? source.side : null,
      targetSide: target.side,
      beforeHp,
      afterHp: afterDamageHp,
      maxHp,
      lethal: afterDamageHp <= 0 && finalAmount > 0,
      defeated: false,
      guarded: false,
      finalHp: afterDamageHp,
      round: this.round
    };
    this.damageFeed.unshift(Object.assign({ id: this.damageSeq, round: this.round }, visual));
    this.damageFeed = this.damageFeed.slice(0, 16);
    const visualEntry = this.recordVisual(visual);
    if (isBonus) {
      this.log('damage', target.name + L('ui.da3a3fdf431f') + finalAmount + L('ui.714c4a3bd2cf') + DAMAGE_TYPES[type].label + L('ui.f494d63aef59') + beforeHp + ' → ' + target.hp + L('ui.df98ca476044'), { side: target.side });
      if (this.rules.showFormula !== false) {
        this.log('formula', L('ui.dd01ee7e98b5') + base + L('ui.8a77ce4db716') + finalAmount + '。', { side: target.side });
      }
    } else {
      this.log('damage', target.name + L('ui.da3a3fdf431f') + finalAmount + L('ui.3fa855be48bb') + DAMAGE_TYPES[type].label + L('ui.f494d63aef59') + beforeHp + ' → ' + target.hp + '）。', { side: target.side });
      if (this.rules.showFormula !== false) {
        const modsText = [];
        if (crit) modsText.push(L('ui.5e5427d6751f'));
        if (lucky) modsText.push(L('ui.b824742329e0'));
        if (defenseMultiplier !== 1) modsText.push(L('ui.5b1e1e2b8bb3') + defenseMultiplier.toFixed(3));
        if (resistance) modsText.push(L('ui.aa8457052a32') + (resistance * 100).toFixed(1) + '%');
        if (vulnerabilityRate) modsText.push(L('ui.c5a59cde4d38') + (vulnerabilityRate * 100).toFixed(1) + '%');
        this.log('formula', L('ui.ae7bb2ee42bc') + base + L('ui.cec11c90e7bd') + (modsText.length ? modsText.join('，') : L('ui.72077749f794')) + L('ui.29429cfaa38a') + finalAmount + '。', { side: target.side });
      }
    }

    if (actualAmount > 0) {
      this.triggerEvent('allyHpChange', { target, unit: target, amount: actualAmount, changeType: 'damage', beforeHp, afterHp: target.hp, source, sourceId: source ? source.cardId : '', isAttack }, {});
    }

    let immune = false;
    if (afterDamageHp <= 0 && !target.pendingDefeat && target.alive) {
      // Every fatal trigger on the same hit is evaluated. The unit's own
      // skills run before generic effects, so Philia093 receives her poem
      // before an external undying curse can short-circuit the chain.
      const candidates = this.getFatalGuardCandidates(target);
      for (const candidate of candidates) {
        if (!target.alive) break;
        const guarded = this.runFatalGuard(candidate, target, source);
        immune = guarded || immune;
        visual.guarded = true;
      }
      if (target.hp <= 0 && immune) {
        const restored = Math.max(1, Math.min(maxHp, beforeHp || 1));
        target.hp = restored;
        this.recordVisual({
          kind: 'heal',
          sourceUid: target.battleId,
          sourceName: target.name,
          targetUid: target.battleId,
          targetName: target.name,
          amount: restored,
          beforeHp: 0,
          afterHp: restored,
          maxHp,
          self: true,
          guard: true
        });
        this.log('effect', target.name + L('ui.7156dbc07361') + restored + '。', { side: target.side });
      }
    }

    if (isAttack && target.alive && target.hp > 0 && !target.pendingDefeat) {
      this.triggerEvent('selfAttacked', { target, source, damage: finalAmount, isAttack: true, targets: [source].filter(Boolean) });
    }
    if (isAttack) this.notifyGlobalEvent('attacked', { unit: target, source, damage: finalAmount, targets: [source].filter(Boolean) });
    if (target.hp !== beforeHp) this.notifyUnitChanged(target, 'damage', { source, beforeHp, afterHp: target.hp, amount: actualAmount });
    if (target.hp <= 0) this.markPendingDefeat(target);
    visual.finalHp = target.hp;
    visual.defeated = target.hp <= 0;
    if (visualEntry) {
      visualEntry.finalHp = visual.finalHp;
      visualEntry.defeated = visual.defeated;
      visualEntry.guarded = visual.guarded;
      visualEntry.afterHp = visual.afterHp;
    }
    if (this.damageFeed[0] && this.damageFeed[0].targetUid === target.battleId) {
      this.damageFeed[0].finalHp = visual.finalHp;
      this.damageFeed[0].defeated = visual.defeated;
      this.damageFeed[0].guarded = visual.guarded;
      this.damageFeed[0].afterHp = visual.afterHp;
    }
    return { hit: true, target, amount: finalAmount, actualAmount, beforeHp, afterHp: target.hp, bonus: isBonus, defeated: visual.defeated, guarded: visual.guarded };
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
    this.log('heal', target.name + L('ui.d97eb661bd0f') + healed + L('ui.6e486b3bfcda') + before + ' → ' + target.hp + '）。', { side: target.side });
    if (healed > 0) {
      this.recordVisual({
        kind: 'heal',
        sourceUid: source ? source.battleId : null,
        sourceName: source ? source.name : L('ui.ffc7850925e7'),
        targetUid: target.battleId,
        targetName: target.name,
        amount: healed,
        beforeHp: before,
        afterHp: target.hp,
        maxHp: target.maxHp,
        self: !!source && source === target
      });
      this.triggerEvent('allyHpChange', { target, unit: target, amount: healed, changeType: 'heal', beforeHp: before, afterHp: target.hp, source, sourceId: source ? source.cardId : '', isAttack: false }, {});
      this.notifyUnitChanged(target, 'heal', { source, beforeHp: before, afterHp: target.hp, amount: healed });
    }
    return healed;
  }

  applyStatEffect(target, stat, amount, sourceKey, sourceName, options) {
    options = options || {};
    if (!target || !target.alive) return null;
    const numeric = Number(amount);
    if (!numeric) return null;
    if (numeric < 0 && this.isNegativeImmune(target)) {
      this.log('effect', target.name + L('ui.3d424ea3ac7d') + (STAT_KEYS[stat] || stat) + '」。', { side: target.side });
      return null;
    }
    const key = '__stat__' + stat + '__' + String(sourceKey || 'system');
    let inst = target.effects.find(item => item.effectId === key);
    if (!inst) {
      inst = {
        effectId: key,
        synthetic: true,
        name: (STAT_KEYS[stat] || stat) + (numeric > 0 ? L('ui.cbc82da9bee4') : L('ui.c64b01b4d2ae')),
        type: numeric > 0 ? 'positive' : 'negative',
        removable: true,
        stackable: false,
        stackMax: 1,
        stacks: 1,
        mods: {},
        sourceUid: null,
        sourceKey: String(sourceKey || 'system'),
        description: ''
      };
      target.effects.push(inst);
    }
    inst.mods[stat] = (inst.mods[stat] || 0) + numeric;
    if (!inst.mods[stat]) {
      target.effects = target.effects.filter(item => item !== inst);
    } else {
      inst.name = (STAT_KEYS[stat] || stat) + (inst.mods[stat] > 0 ? L('ui.cbc82da9bee4') : L('ui.c64b01b4d2ae'));
      inst.type = inst.mods[stat] > 0 ? 'positive' : 'negative';
    }
    this.recalcUnit(target);
    if (!options.silent) {
      this.log('effect', target.name + (numeric > 0 ? L('ui.aab9ff183368') : L('ui.e586a196d931')) + (STAT_KEYS[stat] || stat) + L('ui.a9cd3239527f'), { side: target.side });
      this.notifyUnitChanged(target, 'stat', { stat, amount: numeric });
    }
    return inst;
  }

  statModKey(key) {
    const map = {
      dmgFlat: 'damageBonusFlat', finalDmgFlat: 'damageBonusFlat',
      dmgPct: 'damageBonus', finalDmgPct: 'damageBonus',
      maxHpFlat: 'hpFlat',
      takenPct: 'damageTakenBonus', takenFlat: 'damageTakenBonus'
    };
    return map[key] || key;
  }

  applyModBundle(target, sourceKey, name, mods, options) {
    if (!target || !mods) return;
    for (const key of Object.keys(mods)) {
      let value = Number(mods[key]);
      if (!Number.isFinite(value) || !value) continue;
      if (key === 'takenFlat') value = -value * 10;
      this.applyStatEffect(target, this.statModKey(key), value, sourceKey, name, options);
    }
  }

  removeSourceEffects(target, sourcePrefix) {
    if (!target) return;
    const ids = target.effects
      .filter(inst => inst.synthetic && String(inst.sourceKey || '').startsWith(sourcePrefix))
      .map(inst => inst.effectId);
    for (const id of ids) this.removeEffect(target, id, 999, true);
    if (ids.length) this.recalcUnit(target);
  }

  applyRuneEffects(unit, options) {
    if (!unit) return;
    const side = this.getSideOf(unit);
    for (const rune of side.runes) {
      if (rune.faction !== 'any' && rune.faction !== unit.card.faction) continue;
      this.applyModBundle(unit, 'rune:' + rune.id, rune.name, rune.mods, options);
    }
  }

  syncRuneEffects(sideId) {
    const side = this.sides[sideId];
    if (!side) return;
    for (const unit of side.units) {
      this.removeSourceEffects(unit, 'rune:');
      this.applyRuneEffects(unit, { silent: true });
      this.recalcUnit(unit);
    }
  }

  syncAuraEffects(sideId) {
    const side = this.sides[sideId];
    if (!side) return;
    for (const unit of side.units) this.removeSourceEffects(unit, 'aura:');
    for (const unit of side.units) {
      for (const ally of side.units) {
        if (!ally.alive || !ally.onField) continue;
        for (const skill of this.getUnitSkills(ally)) {
          if (skill.type !== 'passive' || !skill.aura) continue;
          this.applyModBundle(unit, 'aura:' + skill.id, skill.name, skill.aura, { silent: true });
        }
      }
      this.recalcUnit(unit);
    }
  }

  addEffect(target, effectId, stacks, sourceUnit, options) {
    options = options || {};
    const def = this.maps.effects.get(effectId);
    if (!def || !target || !target.alive) return null;
    if (def.type === 'negative' && this.isNegativeImmune(target)) {
      this.log('effect', target.name + L('ui.3d424ea3ac7d') + def.name + '」。', { side: target.side });
      return null;
    }
    const amount = Math.max(1, Number(stacks) || 1);
    let inst = target.effects.find(item => item.effectId === effectId);
    if (inst) {
      if (!def.stackable) {
        this.log('effect', target.name + L('ui.a568f0c3d76f') + def.name + '」。', { side: target.side });
        return inst;
      }
      inst.stacks = Math.min(def.stackMax || 99, inst.stacks + amount);
    } else {
      inst = { effectId, stacks: Math.min(def.stackMax || 99, amount), sourceUid: sourceUnit ? sourceUnit.battleId : null, appliedRound: this.round };
      target.effects.push(inst);
    }
    this.recalcUnit(target);
    if (def.setUncounted && target.counted) {
      inst.countedBefore = true;
      target.counted = false;
      this.log('effect', target.name + L('ui.41f075bb5295') + def.name + L('ui.3c3304162289'), { side: target.side });
    }
    if (!options.silent) this.log('effect', target.name + L('ui.c381f23de046') + def.name + '」' + (def.stackable ? ' ×' + inst.stacks : '') + '。', { side: target.side });
    this.triggerImmediateEffect(target, def, sourceUnit || target);
    this.notifyUnitChanged(target, 'effect', { effectId: def.id, source: sourceUnit || target, stacks: inst.stacks });
    return inst;
  }

  triggerImmediateEffect(target, def, sourceUnit) {
    if (!def || !def.trigger || def.trigger.event !== 'immediate') return;
    if (!target || !target.alive) return;
    if (this.triggerDepth >= ENGINE_LIMITS.triggerDepth) return;
    const ctx = this.createContext(target, null, [target], {
      eventData: { target, source: sourceUnit || target, effectId: def.id },
      effectId: def.id,
      eventName: 'immediate'
    });
    if (def.trigger.condition && !this.evalFormula(def.trigger.condition, ctx)) return;
    this.triggerDepth += 1;
    try {
      this.pushTrigger(target, L('ui.151ddd4f1f9f'), def.name, 'immediate');
      this.log('trigger', target.name + L('ui.ac2c192ca1de') + def.name + '」。', { side: target.side });
      const visualStart = this.visualSeq;
      this.executeSteps(def.steps || [], ctx);
      this.notifyGlobalEvent('effect', { unit: target, effectId: def.id, sourceEvent: 'immediate' });
      if (this.visualSeq === visualStart) {
        this.recordVisual({
          kind: 'effect', action: 'trigger', sourceUid: target.battleId, targetUid: target.battleId,
          sourceName: target.name, targetName: target.name, self: true,
          name: def.name, effectType: def.type || 'special',
          sourceSide: target.side, targetSide: target.side
        });
      }
    } finally {
      this.triggerDepth -= 1;
    }
  }

  removeTypedEffects(target, effectType, all, force) {
    const removed = [];
    if (!target) return removed;
    for (const inst of target.effects.slice()) {
      const def = this.effectDef(inst);
      if (!def || def.type !== effectType) continue;
      if (def.removable === false && !force) continue;
      const amount = all ? 9999 : 1;
      if (this.removeEffect(target, inst.effectId, amount, force)) {
        removed.push({ target, def });
        if (!all) break;
      }
    }
    return removed;
  }

  removeEffect(target, effectId, amount, force) {
    if (!target) return false;
    const inst = target.effects.find(item => item.effectId === effectId);
    const def = this.maps.effects.get(effectId) || (inst && inst.synthetic ? inst : null);
    if (!def || !inst) return false;
    if (def.removable === false && !force) {
      this.log('effect', '「' + def.name + L('ui.65ee0b6d9296'), { side: target.side });
      return false;
    }
    inst.stacks -= Math.max(0, Number(amount) || 0);
    if (inst.stacks <= 0) {
      target.effects = target.effects.filter(item => item !== inst);
      if (def.setUncounted && inst.countedBefore) target.counted = true;
      this.log('effect', target.name + L('ui.cfb26dec4e12') + def.name + L('ui.f940cfab0feb'), { side: target.side });
    } else {
      this.log('effect', target.name + L('ui.cfb26dec4e12') + def.name + L('ui.80595da7dc75') + inst.stacks + L('ui.2a5cc5eb3fb6'), { side: target.side });
    }
    this.recalcUnit(target);
    if (Math.max(0, Number(amount) || 0) > 0) this.notifyUnitChanged(target, 'effect', { effectId, removed: inst.stacks <= 0 });
    return true;
  }

  prepareUnit(unitId) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: L('ui.862131328faa') };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: L('ui.88e43057508b') };
    if (unit.side !== this.currentSide) return { ok: false, error: L('ui.b7e6b7681b4c') };
    if (unit.acted) return { ok: false, error: L('ui.87910350093c') };
    if (unit.pendingDefeat || !unit.alive) return { ok: false, error: L('ui.96165073931e') };
    if (!unit.actionStarted) {
      unit.actionStarted = true;
      this.actionStartedFor = unit.battleId;
      this.log('turn', unit.name + L('ui.29e90092b3c2'), { side: unit.side });
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
    if (this.status !== 'active') return { ok: false, error: L('ui.7e003f486821') };
    if (this.phase !== 'awaiting') return { ok: false, error: L('ui.61932d0665cf') };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: L('ui.88e43057508b') };
    if (unit.side !== this.currentSide) return { ok: false, error: L('ui.a3bf27d4972c') };
    if (unit.acted) return { ok: false, error: L('ui.87910350093c') };
    const skill = this.getSkillForUnit(unit, skillId);
    if (!skill) return { ok: false, error: L('ui.84632c148404') };
    if (skill.type !== 'active') return { ok: false, error: L('ui.419b22d7ba15') };
    const state = this.getSkillState(unit, skill);
    if (!state.usable) return { ok: false, error: state.reason };
    const chosen = this.resolveChosenTargets(unit, skill, targetUid);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !chosen.length) return { ok: false, error: L('ui.546e45d369c5') };
    if ((mode === 'allEnemies') && !chosen.length) return { ok: false, error: L('ui.104e3d0d8d59') };
    if (!unit.alive || unit.acted) return { ok: false, error: L('ui.8fd61ed3c843') };
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
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: L('ui.476292a5497a') };
    const unit = this.getUnit(unitId);
    if (!unit) return { ok: false, error: L('ui.88e43057508b') };
    const skill = this.getSkillForUnit(unit, skillId);
    if (!skill || skill.type !== 'extra') return { ok: false, error: L('ui.8f2b7be4cdbf') };
    const state = this.getSkillState(unit, skill);
    if (!state.usable) return { ok: false, error: state.reason };
    const chosen = this.resolveChosenTargets(unit, skill, targetUid);
    const mode = skill.targetMode || 'none';
    if ((mode === 'enemy' || mode === 'ally') && !chosen.length) return { ok: false, error: L('ui.546e45d369c5') };
    this.phase = 'resolving';
    this.beginBatch();
    this.log('extra', unit.name + L('ui.6d9e4cc6da7f') + skill.name + L('ui.b46f99906963'), { side: unit.side });
    this.executeSkill(unit, skill, chosen, { countAsAttack: true, applyActionEffects: true });
    this.endBatch();
    this.phase = this.status === 'active' ? 'awaiting' : 'ended';
    if (this.status === 'active') this.ensureActionable();
    return { ok: true };
  }

  passAction(unitId) {
    if (this.status !== 'active' || this.phase !== 'awaiting') return { ok: false, error: L('ui.895c47024b8c') };
    const unit = this.getUnit(unitId);
    if (!unit || unit.side !== this.currentSide || unit.acted) return { ok: false, error: L('ui.d7d79a0c0601') };
    if (!unit.actionStarted) {
      const prep = this.prepareUnit(unitId);
      if (!prep.ok) return prep;
      if (prep.skipped) return { ok: true };
    }
    unit.acted = true;
    this.log('turn', unit.name + L('ui.29c1c3eb5ec4'), { side: unit.side });
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
    if (guard >= 8) this.log('system', L('ui.b01227638bfb'));
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
      this.log('turn', L('ui.7122c31651d7') + unit.name + L('ui.dcec5737e379'), { side: unit.side });
      this.pushTrigger(unit, L('ui.151ddd4f1f9f'), L('ui.5d5d29c6a7ac'), 'roundEnd');
      this.recordVisual({
        kind: 'effect',
        action: 'trigger',
        sourceUid: unit.battleId,
        targetUid: unit.battleId,
        sourceName: unit.name,
        targetName: unit.name,
        self: true,
        name: L('ui.5d5d29c6a7ac'),
        effectType: 'positive',
        sourceSide: unit.side,
        targetSide: unit.side
      });
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
    this.log('round', L('ui.f495347d6acf') + this.round + L('ui.de1041c3c441'), {});
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
      this.log('round', L('ui.f495347d6acf') + this.round + L('ui.5876e5b2563f'), {});
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
      this.log('system', L('ui.f47b4af92082') + this.sides[this.currentSide].name + '。');
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
      this.finish(winnerSide, side.name + L('ui.eed93be056ec'));
      return;
    }
  }

  finish(winnerSide, reason) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.phase = 'ended';
    this.winner = winnerSide;
    this.endedAt = Date.now();
    const name = winnerSide ? this.sides[winnerSide].name : L('ui.66402ea5332d');
    this.log('victory', L('ui.fea3c47959c2') + name + L('ui.cf3109c198d0') + (reason ? ' ' + reason : ''), { side: winnerSide });
    if (typeof this.finishCallback === 'function') {
      try { this.finishCallback({ winner: winnerSide, reason, round: this.round }); }
      catch (error) { console.error(error); }
    }
  }

  surrenderSide(sideId) {
    if (this.status !== 'active') return;
    const winner = sideId === 'A' ? 'B' : 'A';
    this.finish(winner, this.sides[sideId].name + L('ui.d8041a2d905c'));
  }

  aiPlan() {
    if (this.status !== 'active' || this.phase !== 'awaiting') return null;
    const sideId = this.currentSide;
    const units = this.sides[sideId].units.filter(unit => unit.alive && !unit.acted && !unit.pendingDefeat);
    if (!units.length) return null;
    const ordered = units.slice().sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0));
    const autoUnit = ordered.find(unit => unit.card && unit.card.autoAttack);
    if (autoUnit) return this.autoUnitPlan(autoUnit);
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
