/* CaeRogue - application shell, navigation, and primary screens. */
'use strict';

/* ---------- Shared render helpers ---------- */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value) { return esc(value); }

function qualityClass(quality) {
  return 'quality-' + (QUALITIES[quality] ? quality : 'white');
}

function qualityBadge(quality) {
  const q = getQuality(quality);
  return '<span class="quality-badge ' + qualityClass(q.id) + '" aria-hidden="true"></span>';
}

function cardTypeLabel(type) {
  return { unit: '角色', equipment: '装备', rune: '符文' }[type] || '卡牌';
}

function cardArt(card, fallback) {
  if (card && card.art) return card.art;
  if (card && card.type === 'rune') return 'assets/pictures/rune-art.svg';
  if (card && card.type === 'equipment') return 'assets/pictures/equipment-soap.svg';
  return fallback || 'assets/pictures/card-back.svg';
}

function itemTypeOf(card) {
  if (!card) return 'unit';
  if (card.type === 'equipment' || card.type === 'rune' || card.type === 'unit') return card.type;
  return 'unit';
}

function getPackLabel(packId) {
  const pack = Store.allPacks().find(p => p.id === packId);
  return pack ? pack.name : (packId || '未归属');
}

function modSummary(mods, compact) {
  if (!mods) return '';
  const entries = Object.keys(mods).filter(key => Number(mods[key])).map(key => {
    const value = Number(mods[key]);
    const label = STAT_KEYS[key] || key;
    return label + (value > 0 ? ' +' : ' ') + value + (key.toLowerCase().includes('pct') ? '%' : '');
  });
  if (!entries.length) return '';
  return compact ? entries.join('，') : entries.join('　');
}

function skillTypeLabel(type) { return SKILL_TYPES[type] ? SKILL_TYPES[type].label : type; }
function skillOpLabel(op) { return SKILL_OPS[op] ? SKILL_OPS[op].label : op; }
function opClass(op) { return ['attack', 'heal', 'support', 'debuff', 'special'].includes(op) ? op : 'special'; }
function triggerLabel(event) { return getTriggerLabel(event); }

function stepLabel(step) {
  if (!step) return '空步骤';
  if (step.kind === 'damage' && step.bonus) return '附加伤害';
  const meta = STEP_LIBRARY.find(item => item.kind === step.kind);
  return meta ? meta.name : step.kind;
}

function stepSummary(step) {
  if (!step) return '';
  switch (step.kind) {
    case 'damage':
      return (step.bonus ? '附加伤害 · ' : '') + (DAMAGE_TYPES[step.damageType] || DAMAGE_TYPES.physical).label + ' ' + (step.formula || '0') + '，' + (TARGET_MODES[step.target || 'chosen'] ? (step.target === 'chosen' ? '选定目标' : step.target) : (step.target || '选定目标'));
    case 'heal': return '回复 ' + (step.formula || '0');
    case 'addEffect': return '附加 ' + (step.effectId || '未引用') + ' ×' + (step.stacks || '1');
    case 'removeEffect': return '移除 ' + (step.effectId || '全部效果');
    case 'modifyCount': return (COUNT_SCOPES[step.scope] || COUNT_SCOPES.unit).label + ' ' + (step.countId || '未设置') + ' ' + (step.mode === 'set' ? '=' : '+') + ' ' + (step.formula || '0');
    case 'readCount': return '读取计数到 ' + (step.varName || 'value');
    case 'branch': return '条件 ' + (step.left || '0') + ' ' + (step.op || '>=') + ' ' + (step.right || '0');
    case 'selectTarget': return '选择目标 ' + (TARGET_MODES[step.mode] ? TARGET_MODES[step.mode].label : (step.mode || ''));
    case 'forEach': return '遍历 ' + (step.source || 'chosen');
    case 'loop': return '循环 ' + (step.times || '1') + ' 次';
    case 'castSkill': return '释放 ' + (step.skillId || '未引用');
    case 'skipAction': return '跳过一次行动';
    case 'immuneDamage': return '免疫此次伤害';
    case 'forceRetreat': return '强制退场';
    case 'summon': return '召唤 ' + (step.unitId || '未引用') + ' ×' + (step.count || '1');
    case 'modifyStat': return '修改 ' + (STAT_KEYS[step.stat] || step.stat || '属性');
    case 'setVar': return '变量 ' + (step.varName || 'value') + ' = ' + (step.formula || '0');
    default: return meta ? meta.name : step.kind;
  }
}

function renderFlowTree(steps, depth) {
  depth = depth || 0;
  if (!Array.isArray(steps) || !steps.length) {
    return '<div class="flow-tree"><div class="ft-row"><span class="ft-index">—</span><span class="faint">没有步骤</span></div></div>';
  }
  let html = '<div class="flow-tree">';
  steps.forEach((step, index) => {
    html += '<div class="ft-row"><span class="ft-index">' + String(index + 1).padStart(2, '0') + '</span><span class="ft-label">' + esc(stepLabel(step)) + '</span><span>' + esc(stepSummary(step)) + '</span></div>';
    if (step.kind === 'branch') {
      if (step.then && step.then.length) html += '<div class="ft-branch"><span class="tiny faint">是</span>' + renderFlowTreeInner(step.then, depth + 1) + '</div>';
      if (step.elseSteps && step.elseSteps.length) html += '<div class="ft-branch"><span class="tiny faint">否</span>' + renderFlowTreeInner(step.elseSteps, depth + 1) + '</div>';
    }
    if ((step.kind === 'forEach' || step.kind === 'loop') && step.steps && step.steps.length) {
      html += '<div class="ft-branch">' + renderFlowTreeInner(step.steps, depth + 1) + '</div>';
    }
  });
  html += '</div>';
  return html;
}
function renderFlowTreeInner(steps, depth) {
  if (depth > 5) return '<div class="ft-row faint">嵌套层级过深</div>';
  let html = '';
  steps.forEach((step, index) => {
    html += '<div class="ft-row"><span class="ft-index">' + String(index + 1).padStart(2, '0') + '</span><span class="ft-label">' + esc(stepLabel(step)) + '</span><span>' + esc(stepSummary(step)) + '</span></div>';
    if ((step.kind === 'branch' || step.kind === 'forEach' || step.kind === 'loop')) {
      const children = step.kind === 'branch' ? (step.then || []).concat(step.elseSteps || []) : (step.steps || []);
      if (children.length) html += '<div class="ft-branch">' + renderFlowTreeInner(children, depth + 1) + '</div>';
    }
  });
  return html;
}

function requirementSummary(skill) {
  if (!skill || !skill.requirements || !skill.requirements.length) return '无额外释放条件';
  return skill.requirements.map(req => {
    const scope = COUNT_SCOPES[req.scope || 'unit'] ? COUNT_SCOPES[req.scope || 'unit'].label : '计数';
    const opMap = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', neq: '≠' };
    return scope + '「' + (req.countId || '未设置') + '」' + (opMap[req.op] || '≥') + (req.value == null ? '0' : req.value);
  }).join('；');
}

function renderSkillDetailCard(skill) {
  if (!skill) return '';
  return '' +
    '<div class="skill-detail-card">' +
      '<div class="skill-detail-head">' +
        '<span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span>' +
        '<strong>' + esc(skill.name) + '</strong>' +
        '<span class="op-badge ' + opClass(skill.op) + '">操作 ' + esc(skillOpLabel(skill.op)) + '</span>' +
      '</div>' +
      '<div class="skill-detail-desc">' + esc(skill.description || '尚无描述。') + '</div>' +
      '<div class="trigger-line" style="padding: 0 9px 4px">' +
        '<span>触发：' + esc(triggerLabel(skill.trigger && skill.trigger.event)) + '</span>' +
        (skill.requirements && skill.requirements.length ? '<span class="cond">条件：' + esc(requirementSummary(skill)) + '</span>' : '') +
      '</div>' +
      '<div class="skill-flow-mini">' + (skill.steps || []).slice(0, 4).map((step, index) => '<span class="flow-mini-step">' + (index + 1) + ' ' + esc(stepLabel(step)) + '</span>').join('<span class="flow-mini-arrow">›</span>') + ((skill.steps || []).length > 4 ? '<span class="flow-mini-arrow">…</span>' : '') + '</div>' +
      '<details class="skill-flow-details"><summary>流程结构预览</summary>' + renderFlowTree(skill.steps) + '</details>' +
    '</div>';
}

function renderCardDetail(card, type, options) {
  options = options || {};
  const packName = getPackLabel(card.packId);
  let stats = '';
  if (type === 'unit') {
    stats = '<div class="kv-grid">' +
      '<div class="kv"><span class="k">生命</span><span class="v">' + esc(card.hp) + (card.maxHpCap ? '（上限 ' + esc(card.maxHpCap) + '）' : '') + '</span></div>' +
      '<div class="kv"><span class="k">攻击力</span><span class="v">' + esc(card.attack == null ? 0 : card.attack) + '</span></div>' +
      '<div class="kv"><span class="k">抗性</span><span class="v">' + esc((RESISTANCE_TYPES[card.resistance.type] || { label: '通用抗性' }).label) + ' ' + esc(card.resistance.value) + '</span></div>' +
      '<div class="kv"><span class="k">是否计数</span><span class="v">' + (card.counted === false ? '不计数' : '计数') + '</span></div>' +
      '</div>';
  } else if (type === 'equipment') {
    stats = '<div class="kv-grid">' +
      '<div class="kv"><span class="k">种类</span><span class="v">' + (card.slot === 'weapon' ? '武器' : '饰品') + '</span></div>' +
      '<div class="kv"><span class="k">数值</span><span class="v">' + esc(modSummary(card.mods) || '无') + '</span></div>' +
      '</div>';
  } else {
    stats = '<div class="kv-grid">' +
      '<div class="kv"><span class="k">适用范围</span><span class="v">' + (card.faction === 'any' ? '全部阵营' : esc(card.faction)) + '</span></div>' +
      '<div class="kv"><span class="k">数值</span><span class="v">' + esc(modSummary(card.mods) || '无') + '</span></div>' +
      '</div>';
  }
  const skillIds = card.skills || card.grantedSkills || [];
  const skills = (skillIds || []).map(id => Store.index.maps.skills.get(id)).filter(Boolean);
  return '' +
    '<article class="card-detail">' +
      '<div class="card-detail-art">' +
        '<span class="detail-q">' + qualityBadge(card.quality) + '</span>' +
        '<img src="' + attr(cardArt(card)) + '" alt="' + attr(card.name) + ' 的卡面">' +
        '<span class="detail-art-label">' + esc(cardTypeLabel(type)) + ' / ' + esc(packName) + '</span>' +
      '</div>' +
      '<div class="card-detail-body">' +
        '<div class="detail-title-row"><div><h2>' + esc(card.name) + '</h2><p class="detail-subline">' + esc(card.id) + '</p></div></div>' +
        '<p class="detail-flavor">' + esc(card.flavor || card.description || '暂无档案记录。') + '</p>' +
        stats +
        (skills.length ? '<div class="detail-section-title">技能档案<span class="line"></span></div><div class="skill-detail-list">' + skills.map(renderSkillDetailCard).join('') + '</div>' : '') +
        (options.actions || '') +
      '</div>' +
    '</article>';
}

function renderStepMini(steps) {
  return (steps || []).map(step => '<span class="flow-mini-step">' + esc(stepLabel(step)) + '</span>').join('<span class="flow-mini-arrow">›</span>') || '<span class="faint tiny">空流程</span>';
}

/* ---------- App ---------- */
const App = {
  route: 'home',
  setupMode: 'versus',
  setup: null,
  builder: null,
  library: {
    type: 'all', quality: 'all', search: '', selectedType: 'unit', selectedId: 'catgirl_jk'
  },
  battle: null,
  battleUI: null,
  battleContext: null,
  _resultShownFor: null,
  _aiTimer: null,
  _toastTimers: [],
  modalOpen: false,
  _modalConfirm: null,
  _lastBuilderResults: null,
  workshopSelected: null,

  init() {
    Store.init();
    document.body.classList.toggle('reduce-motion', !!Store.state.settings.reduceMotion);
    this.bindEvents();
    const route = this.parseRoute();
    this.enterRoute(route || 'home', true);
  },

  parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
    const allowed = ['home', 'setup', 'builder', 'library', 'battle', 'editor', 'expansions', 'workshop', 'settings', 'rogue', 'challenge', 'endless'];
    return allowed.includes(raw) ? raw : 'home';
  },

  go(route) {
    if (!route) route = 'home';
    const target = '#/' + route;
    if (location.hash === target) {
      this.enterRoute(route);
      return;
    }
    location.hash = target;
  },

  enterRoute(route, initial) {
    this.clearAiTimer();
    if (this.route !== route) this.cancelBattleFx();
    this.closeModal(true);
    if (route === 'battle' && !this.battle) route = 'home';
    if (route === 'builder' && !this.builder) route = this.setup ? 'setup' : 'home';
    if (route === 'setup' && !this.setup) route = 'home';
    if (route === 'editor' && window.EditorUI) EditorUI.enter(this);
    if (['rogue', 'challenge', 'endless'].includes(route) && window.ModesUI) ModesUI.enter(route, this);
    this.route = route;
    if (!initial) window.scrollTo({ top: 0, behavior: Store.state.settings.reduceMotion ? 'auto' : 'smooth' });
    this.render();
    if (route === 'battle') this.afterBattleRender();
    if (window.EditorUI && route === 'editor') EditorUI.afterRender(this);
  },

  render() {
    this.renderTopbar();
    this.renderFooter();
    this.renderScreen();
    document.title = 'CaeRogue · ' + this.routeTitle();
  },

  routeTitle() {
    const titles = {
      home: '主菜单', setup: '对战配置', builder: '牌组构筑', library: '卡牌库',
      battle: '战斗', editor: '技能与效果编辑器', expansions: '扩展包管理',
      workshop: '创意工坊', settings: '设置', rogue: '肉鸽', challenge: '挑战', endless: '无尽'
    };
    return titles[this.route] || '主菜单';
  },

  renderTopbar() {
    const idx = Store.index;
    const top = document.getElementById('topbar');
    if (!top) return;
    let context = '';
    if (this.route === 'home') context = '<strong>主菜单</strong><span>战术档案总览</span>';
    else context = '<strong>' + esc(this.routeTitle()) + '</strong><span>' + (this.route === 'battle' && this.battle ? '第 ' + this.battle.round + ' 回合' : 'CAEROGUE / 本地实验场') + '</span>';
    top.innerHTML = '' +
      '<div class="topbar-inner">' +
        '<button class="brand" type="button" data-action="goto-home" aria-label="返回主菜单">' +
          '<img src="assets/pictures/brand-mark.svg" alt="">' +
          '<span><span class="brand-name">CAEROGUE</span><span class="brand-sub">TACTICAL CARD LAB</span></span>' +
        '</button>' +
        '<span class="topbar-divider"></span>' +
        '<div class="topbar-context"><span class="ctx-mark"></span>' + context + '</div>' +
        '<div class="topbar-spacer"></div>' +
        '<div class="topbar-stats">' +
          '<span class="top-stat">卡牌 <b>' + idx.cards + '</b></span>' +
          '<span class="top-stat">扩展 <b>' + idx.packCount + '</b></span>' +
          '<span class="top-stat">版本 <b>' + APP_VERSION + '</b></span>' +
        '</div>' +
        '<div class="topbar-actions">' +
          '<button class="top-link" type="button" data-action="goto-home">主菜单</button>' +
          '<button class="btn btn-sm" type="button" data-action="quick-battle">快速对战</button>' +
        '</div>' +
      '</div>';
  },

  renderFooter() {
    const idx = Store.index;
    const footer = document.getElementById('app-footer');
    if (!footer) return;
    footer.innerHTML = '' +
      '<div class="footer-brand"><img src="assets/pictures/brand-mark.svg" alt=""><span>CAEROGUE · 本地战术档案</span></div>' +
      '<div class="footer-mid"><span>已启用 ' + idx.packCount + ' 个扩展</span><span class="footer-line"></span><span>卡牌 ' + idx.cards + '</span><span class="footer-line"></span><span>版本 ' + APP_VERSION + '</span></div>' +
      '<div><button class="footer-link" type="button" data-action="open-route" data-route="settings">设置</button><span class="dot">·</span><button class="footer-link" type="button" data-action="open-route" data-route="expansions">扩展包</button></div>';
  },

  renderScreen() {
    const screen = document.getElementById('screen');
    if (!screen) return;
    let html = '';
    switch (this.route) {
      case 'home': html = this.renderHome(); break;
      case 'setup': html = this.renderSetup(); break;
      case 'builder': html = this.renderBuilder(); break;
      case 'library': html = this.renderLibrary(); break;
      case 'battle': html = this.renderBattle(); break;
      case 'expansions': html = this.renderExpansions(); break;
      case 'workshop': html = this.renderWorkshop(); break;
      case 'settings': html = this.renderSettings(); break;
      case 'editor': html = window.EditorUI ? EditorUI.render(this) : this.renderMissingModule('编辑器模块未载入'); break;
      case 'rogue':
      case 'challenge':
      case 'endless': html = window.ModesUI ? ModesUI.render(this.route, this) : this.renderMissingModule('模式模块未载入'); break;
      default: html = this.renderHome();
    }
    screen.innerHTML = html;
    if (this.route === 'battle' && this.battle) {
      this.scrollLogToBottom();
      this.scheduleAiIfNeeded();
    }
    if (this.route === 'workshop') this.bindWorkshopNote();
  },

  renderMissingModule(text) {
    return '<div class="page-wrap"><div class="empty-state"><img src="assets/pictures/brand-mark.svg" alt=""><h3>' + esc(text) + '</h3></div></div>';
  },

  /* ---------- Home ---------- */
  renderHome() {
    const idx = Store.index;
    const heroUnits = ['catgirl_jk', 'philia093', 'yonava'].map(id => idx.maps.units.get(id)).filter(Boolean);
    const statCards = [
      { icon: 'assets/icons/packs.svg', label: '已加载扩展包', value: idx.packCount, sub: '含内置牌组' },
      { icon: 'assets/icons/library.svg', label: '卡牌总数', value: idx.cards, sub: '角色 / 装备 / 符文' },
      { icon: 'assets/icons/editor.svg', label: '技能与高级效果', value: idx.skills.length + idx.effects.length, sub: '条可解释流程' },
      { icon: 'assets/icons/versus.svg', label: '当前版本', value: APP_VERSION, sub: '本地存档' }
    ];
    const menu = [
      { key: 'versus', action: 'open-setup', mode: 'versus', number: '01', wide: true, featured: true },
      { key: 'custom', action: 'open-setup', mode: 'custom', number: '02', wide: true },
      { key: 'rogue', action: 'open-route', route: 'rogue', number: '03' },
      { key: 'challenge', action: 'open-route', route: 'challenge', number: '04' },
      { key: 'endless', action: 'open-route', route: 'endless', number: '05' },
      { key: 'library', action: 'open-route', route: 'library', number: '06' },
      { key: 'editor', action: 'open-route', route: 'editor', number: '07' },
      { key: 'expansions', action: 'open-route', route: 'expansions', number: '08' },
      { key: 'workshop', action: 'open-route', route: 'workshop', number: '09' },
      { key: 'settings', action: 'open-route', route: 'settings', number: '10' }
    ];
    const menuHtml = menu.map(entry => {
      const mode = GAME_MODES[entry.key];
      return '<button class="menu-card' + (entry.wide ? ' wide' : '') + (entry.featured ? ' featured' : '') + '" type="button" data-action="' + entry.action + '" data-mode="' + (entry.mode || '') + '" data-route="' + (entry.route || '') + '">' +
        '<div class="mc-top"><img src="' + mode.icon + '" alt=""><span class="mc-no">' + entry.number + ' / 10</span></div>' +
        '<h3>' + esc(mode.name) + '</h3>' +
        '<p>' + esc(mode.desc) + '</p>' +
        '<span class="mc-arrow">进入 · ENTER</span>' +
      '</button>';
    }).join('');
    const heroCards = heroUnits.map((unit, index) => '<div class="hero-card">' +
      '<img class="hc-art" src="' + attr(cardArt(unit)) + '" alt="' + attr(unit.name) + '">' +
      '<div class="hc-foot"><span>' + esc(unit.name) + '</span><span class="hero-quality ' + qualityClass(unit.quality) + '" aria-hidden="true"></span></div>' +
    '</div>').join('');
    const statHtml = statCards.map(stat => '<div class="home-stat">' +
      '<img src="' + stat.icon + '" alt="">' +
      '<div class="hs-main"><div class="hs-value">' + esc(stat.value) + '</div><div class="hs-label">' + esc(stat.label) + ' <small>' + esc(stat.sub) + '</small></div></div>' +
    '</div>').join('');
    return '' +
      '<div class="home-wrap">' +
        '<section class="home-hero">' +
          '<div class="hero-copy">' +
            '<div class="hero-kicker">CARD SYSTEM / LOCAL ARCHIVE</div>' +
            '<h1>把技能写成<em>可执行的卡牌</em>。</h1>' +
            '<p class="hero-desc">一个以 HTML、CSS 与本地资产构建的浅色卡牌战术实验场。技能由触发、步骤与状态数据组成；战斗以单链式流程顺序结算。无需编写函数，也能组合出属于你的战斗逻辑。</p>' +
            '<div class="hero-actions">' +
              '<button class="btn btn-primary btn-lg" type="button" data-action="open-setup" data-mode="versus">开始面对面对战 <span aria-hidden="true">→</span></button>' +
              '<button class="btn btn-lg" type="button" data-action="open-route" data-route="library">浏览卡牌库</button>' +
            '</div>' +
            '<div class="hero-rule"><span class="dot"></span><span>单链式结算</span><span class="line"></span><span>事件队列</span><span class="line"></span><span>无异步状态写入</span></div>' +
          '</div>' +
          '<div class="hero-visual">' +
            '<img class="hero-seal" src="assets/pictures/brand-mark.svg" alt="">' +
            '<div class="hero-cards">' + heroCards + '</div>' +
            '<div class="hero-caption"><b>基础牌组 · 已装载</b><span>' + idx.units.length + ' 角色 / ' + idx.equipment.length + ' 装备 / ' + idx.runes.length + ' 符文</span></div>' +
          '</div>' +
        '</section>' +
        '<section class="home-statbar">' + statHtml + '</section>' +
        '<section class="home-section">' +
          '<div class="home-menu-head"><div><h2>战术入口</h2><p>选择一个工作区，或继续调整你的构筑。</p></div><span class="menu-index">ARCHIVE / 10 ENTRIES</span></div>' +
          '<div class="menu-grid">' + menuHtml + '</div>' +
        '</section>' +
        '<div class="home-footer-note"><span><span class="dot"></span>所有数据保存在当前浏览器本地；扩展包与分享码以 JSON 流转。</span><span>基础牌组 · 版本 ' + APP_VERSION + '</span></div>' +
      '</div>';
  },

  /* ---------- Setup ---------- */
  openSetup(mode) {
    const actual = mode === 'custom' ? 'custom' : 'versus';
    if (!this.setup || this.setup.mode !== actual || this.route !== 'builder') {
      this.setup = {
        mode: actual,
        rules: deepClone(DEFAULT_RULES),
        deckA: deepClone(Store.state.decks.A || DEFAULT_LOADOUT_A),
        deckB: deepClone(Store.state.decks.B || DEFAULT_LOADOUT_B)
      };
    }
    this.setupMode = actual;
    this.route = 'setup';
    this.go('setup');
  },

  resetSetupDecks() {
    if (!this.setup) return;
    this.setup.deckA = deepClone(DEFAULT_LOADOUT_A);
    this.setup.deckB = deepClone(DEFAULT_LOADOUT_B);
    Store.saveDeck('A', this.setup.deckA);
    Store.saveDeck('B', this.setup.deckB);
    this.render();
    this.toast('已恢复推荐构筑。', 'success');
  },

  deckCards(deck) {
    const idx = Store.index;
    return {
      units: (deck.units || []).map(id => idx.maps.units.get(id)).filter(Boolean),
      equipment: (deck.equipment || []).map(id => idx.maps.equipment.get(id)).filter(Boolean),
      runes: (deck.runes || []).map(id => idx.maps.runes.get(id)).filter(Boolean)
    };
  },

  validateDeck(deck, rules) {
    const cards = this.deckCards(deck);
    const errors = [];
    const warnings = [];
    if (!cards.units.length) errors.push('牌组中至少需要一名角色。');
    if (cards.units.length && !cards.units.some(unit => unit.counted !== false)) errors.push('牌组中没有计数角色，无法参与胜负判定。');
    const seen = new Set();
    const duplicates = [];
    for (const unit of cards.units) {
      if (seen.has(unit.id)) duplicates.push(unit.name);
      seen.add(unit.id);
    }
    if (duplicates.length && !(rules && rules.allowDuplicates)) errors.push('规则不允许重复角色：' + [...new Set(duplicates)].join('、'));
    if (cards.runes.length > 3) errors.push('每方最多装备三张符文。');
    if ((deck.units || []).length > 12) warnings.push('角色牌组较长，初始抽牌可能无法覆盖全部单位。');
    return { ok: errors.length === 0, errors, warnings, cards };
  },

  renderSetup() {
    const setup = this.setup;
    if (!setup) return this.renderMissingModule('尚未配置对局');
    const mode = GAME_MODES[setup.mode] || GAME_MODES.versus;
    const rules = setup.rules;
    const custom = setup.mode === 'custom';
    const validationA = this.validateDeck(setup.deckA, rules);
    const validationB = this.validateDeck(setup.deckB, rules);
    const deckHtml = (side, validation) => {
      const deck = side === 'A' ? setup.deckA : setup.deckB;
      const cards = validation.cards;
      const unitMinis = cards.units.slice(0, 6).map(unit => '<span class="deck-mini-card tip" data-tip="' + attr(unit.name + ' · ' + (RESISTANCE_TYPES[unit.resistance.type] || { label: '抗性' }).label + ' ' + unit.resistance.value) + '"><img src="' + attr(cardArt(unit)) + '" alt=""><span class="mini-q ' + qualityClass(unit.quality) + '"></span></span>').join('');
      const more = cards.units.length > 6 ? '<span class="deck-mini-more">+' + (cards.units.length - 6) + '</span>' : '';
      return '<div class="panel deck-side-panel">' +
        '<div class="deck-side-head"><div class="deck-side-title"><span class="side-mark ' + (side === 'B' ? 'enemy' : '') + '">' + side + '</span><div><h3>' + (side === 'A' ? '我方牌组' : '敌方牌组') + '</h3><small>' + (custom || side === 'A' ? '玩家构筑' : '玩家构筑 / 同屏操作') + '</small></div></div><span class="chip">' + cards.units.length + ' 角色</span></div>' +
        '<div class="deck-mini-row">' + (unitMinis || '<span class="faint tiny">尚未选择角色</span>') + more + '</div>' +
        '<div class="deck-side-meta">' +
          cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') +
          cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') +
          (!cards.equipment.length && !cards.runes.length ? '<span class="tiny faint">未配置装备与符文</span>' : '') +
        '</div>' +
        (validation.errors.length ? '<div class="deck-warning">' + validation.errors.map(esc).join('；') + '</div>' : '') +
        '<div class="deck-side-actions"><button class="btn btn-sm" type="button" data-action="setup-edit-deck" data-side="' + side + '">编辑牌组</button><button class="btn btn-sm btn-quiet" type="button" data-action="setup-view-deck" data-side="' + side + '">查看全部</button></div>' +
      '</div>';
    };
    const startDisabled = !validationA.ok || !validationB.ok;
    const drawDisabled = custom || !rules.drawDuringBattle;
    return '' +
      '<div class="page-wrap setup-page">' +
        '<div class="page-head">' +
          '<div class="page-head-main"><div class="page-kicker">MATCH CONFIGURATION</div><h1>' + (custom ? '自定义对战配置' : '面对面对战配置') + '</h1><p>' + (custom ? '不执行抽牌流程。双方以选定的初始构筑直接入场，规则修正与行动顺序遵循标准对战。' : '设置初始抽牌、入场上限与战斗中的补充抽牌，然后为双方确认牌组。默认由敌方先手。') + '</p></div>' +
          '<div class="page-head-side"><button class="btn" type="button" data-action="setup-reset-decks">恢复推荐构筑</button><button class="btn btn-primary" type="button" data-action="setup-start"' + (startDisabled ? ' disabled' : '') + '>进入战场</button></div>' +
        '</div>' +
        '<div class="mode-banner"><img src="' + mode.icon + '" alt=""><div><h3>' + esc(mode.name) + '</h3><p>' + esc(mode.desc) + '</p></div><span class="mode-flag">' + (custom ? '初始构筑 · 无抽牌' : '标准抽牌 · 敌方先手') + '</span></div>' +
        '<div class="setup-layout mt-2">' +
          '<div class="setup-main stack">' +
            '<section class="panel">' +
              '<div class="panel-head"><div><h3>对局规则</h3><div class="panel-sub">默认值已载入。修改只影响本局。</div></div><span class="chip">' + (custom ? '初始构筑模式' : '标准模式') + '</span></div>' +
              '<div class="panel-body"><div class="rules-grid">' +
                '<div class="rule-group-title"><span class="line"></span>入口与场地</div>' +
                '<div class="form-row"><label class="field-label">双方初始抽牌数 <small>0 - 30</small></label><div class="rule-number-wrap"><input class="input" type="number" min="0" max="30" value="' + esc(rules.initialDraw) + '" data-setup-rule="initialDraw"' + (custom ? ' disabled' : '') + '><span>张</span></div><div class="field-hint">' + (custom ? '自定义对战不执行抽牌流程。' : '牌组不足时抽取全部。') + '</div></div>' +
                '<div class="form-row"><label class="field-label">一方场上最多单位数 <small>1 - 5</small></label><div class="rule-number-wrap"><input class="input" type="number" min="1" max="5" value="' + esc(rules.maxField) + '" data-setup-rule="maxField"><span>个</span></div><div class="field-hint">场上单位达到上限后不再入场。</div></div>' +
                '<div class="form-row span-2"><div class="toggle-row"><div class="toggle-copy"><strong>允许重复角色卡</strong><small>同一名角色可以在牌组中出现多张。构筑页会即时检查。</small></div><button class="toggle" type="button" aria-pressed="' + (rules.allowDuplicates ? 'true' : 'false') + '" data-action="setup-toggle-rule" data-rule="allowDuplicates" aria-label="允许重复角色卡"></button></div></div>' +
                '<div class="form-row span-2"><div class="toggle-row"><div class="toggle-copy"><strong>角色被击败后回到可抽牌堆</strong><small>关闭时进入退场区；开启时回到抽牌堆，可再次入场。</small></div><button class="toggle" type="button" aria-pressed="' + (rules.defeatedToDeck ? 'true' : 'false') + '" data-action="setup-toggle-rule" data-rule="defeatedToDeck" aria-label="角色被击败后回到可抽牌堆"></button></div></div>' +
                '<div class="rule-group-title"><span class="line"></span>战斗中的补充抽牌</div>' +
                '<div class="form-row span-2"><div class="toggle-row" style="border-bottom:0;padding-bottom:0"><div class="toggle-copy"><strong>允许战斗中抽牌</strong><small>每经过若干回合，双方从可抽牌堆补充角色牌。</small></div><button class="toggle" type="button" aria-pressed="' + (rules.drawDuringBattle ? 'true' : 'false') + '" data-action="setup-toggle-rule" data-rule="drawDuringBattle"' + (custom ? ' disabled' : '') + ' aria-label="允许战斗中抽牌"></button></div></div>' +
                '<div class="form-row"><label class="field-label">抽牌间隔回合</label><div class="rule-number-wrap"><input class="input" type="number" min="1" max="10" value="' + esc(rules.drawInterval) + '" data-setup-rule="drawInterval"' + (drawDisabled ? ' disabled' : '') + '><span>回合</span></div></div>' +
                '<div class="form-row"><label class="field-label">单次抽牌数</label><div class="rule-number-wrap"><input class="input" type="number" min="1" max="8" value="' + esc(rules.drawCount) + '" data-setup-rule="drawCount"' + (drawDisabled ? ' disabled' : '') + '><span>张</span></div></div>' +
                '<div class="form-row span-2"><div class="notice info">初始入场后，空缺位置由玩家点击手动补入；自动控制方会自行补牌。装备默认不穿戴，可在自己的行动中穿戴或销毁，不结束行动；符文可随时配置。装备与符文都不进入抽牌堆。</div></div>' +
              '</div></div>' +
            '</section>' +
            '<section class="panel"><div class="panel-head"><div><h3>双方构筑</h3><div class="panel-sub">按 ID 引用角色、技能、高级效果、装备与符文。</div></div><button class="btn btn-sm" type="button" data-action="open-route" data-route="library">打开卡牌库</button></div><div class="panel-body"><div class="deck-overview">' + deckHtml('A', validationA) + deckHtml('B', validationB) + '</div></div></section>' +
          '</div>' +
          '<aside class="setup-aside">' +
            '<section class="panel start-panel"><div class="panel-head"><div><h3>对局摘要</h3><div class="panel-sub">确认后立即进入战斗</div></div><img src="' + mode.icon + '" alt="" width="29" height="29" style="border-radius:5px"></div>' +
              '<div class="panel-body">' +
                '<div class="start-rule"><span>模式</span><b>' + esc(mode.short) + '</b></div>' +
                '<div class="start-rule"><span>先手方</span><b>敌方 / B</b></div>' +
                '<div class="start-rule"><span>初始抽牌</span><b>' + (custom ? '不抽牌' : rules.initialDraw + ' 张') + '</b></div>' +
                '<div class="start-rule"><span>场地上限</span><b>' + rules.maxField + ' 单位</b></div>' +
                '<div class="start-rule"><span>重复角色</span><b>' + (rules.allowDuplicates ? '允许' : '不允许') + '</b></div>' +
                '<div class="start-rule"><span>战斗中抽牌</span><b>' + (custom ? '关闭' : rules.drawDuringBattle ? '开启' : '关闭') + '</b></div>' +
                '<div class="mt-2"><div class="validity-list">' +
                  '<span class="chip ' + (validationA.ok ? 'green' : 'red') + '">我方 ' + (validationA.ok ? '可出战' : '需调整') + '</span>' +
                  '<span class="chip ' + (validationB.ok ? 'green' : 'red') + '">敌方 ' + (validationB.ok ? '可出战' : '需调整') + '</span>' +
                '</div></div>' +
                (validationA.errors.length || validationB.errors.length ? '<div class="notice danger mt-2">' + [...validationA.errors, ...validationB.errors].map(esc).join('；') + '</div>' : '') +
                '<div class="start-cta"><button class="btn btn-primary btn-block btn-lg" type="button" data-action="setup-start"' + (startDisabled ? ' disabled' : '') + '>进入战场</button></div>' +
                '<p class="start-caption">' + (custom ? '自定义模式将全部角色置于手牌，初始入场后空缺位置需手动补牌。' : '抽牌、入场与触发按单链式顺序结算。') + '</p>' +
              '</div>' +
            '</section>' +
            '<section class="panel"><div class="panel-head"><div><h3>本次规则优先</h3><div class="panel-sub">开局前确认</div></div></div><div class="panel-body"><div class="stack gap-sm"><div class="trigger-line"><span>退场</span><span class="arrow">›</span><span>处决</span><span class="arrow">›</span><span>击败</span></div><div class="trigger-line"><span>强制回复</span><span class="arrow">›</span><span>禁疗</span><span class="arrow">›</span><span>回复</span></div><p class="field-hint">触发与条件只在对应操作发生时判定一次；效果与技能不会按帧轮询。</p></div></div></section>' +
          '</aside>' +
        '</div>' +
      '</div>';
  },

  setupToggleRule(rule) {
    if (!this.setup) return;
    if (this.setup.mode === 'custom' && ['drawDuringBattle'].includes(rule)) return;
    this.setup.rules[rule] = !this.setup.rules[rule];
    this.render();
  },

  setupRuleInput(rule, value) {
    if (!this.setup) return;
    const numeric = ['initialDraw', 'drawInterval', 'drawCount', 'maxField'];
    if (numeric.includes(rule)) {
      let n = parseInt(value, 10);
      if (!Number.isFinite(n)) n = DEFAULT_RULES[rule];
      const min = { initialDraw: 0, drawInterval: 1, drawCount: 1, maxField: 1 }[rule];
      const max = { initialDraw: 30, drawInterval: 10, drawCount: 8, maxField: 5 }[rule];
      n = Math.max(min, Math.min(max, n));
      this.setup.rules[rule] = n;
    }
  },

  setupStart() {
    if (!this.setup) return;
    const { deckA, deckB, rules, mode } = this.setup;
    const validationA = this.validateDeck(deckA, rules);
    const validationB = this.validateDeck(deckB, rules);
    if (!validationA.ok || !validationB.ok) {
      this.toast([...validationA.errors, ...validationB.errors].join('；'), 'error', '无法开始');
      return;
    }
    Store.saveDeck('A', deckA);
    Store.saveDeck('B', deckB);
    const custom = mode === 'custom';
    this.startBattle({
      loadouts: { A: deepClone(deckA), B: deepClone(deckB) },
      rules: Object.assign({}, rules, { showFormula: Store.state.settings.showFormula }),
      controllers: { A: 'human', B: 'human' },
      mode,
      noDraw: custom,
      context: { mode, source: 'setup', custom }
    });
  },

  setupViewDeck(side) {
    const deck = side === 'A' ? this.setup.deckA : this.setup.deckB;
    const cards = this.deckCards(deck);
    const rows = cards.units.map(unit => '<div class="row" style="padding:6px 0;border-bottom:1px dotted var(--line)"><img src="' + attr(cardArt(unit)) + '" alt="" width="31" height="39" style="object-fit:cover;border-radius:3px;border:1px solid var(--line)"><div class="grow"><strong class="serif">' + esc(unit.name) + '</strong><div class="tiny faint">' + qualityBadge(unit.quality) + ' 生命 ' + unit.hp + ' · ' + (unit.counted === false ? '不计数' : '计数') + '</div></div><button class="btn btn-sm" type="button" data-action="library-open-card" data-type="unit" data-id="' + attr(unit.id) + '">详情</button></div>').join('');
    const gear = cards.equipment.concat(cards.runes).map(item => '<span class="chip">' + esc(item.name) + '</span>').join('') || '<span class="faint tiny">未配置</span>';
    this.openModal({ title: (side === 'A' ? '我方' : '敌方') + '完整牌组', subtitle: '角色牌进入抽牌堆；装备与符文在整备时生效。', body: '<div class="stack">' + (rows || '<p class="muted">空牌组</p>') + '<div class="detail-section-title">装备与符文<span class="line"></span></div><div class="row wrap">' + gear + '</div></div>', size: 'small' });
  },

  /* ---------- Builder ---------- */
  openBuilder(side) {
    if (!this.setup) return;
    const deck = deepClone(side === 'B' ? this.setup.deckB : this.setup.deckA);
    this.builder = {
      side: side === 'B' ? 'B' : 'A',
      deck,
      type: 'unit',
      search: '',
      selectedType: (deck.units || []).length ? 'unit' : 'unit',
      selectedId: (deck.units || [])[0] || (Store.index.units[0] && Store.index.units[0].id) || null
    };
    this.go('builder');
  },

  builderPool(type) {
    const idx = Store.index;
    const list = type === 'unit' ? idx.units : type === 'equipment' ? idx.equipment : idx.runes;
    const query = (this.builder.search || '').trim().toLowerCase();
    return list.filter(card => !query || (card.name + ' ' + card.id).toLowerCase().includes(query));
  },

  builderSelectedCard() {
    if (!this.builder) return null;
    const { selectedType, selectedId } = this.builder;
    const map = { unit: Store.index.maps.units, equipment: Store.index.maps.equipment, rune: Store.index.maps.runes }[selectedType];
    return map ? map.get(selectedId) : null;
  },

  renderBuilderPoolList() {
    if (!this.builder) return '';
    const type = this.builder.type;
    const pool = this.builderPool(type);
    const rules = this.setup ? this.setup.rules : DEFAULT_RULES;
    if (!pool.length) return '<div class="pool-empty">没有匹配的' + esc(cardTypeLabel(type)) + '。</div>';
    return pool.map(card => {
      const selected = this.builder.selectedId === card.id && this.builder.selectedType === type;
      const duplicateBlocked = type === 'unit' && !rules.allowDuplicates && (this.builder.deck.units || []).includes(card.id);
      const runeBlocked = type === 'rune' && (this.builder.deck.runes || []).length >= 3;
      const cardType = type === 'unit' ? 'unit' : type;
      return '<div class="pool-card' + (selected ? ' selected' : '') + '" data-action="builder-pick" data-type="' + cardType + '" data-id="' + attr(card.id) + '" role="button" tabindex="0">' +
        '<img class="pool-thumb" src="' + attr(cardArt(card)) + '" alt="">' +
        '<div class="pool-card-main"><strong>' + esc(card.name) + '</strong><small>' + qualityBadge(card.quality) + ' ' + (type === 'unit' ? '生命 ' + card.hp : modSummary(card.mods, true) || '无数值') + '</small></div>' +
        '<button class="pool-add" type="button" data-action="builder-add" data-type="' + cardType + '" data-id="' + attr(card.id) + '" aria-label="加入牌组"' + (duplicateBlocked || runeBlocked ? ' disabled' : '') + '>+</button>' +
      '</div>';
    }).join('');
  },

  updateBuilderPool() {
    const target = document.getElementById('builder-pool-list');
    if (target) target.innerHTML = this.renderBuilderPoolList();
    const meta = document.getElementById('builder-pool-meta');
    if (meta) meta.textContent = '共 ' + this.builderPool(this.builder.type).length + ' 项 · 点击卡牌查看详情';
  },

  renderBuilder() {
    const state = this.builder;
    if (!state) return this.renderMissingModule('建筑师未初始化');
    const rules = this.setup ? this.setup.rules : DEFAULT_RULES;
    const cards = this.deckCards(state.deck);
    const validation = this.validateDeck(state.deck, rules);
    const selected = this.builderSelectedCard();
    const typeMeta = { unit: '角色', equipment: '装备', rune: '符文' };
    const poolTabs = ['unit', 'equipment', 'rune'].map(type => '<button class="segment' + (state.type === type ? ' active' : '') + '" type="button" data-action="builder-type" data-type="' + type + '">' + typeMeta[type] + '</button>').join('');
    const deckColumn = (type) => {
      const list = cards[type];
      const labels = { units: '角色卡', equipment: '装备卡', runes: '符文卡' };
      const typeKey = type === 'units' ? 'unit' : type === 'equipment' ? 'equipment' : 'rune';
      return '<div class="deck-column">' +
        '<div class="deck-column-head"><h3>' + labels[type] + '</h3><span class="count">' + list.length + (type === 'runes' ? ' / 3' : '') + '</span></div>' +
        '<div class="deck-column-body">' +
          (list.length ? list.map(card => {
            let meta = '';
            if (typeKey === 'unit') {
              const res = RESISTANCE_TYPES[card.resistance.type] || { label: '抗性' };
              meta = '生命 ' + card.hp + ' · ' + res.label.replace('抗性', '抗') + ' ' + card.resistance.value + ' · ' + (card.counted === false ? '不计数' : '计数') + ' · 技能 ' + ((card.skills || []).length);
            } else if (typeKey === 'equipment') {
              meta = (card.slot === 'weapon' ? '武器' : '饰品') + ' · ' + (modSummary(card.mods, true) || '特效');
            } else {
              meta = (card.faction === 'any' ? '全阵营' : card.faction) + ' · ' + (modSummary(card.mods, true) || '特效');
            }
            return '<div class="deck-entry" data-action="builder-pick" data-type="' + typeKey + '" data-id="' + attr(card.id) + '" role="button" tabindex="0" title="查看技能与流程">' +
              '<img class="entry-thumb" src="' + attr(cardArt(card)) + '" alt="">' +
              '<div class="entry-main"><strong>' + esc(card.name) + '</strong><small>' + esc(meta) + '</small></div>' +
              '<button class="entry-remove" type="button" data-action="builder-remove" data-type="' + type + '" data-id="' + attr(card.id) + '" aria-label="移除">×</button></div>';
          }).join('') : '<div class="deck-column-empty"><div><span>+</span>从左侧' + labels[type] + '区添加</div></div>') +
        '</div>' +
      '</div>';
    };
    let detailAction = '';
    if (selected) {
      const selectedList = state.selectedType === 'unit' ? (state.deck.units || []) : state.selectedType === 'equipment' ? (state.deck.equipment || []) : (state.deck.runes || []);
      const inDeck = selectedList.includes(selected.id);
      const duplicateBlocked = state.selectedType === 'unit' && inDeck && !rules.allowDuplicates;
      const runeBlocked = state.selectedType === 'rune' && selectedList.length >= 3;
      const detailLabel = duplicateBlocked ? '已在牌组 · 规则不允许重复' : runeBlocked ? '符文已达上限' : inDeck ? '再加入一张' : '加入牌组';
      detailAction = '<div class="detail-actions"><button class="btn btn-primary" type="button" data-action="builder-add" data-type="' + attr(state.selectedType) + '" data-id="' + attr(selected.id) + '"' + (duplicateBlocked || runeBlocked ? ' disabled' : '') + '>' + detailLabel + '</button></div>';
    }
    const detail = selected ? renderCardDetail(selected, state.selectedType === 'unit' ? 'unit' : state.selectedType, { actions: detailAction }) : '<div class="card-detail"><div class="card-detail-body"><div class="empty-state"><img src="assets/pictures/brand-mark.svg" alt=""><h3>选择一张卡牌</h3><p>左侧卡池中点击卡牌可查看技能与流程。</p></div></div></div>';
    const duplicateRuleText = rules.allowDuplicates ? '本局允许重复角色' : '本局不允许重复角色';
    return '' +
      '<div class="page-wrap builder-page">' +
        '<div class="page-head">' +
          '<div class="page-head-main"><div class="breadcrumb"><button type="button" data-action="builder-back">对战配置</button><i></i><span>' + (state.side === 'A' ? '我方' : '敌方') + '牌组</span></div><div class="page-kicker">DECK CONSTRUCTION / SIDE ' + state.side + '</div><h1>牌组构筑</h1><p>角色、装备、符文分栏编辑。右侧档案显示技能自然语言描述与流程结构预览；所有内容以 ID 互相引用。</p></div>' +
          '<div class="page-head-side"><span class="chip ' + (validation.ok ? 'green' : 'red') + '">' + (validation.ok ? '构筑通过' : '需要调整') + '</span><button class="btn" type="button" data-action="builder-recommended">使用推荐构筑</button><button class="btn btn-primary" type="button" data-action="builder-save">保存并返回</button></div>' +
        '</div>' +
        '<div class="builder-layout">' +
          '<aside class="builder-left">' +
            '<section class="panel pool-panel">' +
              '<div class="panel-head"><div><h3>扩展卡池</h3><div class="panel-sub">' + duplicateRuleText + '</div></div></div>' +
              '<div class="panel-body">' +
                '<div class="segmented pool-tabs">' + poolTabs + '</div>' +
                '<div class="search-wrap mb-1"><input class="input compact" type="search" placeholder="搜索名称或 ID" value="' + attr(state.search) + '" data-builder-search></div>' +
                '<div class="pool-scroll" id="builder-pool-list">' + this.renderBuilderPoolList() + '</div>' +
                '<div class="pool-meta" id="builder-pool-meta">共 ' + this.builderPool(state.type).length + ' 项 · 点击卡牌查看详情</div>' +
              '</div>' +
            '</section>' +
          '</aside>' +
          '<section class="builder-center">' +
            '<div class="panel deck-board">' +
              '<div class="deck-board-head"><div class="deck-board-title"><span class="side-mark ' + (state.side === 'B' ? 'enemy' : '') + '">' + state.side + '</span><h2>' + (state.side === 'A' ? '我方牌组' : '敌方牌组') + '</h2><span class="chip">构筑</span></div>' +
                '<div class="deck-board-meta"><span class="chip">' + cards.units.length + ' 角色</span><span class="chip gold">' + cards.equipment.length + ' 装备</span><span class="chip violet">' + cards.runes.length + ' 符文</span><span class="chip ' + (validation.ok ? 'green' : 'red') + '">' + (validation.ok ? '校验通过' : '存在错误') + '</span></div></div>' +
              '<div class="deck-columns">' + deckColumn('units') + deckColumn('equipment') + deckColumn('runes') + '</div>' +
              '<div class="deck-builder-foot"><div class="validity-list">' +
                '<span class="chip ' + (validation.cards.units.some(u => u.counted !== false) ? 'green' : 'red') + '">计数角色 ' + validation.cards.units.filter(u => u.counted !== false).length + '</span>' +
                '<span class="chip ' + (cards.runes.length <= 3 ? '' : 'red') + '">符文 ' + cards.runes.length + ' / 3</span>' +
              '</div><div class="btn-row"><button class="btn" type="button" data-action="builder-back">取消</button><button class="btn btn-primary" type="button" data-action="builder-save">保存并返回</button></div></div>' +
              (validation.errors.length ? '<div class="notice danger mt-2">' + validation.errors.map(esc).join('；') + '</div>' : '') +
            '</div>' +
          '</section>' +
          '<aside class="builder-right">' + detail + '</aside>' +
        '</div>' +
      '</div>';
  },

  builderPick(type, id) {
    if (!this.builder) return;
    this.builder.selectedType = type;
    this.builder.selectedId = id;
    this.render();
  },

  builderAdd(type, id) {
    if (!this.builder) return;
    const key = type === 'unit' ? 'units' : type === 'equipment' ? 'equipment' : 'runes';
    const list = this.builder.deck[key] || (this.builder.deck[key] = []);
    const rules = this.setup ? this.setup.rules : DEFAULT_RULES;
    if (type === 'unit' && !rules.allowDuplicates && list.includes(id)) {
      this.toast('本局规则不允许重复角色卡。', 'error');
      return;
    }
    if (type === 'rune' && list.length >= 3) {
      this.toast('每方最多装备三张符文。', 'error');
      return;
    }
    const map = type === 'unit' ? Store.index.maps.units : type === 'equipment' ? Store.index.maps.equipment : Store.index.maps.runes;
    if (!map.has(id)) { this.toast('该卡牌不存在。', 'error'); return; }
    list.push(id);
    this.builder.selectedType = type;
    this.builder.selectedId = id;
    this.renderBuilderAndToast('已加入「' + map.get(id).name + '」。');
  },

  builderRemove(type, id) {
    if (!this.builder) return;
    const key = type === 'units' ? 'units' : type === 'equipment' ? 'equipment' : 'runes';
    const list = this.builder.deck[key] || [];
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    this.renderBuilderAndToast('已从牌组移除。');
  },

  renderBuilderAndToast(text) {
    this.render();
    if (text) this.toast(text, 'success');
  },

  builderSaved() {
    if (!this.builder || !this.setup) return;
    const validation = this.validateDeck(this.builder.deck, this.setup.rules);
    if (!validation.ok) {
      this.toast(validation.errors.join('；'), 'error', '构筑无法保存');
      return;
    }
    if (this.builder.side === 'A') this.setup.deckA = deepClone(this.builder.deck);
    else this.setup.deckB = deepClone(this.builder.deck);
    Store.saveDeck(this.builder.side, this.builder.deck);
    const side = this.builder.side;
    this.builder = null;
    this.go('setup');
    this.toast((side === 'A' ? '我方' : '敌方') + '牌组已保存。', 'success');
  },

  builderRecommended() {
    if (!this.builder) return;
    this.builder.deck = deepClone(this.builder.side === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    this.builder.type = 'unit';
    this.builder.selectedType = 'unit';
    this.builder.selectedId = this.builder.deck.units[0];
    this.render();
    this.toast('已载入推荐构筑。', 'success');
  },

  /* ---------- Library ---------- */
  libraryItems() {
    const idx = Store.index;
    const all = [];
    idx.units.forEach(card => all.push({ type: 'unit', card }));
    idx.equipment.forEach(card => all.push({ type: 'equipment', card }));
    idx.runes.forEach(card => all.push({ type: 'rune', card }));
    return all;
  },

  libraryFiltered() {
    const query = (this.library.search || '').trim().toLowerCase();
    return this.libraryItems().filter(item => {
      if (this.library.type !== 'all' && item.type !== this.library.type) return false;
      if (this.library.quality !== 'all' && item.card.quality !== this.library.quality) return false;
      if (query && !(item.card.name + ' ' + item.card.id).toLowerCase().includes(query)) return false;
      return true;
    });
  },

  currentLibraryCard() {
    const type = this.library.selectedType;
    const id = this.library.selectedId;
    if (type === 'skill') return Store.index.maps.skills.get(id);
    if (type === 'effect') return Store.index.maps.effects.get(id);
    const map = type === 'equipment' ? Store.index.maps.equipment : type === 'rune' ? Store.index.maps.runes : Store.index.maps.units;
    return map.get(id) || Store.index.units[0] || null;
  },

  renderLibraryResults() {
    const items = this.libraryFiltered();
    if (!items.length) return '<div class="empty-state library-empty"><img src="assets/icons/library.svg" alt=""><h3>没有匹配的卡牌</h3><p>调整关键词、类型或品质筛选。</p></div>';
    return items.map(item => {
      const card = item.card;
      const selected = this.library.selectedId === card.id && this.library.selectedType === item.type;
      let sub = '';
      let stats = '';
      if (item.type === 'unit') {
        sub = '角色 · 生命 ' + card.hp + ' · ' + (RESISTANCE_TYPES[card.resistance.type] || { label: '抗性' }).label + ' ' + card.resistance.value;
        stats = '<span class="stat"><b>' + card.hp + '</b><span>生命</span></span><span class="stat"><b>' + card.resistance.value + '</b><span>抗性</span></span><span class="chip' + (card.counted === false ? '' : ' green') + '">' + (card.counted === false ? '不计数' : '计数') + '</span>';
      } else if (item.type === 'equipment') {
        sub = '装备 · ' + (card.slot === 'weapon' ? '武器' : '饰品');
        stats = '<span class="chip gold">' + esc(modSummary(card.mods, true) || '无附加数值') + '</span>';
      } else {
        sub = '符文 · ' + (card.faction === 'any' ? '全阵营' : card.faction);
        stats = '<span class="chip violet">' + esc(modSummary(card.mods, true) || '无附加数值') + '</span>';
      }
      return '<button class="display-card ' + qualityClass(card.quality) + ' ' + (item.type === 'unit' && card.quality === 'rainbow' ? 'rainbow-frame ' : '') + (card.quality === 'gold' ? 'gold-frame ' : '') + (selected ? 'selected' : '') + '" type="button" data-action="library-select" data-type="' + item.type + '" data-id="' + attr(card.id) + '">' +
        '<div class="display-card-art"><img src="' + attr(cardArt(card)) + '" alt=""><span class="art-shade"></span><span class="quality-badge ' + qualityClass(card.quality) + '" aria-hidden="true"></span><span class="type-tag">' + cardTypeLabel(item.type) + '</span><span class="card-id">' + esc(card.id) + '</span></div>' +
        '<div class="display-card-body"><h3>' + esc(card.name) + '</h3><div class="card-sub">' + esc(sub) + '</div><div class="display-card-stats">' + stats + '</div></div>' +
      '</button>';
    }).join('');
  },

  updateLibraryResults() {
    const grid = document.getElementById('library-results');
    if (grid) grid.innerHTML = this.renderLibraryResults();
    const count = document.getElementById('library-count');
    if (count) count.textContent = this.libraryFiltered().length + ' 项结果';
  },

  renderLibrary() {
    const items = this.libraryFiltered();
    const selected = this.currentLibraryCard();
    const qualityOptions = '<div class="quality-filter" role="group" aria-label="品质筛选">' +
      '<button class="quality-choice all' + (this.library.quality === 'all' ? ' active' : '') + '" type="button" data-action="library-quality" data-quality="all" aria-label="全部品质"></button>' +
      Object.keys(QUALITIES).map(q => '<button class="quality-choice ' + qualityClass(q) + (this.library.quality === q ? ' active' : '') + '" type="button" data-action="library-quality" data-quality="' + q + '" aria-label="筛选品质 ' + QUALITIES[q].label + '"></button>').join('') +
    '</div>';
    const tabs = [{ id: 'all', label: '全部' }, { id: 'unit', label: '角色' }, { id: 'equipment', label: '装备' }, { id: 'rune', label: '符文' }].map(tab => '<button class="segment' + (this.library.type === tab.id ? ' active' : '') + '" type="button" data-action="library-type" data-type="' + tab.id + '">' + tab.label + '</button>').join('');
    let detail = '';
    if (selected) {
      if (this.library.selectedType === 'skill') {
        detail = '<article class="card-detail"><div class="card-detail-body"><div class="detail-title-row"><div><h2>' + esc(selected.name) + '</h2><p class="detail-subline">技能 · ' + esc(selected.id) + '</p></div></div>' + renderSkillDetailCard(selected) + '<div class="detail-section-title">流程结构<span class="line"></span></div>' + renderFlowTree(selected.steps) + '</div></article>';
      } else if (this.library.selectedType === 'effect') {
        detail = '<article class="card-detail"><div class="card-detail-body"><div class="detail-title-row"><div><h2>' + esc(selected.name) + '</h2><p class="detail-subline">高级效果 · ' + esc(selected.id) + '</p></div></div><p class="detail-flavor">' + esc(selected.description || '无描述') + '</p><div class="validity-list"><span class="chip">' + esc(EFFECT_TYPES[selected.type] ? EFFECT_TYPES[selected.type].label : '特殊') + '</span><span class="chip">' + (selected.removable === false ? '不可解除' : '可解除') + '</span><span class="chip">' + (selected.stackable ? '采用层数 · 上限 ' + selected.stackMax : '不采用层数') + '</span></div><div class="detail-section-title">触发与步骤<span class="line"></span></div>' + renderFlowTree(selected.steps) + '</div></article>';
      } else {
        detail = renderCardDetail(selected, this.library.selectedType);
      }
    }
    return '' +
      '<div class="page-wrap library-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">CARD ARCHIVE / ID INDEX</div><h1>卡牌库</h1><p>按 ID 检索角色、装备与符文，并查看技能的自然语言描述与完整流程结构。当前索引包含已启用的扩展包。</p></div><div class="page-head-side"><span class="chip">' + items.length + ' / ' + Store.index.cards + ' 卡牌</span><button class="btn" type="button" data-action="open-route" data-route="expansions">扩展包管理</button><button class="btn" type="button" data-action="open-route" data-route="editor">技能编辑器</button></div></div>' +
        '<div class="library-toolbar"><div class="segmented">' + tabs + '</div>' + qualityOptions + '<div class="search-wrap"><input class="input" type="search" value="' + attr(this.library.search) + '" placeholder="搜索名称或 ID" data-library-search></div><span class="result-count" id="library-count">' + items.length + ' 项结果</span></div>' +
        '<div class="library-layout">' +
          '<div class="card-grid" id="library-results">' + this.renderLibraryResults() + '</div>' +
          '<aside class="library-aside">' + (detail || '<div class="panel"><div class="panel-body"><div class="empty-state"><img src="assets/icons/library.svg" alt=""><h3>选择一张卡牌</h3><p>卡牌详情会显示在右侧。</p></div></div></div>') + '</aside>' +
        '</div>' +
      '</div>';
  },

  selectLibraryCard(type, id) {
    this.library.selectedType = type;
    this.library.selectedId = id;
    this.render();
  },

  openCardFromOther(type, id) {
    this.library.type = type === 'skill' || type === 'effect' ? 'all' : type;
    this.library.selectedType = type;
    this.library.selectedId = id;
    this.go('library');
  },

  /* Toast, modal, clipboard */
  toast(text, type, title) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.innerHTML = '<div><strong>' + esc(title || (type === 'error' ? '操作未完成' : '提示')) + '</strong><span>' + (title ? '<br>' : '') + esc(text) + '</span></div>';
    root.appendChild(el);
    const timer = setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, type === 'error' ? 5200 : 3300);
    this._toastTimers.push(timer);
    if (this._toastTimers.length > 8) this._toastTimers.shift();
  },

  openModal(options) {
    options = options || {};
    const root = document.getElementById('overlay-root');
    if (!root) return;
    const closeButton = options.closable === false ? '' : '<button class="modal-close" type="button" data-action="modal-close" aria-label="关闭">×</button>';
    root.innerHTML = '' +
      '<div class="modal-backdrop" data-action="modal-backdrop">' +
        '<section class="modal ' + (options.size === 'small' ? 'small ' : options.size === 'large' ? 'large ' : '') + '" role="dialog" aria-modal="true" aria-label="' + attr(options.title || '对话框') + '">' +
          '<div class="modal-head"><div><h2>' + esc(options.title || '') + '</h2>' + (options.subtitle ? '<p>' + esc(options.subtitle) + '</p>' : '') + '</div>' + closeButton + '</div>' +
          '<div class="modal-body">' + (options.body || '') + '</div>' +
          (options.foot ? '<div class="modal-foot">' + options.foot + '</div>' : '') +
        '</section>' +
      '</div>';
    root.classList.add('active');
    this.modalOpen = true;
    document.body.style.overflow = 'hidden';
  },

  closeModal(silent) {
    const root = document.getElementById('overlay-root');
    if (!root) return;
    root.innerHTML = '';
    root.classList.remove('active');
    this.modalOpen = false;
    this._modalConfirm = null;
    document.body.style.overflow = '';
    if (this._deploySide) this._deploySide = null;
    this._runeDraft = null;
    if (this._battleInteractionPause) {
      this._battleInteractionPause = false;
      if (this.route === 'battle' && this.battle) this.afterBattleRender();
    }
  },

  pauseBattleInteraction() {
    this.clearAiTimer();
    this._battleInteractionPause = true;
  },

  confirm(options) {
    this._modalConfirm = options.onConfirm || null;
    this.openModal({
      title: options.title || '确认操作',
      subtitle: options.subtitle || '',
      size: 'small',
      closable: true,
      body: '<p class="modal-copy">' + esc(options.message || '') + '</p>' + (options.detail ? '<div class="notice mt-2">' + esc(options.detail) + '</div>' : ''),
      foot: '<button class="btn" type="button" data-action="modal-close">取消</button><button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-action="modal-confirm">' + esc(options.confirmLabel || '确认') + '</button>'
    });
  },

  copyText(text, successMessage) {
    const done = () => this.toast(successMessage || '已复制到剪贴板。', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  },

  fallbackCopy(text, done) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      if (ok) done();
      else {
        this.openModal({ title: '手动复制', size: 'large', body: '<p class="modal-copy">浏览器无法直接访问剪贴板，请选择下方文本手动复制。</p><textarea class="textarea mono mt-2" readonly rows="7" onclick="this.select()">' + esc(text) + '</textarea>' });
      }
    } catch (error) {
      this.openModal({ title: '手动复制', size: 'large', body: '<p class="modal-copy">请选择下方文本手动复制。</p><textarea class="textarea mono mt-2" readonly rows="7" onclick="this.select()">' + esc(text) + '</textarea>' });
    }
  },

  downloadJson(filename, data) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      this.toast('已导出 ' + filename, 'success');
    } catch (error) {
      this.toast('导出失败：' + error.message, 'error');
    }
  }
};

/* ---------- Battle ---------- */
App.startBattle = function (config) {
  config = config || {};
  try {
    const settings = Store.state.settings || {};
    const rules = Object.assign({}, DEFAULT_RULES, config.rules || {}, { showFormula: settings.showFormula !== false });
    const battle = new Battle({
      loadouts: config.loadouts,
      rules,
      controllers: config.controllers || { A: 'human', B: 'ai' },
      mode: config.mode || 'versus',
      noDraw: !!config.noDraw,
      modifiers: config.modifiers || {},
      onEnd: null
    });
    this.battle = battle;
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.battleContext = Object.assign({ mode: config.mode || 'versus', source: config.source || 'setup', startedAt: Date.now() }, config.context || {});
    this._resultShownFor = null;
    this._battleFxActive = false;
    this._battleInteractionPause = false;
    this._battlePreRects = null;
    this._fxToken = (this._fxToken || 0) + 1;
    this._battleVisualCursor = battle.visualFeed.length ? battle.visualFeed[battle.visualFeed.length - 1].id : 0;
    if (window.BattleFX) BattleFX.cancel();
    this.route = 'battle';
    this.go('battle');
  } catch (error) {
    console.error(error);
    this.toast('无法建立战斗：' + error.message, 'error');
  }
};

App.battleSkillContext = function () {
  if (!this.battle || !this.battleUI || !this.battleUI.skillId) return null;
  const actorUid = this.battleUI.kind === 'extra' ? (this.battleUI.extraUid || this.battleUI.selectedUid) : this.battleUI.selectedUid;
  const actor = this.battle.getUnit(actorUid);
  if (!actor) return null;
  const skill = this.battle.getSkillForUnit(actor, this.battleUI.skillId);
  if (!skill) return null;
  return { actor, skill, kind: this.battleUI.kind };
};

App.battleTargetPreview = function () {
  const context = this.battleSkillContext();
  if (!context) return [];
  const mode = context.skill.targetMode || 'none';
  if (mode !== 'enemy' && mode !== 'ally') return [];
  return context.actor && this.battle ? this.battle.resolveTargetPreview(context.actor, context.skill) : [];
};

App.isBattleTarget = function (unit) {
  if (!unit || !unit.alive || !unit.onField) return false;
  const context = this.battleSkillContext();
  if (!context) return false;
  const mode = context.skill.targetMode || 'none';
  if (mode !== 'enemy' && mode !== 'ally') return false;
  return this.battleTargetPreview().some(item => item.battleId === unit.battleId);
};

App.phaseLabel = function () {
  if (!this.battle) return '';
  if (this.battle.status === 'ended') return '对局结束';
  return { setup: '准备中', muster: '入场阶段', awaiting: '行动阶段', resolving: '结算中', roundEnd: '回合结束', ended: '对局结束' }[this.battle.phase] || '行动阶段';
};

App.renderBattle = function () {
  if (!this.battle) return this.renderMissingModule('没有正在进行的对局');
  const battle = this.battle;
  const current = battle.currentSide ? battle.sides[battle.currentSide] : null;
  const currentController = current ? battle.controllers[current.side] : null;
  const remaining = current ? battle.getFieldUnits(current.id).filter(unit => !unit.acted).length : 0;
  const modeName = this.battleContext && GAME_MODES[this.battleContext.mode] ? GAME_MODES[this.battleContext.mode].name : '对战';
  const phase = this.phaseLabel();
  const result = battle.status === 'ended' ? this.battleResultSummary() : null;
  const customBattle = this.battleContext && this.battleContext.custom;
  const ruleTags = [
    customBattle ? '初始构筑' : battle.rules.initialDraw + ' 初始抽牌',
    battle.rules.maxField + ' 场地上限',
    battle.rules.allowDuplicates ? '允许重复' : '不重复角色'
  ];
  const winnerBanner = result ? '<div class="battle-end-banner"><img src="' + (result.playerWin ? 'assets/pictures/brand-mark.svg' : 'assets/icons/challenge.svg') + '" alt="" width="25" height="25"><div><strong>' + esc(result.title) + '</strong><br><span>' + esc(result.subtitle) + '</span></div><button class="btn btn-sm btn-gold" type="button" data-action="battle-show-result">查看结算</button></div>' : '';
  return '' +
    '<div class="battle-page' + (this._battleFxActive ? ' fx-locked' : '') + '">' +
      '<div class="battle-titlebar">' +
        '<div class="battle-title"><img src="assets/pictures/brand-mark.svg" alt=""><div><h1>对局记录 · ' + esc(modeName) + '</h1><p>本地单链式结算 · ' + esc(battle.mode) + ' · 先手方：敌方</p></div><div class="battle-rule-tags">' + ruleTags.map(tag => '<span class="chip tiny">' + esc(tag) + '</span>').join('') + '</div></div>' +
        '<div class="battle-titlebar-actions"><button class="btn btn-sm" type="button" data-action="battle-log-toggle">日志</button><button class="btn btn-sm" type="button" data-action="battle-surrender"' + (battle.status !== 'active' ? ' disabled' : '') + '>认输</button><button class="btn btn-sm" type="button" data-action="battle-leave">离开对局</button></div>' +
      '</div>' +
      '<div class="battle-statusbar' + (battle.status === 'ended' ? ' ended' : '') + '">' +
        '<div class="battle-status-item"><div class="battle-status-label">回合</div><div class="battle-status-value"><b>' + battle.round + '</b></div></div>' +
        '<div class="battle-status-item"><div class="battle-status-label">当前阶段</div><div class="battle-status-value"><span class="phase-mark"></span>' + esc(phase) + '</div></div>' +
        '<div class="battle-status-item"><div class="battle-status-label">当前行动方</div><div class="battle-status-value"><span class="side-dot ' + (battle.currentSide === 'B' ? 'enemy' : '') + '"></span><span>' + (result ? esc(result.title) : current ? esc(current.name) : '—') + '</span>' + (current && !result ? '<span class="tiny faint">' + (currentController === 'ai' ? '自动' : '玩家') + '</span>' : '') + '</div></div>' +
        '<div class="battle-status-item"><div class="battle-status-label">先手方</div><div class="battle-status-value">敌方 / B</div></div>' +
        '<div class="battle-status-item"><div class="battle-status-label">剩余可行动</div><div class="battle-status-value"><b>' + (result ? '—' : remaining) + '</b><span class="tiny faint">单位</span></div></div>' +
      '</div>' +
      winnerBanner +
      '<div class="battle-grid">' +
        this.renderBattleField('A') +
        this.renderBattleActionPanel() +
        this.renderBattleField('B') +
        this.renderBattleHand() +
        this.renderBattleRail() +
      '</div>' +
    '</div>';
};

App.renderBattleField = function (sideId) {
  const battle = this.battle;
  const side = battle.sides[sideId];
  const isActive = battle.currentSide === sideId && battle.status === 'active';
  const units = side.units.filter(unit => unit.alive && unit.onField);
  const activeSkills = this.battleSkillContext();
  const isHuman = battle.controllers[sideId] === 'human';
  const emptySlots = Math.max(0, battle.rules.maxField - units.length);
  const canDeploy = isHuman && battle.status === 'active' && battle.phase === 'awaiting' && side.hand.length > 0;
  const slotHtml = Array.from({ length: emptySlots }).map(() => canDeploy
    ? '<button class="unit-empty-slot deployable" type="button" data-action="battle-deploy-open" data-side="' + sideId + '"><span class="plus">+</span>点击补牌 · 手牌 ' + side.hand.length + '</button>'
    : '<div class="unit-empty-slot"><span class="plus">+</span>' + (battle.phase !== 'awaiting' ? '等待结算' : side.hand.length ? '等待手动补牌' : '当前无可补角色') + '</div>').join('');
  const sideLabel = sideId === 'A' ? '我方场地' : '敌方场地';
  const runeSlots = Array.from({ length: 3 }).map((_, index) => side.runes[index]
    ? '<span class="rune-mini" title="' + attr(side.runes[index].description || '') + '">' + esc(side.runes[index].name) + '</span>'
    : '<span class="rune-mini empty">+</span>').join('');
  const runeFooter = isHuman
    ? '<button class="field-runes-action" type="button" data-action="battle-rune-config" data-side="' + sideId + '"><span class="field-runes-label">符文 ' + side.runes.length + '/3</span><span class="field-runes-list">' + runeSlots + '</span><span class="field-runes-edit">配置</span></button>'
    : '<span class="field-runes-static">' + runeSlots + '</span>';
  const activeLabel = isActive ? (battle.controllers[sideId] === 'ai' ? '自动行动' : '当前行动') : '';
  return '' +
    '<section class="battle-field field-' + sideId.toLowerCase() + '">' +
      '<div class="panel field-panel' + (isActive ? ' side-active' : '') + '">' +
        '<div class="field-head">' +
          '<div class="field-head-left"><span class="field-side-mark">' + (sideId === 'A' ? '我' : '敌') + '</span><div><h2>' + sideLabel + '</h2><div class="field-sub">' + side.name + ' · ' + (isHuman ? '玩家控制' : '自动控制') + '</div></div></div>' +
          '<div class="field-status"><span class="chip ' + (isActive ? 'gold' : '') + '">' + esc(activeLabel || '待机') + '</span><span class="chip">' + units.length + '/' + battle.rules.maxField + '</span></div>' +
        '</div>' +
        '<div class="field-body"><div class="unit-stack">' + (units.length ? units.map(unit => this.renderBattleUnit(unit)).join('') : '<div class="field-empty"><span>该区域暂无单位</span><span class="tiny">单位将在回合开始或紧急轮换时入场</span></div>') + slotHtml + '</div></div>' +
        '<div class="field-footer"><span>装备 ' + side.equipmentPool.length + ' · 手牌 ' + side.hand.length + '</span>' + runeFooter + '</div>' +
      '</div>' +
    '</section>';
};

App.renderBattleUnit = function (unit) {
  const battle = this.battle;
  const ui = this.battleUI;
  const isTarget = this.isBattleTarget(unit);
  const isTargetChosen = ui.targetUid === unit.battleId;
  const isSelected = ui.selectedUid === unit.battleId && !ui.skillId;
  const isOwnTurn = battle.currentSide === unit.side && battle.status === 'active';
  const isHuman = battle.controllers[unit.side] === 'human';
  const canSelect = isOwnTurn && !unit.acted && isHuman && !ui.skillId;
  const res = battle.resistanceSummary(unit);
  const effects = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    if (!def) return '';
    return '<span class="unit-effect-chip ' + esc(def.type) + '" title="' + attr(def.description || '') + '"><span>' + esc(def.name) + '</span>' + (def.stackable ? '<b>×' + inst.stacks + '</b>' : '') + '</span>';
  }).join('');
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<span class="unit-effect-chip"><span>' + esc(battle.countLabel(key)) + '</span><b>' + unit.counts[key] + '</b></span>').join('');
  const gear = ['weapon', 'accessory'].map(slot => {
    const item = unit.equipment[slot];
    return '<span class="gear-slot' + (item ? ' filled' : '') + '" title="' + attr(slot === 'weapon' ? '武器栏' : '饰品栏') + '">' + (item ? esc(item.name) : (slot === 'weapon' ? '武器空' : '饰品空')) + '</span>';
  }).join('');
  const hpPct = Math.max(0, Math.min(100, Math.round(unit.hp / Math.max(1, unit.maxHp) * 100)));
  const baseResLabel = (RESISTANCE_TYPES[unit.card.resistance.type] || { label: '抗性' }).label;
  const classes = ['unit-card', qualityClass(unit.quality)];
  if (canSelect) classes.push('selectable');
  if (isSelected) classes.push('selected-action');
  if (isTarget) classes.push('targetable');
  if (isTargetChosen) classes.push('target-selected');
  if (unit.acted) classes.push('acted');
  if (unit.pendingDefeat) classes.push('pending-defeat');
  return '' +
    '<article class="' + classes.join(' ') + '" data-action="battle-unit" data-uid="' + attr(unit.battleId) + '" role="button" tabindex="0" aria-label="' + attr(unit.name) + '">' +
      (isTarget ? '<span class="target-flag">选择目标</span>' : '') +
      '<div class="unit-top"><div class="unit-name-wrap"><div class="unit-name"><strong>' + esc(unit.name) + '</strong><span class="unit-uid">' + esc(unit.battleId) + '</span></div><div class="unit-tags">' + qualityBadge(unit.quality) + '<span class="chip">' + (unit.counted ? '计数' : '不计数') + '</span>' + (unit.acted ? '<span class="unit-acted-label">已行动</span>' : '') + '</div></div></div>' +
      '<div class="unit-body"><div class="unit-portrait"><img src="' + attr(cardArt(unit.card)) + '" alt=""><span class="unit-counted-mark">' + (unit.counted ? '计' : '不') + '</span></div><div class="unit-info">' +
        '<div class="unit-hp-line"><span class="hp-label">生命</span><span class="hp-num' + (unit.hp < unit.maxHp ? ' hurt' : '') + '">' + unit.hp + '<small> / ' + unit.maxHp + '</small></span></div>' +
        '<div class="hp-bar' + (hpPct > 50 ? ' green' : '') + '"><span style="width:' + hpPct + '%"></span></div>' +
        '<div class="unit-statline"><span class="chip" title="' + attr('基础抗性：' + baseResLabel + ' ' + unit.card.resistance.value) + '">物抗 ' + res.physical + '</span><span class="chip">精抗 ' + res.mental + '</span><span class="stat"><span>攻</span><b>' + unit.atk + '</b></span></div>' +
      '</div></div>' +
      ((effects || counts) ? '<div class="unit-effects">' + effects + counts + '</div>' : '') +
      '<div class="unit-foot"><div class="unit-foot-left">' + gear + '</div><div class="unit-foot-actions"><button class="mini-action" type="button" data-action="battle-unit-counts" data-uid="' + attr(unit.battleId) + '">计数</button><button class="mini-action" type="button" data-action="battle-unit-gear" data-uid="' + attr(unit.battleId) + '">装备</button></div></div>' +
    '</article>';
};

App.renderBattleActionPanel = function () {
  const battle = this.battle;
  const ui = this.battleUI;
  const current = battle.currentSide ? battle.sides[battle.currentSide] : null;
  const ending = battle.status === 'ended';
  const isAi = current && battle.controllers[current.side] === 'ai';
  const pending = this.battleSkillContext();
  const actor = pending ? pending.actor : null;
  const selectedUnit = ui.selectedUid ? battle.getUnit(ui.selectedUid) : null;
  let body = '';
  let footer = '';
  if (ending) {
    const result = this.battleResultSummary();
    body = '<div class="action-empty"><img src="assets/pictures/brand-mark.svg" alt="" width="45" height="45"><h3>' + esc(result.title) + '</h3><p>' + esc(result.subtitle) + '</p><div class="btn-row" style="justify-content:center"><button class="btn btn-primary" type="button" data-action="battle-show-result">查看结算</button><button class="btn" type="button" data-action="battle-return-setup">返回配置</button></div></div>';
    footer = '<div class="turn-help">第 ' + battle.round + ' 回合结束。所有触发已按队列顺序结算。</div><button class="btn btn-sm" type="button" data-action="battle-leave">离开</button>';
  } else if (isAi) {
    body = '<div class="ai-thinking"><div class="ai-orbit"></div><strong class="serif">' + esc(current.name) + '正在行动</strong><span>正在选择单位、技能与目标。所有结算仍按单链式顺序执行。</span></div>';
    footer = '<div class="turn-help">自动控制方行动中。界面刷新不改变战场状态。</div><button class="btn btn-sm" type="button" data-action="battle-log-toggle">查看日志</button>';
  } else if (pending) {
    const skill = pending.skill;
    const mode = skill.targetMode || 'none';
    const targetMode = TARGET_MODES[mode] || TARGET_MODES.none;
    const validTargets = this.battleTargetPreview();
    const chosen = ui.targetUid ? battle.getUnit(ui.targetUid) : null;
    const canConfirm = !targetMode.needsTarget || !!chosen;
    const prompt = targetMode.needsTarget
      ? '<div class="target-prompt"><strong>选择目标</strong><div class="target-hint">' + (chosen ? '已选择：' + esc(chosen.name) + '（' + esc(chosen.battleId) + '）' : '在左侧或右侧场地中点击高亮的单位。') + '</div></div>'
      : '<div class="target-prompt"><strong>无需指定目标</strong><div class="target-hint">该技能会作用于' + esc(targetMode.label) + '。确认后结算。</div></div>';
    body = '<div class="action-unit-line"><img src="' + attr(cardArt(pending.actor.card)) + '" alt=""><div class="grow"><strong>' + esc(pending.actor.name) + '</strong><small>' + esc(skillTypeLabel(skill.type)) + ' · 操作 ' + esc(skillOpLabel(skill.op)) + ' · 目标 ' + esc(targetMode.label) + '</small></div><span class="chip ' + opClass(skill.op) + '">' + esc(skill.name) + '</span></div>' +
      prompt +
      '<div class="notice">' + esc(skill.description || '') + '</div>' +
      '<div class="confirm-dock"><button class="btn btn-primary" type="button" data-action="battle-confirm-skill"' + (canConfirm ? '' : ' disabled') + '>' + (pending.kind === 'extra' ? '释放附加技' : '确认释放') + '</button><button class="btn" type="button" data-action="battle-cancel-skill">取消选择</button><span class="muted small right">' + (validTargets.length ? '可选目标 ' + validTargets.length + ' 个' : '自动目标') + '</span></div>' +
      (skill.requirements && skill.requirements.length ? '<div class="notice info mt-2">释放条件：' + esc(requirementSummary(skill)) + '</div>' : '');
    footer = '<div class="turn-help">' + (pending.kind === 'extra' ? '附加技不占用行动，本次释放后当前单位仍可行动。' : '主动技占用当前单位本回合行动。') + '</div><button class="btn btn-sm" type="button" data-action="battle-cancel-skill">返回</button>';
  } else if (selectedUnit) {
    const skills = battle.getActiveSkills(selectedUnit);
    const skillRows = skills.map(skill => {
      const state = battle.getSkillState(selectedUnit, skill);
      const chosen = ui.skillId === skill.id;
      return '<button class="skill-choice ' + (state.usable ? 'usable' : 'disabled') + (chosen ? ' chosen' : '') + '" type="button" data-action="battle-skill" data-uid="' + attr(selectedUnit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled') + '>' +
        '<span class="skill-choice-icon"><img src="' + (skill.op === 'heal' ? 'assets/icons/heal.svg' : 'assets/icons/damage.svg') + '" alt=""></span>' +
        '<span class="skill-choice-main"><span class="skill-choice-top"><strong>' + esc(skill.name) + '</strong><span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span><span class="op-badge ' + opClass(skill.op) + '">' + esc(skillOpLabel(skill.op)) + '</span></span><span class="skill-choice-desc">' + esc(skill.description || '') + '</span>' + (state.usable ? '' : '<span class="req-line">' + esc(state.reason) + '</span>') + '</span>' +
        '<span class="skill-choice-state' + (state.usable ? '' : ' locked') + '">' + (state.usable ? (TARGET_MODES[skill.targetMode] || TARGET_MODES.none).label : '不可用') + '</span>' +
      '</button>';
    }).join('') || '<div class="notice">该单位没有主动技。可以选择待机，或检查装备与效果授予的技能。</div>';
    const extraSkills = battle.getExtraSkills(selectedUnit);
    body = '<div class="action-unit-line"><img src="' + attr(cardArt(selectedUnit.card)) + '" alt=""><div class="grow"><strong>' + esc(selectedUnit.name) + '</strong><small>生命 ' + selectedUnit.hp + ' / ' + selectedUnit.maxHp + ' · ' + esc(selectedUnit.battleId) + ' · ' + (selectedUnit.counted ? '计数单位' : '不计数单位') + '</small></div><span class="chip gold">行动中</span></div>' +
      '<div class="action-subline"><span class="tiny faint">选择一项主动技</span><span class="tiny faint">·</span><span class="tiny faint">条件只在释放时检查一次</span></div>' +
      '<div class="skill-choice-list">' + skillRows + '</div>' +
      (extraSkills.length ? '<div class="extra-area"><div class="extra-head"><span>附加技 · 不占用行动</span><span>' + extraSkills.length + '</span></div><div class="extra-list">' + extraSkills.map(skill => {
        const state = battle.getSkillState(selectedUnit, skill);
        return '<button class="extra-skill-btn" type="button" data-action="battle-extra" data-uid="' + attr(selectedUnit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled title="' + attr(state.reason) + '"') + '>' + esc(skill.name) + '</button>';
      }).join('') + '</div></div>' : '');
    footer = '<div class="turn-help">点击敌方或友方单位切换目标；主动技结算后该单位本回合不可再次行动。</div><button class="btn btn-sm" type="button" data-action="battle-pass" data-uid="' + attr(selectedUnit.battleId) + '">待机</button>';
  } else {
    const selectable = current ? battle.getFieldUnits(current.id).filter(unit => !unit.acted) : [];
    const extraLines = current ? battle.getFieldUnits(current.id).flatMap(unit => battle.getExtraSkills(unit).map(skill => ({ unit, skill }))) : [];
    const extras = extraLines.length ? '<div class="extra-area"><div class="extra-head"><span>附加技 · 全场地</span><span>' + extraLines.length + '</span></div><div class="extra-list">' + extraLines.map(({ unit, skill }) => {
      const state = battle.getSkillState(unit, skill);
      return '<button class="extra-skill-btn" type="button" data-action="battle-extra" data-uid="' + attr(unit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled title="' + attr(state.reason) + '"') + '>' + esc(unit.name) + ' · ' + esc(skill.name) + '</button>';
    }).join('') + '</div></div>' : '';
    const canRefill = current && battle.controllers[current.id] === 'human' && current.hand.length && battle.getFieldUnits(current.id).length < battle.rules.maxField;
    body = '<div class="action-empty"><div class="ae-icon">行</div><h3>' + (selectable.length ? '选择行动单位' : '本回合没有可行动单位') + '</h3><p>' + (selectable.length ? '点击任意未行动单位。也可以先释放满足条件的附加技，附加技不占用行动。' : '可行动单位可能已待机或退场。系统会按顺序推进回合。') + '</p>' + (canRefill ? '<p class="field-hint">场上有空缺位置。点击空缺位置，从手牌指定补入一名角色；补牌不会结束当前行动。</p>' : '') + extras + '</div>';
    footer = '<div class="turn-help">当前行动方：' + esc(current ? current.name : '') + ' · 未行动 ' + remainingCountLabel(this.battle) + '</div><button class="btn btn-sm" type="button" data-action="battle-log-toggle">日志</button>';
  }
  return '<div class="battle-action"><div class="action-panel">' +
    '<div class="action-head"><div><div class="eyebrow">' + (ending ? 'RESULT' : isAi ? 'AUTOMATED TURN' : 'ACTION SELECTION') + '</div><h2>' + (ending ? '对局结算' : isAi ? '自动行动中' : '行动选择区') + '</h2></div><div class="action-head-right"><span class="chip">第 ' + battle.round + ' 回合</span>' + (current && !ending ? '<span class="chip ' + (current.id === 'B' ? 'blue' : 'gold') + '">' + esc(current.name) + '</span>' : '') + '<span class="chip">' + esc(this.phaseLabel()) + '</span></div></div>' +
    '<div class="action-body">' + body + '</div>' +
    '<div class="action-footer">' + footer + '</div>' +
  '</div></div>';
};

function remainingCountLabel(battle) {
  if (!battle || !battle.currentSide) return '0';
  return String(battle.getFieldUnits(battle.currentSide).filter(unit => !unit.acted).length);
}

App.renderDamageStage = function () { return ''; };

App.captureBattleUnitPositions = function () {
  const positions = {};
  const nodes = document.querySelectorAll('.battle-grid .unit-card[data-uid]');
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    positions[node.dataset.uid] = {
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(rect.height * 0.48, rect.height - 18),
      w: rect.width,
      h: rect.height
    };
  }
  for (const side of ['A', 'B']) {
    const field = document.querySelector('.field-' + side.toLowerCase() + ' .field-panel');
    if (field) {
      const rect = field.getBoundingClientRect();
      positions['field:' + side] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }
  positions.center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return positions;
};

App.beginBattleEngineAction = function () {
  this._battlePreRects = this.captureBattleUnitPositions();
};

App.drainBattleVisuals = function () {
  if (!this.battle) return [];
  const feed = this.battle.visualFeed || [];
  const fresh = feed.filter(item => item.id > (this._battleVisualCursor || 0));
  this._battleVisualCursor = feed.length ? feed[feed.length - 1].id : (this._battleVisualCursor || 0);
  return fresh;
};

App.finishBattleEngineAction = function () {
  if (!this.battle) return;
  const battle = this.battle;
  const previousPositions = this._battlePreRects || {};
  this._battlePreRects = null;
  const visuals = this.drainBattleVisuals();
  this._battleFxActive = visuals.length > 0;
  this.render();
  if (!visuals.length || !window.BattleFX) {
    this._battleFxActive = false;
    this.afterBattleRender();
    return;
  }
  const token = ++this._fxToken;
  const currentPositions = this.captureBattleUnitPositions();
  const positions = Object.assign({}, previousPositions, currentPositions);
  requestAnimationFrame(() => {
    if (token !== this._fxToken || this.route !== 'battle' || this.battle !== battle || !this._battleFxActive) return;
    BattleFX.play(visuals, positions, () => {
      if (token !== this._fxToken || this.route !== 'battle' || this.battle !== battle) return;
      this._battleFxActive = false;
      this.afterBattleRender();
    });
  });
};

App.cancelBattleFx = function () {
  this._fxToken = (this._fxToken || 0) + 1;
  this._battleFxActive = false;
  if (window.BattleFX) BattleFX.cancel();
};

App.renderBattleHand = function () {
  const battle = this.battle;
  const side = battle.sides[battle.currentSide || 'A'];
  const hand = (side.hand || []).map(id => battle.deckUnitCard(id)).filter(Boolean);
  const countdown = battle.drawCountdown();
  const handCards = hand.length ? hand.slice(0, 12).map(card => {
    return '<button class="hand-card" type="button" data-action="battle-hand-info" data-id="' + attr(card.id) + '">' +
      '<img src="' + attr(cardArt(card)) + '" alt="">' +
      '<span class="hc-name">' + esc(card.name) + '</span>' +
      '<span class="hc-badges">' + qualityBadge(card.quality) + '<span>' + (card.counted === false ? '不计数' : '计数') + '</span></span>' +
    '</button>';
  }).join('') : '<div class="hand-empty"><span>当前行动方没有可用角色手牌。</span><span class="faint">退场的角色会进入退场区，除非规则允许回到可抽牌堆。</span></div>';
  const canHandleEquipment = battle.status === 'active' && battle.phase === 'awaiting' && battle.controllers[side.id] === 'human' && battle.currentSide === side.id;
  const gear = (side.equipmentPool || []).map(id => battle.maps.equipment.get(id)).filter(Boolean);
  const gearCards = gear.length ? gear.map((item, index) => {
    const body = '<img src="' + attr(cardArt(item)) + '" alt=""><div><strong>' + esc(item.name) + '</strong><small>' + esc((item.slot === 'weapon' ? '武器' : '饰品') + ' · ' + (modSummary(item.mods, true) || '特效')) + '</small></div>' + qualityBadge(item.quality);
    return canHandleEquipment
      ? '<button class="gear-rack-card" type="button" data-action="battle-equipment-open" data-side="' + side.id + '" data-id="' + attr(item.id) + '">' + body + '</button>'
      : '<div class="gear-rack-card">' + body + '</div>';
  }).join('') : '<div class="gear-rack-empty">' + (side.deck.length || side.hand.length ? '整备区为空。装备卡不会自动穿戴。' : '没有可用装备。') + '</div>';
  return '<section class="hand-zone panel">' +
    '<div class="hand-head"><div class="hand-head-left"><span class="field-side-mark">' + (side.id === 'A' ? '我' : '敌') + '</span><h2>' + esc(side.name) + '手牌</h2><span class="chip">' + hand.length + ' 张</span></div>' +
      '<div class="zone-chips"><span class="zone-chip">牌堆 <b>' + side.deck.length + '</b></span><span class="zone-chip">可抽牌堆 <b>' + side.deck.length + '</b></span><span class="zone-chip">弃牌 <b>' + side.discard.length + '</b></span><span class="zone-chip">退场 <b>' + side.retreat.length + '</b></span>' + (battle.rules.drawDuringBattle ? '<span class="zone-chip draw-countdown">补充抽牌倒计时 <b>' + (countdown == null ? '—' : countdown) + '</b> 回合</span>' : '<span class="zone-chip">战斗中抽牌 关闭</span>') + '</div></div>' +
    '<div class="hand-body">' + handCards + '</div>' +
    '<div class="gear-rack"><div class="gear-rack-head"><div><strong>装备卡</strong><span>选择销毁或穿戴，不结束行动</span></div><span class="tiny faint">' + gear.length + ' 张 · 默认未穿戴</span></div><div class="gear-rack-list">' + gearCards + '</div></div>' +
    '<div class="hand-tip"><span class="dot"></span>点击场内空缺位置从手牌手动补入；符文可随时配置。装备与符文都不占用抽牌堆。<button class="footer-link" type="button" data-action="battle-deck-info">查看双方区域</button></div>' +
  '</section>';
};

App.renderBattleRail = function () {
  const battle = this.battle;
  const settings = Store.state.settings;
  let logs = battle.logs.slice(-120);
  if (settings.compactLog) logs = logs.filter(entry => entry.kind !== 'formula' && entry.kind !== 'system');
  const logHtml = logs.length ? logs.map(entry => '<div class="log-entry ' + esc(entry.kind) + '"><span class="log-round">R' + entry.round + '</span><span class="log-kind">' + esc(entry.label) + '</span><span class="log-text">' + esc(entry.text) + '</span></div>').join('') : '<div class="log-empty">暂无记录</div>';
  const countDefs = Store.index.countDefs || {};
  const allCountIds = [...new Set(Object.keys(countDefs).concat(Object.keys(battle.globalCounts).concat(Object.keys(battle.sides.A.counts), Object.keys(battle.sides.B.counts))))].filter(id => {
    return battle.globalCounts[id] || battle.sides.A.counts[id] || battle.sides.B.counts[id] || Object.keys(countDefs).includes(id);
  });
  const globalRows = allCountIds.map(id => '<div class="count-row"><span>' + esc(battle.countLabel(id)) + '</span><b>' + (battle.globalCounts[id] || 0) + '</b></div>').join('') || '<div class="status-empty">暂无全场计数</div>';
  const sideCountRows = (sideId) => {
    const side = battle.sides[sideId];
    const rows = allCountIds.map(id => '<div class="count-row"><span>' + esc(battle.countLabel(id)) + '</span><b>' + (side.counts[id] || 0) + '</b></div>').join('');
    return rows || '<div class="status-empty">暂无阵营计数</div>';
  };
  const unitStatus = (sideId) => {
    const units = battle.getFieldUnits(sideId);
    if (!units.length) return '<div class="status-empty">场上无单位</div>';
    return units.map(unit => {
      const countText = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => battle.countLabel(key) + ' ' + unit.counts[key]).join(' · ');
      const effectText = unit.effects.map(inst => (battle.maps.effects.get(inst.effectId) || {}).name + (inst.stacks > 1 ? '×' + inst.stacks : '')).filter(Boolean).join(' · ');
      const tempText = Object.keys(unit.tempMods || {}).filter(key => unit.tempMods[key]).map(key => (STAT_KEYS[key] || key) + ' ' + unit.tempMods[key]).join(' · ');
      return '<div class="status-unit-entry"><div class="status-unit-name"><span>' + esc(unit.name) + '</span><span>' + esc(unit.battleId) + '</span></div><div class="status-unit-name"><span class="tiny">HP ' + unit.hp + '/' + unit.maxHp + '</span><span class="tiny">' + (unit.counted ? '计数' : '不计数') + '</span></div>' +
        ((countText || effectText || tempText) ? '<div class="status-unit-meta">' + (countText ? '<span class="chip gold">' + esc(countText) + '</span>' : '') + (effectText ? '<span class="chip violet">' + esc(effectText) + '</span>' : '') + (tempText ? '<span class="chip">' + esc(tempText) + '</span>' : '') + '</div>' : '') +
      '</div>';
    }).join('');
  };
  const listenerItems = [];
  for (const sideId of ['A', 'B']) {
    for (const unit of battle.getFieldUnits(sideId)) {
      for (const skill of battle.getUnitSkills(unit)) {
        if (skill.type === 'passive' && skill.trigger && skill.trigger.event !== 'rule' && skill.trigger.event !== 'none') {
          listenerItems.push({ owner: unit.name, uid: unit.battleId, name: skill.name, event: triggerLabel(skill.trigger.event), type: '技能' });
        }
      }
      for (const inst of unit.effects) {
        const def = battle.maps.effects.get(inst.effectId);
        if (def && def.trigger && def.trigger.event && def.trigger.event !== 'none') {
          listenerItems.push({ owner: unit.name, uid: unit.battleId, name: def.name, event: triggerLabel(def.trigger.event), type: '效果' });
        }
      }
    }
  }
  const feedItems = battle.triggerFeed.slice(0, 8).map(item => '<div class="trigger-item"><div class="trigger-name"><span>' + esc(item.owner) + ' · ' + esc(item.name) + '</span><span>' + esc(item.type) + '</span></div><div class="trigger-event">' + esc(item.event) + '</div></div>').join('');
  const feedHtml = feedItems || '<div class="rail-empty">尚未触发被动或效果。被动必须同时满足触发与释放条件。</div>';
  const listenerHtml = listenerItems.slice(0, 12).map(item => '<div class="listener-item"><span class="listener-type">' + esc(item.type) + '</span><span>' + esc(item.owner) + ' · ' + esc(item.name) + '</span><span class="listener-event">' + esc(item.event) + '</span></div>').join('') || '<div class="rail-empty">场上没有待命被动。</div>';
  return '<aside class="battle-rail">' +
    '<section class="rail-panel panel log-panel"><div class="panel-head"><h3>战斗日志</h3><span class="panel-count">' + logs.length + '</span></div><div class="rail-body"><div class="battle-log" id="battle-log">' + logHtml + '</div></div></section>' +
    '<section class="rail-panel panel"><div class="panel-head"><h3>状态与计数</h3><span class="panel-count">当前</span></div><div class="rail-body"><div class="status-summary">' +
      '<details class="status-group" open><summary>全场计数</summary><div class="status-group-body">' + globalRows + '</div></details>' +
      '<details class="status-group"><summary>阵营计数</summary><div class="status-group-body"><div class="status-group-label">我方</div>' + sideCountRows('A') + '<div class="status-group-label">敌方</div>' + sideCountRows('B') + '</div></details>' +
      '<details class="status-group"><summary>我方单位数据</summary><div class="status-group-body">' + unitStatus('A') + '</div></details>' +
      '<details class="status-group"><summary>敌方单位数据</summary><div class="status-group-body">' + unitStatus('B') + '</div></details>' +
    '</div></div></section>' +
    '<section class="rail-panel panel"><div class="panel-head"><h3>触发队列</h3><span class="panel-count">' + listenerItems.length + '</span></div><div class="rail-body"><div class="trigger-list">' + feedHtml + '</div><div class="detail-section-title" style="margin:8px 0 3px">待命监听</div><div class="trigger-list">' + listenerHtml + '</div></div></section>' +
  '</aside>';
};

App.scrollLogToBottom = function () {
  const log = document.getElementById('battle-log');
  if (log) log.scrollTop = log.scrollHeight;
};

App.selectBattleUnit = function (uid) {
  if (!this.battle || this.battle.status !== 'active') return;
  const ui = this.battleUI;
  const unit = this.battle.getUnit(uid);
  if (!unit) return;
  if (ui.skillId) {
    if (this.isBattleTarget(unit)) {
      ui.targetUid = unit.battleId;
      this.render();
      return;
    }
    this.toast('该单位不是当前技能的合法目标。', 'error');
    return;
  }
  const side = this.battle.sides[unit.side];
  if (unit.side !== this.battle.currentSide) {
    this.openBattleUnitInfo(unit.battleId);
    return;
  }
  if (this.battle.controllers[unit.side] !== 'human') {
    this.toast('当前行动方为自动控制。', 'error');
    return;
  }
  if (unit.acted) {
    this.toast('该单位本回合已行动。', 'error');
    return;
  }
  this.beginBattleEngineAction();
  const prep = this.battle.prepareUnit(unit.battleId);
  if (!prep.ok) {
    this._battlePreRects = null;
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.toast(prep.error || '无法选择该单位。', 'error');
    return;
  }
  if (prep.skipped || this.battle.status === 'ended') {
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.finishBattleEngineAction();
    return;
  }
  if (this.battle.currentSide !== unit.side) {
    this.finishBattleEngineAction();
    return;
  }
  this.battleUI = { selectedUid: unit.battleId, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.chooseBattleSkill = function (uid, skillId, kind) {
  if (!this.battle || this.battle.status !== 'active') return;
  const actor = this.battle.getUnit(uid);
  if (!actor) return;
  const skill = this.battle.getSkillForUnit(actor, skillId);
  if (!skill) return;
  let preparedNow = false;
  if (kind === 'active' && this.battleUI.selectedUid !== uid) {
    this.beginBattleEngineAction();
    const prep = this.battle.prepareUnit(uid);
    if (!prep.ok) { this._battlePreRects = null; this.toast(prep.error, 'error'); return; }
    preparedNow = true;
    if (prep.skipped) { this.finishBattleEngineAction(); return; }
  }
  const state = this.battle.getSkillState(actor, skill);
  if (!state.usable) {
    if (preparedNow) this.finishBattleEngineAction();
    this.toast(state.reason, 'error');
    return;
  }
  this.battleUI.kind = kind === 'extra' ? 'extra' : 'active';
  this.battleUI.extraUid = kind === 'extra' ? uid : null;
  if (kind === 'active') this.battleUI.selectedUid = uid;
  this.battleUI.skillId = skillId;
  this.battleUI.targetUid = null;
  const mode = skill.targetMode || 'none';
  if (mode === 'self') this.battleUI.targetUid = actor.battleId;
  else if (mode === 'enemy' || mode === 'ally') {
    const targets = this.battleTargetPreview();
    if (targets.length === 1) this.battleUI.targetUid = targets[0].battleId;
  }
  if (preparedNow) this.finishBattleEngineAction();
  else this.render();
};

App.confirmBattleSkill = function () {
  if (!this.battle || this.battle.status !== 'active') return;
  const context = this.battleSkillContext();
  if (!context) return;
  const { actor, skill, kind } = context;
  const mode = skill.targetMode || 'none';
  if ((mode === 'enemy' || mode === 'ally') && !this.battleUI.targetUid) {
    const preview = this.battleTargetPreview();
    if (!preview.length) { this.toast('没有合法目标。', 'error'); return; }
    this.toast('请先在地场上选择目标。', 'error'); return;
  }
  this.beginBattleEngineAction();
  let result;
  if (kind === 'extra') {
    result = this.battle.useExtraSkill(actor.battleId, skill.id, this.battleUI.targetUid || null);
  } else {
    result = this.battle.useSkill(actor.battleId, skill.id, this.battleUI.targetUid || null);
  }
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || '技能释放失败。', 'error');
    return;
  }
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.cancelBattleSkill = function () {
  const keepSelected = this.battleUI.kind === 'active' ? this.battleUI.selectedUid : null;
  this.battleUI.skillId = null;
  this.battleUI.targetUid = null;
  this.battleUI.extraUid = null;
  this.battleUI.kind = 'active';
  this.battleUI.selectedUid = keepSelected;
  this.render();
};

App.passBattleAction = function (uid) {
  if (!this.battle || this.battle.status !== 'active') return;
  this.beginBattleEngineAction();
  const result = this.battle.passAction(uid);
  if (!result.ok) { this._battlePreRects = null; this.toast(result.error, 'error'); return; }
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.openDeployMenu = function (sideId) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active' || battle.phase !== 'awaiting' || this._battleFxActive) return;
  const side = battle.sides[sideId];
  if (!side || battle.controllers[sideId] !== 'human') return;
  if (battle.getFieldUnits(sideId).length >= battle.rules.maxField) return;
  if (!side.hand.length) { this.toast('手牌区没有可补入的角色。', 'error'); return; }
  this.pauseBattleInteraction();
  this._deploySide = sideId;
  const cards = side.hand.map((cardId, index) => {
    const card = battle.deckUnitCard(cardId);
    if (!card) return '';
    const res = RESISTANCE_TYPES[card.resistance.type] || { label: '抗性' };
    return '<button class="deploy-card" type="button" data-action="battle-deploy-card" data-side="' + sideId + '" data-index="' + index + '">' +
      '<img src="' + attr(cardArt(card)) + '" alt="">' +
      '<span class="deploy-card-main"><strong>' + esc(card.name) + '</strong><small>生命 ' + card.hp + ' · ' + esc(res.label) + ' ' + card.resistance.value + ' · ' + (card.counted === false ? '不计数' : '计数') + '</small></span>' +
      qualityBadge(card.quality) +
    '</button>';
  }).join('');
  this.openModal({
    title: '补牌 · ' + side.name,
    subtitle: '战场已暂停。补入一名角色，不结束当前行动。',
    size: 'large',
    body: '<p class="modal-copy">场上有 ' + Math.max(0, battle.rules.maxField - battle.getFieldUnits(sideId).length) + ' 个空缺位置。选择一张手牌补入，补牌不会消耗当前单位的行动。</p><div class="deploy-grid mt-2">' + (cards || '<div class="empty-state"><p>没有可补入的角色。</p></div>') + '</div>',
    foot: '<span class="left">手牌 ' + side.hand.length + ' 张 · 场地上限 ' + battle.rules.maxField + '</span><button class="btn" type="button" data-action="modal-close">取消</button>'
  });
};

App.deployBattleCard = function (sideId, index) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  this.beginBattleEngineAction();
  const result = battle.manualDeployCard(sideId, Number(index));
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || '补牌失败。', 'error');
    return;
  }
  this._battleInteractionPause = false;
  this.closeModal(true);
  this.finishBattleEngineAction();
};

App.openEquipmentMenu = function (sideId, equipmentId) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active' || battle.phase !== 'awaiting' || this._battleFxActive) return;
  if (battle.currentSide !== sideId || battle.controllers[sideId] !== 'human') return;
  const side = battle.sides[sideId];
  if (!side || !side.equipmentPool.includes(equipmentId)) return;
  const gear = battle.maps.equipment.get(equipmentId);
  if (!gear) return;
  this.pauseBattleInteraction();
  const units = battle.getFieldUnits(sideId);
  const unitRows = units.length ? units.map(unit => {
    const occupied = !!unit.equipment[gear.slot];
    return '<button class="choice-card' + (occupied ? ' disabled' : '') + '" type="button" data-action="battle-equip-confirm" data-side="' + sideId + '" data-id="' + attr(equipmentId) + '" data-unit="' + attr(unit.battleId) + '"' + (occupied ? ' disabled' : '') + '>' +
      '<span class="choice-mark">' + (gear.slot === 'weapon' ? '武' : '饰') + '</span><span class="choice-main"><strong>' + esc(unit.name) + '</strong><small>' + (occupied ? (gear.slot === 'weapon' ? '武器栏' : '饰品栏') + '已满' : '生命 ' + unit.hp + ' / ' + unit.maxHp + ' · 空闲' + (gear.slot === 'weapon' ? '武器栏' : '饰品栏')) + '</small></span>' +
    '</button>';
  }).join('') : '<div class="empty-state"><p>场上没有可穿戴该装备的单位。</p></div>';
  this.openModal({
    title: gear.name,
    subtitle: '装备卡 · ' + (gear.slot === 'weapon' ? '武器' : '饰品') + ' · 不结束行动',
    size: 'large',
    body: '<div class="row between wrap mb-2"><div class="row">' + qualityBadge(gear.quality) + '<span class="chip">' + esc(gear.slot === 'weapon' ? '武器' : '饰品') + '</span><span class="chip gold">' + esc(modSummary(gear.mods, true) || '无附加数值') + '</span></div><span class="field-hint">默认未穿戴；穿戴或销毁都不消耗行动。</span></div>' +
      '<p class="modal-copy">' + esc(gear.description || '这张装备没有额外描述。') + '</p>' +
      '<div class="detail-section-title">选择穿戴单位<span class="line"></span></div><div class="choice-list">' + unitRows + '</div>' +
      '<div class="notice mt-2">销毁会将该装备永久移出本局整备区。</div>',
    foot: '<button class="btn btn-danger" type="button" data-action="battle-equipment-destroy" data-side="' + sideId + '" data-id="' + attr(equipmentId) + '">销毁装备</button><button class="btn" type="button" data-action="modal-close">取消</button>'
  });
};

App.equipBattleCard = function (sideId, equipmentId, unitUid) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  this.beginBattleEngineAction();
  const result = battle.equipFromPool(sideId, unitUid, equipmentId);
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || '穿戴失败。', 'error');
    return;
  }
  this._battleInteractionPause = false;
  this.closeModal(true);
  this.finishBattleEngineAction();
};

App.destroyBattleEquipment = function (sideId, equipmentId) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  const result = battle.destroyEquipmentFromPool(sideId, equipmentId);
  if (!result.ok) { this.toast(result.error || '销毁失败。', 'error'); return; }
  const context = this.battleContext || {};
  if (['rogue', 'endless'].includes(context.mode)) {
    const run = Store.state.runs[context.mode];
    if (run && run.deck) {
      const owned = run.deck.equipment || [];
      const index = owned.indexOf(equipmentId);
      if (index >= 0) owned.splice(index, 1);
      if (Array.isArray(run.activeEquipment)) run.activeEquipment = run.activeEquipment.filter(item => item !== equipmentId);
      Store.recordRun(context.mode, run);
    }
  }
  this._battleInteractionPause = false;
  this.closeModal(true);
  this.beginBattleEngineAction();
  this.finishBattleEngineAction();
};

App.openRuneConfig = function (sideId) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active' || battle.phase !== 'awaiting' || this._battleFxActive) return;
  const side = battle.sides[sideId];
  if (!side || battle.controllers[sideId] !== 'human') return;
  this.pauseBattleInteraction();
  this._runeDraft = { sideId, ids: side.runes.map(rune => rune.id) };
  this.renderRuneConfigModal();
};

App.renderRuneConfigModal = function () {
  const battle = this.battle;
  const draft = this._runeDraft;
  if (!battle || !draft) return;
  const side = battle.sides[draft.sideId];
  const pool = side.runePool || [];
  const cards = pool.length ? pool.map(rune => {
    const selected = draft.ids.includes(rune.id);
    return '<button class="rune-choice' + (selected ? ' selected' : '') + '" type="button" data-action="battle-rune-toggle" data-side="' + side.id + '" data-id="' + attr(rune.id) + '">' +
      '<span class="rune-choice-top">' + qualityBadge(rune.quality) + '<strong>' + esc(rune.name) + '</strong><span class="rune-check">' + (selected ? '已启用' : '启用') + '</span></span>' +
      '<span class="rune-choice-mods">' + esc(modSummary(rune.mods, true) || '特效') + '</span>' +
      '<span class="rune-choice-desc">' + esc(rune.description || '') + '</span>' +
    '</button>';
  }).join('') : '<div class="empty-state"><p>本局没有可配置的符文。可以在牌组构筑或战前整备中加入。</p></div>';
  this.openModal({
    title: '符文配置 · ' + side.name,
    subtitle: '战场已暂停。至多启用三张符文，配置不结束行动。',
    size: 'large',
    body: '<div class="row between wrap mb-2"><span class="chip violet">已启用 ' + draft.ids.length + ' / 3</span><span class="field-hint">符文对该阵营全部单位实时生效。</span></div><div class="rune-choice-grid">' + cards + '</div>',
    foot: '<span class="left">当前：' + (side.runes.map(rune => rune.name).join('、') || '无') + '</span><button class="btn" type="button" data-action="modal-close">取消</button><button class="btn btn-primary" type="button" data-action="battle-rune-apply" data-side="' + side.id + '">应用配置</button>'
  });
};

App.toggleRuneDraft = function (sideId, runeId) {
  const draft = this._runeDraft;
  if (!draft || draft.sideId !== sideId) return;
  const index = draft.ids.indexOf(runeId);
  if (index >= 0) draft.ids.splice(index, 1);
  else if (draft.ids.length >= 3) { this.toast('每个阵营最多启用三张符文。', 'error'); return; }
  else draft.ids.push(runeId);
  this.renderRuneConfigModal();
};

App.applyRuneConfig = function (sideId) {
  const draft = this._runeDraft;
  if (!draft || !this.battle) return;
  const result = this.battle.setActiveRunes(sideId, draft.ids);
  if (!result.ok) { this.toast(result.error, 'error'); return; }
  this._runeDraft = null;
  this._battleInteractionPause = false;
  this.closeModal(true);
  this.render();
  this.afterBattleRender();
};

App.openBattleUnitInfo = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const skillRows = battle.getUnitSkills(unit).map(skill => '<div class="skill-detail-card"><div class="skill-detail-head"><span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span><strong>' + esc(skill.name) + '</strong></div><div class="skill-detail-desc">' + esc(skill.description || '') + '</div><div class="trigger-line" style="padding:0 9px 6px"><span>触发：' + esc(triggerLabel(skill.trigger && skill.trigger.event)) + '</span></div></div>').join('');
  const effects = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    return def ? '<div class="kv"><span class="k">' + esc(def.name) + ' ×' + inst.stacks + '</span><span class="v">' + esc(EFFECT_TYPES[def.type] ? EFFECT_TYPES[def.type].label : '特殊') + (def.removable === false ? ' · 不可解除' : '') + '</span></div>' : '';
  }).join('') || '<div class="status-empty">无效果</div>';
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<div class="kv"><span class="k">' + esc(battle.countLabel(key)) + '</span><span class="v">' + unit.counts[key] + '</span></div>').join('') || '<div class="status-empty">无角色计数</div>';
  const gear = ['weapon', 'accessory'].map(slot => '<div class="kv"><span class="k">' + (slot === 'weapon' ? '武器' : '饰品') + '</span><span class="v">' + esc(unit.equipment[slot] ? unit.equipment[slot].name : '空') + '</span></div>').join('');
  this.openModal({
    title: unit.name,
    subtitle: unit.battleId + ' · ' + (unit.side === 'A' ? '我方' : '敌方') + ' · ' + (unit.counted ? '计数单位' : '不计数单位'),
    size: 'large',
    body: '<div class="row" style="align-items:flex-start;gap:16px"><img src="' + attr(cardArt(unit.card)) + '" alt="" style="width:120px;border-radius:5px;border:1px solid var(--line-strong)"><div class="grow"><div class="validity-list mb-2">' + qualityBadge(unit.quality) + '<span class="chip">生命 ' + unit.hp + ' / ' + unit.maxHp + '</span><span class="chip">攻击 ' + unit.atk + '</span><span class="chip">物理抗 ' + battle.getResistance(unit, 'physical') + '</span><span class="chip">精神抗 ' + battle.getResistance(unit, 'mental') + '</span></div><div class="hp-bar"><span style="width:' + Math.round(unit.hp / Math.max(1, unit.maxHp) * 100) + '%"></span></div><div class="detail-section-title">效果<span class="line"></span></div>' + effects + '<div class="detail-section-title">角色计数<span class="line"></span></div>' + counts + '<div class="detail-section-title">装备<span class="line"></span></div>' + gear + '</div></div><div class="detail-section-title">技能档案<span class="line"></span></div><div class="skill-detail-list">' + skillRows + '</div>'
  });
};

App.openBattleCounts = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<div class="kv"><span class="k">' + esc(battle.countLabel(key)) + '</span><span class="v">' + unit.counts[key] + '</span></div>').join('') || '<div class="status-empty">无角色计数</div>';
  const effectRows = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    return def ? '<div class="kv"><span class="k">' + esc(def.name) + '</span><span class="v">' + inst.stacks + ' 层</span></div>' : '';
  }).join('') || '<div class="status-empty">无效果</div>';
  this.openModal({ title: unit.name + ' · 状态与计数', subtitle: unit.battleId + ' · 同名角色状态按绝对独立战斗 ID 隔离', size: 'small', body: '<div class="detail-section-title">角色计数<span class="line"></span></div>' + counts + '<div class="detail-section-title">效果层数<span class="line"></span></div>' + effectRows });
};

App.openBattleGear = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const slots = ['weapon', 'accessory'].map(slot => {
    const item = unit.equipment[slot];
    return '<div class="kv"><span class="k">' + (slot === 'weapon' ? '武器' : '饰品') + '</span><span class="v">' + esc(item ? item.name : '空') + '</span></div>';
  }).join('');
  const runes = battle.getSideOf(unit).runes.map(rune => '<div class="kv"><span class="k">' + esc(rune.name) + '</span><span class="v">' + esc(modSummary(rune.mods, true) || '特效') + '</span></div>').join('') || '<div class="status-empty">本阵营未启用符文</div>';
  this.openModal({ title: unit.name + ' · 装备栏', subtitle: '每角色武器与饰品各最多装备一个；符文对阵营全部单位有效。', size: 'small', body: '<div class="detail-section-title">装备<span class="line"></span></div>' + slots + '<div class="detail-section-title">阵营符文<span class="line"></span></div>' + runes });
};

App.openBattleHandInfo = function (cardId) {
  const card = Store.index.maps.units.get(cardId);
  if (!card) return;
  this.openModal({
    title: card.name,
    subtitle: '手牌中的角色 · ' + card.id,
    size: 'large',
    body: renderCardDetail(card, 'unit')
  });
};

App.openBattleDeckInfo = function () {
  const battle = this.battle;
  if (!battle) return;
  const sideRows = ['A', 'B'].map(id => {
    const side = battle.sides[id];
    return '<div class="detail-section-title">' + esc(side.name) + '区域<span class="line"></span></div><div class="kv-grid">' +
      '<div class="kv"><span class="k">手牌</span><span class="v">' + side.hand.length + '</span></div>' +
      '<div class="kv"><span class="k">可抽牌堆</span><span class="v">' + side.deck.length + '</span></div>' +
      '<div class="kv"><span class="k">弃牌区</span><span class="v">' + side.discard.length + '</span></div>' +
      '<div class="kv"><span class="k">退场区</span><span class="v">' + side.retreat.length + '</span></div>' +
      '<div class="kv"><span class="k">装备池</span><span class="v">' + side.equipmentPool.length + '</span></div>' +
      '<div class="kv"><span class="k">符文</span><span class="v">' + side.runes.length + '</span></div></div>';
  }).join('');
  this.openModal({ title: '区域与牌堆', subtitle: '装备与符文不进入抽牌堆；装备默认不穿戴，符文可在本局中随时重新配置。', body: sideRows });
};

App.openBattleLog = function () {
  const battle = this.battle;
  if (!battle) return;
  const logs = battle.logs.slice(-160).map(entry => '<div class="log-entry ' + esc(entry.kind) + '" style="grid-template-columns:26px 30px 1fr"><span class="log-round">R' + entry.round + '</span><span class="log-kind">' + esc(entry.label) + '</span><span class="log-text">' + esc(entry.text) + '</span></div>').join('');
  this.openModal({ title: '完整战斗日志', subtitle: '按发生顺序记录入场、行动、技能、被动、伤害、效果、退场、处决、击败与回复。', body: '<div class="battle-log" style="max-height:58vh">' + (logs || '<div class="log-empty">暂无记录</div>') + '</div>' });
};

App.battleResultSummary = function () {
  const battle = this.battle;
  if (!battle || battle.status !== 'ended') return null;
  const playerWin = battle.winner === 'A';
  const winnerName = battle.winner ? battle.sides[battle.winner].name : '平局';
  return {
    title: battle.winner ? winnerName + '胜利' : '平局',
    subtitle: battle.winner ? '第 ' + battle.round + ' 回合结束，对局已结算。' : '双方均无计数单位。',
    playerWin,
    winner: battle.winner
  };
};

App.showBattleResult = function () {
  const battle = this.battle;
  if (!battle || battle.status !== 'ended') return;
  this._resultShownFor = battle;
  const summary = this.battleResultSummary();
  const context = this.battleContext || {};
  const isMode = ['rogue', 'challenge', 'endless'].includes(context.mode);
  let actions = [];
  if (isMode && window.ModesUI && typeof ModesUI.battleResultActions === 'function') {
    actions = ModesUI.battleResultActions(context, battle, summary, this) || [];
  }
  if (!actions.length) {
    actions = [
      { label: '返回对战配置', action: 'battle-return-setup', kind: 'primary' },
      { label: '返回主菜单', action: 'battle-return-home', kind: '' }
    ];
  }
  const actionHtml = actions.map(action => '<button class="btn ' + (action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger' : '') + '" type="button" data-action="' + attr(action.action) + '"' + (action.data ? Object.keys(action.data).map(key => ' data-' + key + '="' + attr(action.data[key]) + '"').join('') : '') + '>' + esc(action.label) + '</button>').join('');
  const damageCount = battle.logs.filter(entry => entry.kind === 'damage').length;
  const passiveCount = battle.logs.filter(entry => entry.kind === 'passive' || entry.kind === 'trigger').length;
  const activeSide = battle.sides[battle.winner || 'A'];
  this.openModal({
    title: '对局结算',
    subtitle: context.mode && GAME_MODES[context.mode] ? GAME_MODES[context.mode].name : '对战',
    closable: true,
    body: '<div class="result-badge"><img class="result-emblem" src="assets/pictures/brand-mark.svg" alt=""><div class="eyebrow">BATTLE REPORT</div><h2>' + esc(summary.title) + '</h2><p>' + esc(summary.subtitle) + '</p></div><div class="result-stats"><div class="result-stat"><b>' + battle.round + '</b><span>回合</span></div><div class="result-stat"><b>' + damageCount + '</b><span>伤害结算</span></div><div class="result-stat"><b>' + passiveCount + '</b><span>被动与效果触发</span></div></div>' + (battle.logs.length ? '<div class="notice mt-3">' + esc(battle.logs[battle.logs.length - 1].text) + '</div>' : ''),
    foot: '<span class="left">' + esc((activeSide && activeSide.name) || '') + ' · 单链式结算</span>' + actionHtml
  });
};

App.afterBattleRender = function () {
  if (!this.battle) return;
  if (this.battle.status === 'ended') {
    this.clearAiTimer();
    if (this._resultShownFor !== this.battle) {
      this._resultShownFor = this.battle;
      const self = this;
      setTimeout(() => { if (self.route === 'battle' && self.battle === self._resultShownFor) self.showBattleResult(); }, 260);
    }
    return;
  }
  this.scheduleAiIfNeeded();
};

App.clearAiTimer = function () {
  if (this._aiTimer) {
    clearTimeout(this._aiTimer);
    this._aiTimer = null;
  }
};

App.scheduleAiIfNeeded = function () {
  this.clearAiTimer();
  if (!this.battle || this.route !== 'battle' || this.battle.status !== 'active') return;
  if (this._battleFxActive || this._battleInteractionPause) return;
  if (this.battle.phase !== 'awaiting') return;
  const side = this.battle.currentSide;
  if (!side || this.battle.controllers[side] !== 'ai') return;
  const delay = Math.max(180, Number(Store.state.settings.aiDelay) || 650);
  this._aiTimer = setTimeout(() => {
    this._aiTimer = null;
    this.runAiTurn();
  }, delay);
};

App.runAiTurn = function () {
  if (!this.battle || this.route !== 'battle' || this.battle.status !== 'active' || this.battle.phase !== 'awaiting') return;
  if (this.battle.controllers[this.battle.currentSide] !== 'ai') return;
  if (this._battleFxActive || this._battleInteractionPause) return;
  this.beginBattleEngineAction();
  const plan = this.battle.aiPlan();
  if (!plan) {
    this.battle.advanceTurn();
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.finishBattleEngineAction();
    return;
  }
  let result = null;
  if (!plan.skillId) {
    result = this.battle.passAction(plan.unitId);
  } else {
    const prep = this.battle.prepareUnit(plan.unitId);
    if (!prep.ok) {
      result = this.battle.passAction(plan.unitId);
    } else if (prep.skipped || this.battle.status !== 'active' || this.battle.phase !== 'awaiting') {
      result = { ok: true };
    } else {
      const target = this.battle.getUnit(plan.targetUid);
      const actor = this.battle.getUnit(plan.unitId);
      const skill = actor ? this.battle.getSkillForUnit(actor, plan.skillId) : null;
      const state = actor ? this.battle.getSkillState(actor, skill) : null;
      if (!target && state && state.targets && state.targets.length === 1) plan.targetUid = state.targets[0].battleId;
      result = this.battle.useSkill(plan.unitId, plan.skillId, plan.targetUid);
      if (!result.ok) result = this.battle.passAction(plan.unitId);
    }
  }
  if (!result || !result.ok) {
    this._battlePreRects = null;
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.finishBattleEngineAction();
    return;
  }
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.leaveBattle = function (skipConfirm, destination) {
  const doLeave = () => {
    const context = this.battleContext;
    let modeRoute = null;
    if (window.ModesUI && typeof ModesUI.onBattleAbort === 'function') modeRoute = ModesUI.onBattleAbort(context, this);
    this.clearAiTimer();
    this.cancelBattleFx();
    this.battle = null;
    this.battleUI = null;
    this.battleContext = null;
    this._resultShownFor = null;
    this.closeModal(true);
    this.go(destination || modeRoute || (this.setup ? 'setup' : 'home'));
  };
  if (skipConfirm) { doLeave(); return; }
  this.confirm({
    title: '离开对局',
    message: '当前对局进度将会被舍弃。该操作不会自动保存战斗中的状态。',
    confirmLabel: '确认离开',
    danger: true,
    onConfirm: doLeave
  });
};

App.surrenderBattle = function () {
  if (!this.battle || this.battle.status !== 'active') return;
  const doSurrender = () => {
    if (!this.battle || this.battle.status !== 'active') return;
    this.battle.surrenderSide('A');
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.render();
    this.afterBattleRender();
  };
  if (Store.state.settings.confirmAction) {
    this.confirm({ title: '确认认输', message: '认输会立即结算对局，我方判定为失败。', confirmLabel: '认输', danger: true, onConfirm: doSurrender });
  } else {
    doSurrender();
  }
};

App.retryBattle = function () {
  const context = this.battleContext;
  this.clearAiTimer();
  this.battle = null;
  this.battleUI = null;
  this.battleContext = null;
  this._resultShownFor = null;
  this.closeModal(true);
  if (window.ModesUI && context && ['rogue', 'challenge', 'endless'].includes(context.mode) && typeof ModesUI.retryCurrentBattle === 'function') {
    ModesUI.retryCurrentBattle(context, this);
    return;
  }
  this.go('setup');
};

App.exitBattleTo = function (route) {
  this.clearAiTimer();
  this.closeModal(true);
  this.battle = null;
  this.battleUI = null;
  this.battleContext = null;
  this._resultShownFor = null;
  const destination = route || 'home';
  if (this.route === destination) this.enterRoute(destination);
  else this.go(destination);
};

/* ---------- Expansion packs ---------- */
App.renderExpansions = function () {
  const idx = Store.index;
  const packs = Store.allPacks();
  const core = CORE_PACK;
  const importResult = this._packImportResult;
  const packCard = (pack) => {
    const enabled = Store.isEnabled(pack.id);
    const counts = pack.content || { units: [], skills: [], effects: [], equipment: [], runes: [] };
    const isCore = pack.id === CORE_PACK_ID;
    return '<article class="panel pack-card">' +
      '<div class="pack-banner"><div class="pack-emblem"><img src="' + (isCore ? 'assets/pictures/brand-mark.svg' : 'assets/icons/packs.svg') + '" alt=""></div><div class="pack-title"><h3>' + esc(pack.name) + '</h3><div class="pack-path">' + esc(pack.id) + ' · v' + esc(pack.version) + '</div></div><span class="pack-state ' + (enabled ? 'on' : 'off') + '">' + (enabled ? '已启用' : '已禁用') + '</span></div>' +
      '<div class="pack-body">' +
        '<p class="pack-desc">' + esc(pack.description || '没有填写说明。') + '</p>' +
        '<div class="pack-stats">' +
          [['units', '角色'], ['equipment', '装备'], ['runes', '符文'], ['skills', '技能'], ['effects', '效果']].map(([key, label]) => '<div class="pack-stat"><b>' + (counts[key] || []).length + '</b><span>' + label + '</span></div>').join('') +
        '</div>' +
        '<div class="pack-meta"><span class="chip">作者 ' + esc(pack.author || '未知') + '</span>' + ((pack.dependencies || []).length ? pack.dependencies.map(dep => '<span class="chip gold">依赖 ' + esc(dep) + '</span>').join('') : '<span class="chip">无依赖</span>') + (isCore ? '<span class="chip blue">内置</span>' : '') + '</div>' +
        (Store.index.errors.length && pack.id !== CORE_PACK_ID ? '' : '') +
        '<div class="pack-actions">' +
          (isCore ? '<button class="btn btn-sm" type="button" disabled>内置包</button>' : '<button class="btn btn-sm" type="button" data-action="pack-toggle" data-pack="' + attr(pack.id) + '">' + (enabled ? '禁用' : '启用') + '</button>') +
          '<button class="btn btn-sm" type="button" data-action="pack-inspect" data-pack="' + attr(pack.id) + '">内容</button>' +
          '<button class="btn btn-sm" type="button" data-action="pack-export" data-pack="' + attr(pack.id) + '">导出</button>' +
          '<button class="btn btn-sm" type="button" data-action="pack-share" data-pack="' + attr(pack.id) + '">分享码</button>' +
          (!isCore ? '<button class="btn btn-sm btn-danger" type="button" data-action="pack-delete" data-pack="' + attr(pack.id) + '">删除</button>' : '') +
        '</div>' +
      '</div>' +
    '</article>';
  };
  const errorList = idx.errors.length ? '<div class="notice danger"><strong>索引检查发现问题</strong><ul>' + idx.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul></div>' : '<div class="notice success">索引检查通过：ID 无冲突，引用完整，依赖按顺序建立。</div>';
  const warningList = idx.warnings.length ? '<div class="notice mt-2"><strong>提示</strong><ul>' + idx.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '';
  const resultHtml = importResult ? '<div class="import-result"><div class="notice ' + (importResult.errors.length ? 'danger' : 'success') + '"><strong>' + (importResult.errors.length ? '导入未完成' : '导入完成') + '</strong>' +
    (importResult.errors.length ? '<ul>' + importResult.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul>' : '') +
    (importResult.warnings && importResult.warnings.length ? '<ul>' + importResult.warnings.map(w => '<li>提示：' + esc(w) + '</li>').join('') + '</ul>' : '') +
    '</div></div>' : '';
  return '' +
    '<div class="page-wrap packs-page">' +
      '<div class="page-head"><div class="page-head-main"><div class="page-kicker">EXPANSION INDEX / NAMESPACED IDs</div><h1>扩展包管理</h1><p>导入、启用、禁用并检查扩展包。加载时建立全局索引，校验 ID 冲突、缺失引用与循环依赖；扩展内容使用包命名空间。</p></div><div class="page-head-side"><span class="chip">' + idx.packCount + ' 已加载</span><span class="chip">' + packs.length + ' 本地包</span><button class="btn" type="button" data-action="pack-check">重新检查</button></div></div>' +
      errorList + warningList +
      '<div class="pack-grid mt-2">' + packs.map(packCard).join('') + '</div>' +
      '<div class="mt-3"><div class="section-heading"><div><h2>导入扩展包</h2><p>支持 JSON 文件、粘贴 JSON 或 CAE1 分享码。导入前执行结构与引用检查。</p></div></div>' +
        '<div class="import-grid">' +
          '<section class="panel"><div class="panel-head"><div><h3>从文本或分享码导入</h3><div class="panel-sub">格式：caerogue.expansion</div></div></div><div class="panel-body"><textarea class="textarea mono" rows="9" placeholder="粘贴扩展包 JSON 或 CAE1 分享码" data-pack-import-text>' + esc(this._packImportText || '') + '</textarea><div class="btn-row mt-2"><button class="btn btn-primary" type="button" data-action="pack-import-text">检查并导入</button><button class="btn" type="button" data-action="pack-format-hint">格式说明</button></div>' + resultHtml + '</div></section>' +
          '<section class="panel"><div class="panel-head"><div><h3>从文件导入</h3><div class="panel-sub">本地 JSON 文件</div></div></div><div class="panel-body"><button class="drop-zone btn-block" type="button" data-action="pack-pick-file"><img src="assets/icons/packs.svg" alt=""><strong>选择扩展包文件</strong><small>点击选择 .json 文件，或拖入此区域</small></button><input class="hide" type="file" accept=".json,application/json" data-pack-file-input><div class="notice mt-2">导入不会修改内置牌组；扩展包使用自身命名空间。当前版本的冲突检查会拒绝与内置内容同 ID 的条目。</div></div></section>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 notice"><strong>依赖顺序</strong><br>启用依赖包时，系统会按依赖关系排列索引；禁用仍被其他扩展依赖的扩展会被拒绝。分享码与 JSON 只在本机流转，不依赖后端服务。</div>' +
    '</div>';
};

App.handlePackPayload = function (raw, options) {
  try {
    let payload = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) throw new Error('内容为空。');
      if (trimmed.startsWith('CAE1.')) payload = decodeShareCode(trimmed);
      else payload = JSON.parse(trimmed);
    }
    if (!payload || typeof payload !== 'object') throw new Error('不是有效的扩展包对象。');
    const result = Store.importPack(payload, options || {});
    this._packImportResult = { errors: result.ok ? [] : result.errors, warnings: result.warnings || [] };
    if (result.ok) {
      this._packImportText = '';
      this.toast('扩展包「' + result.pack.name + '」已导入并启用。', 'success');
      this.render();
    } else {
      this.toast(result.errors[0] || '扩展包校验失败。', 'error', '导入失败');
      this.render();
    }
    return result;
  } catch (error) {
    this._packImportResult = { errors: [error.message], warnings: [] };
    this.toast(error.message, 'error', '导入失败');
    this.render();
    return { ok: false, errors: [error.message], warnings: [] };
  }
};

App.importPackFromFile = function (file) {
  if (!file) return;
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    this.toast('请选择 JSON 扩展包文件。', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    this.handlePackPayload(String(reader.result || ''));
  };
  reader.onerror = () => this.toast('文件读取失败。', 'error');
  reader.readAsText(file);
};

App.exportPack = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  this.downloadJson(pack.id + '.caerogue.json', pack);
};

App.inspectPack = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  const groups = ['units', 'equipment', 'runes', 'skills', 'effects'].map(category => {
    const labels = { units: '角色', equipment: '装备', runes: '符文', skills: '技能', effects: '高级效果' };
    const items = pack.content[category] || [];
    return '<div class="detail-section-title">' + labels[category] + ' · ' + items.length + '<span class="line"></span></div><div class="row wrap">' + (items.length ? items.map(item => '<span class="chip">' + esc(item.name || item.id) + '</span>').join('') : '<span class="faint tiny">无内容</span>') + '</div>';
  }).join('');
  this.openModal({ title: pack.name, subtitle: pack.id + ' · v' + pack.version + ' · ' + pack.author, size: 'large', body: groups + '<div class="notice mt-2">' + esc(pack.description || '') + '</div>' });
};

App.sharePackModal = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  const code = encodeShareCode(pack);
  this.openModal({
    title: '分享码 · ' + pack.name,
    subtitle: '分享码包含完整扩展包 JSON，可粘贴到创意工坊或扩展包管理导入。',
    size: 'large',
    body: '<textarea class="share-code" readonly rows="7" data-share-code>' + esc(code) + '</textarea><div class="share-actions"><button class="btn" type="button" data-action="pack-copy-share" data-pack="' + attr(pack.id) + '">复制分享码</button><span class="muted">' + code.length + ' 字符</span></div>'
  });
};

/* ---------- Workshop ---------- */
App.renderWorkshop = function () {
  const packs = Store.state.packs;
  let selected = packs.find(pack => pack.id === this.workshopSelected) || packs[0] || null;
  if (!selected) this.workshopSelected = null;
  else this.workshopSelected = selected.id;
  const list = packs.length ? packs.map(pack => {
    const fav = Store.state.favorites.includes(pack.id);
    return '<button class="workshop-item' + (selected && selected.id === pack.id ? ' active' : '') + '" type="button" data-action="workshop-select" data-pack="' + attr(pack.id) + '"><img src="assets/icons/workshop.svg" alt=""><span class="wi-main"><strong>' + esc(pack.name) + '</strong><small>' + esc(pack.id) + ' · v' + esc(pack.version) + '</small></span>' + (fav ? '<span class="wi-fav">收藏</span>' : '') + '</button>';
  }).join('') : '<div class="empty-state"><img src="assets/icons/workshop.svg" alt=""><h3>还没有本地扩展</h3><p>可以导入分享码、从扩展包管理导入 JSON，或把编辑器草稿发布到本地工坊。</p></div>';
  let detail = '';
  if (selected) {
    const code = encodeShareCode(selected);
    const fav = Store.state.favorites.includes(selected.id);
    const note = Store.state.notes[selected.id] || '';
    const counts = selected.content || { units: [], skills: [], effects: [], equipment: [], runes: [] };
    detail = '' +
      '<section class="panel workshop-detail"><div class="panel-body">' +
        '<div class="workshop-hero"><img src="assets/icons/workshop.svg" alt=""><div class="wh-main"><h2>' + esc(selected.name) + '</h2><p>' + esc(selected.id) + ' · v' + esc(selected.version) + ' · 作者 ' + esc(selected.author) + '</p><div class="pack-meta mt-1">' + (fav ? '<span class="chip gold">已收藏</span>' : '<span class="chip">未收藏</span>') + '<span class="chip ' + (Store.isEnabled(selected.id) ? 'green' : '') + '">' + (Store.isEnabled(selected.id) ? '已启用' : '已禁用') + '</span>' + ((selected.dependencies || []).length ? '<span class="chip">依赖 ' + selected.dependencies.map(esc).join('、') + '</span>' : '') + '</div></div><div class="wh-actions"><button class="btn btn-sm" type="button" data-action="workshop-favorite" data-pack="' + attr(selected.id) + '">' + (fav ? '取消收藏' : '收藏') + '</button><button class="btn btn-sm" type="button" data-action="pack-export" data-pack="' + attr(selected.id) + '">导出 JSON</button><button class="btn btn-sm" type="button" data-action="pack-inspect" data-pack="' + attr(selected.id) + '">内容</button></div></div>' +
        '<p class="modal-copy mt-2">' + esc(selected.description || '暂无说明。') + '</p>' +
        '<div class="pack-stats">' + [['units', '角色'], ['equipment', '装备'], ['runes', '符文'], ['skills', '技能'], ['effects', '效果']].map(([key, label]) => '<div class="pack-stat"><b>' + (counts[key] || []).length + '</b><span>' + label + '</span></div>').join('') + '</div>' +
        '<div class="share-zone"><div class="detail-section-title">分享码<span class="line"></span></div><textarea class="share-code" readonly rows="5" data-share-code>' + esc(code) + '</textarea><div class="share-actions"><button class="btn" type="button" data-action="workshop-copy-share" data-pack="' + attr(selected.id) + '">复制分享码</button><button class="btn btn-quiet" type="button" data-action="pack-share" data-pack="' + attr(selected.id) + '">单独展示</button><span class="muted">内容以 JSON 扩展包与分享码流转，不依赖后端。</span></div></div>' +
        '<div class="workshop-note"><div class="detail-section-title">本地说明<span class="line"></span></div><textarea class="textarea" rows="4" data-workshop-note data-pack="' + attr(selected.id) + '" placeholder="记录这套扩展包的用途、测试记录或改动计划">' + esc(note) + '</textarea><div class="workshop-note-actions"><span class="tiny faint">说明仅保存在本地，不写入分享码。</span><button class="btn btn-sm" type="button" data-action="workshop-save-note" data-pack="' + attr(selected.id) + '">保存说明</button></div></div>' +
      '</div></section>';
  } else {
    detail = '<div class="empty-state workshop-empty"><img src="assets/icons/workshop.svg" alt=""><h3>创意工坊待命中</h3><p>本地扩展包会显示在这里。导出 JSON、生成 CAE1 分享码，或把编辑器草稿发布到工坊。</p><div class="actions"><button class="btn btn-primary" type="button" data-action="workshop-publish-draft">发布编辑器草稿</button><button class="btn" type="button" data-action="open-route" data-route="expansions">导入扩展包</button></div></div>';
  }
  const draft = Store.state.editorPack;
  const draftCount = draft ? contentCount(draft) + (draft.content ? draft.content.skills.length + draft.content.effects.length : 0) : 0;
  return '' +
    '<div class="page-wrap workshop-page">' +
      '<div class="page-head"><div class="page-head-main"><div class="page-kicker">LOCAL CREATIVE WORKSHOP</div><h1>创意工坊</h1><p>管理本地扩展包索引、生成分享码与维护说明。工坊内容以 JSON 扩展包流转，不直接修改内置卡牌。</p></div><div class="page-head-side"><span class="chip">' + packs.length + ' 本地包</span><button class="btn" type="button" data-action="open-route" data-route="expansions">扩展包管理</button></div></div>' +
      '<div class="workshop-layout">' +
        '<div class="stack">' +
          '<section class="panel"><div class="panel-head"><div><h3>本地扩展索引</h3><div class="panel-sub">收藏、选择与维护</div></div><button class="btn btn-sm" type="button" data-action="workshop-publish-draft">发布草稿</button></div><div class="panel-body"><div class="workshop-list">' + list + '</div><div class="notice mt-2"><strong>设计草稿</strong><br>' + (draft && draftCount ? esc(draft.name) + ' · ' + draftCount + ' 项内容可发布。' : '尚未创建编辑器内容。') + '</div></div></section>' +
          '<section class="panel"><div class="panel-head"><div><h3>从分享码导入</h3><div class="panel-sub">CAE1 分享码或 JSON</div></div></div><div class="panel-body"><textarea class="textarea mono" rows="5" placeholder="粘贴 CAE1 分享码或扩展包 JSON" data-workshop-import></textarea><div class="btn-row mt-2"><button class="btn btn-primary" type="button" data-action="workshop-import">导入到本地</button><button class="btn" type="button" data-action="workshop-import-clear">清空</button></div></div></section>' +
        '</div>' +
        detail +
      '</div>' +
    '</div>';
};

App.publishEditorDraft = function () {
  const draft = Store.state.editorPack;
  if (!draft) {
    this.toast('编辑器中还没有草稿。', 'error');
    return;
  }
  const counts = ['units', 'skills', 'effects', 'equipment', 'runes'].map(key => (draft.content[key] || []).length);
  if (counts.reduce((sum, n) => sum + n, 0) === 0) {
    this.toast('草稿中没有可发布的内容。', 'error');
    return;
  }
  const raw = deepClone(draft);
  raw.id = raw.id || 'draft.local';
  raw.content.skills.forEach(item => { item.packId = raw.id; });
  raw.content.effects.forEach(item => { item.packId = raw.id; });
  const existing = Store.getPack(raw.id);
  const result = Store.validatePack(raw, { replace: !!existing });
  if (!result.ok) {
    this.openModal({ title: '草稿无法发布', subtitle: '请先修正校验问题', body: '<div class="notice danger"><ul>' + result.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul></div>' });
    return;
  }
  const imported = Store.importPack(raw, { replace: true });
  if (!imported.ok) {
    this.toast(imported.errors[0], 'error');
    return;
  }
  this.workshopSelected = imported.pack.id;
  this.render();
  this.toast('设计草稿已发布为本地扩展包。', 'success');
};

App.importWorkshopCode = function () {
  const input = document.querySelector('[data-workshop-import]');
  const raw = input ? input.value : '';
  if (!raw.trim()) { this.toast('请先粘贴分享码或 JSON。', 'error'); return; }
  const result = this.handlePackPayload(raw);
  if (result && result.ok) {
    this.workshopSelected = result.pack.id;
    this.render();
  }
};

App.bindWorkshopNote = function () {
  // Notes are persisted through the global input handler; this hook is intentionally light.
};

/* ---------- Settings ---------- */
App.renderSettings = function () {
  const settings = Store.state.settings;
  const idx = Store.index;
  const toggle = (key, title, hint) => '<div class="toggle-row"><div class="toggle-copy"><strong>' + esc(title) + '</strong><small>' + esc(hint) + '</small></div><button class="toggle" type="button" aria-pressed="' + (settings[key] ? 'true' : 'false') + '" data-action="setting-toggle" data-setting="' + key + '" aria-label="' + attr(title) + '"></button></div>';
  return '' +
    '<div class="page-wrap settings-page">' +
      '<div class="page-head"><div class="page-head-main"><div class="page-kicker">PREFERENCES / LOCAL STORAGE</div><h1>设置</h1><p>显示、战斗反馈与本地数据选项。战斗中的状态修改始终顺序执行；这里的设置只影响呈现与节奏。</p></div><div class="page-head-side"><span class="chip ' + (Store.storageAvailable ? 'green' : 'red') + '">' + (Store.storageAvailable ? '本地存储可用' : '本地存储不可用') + '</span><span class="chip">版本 ' + APP_VERSION + '</span></div></div>' +
      '<div class="settings-layout">' +
        '<div class="settings-main">' +
          '<section class="panel settings-section"><div class="panel-head"><div><h3>战斗与显示</h3><div class="panel-sub">只影响界面呈现，不改变结算顺序。</div></div></div><div class="panel-body">' +
            toggle('reduceMotion', '减少动效', '关闭页面过渡与卡牌浮动动画。') +
            toggle('compactLog', '紧凑战斗日志', '隐藏公式与系统记录，保留行动、伤害、效果与退场。') +
            toggle('confirmAction', '危险操作前确认', '在认输、离开对局等操作前显示确认提示。') +
            toggle('showFormula', '显示伤害公式', '在战斗日志中记录基础伤害、修正值、抗性与实际伤害。') +
            '<div class="toggle-row"><div class="toggle-copy"><strong>自动行动间隔</strong><small>仅用于 AI 行动之间的界面节奏，不参与状态计算。</small></div><select class="select" style="width:132px" data-setting-ai-delay><option value="250"' + (Number(settings.aiDelay) === 250 ? ' selected' : '') + '>快速 250ms</option><option value="650"' + (Number(settings.aiDelay) === 650 ? ' selected' : '') + '>标准 650ms</option><option value="1100"' + (Number(settings.aiDelay) === 1100 ? ' selected' : '') + '>缓慢 1100ms</option></select></div>' +
          '</div></section>' +
          '<section class="panel settings-section"><div class="panel-head"><div><h3>数据与维护</h3><div class="panel-sub">本地浏览器存档</div></div></div><div class="panel-body">' +
            '<div class="settings-grid"><div class="settings-card"><h3>当前索引</h3><p>' + idx.packCount + ' 个已启用扩展 · ' + idx.cards + ' 张卡牌 · ' + idx.skills.length + ' 个技能 · ' + idx.effects.length + ' 个高级效果</p></div><div class="settings-card"><h3>存档位置</h3><p>localStorage · ' + (Store.storageAvailable ? '可用' : '不可用') + '<br>键名 ' + STORAGE_KEY + '</p></div></div>' +
            '<div class="btn-row mt-2"><button class="btn" type="button" data-action="settings-export-save">导出本地存档</button><button class="btn" type="button" data-action="setting-pick-save">查看存档数据</button><button class="btn btn-quiet" type="button" data-action="open-route" data-route="expansions">检查扩展包索引</button></div>' +
            '<div class="reset-zone mt-3"><h3>重置本地数据</h3><p>清除本地扩展包、设计草稿、收藏、说明、牌组修改与对局记录，恢复默认设置。该操作不可撤销。</p><div class="btn-row mt-2"><button class="btn btn-danger" type="button" data-action="settings-reset">重置全部数据</button></div></div>' +
          '</div></section>' +
        '</div>' +
        '<aside class="settings-aside stack">' +
          '<section class="panel"><div class="panel-body about-block"><div class="about-mark"><img src="assets/pictures/brand-mark.svg" alt=""><div><h2>CAEROGUE</h2><p>HTML · CSS · LOCAL ASSETS</p></div></div><p class="modal-copy">一个面向可视化技能设计实验的卡牌战术单页应用。默认内容与扩展包使用纯 JSON 描述，战斗流程按单链式队列解释执行。</p><div class="validity-list"><span class="chip">版本 ' + APP_VERSION + '</span><span class="chip">无外部依赖</span><span class="chip">浅色主题</span></div></div></section>' +
          '<section class="panel"><div class="panel-head"><h3>结算原则</h3></div><div class="panel-body"><div class="rule-principles">' +
            [['退场优先于处决，处决优先于击败'], ['强制回复优先于禁疗，禁疗优先于回复'], ['条件只在对应操作发生时判定一次'], ['所有待处理退场在当前操作批次末统一结算'], ['同名角色的各类状态按绝对独立战斗 ID 存储']].map((text, index) => '<div class="rule-principle"><span class="no">' + (index + 1) + '</span><span>' + text + '</span></div>').join('') +
          '</div></div></section>' +
          '<section class="panel"><div class="panel-head"><h3>快捷入口</h3></div><div class="panel-body"><div class="stack gap-sm"><button class="btn btn-block" type="button" data-action="open-route" data-route="editor">技能与效果编辑器</button><button class="btn btn-block" type="button" data-action="open-route" data-route="library">卡牌库</button><button class="btn btn-block" type="button" data-action="open-route" data-route="expansions">扩展包管理</button></div></div></section>' +
        '</aside>' +
      '</div>' +
    '</div>';
};

/* ---------- Event handling ---------- */
App.bindEvents = function () {
  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'modal-backdrop') {
      if (event.target === actionEl) this.closeModal();
      return;
    }
    this.handleAction(action, actionEl, event);
  });
  document.addEventListener('input', (event) => this.handleInputEvent(event));
  document.addEventListener('change', (event) => this.handleChangeEvent(event));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (this.modalOpen) this.closeModal();
      return;
    }
    const roleEl = event.target.closest('[role="button"][data-action]');
    if (roleEl && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      roleEl.click();
    }
  });
  document.addEventListener('dragstart', (event) => {
    if (this.route === 'editor' && window.EditorUI) EditorUI.onDragStart(event, this);
  });
  document.addEventListener('dragover', (event) => {
    if (this.route === 'editor' && window.EditorUI) { EditorUI.onDragOver(event, this); return; }
    if (this.route === 'expansions') {
      const zone = event.target.closest('.drop-zone');
      if (zone) { event.preventDefault(); zone.classList.add('drag-over'); }
    }
  });
  document.addEventListener('dragleave', (event) => {
    if (this.route !== 'expansions') return;
    const zone = event.target.closest('.drop-zone');
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
  });
  document.addEventListener('drop', (event) => {
    if (this.route === 'editor' && window.EditorUI) { EditorUI.onDrop(event, this); return; }
    if (this.route === 'expansions') {
      const zone = event.target.closest('.drop-zone');
      if (zone) {
        event.preventDefault();
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) this.importPackFromFile(file);
        zone.classList.remove('drag-over');
      }
    }
  });
  document.addEventListener('dragend', (event) => {
    if (this.route === 'editor' && window.EditorUI) EditorUI.onDragEnd(event, this);
  });
  window.addEventListener('hashchange', () => {
    this.enterRoute(this.parseRoute());
  });
};

App.handleInputEvent = function (event) {
  const target = event.target;
  if (!target) return;
  if (this.route === 'setup' && target.matches('[data-setup-rule]')) {
    this.setupRuleInput(target.dataset.setupRule, target.value);
    return;
  }
  if (this.route === 'library' && target.matches('[data-library-search]')) {
    this.library.search = target.value;
    this.updateLibraryResults();
    return;
  }
  if (this.route === 'builder' && target.matches('[data-builder-search]')) {
    this.builder.search = target.value;
    this.updateBuilderPool();
    return;
  }
  if (this.route === 'expansions' && target.matches('[data-pack-import-text]')) {
    this._packImportText = target.value;
    return;
  }
  if (this.route === 'workshop' && target.matches('[data-workshop-note]')) {
    Store.setNote(target.dataset.pack, target.value);
    return;
  }
  if (this.route === 'editor' && window.EditorUI) {
    EditorUI.handleInput(event, this);
    return;
  }
  if (target.matches('[data-setting-ai-delay]')) {
    Store.state.settings.aiDelay = Number(target.value) || 650;
    Store.save();
  }
};

App.handleChangeEvent = function (event) {
  const target = event.target;
  if (!target) return;
  if (this.route === 'library' && target.matches('[data-library-quality]')) {
    this.library.quality = target.value;
    this.render();
    return;
  }
  if (this.route === 'expansions' && target.matches('[data-pack-file-input]')) {
    const file = target.files && target.files[0];
    if (file) this.importPackFromFile(file);
    target.value = '';
    return;
  }
  if (this.route === 'builder' && target.matches('[data-builder-search]')) {
    this.builder.search = target.value;
    this.updateBuilderPool();
    return;
  }
  if (this.route === 'setup' && target.matches('[data-setup-rule]')) {
    this.setupRuleInput(target.dataset.setupRule, target.value);
    this.render();
    return;
  }
  if (this.route === 'editor' && window.EditorUI) {
    EditorUI.handleInput(event, this);
  }
};

App.handleAction = function (action, el, event) {
  if (this._battleFxActive && action && action.startsWith('battle-')) {
    const allowed = ['battle-log-toggle', 'battle-unit-info', 'battle-unit-counts', 'battle-unit-gear', 'battle-show-result', 'battle-deck-info'];
    if (!allowed.includes(action)) return;
  }
  if (window.EditorUI && typeof EditorUI.handleAction === 'function' && EditorUI.handleAction(action, el, this, event)) return;
  if (window.ModesUI && typeof ModesUI.handleAction === 'function' && ModesUI.handleAction(action, el, this, event)) return;
  const data = el.dataset;
  switch (action) {
    case 'goto-home':
      if (this.battle && this.route === 'battle') {
        if (Store.state.settings.confirmAction) this.confirm({ title: '返回主菜单', message: '当前对局进度将被舍弃。', confirmLabel: '舍弃并返回', danger: true, onConfirm: () => this.leaveBattle(true, 'home') });
        else this.leaveBattle(true, 'home');
        return;
      }
      this.go('home');
      break;
    case 'quick-battle':
      if (this.battle && this.route === 'battle') { this.toast('当前对局尚未结束。', 'error'); return; }
      this.openSetup('versus');
      break;
    case 'open-setup':
      if (this.battle && this.route === 'battle') { this.toast('请先结束或离开当前对局。', 'error'); return; }
      this.openSetup(data.mode || 'versus');
      break;
    case 'open-route':
      if (this.battle && this.route === 'battle') { this.toast('请先结束或离开当前对局。', 'error'); return; }
      this.go(data.route || 'home');
      break;
    case 'modal-close':
      this.closeModal();
      break;
    case 'modal-confirm': {
      const callback = this._modalConfirm;
      this.closeModal();
      if (typeof callback === 'function') callback();
      break;
    }
    case 'setup-toggle-rule':
      this.setupToggleRule(data.rule);
      break;
    case 'setup-edit-deck':
      this.openBuilder(data.side || 'A');
      break;
    case 'setup-view-deck':
      this.setupViewDeck(data.side || 'A');
      break;
    case 'setup-reset-decks':
      this.resetSetupDecks();
      break;
    case 'setup-start':
      this.setupStart();
      break;
    case 'builder-type':
      this.builder.type = data.type;
      this.builder.search = '';
      this.updateBuilderPool();
      const searchInput = document.querySelector('[data-builder-search]');
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.pool-tabs .segment').forEach(seg => seg.classList.toggle('active', seg.dataset.type === data.type));
      break;
    case 'builder-pick':
      this.builderPick(data.type, data.id);
      break;
    case 'builder-add':
      this.builderAdd(data.type, data.id);
      break;
    case 'builder-remove':
      this.builderRemove(data.type, data.id);
      break;
    case 'builder-save':
      this.builderSaved();
      break;
    case 'builder-back':
      this.builder = null;
      this.go('setup');
      break;
    case 'builder-recommended':
      this.builderRecommended();
      break;
    case 'library-type':
      this.library.type = data.type;
      this.render();
      break;
    case 'library-select':
      this.selectLibraryCard(data.type, data.id);
      break;
    case 'library-quality':
      this.library.quality = data.quality || 'all';
      this.render();
      break;
    case 'library-open-card':
      this.openCardFromOther(data.type, data.id);
      break;
    case 'battle-unit':
      this.selectBattleUnit(data.uid);
      break;
    case 'battle-skill':
      this.chooseBattleSkill(data.uid, data.skill, 'active');
      break;
    case 'battle-extra':
      this.chooseBattleSkill(data.uid, data.skill, 'extra');
      break;
    case 'battle-confirm-skill':
      this.confirmBattleSkill();
      break;
    case 'battle-cancel-skill':
      this.cancelBattleSkill();
      break;
    case 'battle-pass':
      this.passBattleAction(data.uid);
      break;
    case 'battle-unit-info':
      this.openBattleUnitInfo(data.uid);
      break;
    case 'battle-unit-counts':
      this.openBattleCounts(data.uid);
      break;
    case 'battle-unit-gear':
      this.openBattleGear(data.uid);
      break;
    case 'battle-deploy-open':
      this.openDeployMenu(data.side);
      break;
    case 'battle-deploy-card':
      this.deployBattleCard(data.side, Number(data.index));
      break;
    case 'battle-equipment-open':
      this.openEquipmentMenu(data.side, data.id);
      break;
    case 'battle-equip-confirm':
      this.equipBattleCard(data.side, data.id, data.unit);
      break;
    case 'battle-equipment-destroy':
      this.destroyBattleEquipment(data.side, data.id);
      break;
    case 'battle-rune-config':
      this.openRuneConfig(data.side);
      break;
    case 'battle-rune-toggle':
      this.toggleRuneDraft(data.side, data.id);
      break;
    case 'battle-rune-apply':
      this.applyRuneConfig(data.side);
      break;
    case 'battle-hand-info':
      this.openBattleHandInfo(data.id);
      break;
    case 'battle-deck-info':
      this.openBattleDeckInfo();
      break;
    case 'battle-log-toggle':
      this.openBattleLog();
      break;
    case 'battle-surrender':
      this.surrenderBattle();
      break;
    case 'battle-leave':
      if (Store.state.settings.confirmAction) this.confirm({ title: '离开对局', message: '当前对局进度将被舍弃。', confirmLabel: '确认离开', danger: true, onConfirm: () => this.leaveBattle(true) });
      else this.leaveBattle(true);
      break;
    case 'battle-show-result':
      this.showBattleResult();
      break;
    case 'battle-return-setup':
      this.closeModal();
      this.battle = null; this.battleUI = null; this.battleContext = null; this._resultShownFor = null;
      this.go('setup');
      break;
    case 'battle-return-home':
      this.closeModal();
      this.battle = null; this.battleUI = null; this.battleContext = null; this._resultShownFor = null;
      this.go('home');
      break;
    case 'pack-toggle': {
      const pack = Store.getPack(data.pack);
      if (!pack) break;
      const result = Store.setEnabled(data.pack, !Store.isEnabled(data.pack));
      if (!result.ok) this.toast(result.error, 'error');
      else this.toast('扩展包「' + pack.name + '」' + (Store.isEnabled(data.pack) ? '已启用' : '已禁用') + '。', 'success');
      this.render();
      break;
    }
    case 'pack-export':
      this.exportPack(data.pack);
      break;
    case 'pack-inspect':
      this.inspectPack(data.pack);
      break;
    case 'pack-share':
      this.sharePackModal(data.pack);
      break;
    case 'pack-copy-share': {
      const pack = Store.getPack(data.pack);
      if (pack) this.copyText(encodeShareCode(pack), '分享码已复制。');
      break;
    }
    case 'pack-delete': {
      const pack = Store.getPack(data.pack);
      if (!pack) break;
      this.confirm({ title: '删除扩展包', message: '确认删除「' + pack.name + '」？其内容会从当前索引移除，依赖它的扩展也会无法启用。', confirmLabel: '删除', danger: true, onConfirm: () => {
        const result = Store.removePack(data.pack);
        if (!result.ok) this.toast(result.error, 'error');
        else this.toast('扩展包已删除。', 'success');
        this.render();
      } });
      break;
    }
    case 'pack-check':
      Store.rebuild();
      this.render();
      this.toast(Store.index.errors.length ? '索引检查发现 ' + Store.index.errors.length + ' 个问题。' : '索引检查通过。', Store.index.errors.length ? 'error' : 'success');
      break;
    case 'pack-import-text': {
      const area = document.querySelector('[data-pack-import-text]');
      const raw = area ? area.value : (this._packImportText || '');
      this._packImportText = raw;
      this.handlePackPayload(raw);
      break;
    }
    case 'pack-pick-file': {
      const input = document.querySelector('[data-pack-file-input]');
      if (input) input.click();
      break;
    }
    case 'pack-format-hint':
      this.openModal({ title: '扩展包格式', subtitle: 'caerogue.expansion', size: 'large', body: '<p class="modal-copy">扩展包必须包含 format、id、name、version、author、description、dependencies、content。content 可包含 units、skills、effects、equipment、runes 数组。所有条目应使用包命名空间前缀，避免与内置内容冲突。</p><pre class="code-block mt-2">' + esc(JSON.stringify({ format: 'caerogue.expansion', id: 'my.pack', name: '我的扩展', version: '0.1.0', author: '本地作者', description: '', dependencies: ['core'], content: { units: [], skills: [], effects: [], equipment: [], runes: [] } }, null, 2)) + '</pre>' });
      break;
    case 'workshop-select':
      this.workshopSelected = data.pack;
      this.render();
      break;
    case 'workshop-favorite': {
      const active = Store.toggleFavorite(data.pack);
      this.toast(active ? '已加入收藏。' : '已取消收藏。', 'success');
      this.render();
      break;
    }
    case 'workshop-copy-share': {
      const pack = Store.getPack(data.pack);
      if (pack) this.copyText(encodeShareCode(pack), '分享码已复制。');
      break;
    }
    case 'workshop-save-note': {
      const area = document.querySelector('[data-workshop-note]');
      if (area) Store.setNote(data.pack, area.value);
      this.toast('本地说明已保存。', 'success');
      break;
    }
    case 'workshop-import':
      this.importWorkshopCode();
      break;
    case 'workshop-import-clear': {
      const input = document.querySelector('[data-workshop-import]');
      if (input) input.value = '';
      break;
    }
    case 'workshop-publish-draft':
      this.publishEditorDraft();
      break;
    case 'setting-toggle':
      Store.toggleSetting(data.setting);
      if (data.setting === 'reduceMotion') document.body.classList.toggle('reduce-motion', !!Store.state.settings.reduceMotion);
      this.render();
      break;
    case 'settings-reset':
      this.confirm({ title: '重置全部本地数据', message: '这会清除本地扩展包、设计草稿、收藏、说明、牌组与对局记录。此操作不可撤销。', confirmLabel: '确认重置', danger: true, onConfirm: () => {
        Store.resetAll();
        this.setup = null;
        this.builder = null;
        this.battle = null;
        this.battleContext = null;
        this._resultShownFor = null;
        this.workshopSelected = null;
        this._packImportText = '';
        this._packImportResult = null;
        if (window.EditorUI) EditorUI.reset();
        if (window.ModesUI) ModesUI.reset();
        document.body.classList.toggle('reduce-motion', !!Store.state.settings.reduceMotion);
        this.go('home');
        this.toast('本地数据已重置。', 'success');
      } });
      break;
    case 'settings-export-save':
      this.downloadJson('caerogue-save.json', Store.state);
      break;
    case 'setting-pick-save':
      this.openModal({ title: '本地存档数据', subtitle: '可用于排错与备份', size: 'large', body: '<pre class="code-block" style="max-height:55vh">' + esc(JSON.stringify(Store.state, null, 2)) + '</pre>' });
      break;
    case 'modal-close':
      this.closeModal();
      break;
    default:
      this.toast('未识别的操作：' + action, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
