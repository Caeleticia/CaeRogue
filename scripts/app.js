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
  return { unit: L('ui.6b26695e4dce'), equipment: L('ui.1faf3321a84f'), rune: L('ui.52bd5ee23b8d') }[type] || L('ui.91b7735c3069');
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
  return pack ? pack.name : (packId || L('ui.46a9e40651b3'));
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
  if (!step) return L('ui.2906b5f44491');
  if (step.kind === 'damage' && step.bonus) return L('ui.683a6ce05a97');
  const meta = STEP_LIBRARY.find(item => item.kind === step.kind);
  return meta ? meta.name : step.kind;
}

function stepSummary(step) {
  if (!step) return '';
  switch (step.kind) {
    case 'damage': {
      const targetText = TARGET_MODES[step.target || 'chosen'] ? (step.target === 'chosen' ? L('ui.eb7098eca082') : step.target) : (step.target || L('ui.eb7098eca082'));
      if (step.useSkillValue) return (step.rawDamage ? L('ui.683a6ce05a97') : '') + (DAMAGE_TYPES[step.damageType] || DAMAGE_TYPES.physical).label + ' ' + (step.valueFormula || '{self}.atk') + ' ×' + (step.multiplier == null ? 100 : step.multiplier) + '%，' + targetText;
      return (step.bonus ? L('ui.8eaa1a49d5e7') : '') + (DAMAGE_TYPES[step.damageType] || DAMAGE_TYPES.physical).label + ' ' + (step.formula || '0') + '，' + targetText;
    }
    case 'heal': return L('ui.0fe992a5e20d') + (step.formula || '0');
    case 'addEffect': return L('ui.bdf8e628c405') + (step.effectId || L('ui.2c6270bccebb')) + ' ×' + (step.stacks || '1');
    case 'removeEffect': return L('ui.0c209cd06895') + (step.effectId || L('ui.c70c2b103ba2'));
    case 'modifyCount': return (COUNT_SCOPES[step.scope] || COUNT_SCOPES.unit).label + ' ' + (step.countId || L('ui.55a04b58cd2c')) + ' ' + (step.mode === 'set' ? '=' : '+') + ' ' + (step.formula || '0');
    case 'readCount': return L('ui.9e1cbead6180') + (step.varName || 'value');
    case 'branch': return L('ui.dbde4f0f6336') + (step.left || '0') + ' ' + (step.op || '>=') + ' ' + (step.right || '0');
    case 'selectTarget': return L('ui.c521654d1f03') + (TARGET_MODES[step.mode] ? TARGET_MODES[step.mode].label : (step.mode || ''));
    case 'forEach': return L('ui.4d9dfc528db4') + (step.source || 'chosen');
    case 'loop': return L('ui.9cf6df0e054d') + (step.times || '1') + L('ui.793578ecc72c');
    case 'castSkill': return L('ui.7adab4759a7d') + (step.skillId || L('ui.2c6270bccebb'));
    case 'skipAction': return L('ui.c0a60cdb3f3b');
    case 'immuneDamage': return L('ui.17d185d84555');
    case 'forceRetreat': return L('ui.040e3da5d8f6');
    case 'summon': return L('ui.13f7451fac8f') + (step.unitId || L('ui.2c6270bccebb')) + ' ×' + (step.count || '1');
    case 'modifyStat': return L('ui.01b4ba8bdc1a') + (STAT_KEYS[step.stat] || step.stat || L('ui.7d3c35c29be1'));
    case 'setVar': return L('ui.c812a722713f') + (step.varName || 'value') + ' = ' + (step.formula || '0');
    default: return meta ? meta.name : step.kind;
  }
}

function renderFlowTree(steps, depth) {
  depth = depth || 0;
  if (!Array.isArray(steps) || !steps.length) {
    return L('ui.3cfff12f09c7');
  }
  let html = '<div class="flow-tree">';
  steps.forEach((step, index) => {
    html += '<div class="ft-row"><span class="ft-index">' + String(index + 1).padStart(2, '0') + '</span><span class="ft-label">' + esc(stepLabel(step)) + '</span><span>' + esc(stepSummary(step)) + '</span></div>';
    if (step.kind === 'branch') {
      if (step.then && step.then.length) html += L('ui.57f3573a5efb') + renderFlowTreeInner(step.then, depth + 1) + '</div>';
      if (step.elseSteps && step.elseSteps.length) html += L('ui.62e0f5317e59') + renderFlowTreeInner(step.elseSteps, depth + 1) + '</div>';
    }
    if ((step.kind === 'forEach' || step.kind === 'loop') && step.steps && step.steps.length) {
      html += '<div class="ft-branch">' + renderFlowTreeInner(step.steps, depth + 1) + '</div>';
    }
  });
  html += '</div>';
  return html;
}
function renderFlowTreeInner(steps, depth) {
  if (depth > 5) return L('ui.eb4d528cad23');
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
  if (!skill || !skill.requirements || !skill.requirements.length) return L('ui.9bd2655786de');
  return skill.requirements.map(req => {
    const scope = COUNT_SCOPES[req.scope || 'unit'] ? COUNT_SCOPES[req.scope || 'unit'].label : L('ui.37802b1dfc26');
    const opMap = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', neq: '≠' };
    return scope + '「' + (req.countId || L('ui.55a04b58cd2c')) + '」' + (opMap[req.op] || '≥') + (req.value == null ? '0' : req.value);
  }).join('；');
}

function renderSkillDetailCard(skill) {
  if (!skill) return '';
  return '' +
    '<div class="skill-detail-card">' +
      '<div class="skill-detail-head">' +
        '<span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span>' +
        '<strong>' + esc(skill.name) + '</strong>' +
        '<span class="op-badge ' + opClass(skill.op) + L('ui.64532f10e453') + esc(skillOpLabel(skill.op)) + '</span>' +
      '</div>' +
      '<div class="skill-detail-desc">' + esc(skill.description || L('ui.f6660e2d975d')) + '</div>' +
      '<div class="trigger-line" style="padding: 0 9px 4px">' +
        L('ui.6deb63bc0b1a') + esc(triggerLabel(skill.trigger && skill.trigger.event)) + '</span>' +
        (skill.requirements && skill.requirements.length ? L('ui.65438d88bc7c') + esc(requirementSummary(skill)) + '</span>' : '') +
      '</div>' +
      '<div class="skill-flow-mini">' + (skill.steps || []).slice(0, 4).map((step, index) => '<span class="flow-mini-step">' + (index + 1) + ' ' + esc(stepLabel(step)) + '</span>').join('<span class="flow-mini-arrow">›</span>') + ((skill.steps || []).length > 4 ? '<span class="flow-mini-arrow">…</span>' : '') + '</div>' +
      L('ui.1b731ebfee9c') + renderFlowTree(skill.steps) + '</details>' +
    '</div>';
}

function renderCardDetail(card, type, options) {
  options = options || {};
  const packName = getPackLabel(card.packId);
  let stats = '';
  if (type === 'unit') {
    stats = '<div class="kv-grid">' +
      L('ui.46fc290ffeb6') + esc(card.hp) + (card.maxHpCap ? L('ui.0e56bcf239a5') + esc(card.maxHpCap) + '）' : '') + '</span></div>' +
      L('ui.b5535df6d4c2') + esc(card.attack == null ? 0 : card.attack) + '</span></div>' +
      L('ui.012df779c864') + esc((RESISTANCE_TYPES[card.resistance.type] || { label: L('ui.360fb1266c5e') }).label) + ' ' + esc(card.resistance.value) + '</span></div>' +
      L('ui.727b819b7e98') + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</span></div>' +
      '</div>';
  } else if (type === 'equipment') {
    stats = '<div class="kv-grid">' +
      L('ui.9e8fc535f1c9') + (card.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + '</span></div>' +
      L('ui.bc4969a36c10') + esc(modSummary(card.mods) || L('ui.72077749f794')) + '</span></div>' +
      '</div>';
  } else {
    stats = '<div class="kv-grid">' +
      L('ui.f11c5b0f00a7') + (card.faction === 'any' ? L('ui.b19d3ebfba21') : esc(card.faction)) + '</span></div>' +
      L('ui.bc4969a36c10') + esc(modSummary(card.mods) || L('ui.72077749f794')) + '</span></div>' +
      '</div>';
  }
  const skillIds = card.skills || card.grantedSkills || [];
  const skills = (skillIds || []).map(id => Store.index.maps.skills.get(id)).filter(Boolean);
  return '' +
    '<article class="card-detail">' +
      '<div class="card-detail-art">' +
        '<span class="detail-q">' + qualityBadge(card.quality) + '</span>' +
        '<img src="' + attr(cardArt(card)) + '" alt="' + attr(card.name) + L('ui.5bc95486d868') +
        '<span class="detail-art-label">' + esc(cardTypeLabel(type)) + ' / ' + esc(packName) + '</span>' +
      '</div>' +
      '<div class="card-detail-body">' +
        '<div class="detail-title-row"><div><h2>' + esc(card.name) + '</h2><p class="detail-subline">' + esc(card.id) + '</p></div></div>' +
        '<p class="detail-flavor">' + esc(card.flavor || card.description || L('ui.b853bc1e3c5c')) + '</p>' +
        stats +
        (skills.length ? L('ui.fa7ffda22d2a') + skills.map(renderSkillDetailCard).join('') + '</div>' : '') +
        (options.actions || '') +
      '</div>' +
    '</article>';
}

function renderStepMini(steps) {
  return (steps || []).map(step => '<span class="flow-mini-step">' + esc(stepLabel(step)) + '</span>').join('<span class="flow-mini-arrow">›</span>') || L('ui.8838bf3c1cfa');
}

/* ---------- App ---------- */

/* ---------- Minimal DOM patching ----------
   Reuses matching nodes and replaces only changed content, so in-page
   updates do not recreate the whole screen or restart page animations. */
function domNodesCompatible(oldNode, newNode) {
  if (!oldNode || !newNode || oldNode.nodeType !== newNode.nodeType) return false;
  if (oldNode.nodeType === 1) return oldNode.tagName === newNode.tagName && oldNode.namespaceURI === newNode.namespaceURI;
  return true;
}

function syncTextInputValue(el, value) {
  if (el.value === value) return;
  const focused = document.activeElement === el;
  let start = null;
  let end = null;
  if (focused && typeof el.selectionStart === 'number') {
    start = el.selectionStart;
    end = el.selectionEnd;
  }
  el.value = value;
  if (focused && start != null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(start, end); } catch (error) { /* inputs without selection */ }
  }
}

function morphDomNode(oldNode, newNode) {
  if (!oldNode || !newNode) return;
  if (oldNode.nodeType !== newNode.nodeType) {
    if (oldNode.parentNode) oldNode.parentNode.replaceChild(newNode.cloneNode(true), oldNode);
    return;
  }
  if (oldNode.nodeType === 3 || oldNode.nodeType === 4) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return;
  }
  if (oldNode.nodeType === 8) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return;
  }
  if (oldNode.nodeType !== 1) return;
  if (oldNode.tagName !== newNode.tagName || oldNode.namespaceURI !== newNode.namespaceURI) {
    if (oldNode.parentNode) oldNode.parentNode.replaceChild(newNode.cloneNode(true), oldNode);
    return;
  }
  const isInput = oldNode.tagName === 'INPUT';
  const isTextarea = oldNode.tagName === 'TEXTAREA';
  const isSelect = oldNode.tagName === 'SELECT';

  const oldAttrs = Array.from(oldNode.attributes || []);
  const newAttrs = Array.from(newNode.attributes || []);
  const nextAttrs = new Set();
  for (const attr of newAttrs) {
    nextAttrs.add(attr.name);
    if ((isInput || isTextarea || isSelect) && (attr.name === 'value' || attr.name === 'selected')) continue;
    if (oldNode.getAttribute(attr.name) !== attr.value) oldNode.setAttribute(attr.name, attr.value);
  }
  for (const attr of oldAttrs) {
    if (!nextAttrs.has(attr.name)) oldNode.removeAttribute(attr.name);
  }

  morphDomChildren(oldNode, newNode);

  if (isInput) {
    if (newNode.type === 'checkbox' || newNode.type === 'radio') {
      const checked = newNode.hasAttribute('checked');
      if (oldNode.checked !== checked) oldNode.checked = checked;
    } else if (newNode.hasAttribute('value')) {
      syncTextInputValue(oldNode, newNode.getAttribute('value') || '');
    }
  } else if (isTextarea) {
    syncTextInputValue(oldNode, newNode.value);
  } else if (isSelect) {
    const value = newNode.value;
    if (oldNode.value !== value) oldNode.value = value;
  }
}

function morphDomChildren(oldParent, newParent) {
  const oldNodes = Array.from(oldParent.childNodes);
  const newNodes = Array.from(newParent.childNodes);
  const common = Math.min(oldNodes.length, newNodes.length);
  for (let i = 0; i < common; i += 1) {
    if (domNodesCompatible(oldNodes[i], newNodes[i])) morphDomNode(oldNodes[i], newNodes[i]);
    else oldParent.replaceChild(newNodes[i].cloneNode(true), oldNodes[i]);
  }
  for (let i = oldNodes.length - 1; i >= newNodes.length; i -= 1) {
    if (oldNodes[i].parentNode === oldParent) oldParent.removeChild(oldNodes[i]);
  }
  for (let i = oldNodes.length; i < newNodes.length; i += 1) {
    oldParent.appendChild(newNodes[i].cloneNode(true));
  }
}

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

  async init() {
    const screen = document.getElementById('screen');
    try {
      if (!window.DataLoader) throw new Error(L('ui.2af998c7e7e9'));
      if (!window.I18n || !I18n.source || !Object.keys(I18n.source).length) {
        throw new Error(I18n && I18n.loadError ? I18n.loadError : L('ui.506300e29e75'));
      }
      await DataLoader.loadCore();
      await DataLoader.loadRogueEvents();
      await DataLoader.loadRogueConfig();
      Store.init();
      const extra = await DataLoader.loadExtraPacks(Store);
      if (DataLoader.rogueEventError) extra.errors.unshift(DataLoader.rogueEventError);
      if (DataLoader.rogueConfigError) extra.errors.unshift(DataLoader.rogueConfigError);
      if (extra && extra.errors && extra.errors.length) {
        console.warn(L('ui.4dbfe8c32b39'), extra.errors);
      }
      document.body.classList.toggle('reduce-motion', !!Store.state.settings.reduceMotion);
      this.bindEvents();
      const route = this.parseRoute();
      this.enterRoute(route || 'home', true);
      if (extra && extra.errors && extra.errors.length) {
        setTimeout(() => this.toast(L('ui.70a43e32ce29') + extra.errors.join('；'), 'error'), 400);
      }
    } catch (error) {
      console.error(error);
      if (screen) {
        screen.innerHTML = L('ui.770186d8c1ea') + esc(error.message) + L('ui.1253ae4d8bd1');
      }
    }
  },

  parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
    const allowed = ['home', 'setup', 'builder', 'library', 'battle', 'editor', 'expansions', 'workshop', 'settings', 'rogue', 'challenge', 'endless', 'tutorial'];
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
    this.clearAutoTimer();
    if (this.route !== route) this.cancelBattleFx();
    this.closeModal(true);
    if (route === 'battle' && !this.battle) route = 'home';
    if (route === 'builder' && !this.builder) { this.openBuilder('A'); return; }
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
    if (window.I18n) I18n.apply(document.body);
  },

  routeTitle() {
    const titles = {
      home: L('ui.8112901ecd4e'), setup: L('ui.94cbce5abb17'), builder: L('ui.d5858652d876'), library: L('ui.d7e338050780'),
      battle: L('ui.bc5a114f901a'), editor: L('ui.43b5c62dff65'), expansions: L('ui.a8ef9fc3d8eb'),
      workshop: L('ui.64ee9b365cad'), settings: L('ui.7debf9cb0372'), rogue: L('ui.85646631c0e1'), challenge: L('ui.9294c931e171'), endless: L('ui.fb68101a77f8'), tutorial: L('ui.0de9c5503e7c')
    };
    return titles[this.route] || L('ui.8112901ecd4e');
  },

  renderTopbar() {
    const idx = Store.index;
    const top = document.getElementById('topbar');
    if (!top) return;
    let context = '';
    if (this.route === 'home') context = L('ui.2486c7e6860a');
    else context = '<strong>' + esc(this.routeTitle()) + '</strong><span>' + (this.route === 'battle' && this.battle ? L('ui.f495347d6acf') + this.battle.round + L('ui.9be0dd7897d4') : L('ui.d2368b5a055e')) + '</span>';
    const topHtml = '' +
      '<div class="topbar-inner">' +
        L('ui.5df1bd26d350') +
          '<img src="assets/pictures/brand-mark.svg" alt="">' +
          '<span><span class="brand-name">CAEROGUE</span><span class="brand-sub">TACTICAL CARD LAB</span></span>' +
        '</button>' +
        '<span class="topbar-divider"></span>' +
        '<div class="topbar-context"><span class="ctx-mark"></span>' + context + '</div>' +
        '<div class="topbar-spacer"></div>' +
        '<div class="topbar-stats">' +
          L('ui.b7d3905aa648') + idx.cards + '</b></span>' +
          L('ui.99b21d101c62') + idx.packCount + '</b></span>' +
          L('ui.b93a708fd49d') + APP_VERSION + '</b></span>' +
        '</div>' +
        '<div class="topbar-actions">' +
          L('ui.78ef730c1bc3') +
          L('ui.c22884a0c027') +
        '</div>' +
      '</div>';
    if (top._caeHtml === topHtml) return;
    top._caeHtml = topHtml;
    top.innerHTML = topHtml;
  },

  renderFooter() {
    const idx = Store.index;
    const footer = document.getElementById('app-footer');
    if (!footer) return;
    const footerHtml = '' +
      L('ui.1beae6969774') +
      L('ui.0ef89e8ff22e') + idx.packCount + L('ui.d8d547bcd5aa') + idx.cards + L('ui.28fcf56130c6') + APP_VERSION + '</span></div>' +
      L('ui.9b57eab456f4');
    if (footer._caeHtml === footerHtml) return;
    footer._caeHtml = footerHtml;
    footer.innerHTML = footerHtml;
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
      case 'tutorial': html = this.renderTutorial(); break;
      case 'editor': html = window.EditorUI ? EditorUI.render(this) : this.renderMissingModule(L('ui.f0d00d2bb8c0')); break;
      case 'rogue':
      case 'challenge':
      case 'endless': html = window.ModesUI ? ModesUI.render(this.route, this) : this.renderMissingModule(L('ui.09f47d50df44')); break;
      default: html = this.renderHome();
    }
    const routeChanged = this._screenRoute !== this.route;
    if (!routeChanged && this._screenHtml === html && screen.childElementCount) {
      // Nothing visible changed; keep the existing DOM and focus untouched.
    } else if (routeChanged || !screen.childElementCount) {
      screen.innerHTML = html;
    } else {
      const template = document.createElement('template');
      template.innerHTML = html;
      morphDomChildren(screen, template.content);
    }
    this._screenRoute = this.route;
    this._screenHtml = html;
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
      { icon: 'assets/icons/packs.svg', label: L('ui.fd3dc7d43370'), value: idx.packCount, sub: L('ui.918414bd3c37') },
      { icon: 'assets/icons/library.svg', label: L('ui.284136a01750'), value: idx.cards, sub: L('ui.3979ebae1d87') },
      { icon: 'assets/icons/editor.svg', label: L('ui.669187cae8ac'), value: idx.skills.length + idx.effects.length, sub: L('ui.5b1887eb6252') },
      { icon: 'assets/icons/versus.svg', label: L('ui.46e66f63217a'), value: APP_VERSION, sub: L('ui.96a0e68026db') }
    ];
    const menu = [
      { key: 'versus', action: 'open-setup', mode: 'versus', number: '01', wide: true, featured: true },
      { key: 'custom', action: 'open-setup', mode: 'custom', number: '02', wide: true },
      { key: 'builder', action: 'open-route', route: 'builder', number: '03' },
      { key: 'rogue', action: 'open-route', route: 'rogue', number: '04' },
      { key: 'challenge', action: 'open-route', route: 'challenge', number: '05' },
      { key: 'endless', action: 'open-route', route: 'endless', number: '06' },
      { key: 'library', action: 'open-route', route: 'library', number: '07' },
      { key: 'editor', action: 'open-route', route: 'editor', number: '08' },
      { key: 'expansions', action: 'open-route', route: 'expansions', number: '09' },
      { key: 'workshop', action: 'open-route', route: 'workshop', number: '10' },
      { key: 'settings', action: 'open-route', route: 'settings', number: '11' }
    ];
    const menuHtml = menu.map(entry => {
      const mode = GAME_MODES[entry.key];
      return '<button class="menu-card' + (entry.wide ? ' wide' : '') + (entry.featured ? ' featured' : '') + '" type="button" data-action="' + entry.action + '" data-mode="' + (entry.mode || '') + '" data-route="' + (entry.route || '') + '">' +
        '<div class="mc-top"><img src="' + mode.icon + '" alt=""><span class="mc-no">' + entry.number + ' / 11</span></div>' +
        '<h3>' + esc(mode.name) + '</h3>' +
        '<p>' + esc(mode.desc) + '</p>' +
        L('ui.5f5b7233311e') +
      '</button>';
    }).join('');
    const baseDeck = Store.state.decks.A || DEFAULT_LOADOUT_A;
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
            L('ui.d5e67bcdd733') +
            L('ui.48e7100dc378') +
            '<div class="hero-actions">' +
              (Store.state.tutorialCompleted
                ? L('ui.ee33d497faec')
                : L('ui.a2f94edfc6a6')) +
              L('ui.57fe9b4f8129') +
            '</div>' +
            L('ui.542de737bce2') +
          '</div>' +
          '<div class="hero-visual">' +
            '<img class="hero-seal" src="assets/pictures/brand-mark.svg" alt="">' +
            '<div class="hero-cards">' + heroCards + '</div>' +
            L('ui.3f8ea9128a90') + (baseDeck.units || []).length + L('ui.2ef5f8c5c834') + (baseDeck.equipment || []).length + L('ui.03befcf868ca') + (baseDeck.runes || []).length + L('ui.004faba58c32') +
          '</div>' +
        '</section>' +
        '<section class="home-statbar">' + statHtml + '</section>' +
        '<section class="home-section">' +
          L('ui.7d472148d2e1') +
          '<div class="menu-grid">' + menuHtml + '</div>' +
        '</section>' +
        L('ui.f56668d3d163') + APP_VERSION + '</span></div>' +
      '</div>';
  },

  renderTutorial() {
  const steps = [
    ['1', L('ui.2150939fb166'), L('ui.6115206b2361')],
    ['2', L('ui.af6ccc9dee69'), L('ui.ae97527cc9a6')],
    ['3', L('ui.bd2f8146fd3b'), L('ui.e28c60821752')],
    ['4', L('ui.c59a62e56a2b'), L('ui.881310de8231')]
  ];
  return '<div class="page-wrap tutorial-page">' +
    L('ui.7ed68df4778e') +
    '<section class="panel"><div class="panel-body"><div class="tutorial-grid">' + steps.map(step => '<div class="tutorial-card"><span class="tutorial-no">' + step[0] + '</span><h3>' + step[1] + '</h3><p>' + step[2] + '</p></div>').join('') + '</div>' +
      L('ui.d575043720e1') +
    '</div></section></div>';
  },

  startTutorialBattle() {
  this.clearAiTimer();
  this.clearAutoTimer();
  this.closeModal(true);
  this.startBattle({
    loadouts: {
      A: { units: ['catgirl_jk', 'slime_big'], equipment: [], runes: ['war_spirit'] },
      B: { units: ['slime_small', 'slime_small'], equipment: [], runes: [] }
    },
    rules: Object.assign({}, DEFAULT_RULES, { initialDraw: 2, maxField: 2, allowDuplicates: false, defeatedToDeck: false, drawDuringBattle: false, showFormula: false }),
    controllers: { A: 'human', B: 'ai' },
    mode: 'tutorial',
    noDraw: true,
    context: { mode: 'tutorial', source: 'tutorial' }
  });
  },

/* ---------- Setup ---------- */
  setupSideName(side) {
    const setup = this.setup;
    const pvp = !setup || !(setup.mode === 'custom' && setup.opponent === 'ai');
    if (pvp) return side === 'A' ? L('ui.13d56d03d73a') : L('ui.4bdaf46d2363');
    return side === 'A' ? L('ui.da12da253948') : L('ui.99d2b5e44698');
  },

  openSetup(mode) {
    const actual = mode === 'custom' ? 'custom' : 'versus';
    if (!this.setup || this.setup.mode !== actual || this.route !== 'builder') {
      const rules = deepClone(DEFAULT_RULES);
      if (actual === 'versus') rules.drawDuringBattle = true;
      this.setup = {
        mode: actual,
        opponent: 'human',
        rules,
        deckA: deepClone(DEFAULT_LOADOUT_A),
        deckB: deepClone(DEFAULT_LOADOUT_B)
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
    this.toast(L('ui.8d5feedb9148'), 'success');
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
    if (!cards.units.length) errors.push(L('ui.f2cb68e5cfed'));
    if (cards.units.length && !cards.units.some(unit => unit.counted !== false)) errors.push(L('ui.57caf0c9cbc7'));
    const seen = new Set();
    const duplicates = [];
    for (const unit of cards.units) {
      if (seen.has(unit.id)) duplicates.push(unit.name);
      seen.add(unit.id);
    }
    if (duplicates.length && !(rules && rules.allowDuplicates)) errors.push(L('ui.92fbcad75ca3') + [...new Set(duplicates)].join('、'));
    if (cards.runes.length > 3) errors.push(L('ui.750d70304046'));
    if ((deck.units || []).length > 12) warnings.push(L('ui.f17666048a03'));
    return { ok: errors.length === 0, errors, warnings, cards };
  },

  renderSetup() {
    const setup = this.setup;
    if (!setup) return this.renderMissingModule(L('ui.a51c63fbc4b7'));
    const mode = GAME_MODES[setup.mode] || GAME_MODES.versus;
    const custom = setup.mode === 'custom';
    const rules = setup.rules;
    const drawMode = !custom || !!rules.drawDuringBattle;
    const defaultDeckMode = custom && !rules.drawDuringBattle;
    const builtDeckA = deepClone(Store.state.decks.A || DEFAULT_LOADOUT_A);
    const builtDeckB = deepClone(Store.state.decks.B || DEFAULT_LOADOUT_B);
    const builtCardsA = this.deckCards(builtDeckA);
    const builtCardsB = this.deckCards(builtDeckB);
    const defaultA = this.validateDeck(builtDeckA, rules);
    const defaultB = this.validateDeck(builtDeckB, rules);
    const startDisabled = defaultDeckMode ? (!defaultA.ok || !defaultB.ok) : false;
    const deckSummary = (cards) => {
      const names = cards.units.map(unit => unit.name);
      const shown = names.slice(0, 6).join('、') + (names.length > 6 ? '…' : '');
      return (shown || L('ui.5656d581df55')) + L('ui.d65a0a66148c') + cards.equipment.length + L('ui.b604c4619b70') + cards.runes.length;
    };
    const drawDisabled = !drawMode;
    const opponent = custom
      ? L('ui.be812d843059') + (setup.opponent !== 'ai' ? ' active' : '') + L('ui.0ea6ea613888') + (setup.opponent === 'ai' ? ' active' : '') + L('ui.cf0d1da75636')
      : '';
    const rulePanel = L('ui.183ed5c2b066') + (drawMode ? L('ui.f7aff8c0e244') : L('ui.a0a8f6bd664c')) + '</span></div><div class="panel-body">' +
      opponent +
      '<div class="rules-grid">' +
        L('ui.aaa8e8cbcb9c') + esc(rules.maxField) + L('ui.4f607c19530f') +
        L('ui.921adaeca2e4') + esc(rules.initialDraw) + '" data-setup-rule="initialDraw"' + (drawDisabled ? ' disabled' : '') + L('ui.e3effbb5ff65') + (drawDisabled ? L('ui.a0398b354e8d') : L('ui.60abea9f521b')) + '</div></div>' +
        L('ui.70c89623dd08') + (drawDisabled ? L('ui.85f7e17cab6e') : L('ui.65365779fbfc')) + '</small></div><button class="toggle' + (rules.drawDuringBattle ? ' on' : '') + '" type="button" aria-pressed="' + (rules.drawDuringBattle ? 'true' : 'false') + '" data-action="setup-toggle-rule" data-rule="drawDuringBattle"' + (setup.mode === 'versus' ? ' disabled' : '') + '></button></div></div>' +
        L('ui.35af0c015328') + esc(rules.drawInterval) + '" data-setup-rule="drawInterval"' + (drawDisabled ? ' disabled' : '') + L('ui.0109582ffc72') +
        L('ui.6803f26e2fc9') + esc(rules.drawCount) + '" data-setup-rule="drawCount"' + (drawDisabled ? ' disabled' : '') + L('ui.d4ce44071af7') +
        L('ui.2d0c441f57b6') + (rules.allowDuplicates ? ' on' : '') + '" type="button" aria-pressed="' + (rules.allowDuplicates ? 'true' : 'false') + '" data-action="setup-toggle-rule" data-rule="allowDuplicates"></button></div></div>' +
      '</div></div></section>';
    const modePanel = drawMode
      ? L('ui.91b3b4c2557a') +
          L('ui.4841288cfe65') + esc(rules.initialDraw) + L('ui.49b902c804f3') +
          L('ui.88b6bb0fb0a4') +
          L('ui.541cc8fd75c3') + esc(rules.drawInterval) + L('ui.ff0f1e90f05f') + esc(rules.drawCount) + L('ui.66045ac49a74') +
          L('ui.82d6353a3b19') +
        '</div></div></section>'
      : L('ui.8440dbd6f8dc') +
          L('ui.d558a5508a38') + esc(deckSummary(builtCardsA)) + '</span></div>' +
          L('ui.1d78a678cae5') + esc(deckSummary(builtCardsB)) + '</span></div>' +
          L('ui.3bb46b4c7686') +
          L('ui.6384d20a11a4') +
          (defaultA.ok && defaultB.ok ? '' : '<div class="notice danger">' + esc([...defaultA.errors, ...defaultB.errors].join('；')) + '</div>') +
        '</div></div></section>';
    return '' +
      '<div class="page-wrap setup-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">MATCH CONFIGURATION</div><h1>' + (custom ? (setup.opponent === 'ai' ? L('ui.510aeff51ed1') : L('ui.9d56c4ef3801')) : L('ui.6dbf1f702a07')) + '</h1><p>' + (drawMode ? L('ui.1066621b417a') : L('ui.9b274e75b441')) + '</p></div><div class="page-head-side"><button class="btn btn-primary btn-lg" type="button" data-action="setup-start"' + (startDisabled ? ' disabled' : '') + L('ui.11445dcb323c') +
        '<div class="mode-banner"><img src="' + mode.icon + '" alt=""><div><h3>' + esc(mode.name) + '</h3><p>' + esc(mode.desc) + '</p></div><span class="mode-flag">' + (drawMode ? L('ui.f7aff8c0e244') : L('ui.a0a8f6bd664c')) + '</span></div>' +
        '<div class="setup-layout mt-2"><div class="setup-main stack">' + rulePanel + modePanel + '</div><aside class="setup-aside">' +
          L('ui.c5acfa0274da') +
            L('ui.4a07dd36954f') + esc(mode.short) + '</span></div>' +
            L('ui.d3a7f6299ebf') + (custom && setup.opponent === 'ai' ? L('ui.ad9f0dc50328') : L('ui.ca55daa1c64c')) + '</span></div>' +
            L('ui.09a9976125cc') + (drawMode ? L('ui.971f3007661c') : L('ui.6c14bd7f6f9e')) + '</span></div>' +
            (drawMode ? L('ui.635fd2b183b0') + esc(rules.initialDraw) + L('ui.972cc4b623e8') + '</span></div>' : L('ui.083a023c93b4') + builtCardsA.units.length + L('ui.e2f1a84cc132') + builtCardsB.units.length + L('ui.67eb66f38591')) +
            L('ui.4b37bbf9194e') + (drawMode ? L('ui.bf305518607d') : L('ui.40d1c2865e8d')) + '</span></div>' +
            '<div class="notice ' + (startDisabled ? 'danger' : '') + ' mt-2">' + (startDisabled ? L('ui.fd92c866de53') : (drawMode ? L('ui.e6f76816d16e') : L('ui.403d84f4a1bd'))) + '</div>' +
            '<button class="btn btn-primary btn-block btn-lg mt-2" type="button" data-action="setup-start"' + (startDisabled ? ' disabled' : '') + L('ui.fea868b1bad3') +
          '</div></div></section>' +
        '</aside></div>' +
      '</div>';
  },

  setupToggleRule(rule) {
    if (!this.setup) return;
    if (this.setup.mode === 'versus' && rule === 'drawDuringBattle') return;
    this.setup.rules[rule] = !this.setup.rules[rule];
    if (rule === 'drawDuringBattle' && this.setup.rules[rule] && this.setup.mode === 'versus') this.setup.rules[rule] = true;
    this.render();
  },

  setupRuleInput(rule, value) {
    if (!this.setup) return;
    const numeric = ['initialDraw', 'drawInterval', 'drawCount', 'maxField'];
    if (numeric.includes(rule)) {
      let n = parseInt(value, 10);
      if (!Number.isFinite(n)) n = DEFAULT_RULES[rule];
      const min = { initialDraw: 1, drawInterval: 1, drawCount: 1, maxField: 1 }[rule];
      const max = { initialDraw: 30, drawInterval: 10, drawCount: 8, maxField: 5 }[rule];
      n = Math.max(min, Math.min(max, n));
      this.setup.rules[rule] = n;
    }
  },

  setupStart() {
    if (!this.setup) return;
    const { rules, mode } = this.setup;
    const custom = mode === 'custom';
    const customAI = custom && this.setup.opponent === 'ai';
    const drawMode = !custom || !!rules.drawDuringBattle;
    if (drawMode) {
      const initialDraw = Math.max(1, Math.min(30, Number(rules.initialDraw) || 1));
      this.startBattle({
        loadouts: { A: { units: [], equipment: [], runes: [] }, B: { units: [], equipment: [], runes: [] } },
        rules: Object.assign({}, rules, { initialDraw, drawDuringBattle: true, showFormula: Store.state.settings.showFormula }),
        controllers: { A: 'human', B: customAI ? 'ai' : 'human' },
        mode,
        drawFromPool: true,
        context: { mode, source: 'setup', custom, customAI, drawMode: true }
      });
      return;
    }
    const deckA = deepClone(Store.state.decks.A || DEFAULT_LOADOUT_A);
    const deckB = deepClone(Store.state.decks.B || DEFAULT_LOADOUT_B);
    const validationA = this.validateDeck(deckA, rules);
    const validationB = this.validateDeck(deckB, rules);
    if (!validationA.ok || !validationB.ok) {
      this.toast([...validationA.errors, ...validationB.errors].join('；'), 'error', L('ui.c46848abe6b1'));
      return;
    }
    this.startBattle({
      loadouts: { A: deckA, B: deckB },
      rules: Object.assign({}, rules, { drawDuringBattle: false, showFormula: Store.state.settings.showFormula }),
      controllers: { A: 'human', B: customAI ? 'ai' : 'human' },
      mode,
      noDraw: true,
      context: { mode, source: 'setup', custom, customAI, drawMode: false }
    });
  },

  setupViewDeck(side) {
    const deck = side === 'A' ? this.setup.deckA : this.setup.deckB;
    const cards = this.deckCards(deck);
    const rows = cards.units.map(unit => '<div class="row" style="padding:6px 0;border-bottom:1px dotted var(--line)"><img src="' + attr(cardArt(unit)) + '" alt="" width="31" height="39" style="object-fit:cover;border-radius:3px;border:1px solid var(--line)"><div class="grow"><strong class="serif">' + esc(unit.name) + '</strong><div class="tiny faint">' + qualityBadge(unit.quality) + L('ui.4457474f931b') + unit.hp + ' · ' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</div></div><button class="btn btn-sm" type="button" data-action="library-open-card" data-type="unit" data-id="' + attr(unit.id) + L('ui.c71b84771014')).join('');
    const gear = cards.equipment.concat(cards.runes).map(item => '<span class="chip">' + esc(item.name) + '</span>').join('') || L('ui.cc483abff76a');
    this.openModal({ title: this.setupSideName(side) + L('ui.db28aa18cc0c'), subtitle: L('ui.24edf033b1f8'), body: '<div class="stack">' + (rows || L('ui.6e0e5b504ba1')) + L('ui.da3ebbc277d8') + gear + '</div></div>', size: 'small' });
  },

  /* ---------- Builder ---------- */
  openBuilder(side) {
    const selectedSide = side === 'B' ? 'B' : 'A';
    const source = Store.state.decks[selectedSide] || (selectedSide === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    const deck = deepClone(source);
    this.builder = {
      side: selectedSide,
      deck,
      type: 'unit',
      search: '',
      selectedType: (deck.units || []).length ? 'unit' : 'unit',
      selectedId: (deck.units || [])[0] || (Store.index.units[0] && Store.index.units[0].id) || null,
      returnRoute: this.route === 'setup' ? 'setup' : 'home',
      rules: deepClone(DEFAULT_RULES)
    };
    this.go('builder');
  },

  builderSideName(side) {
    return side === 'A' ? L('ui.13d56d03d73a') : L('ui.4bdaf46d2363');
  },

  builderSwitchSide(side) {
    if (!this.builder) return;
    const selectedSide = side === 'B' ? 'B' : 'A';
    const source = Store.state.decks[selectedSide] || (selectedSide === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    this.builder.side = selectedSide;
    this.builder.deck = deepClone(source);
    this.builder.selectedType = 'unit';
    this.builder.selectedId = (this.builder.deck.units || [])[0] || (Store.index.units[0] && Store.index.units[0].id) || null;
    this.render();
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
    const rules = (this.builder && this.builder.rules) || DEFAULT_RULES;
    if (!pool.length) return L('ui.0f7db6488fdc') + esc(cardTypeLabel(type)) + '。</div>';
    return pool.map(card => {
      const selected = this.builder.selectedId === card.id && this.builder.selectedType === type;
      const duplicateBlocked = type === 'unit' && !rules.allowDuplicates && (this.builder.deck.units || []).includes(card.id);
      const runeBlocked = type === 'rune' && (this.builder.deck.runes || []).length >= 3;
      const cardType = type === 'unit' ? 'unit' : type;
      return '<div class="pool-card' + (selected ? ' selected' : '') + '" data-action="builder-pick" data-type="' + cardType + '" data-id="' + attr(card.id) + '" role="button" tabindex="0">' +
        '<img class="pool-thumb" src="' + attr(cardArt(card)) + '" alt="">' +
        '<div class="pool-card-main"><strong>' + esc(card.name) + '</strong><small>' + qualityBadge(card.quality) + ' ' + (type === 'unit' ? L('ui.11d4fcf2be9c') + card.hp : modSummary(card.mods, true) || L('ui.d9f936d25fe4')) + '</small></div>' +
        '<button class="pool-add" type="button" data-action="builder-add" data-type="' + cardType + '" data-id="' + attr(card.id) + L('ui.c7d9f20e147d') + (duplicateBlocked || runeBlocked ? ' disabled' : '') + '>+</button>' +
      '</div>';
    }).join('');
  },

  updateBuilderPool() {
    const target = document.getElementById('builder-pool-list');
    if (target) { target.innerHTML = this.renderBuilderPoolList(); if (window.I18n) I18n.apply(target); }
    const meta = document.getElementById('builder-pool-meta');
    if (meta) meta.textContent = L('ui.497064be1f41') + this.builderPool(this.builder.type).length + L('ui.8ca146f412cc');
  },

  renderBuilder() {
    const state = this.builder;
    if (!state) return this.renderMissingModule(L('ui.39ef96f312da'));
    const rules = (this.builder && this.builder.rules) || DEFAULT_RULES;
    const cards = this.deckCards(state.deck);
    const validation = this.validateDeck(state.deck, rules);
    const selected = this.builderSelectedCard();
    const typeMeta = { unit: L('ui.6b26695e4dce'), equipment: L('ui.1faf3321a84f'), rune: L('ui.52bd5ee23b8d') };
    const poolTabs = ['unit', 'equipment', 'rune'].map(type => '<button class="segment' + (state.type === type ? ' active' : '') + '" type="button" data-action="builder-type" data-type="' + type + '">' + typeMeta[type] + '</button>').join('');
    const deckColumn = (type) => {
      const list = cards[type];
      const labels = { units: L('ui.5faece5e0845'), equipment: L('ui.1e8d4e6cdbca'), runes: L('ui.3e9d3e70f9cf') };
      const typeKey = type === 'units' ? 'unit' : type === 'equipment' ? 'equipment' : 'rune';
      return '<div class="deck-column">' +
        '<div class="deck-column-head"><h3>' + labels[type] + '</h3><span class="count">' + list.length + (type === 'runes' ? ' / 3' : '') + '</span></div>' +
        '<div class="deck-column-body">' +
          (list.length ? list.map(card => {
            let meta = '';
            if (typeKey === 'unit') {
              const res = RESISTANCE_TYPES[card.resistance.type] || { label: L('ui.aa8457052a32') };
              meta = L('ui.11d4fcf2be9c') + card.hp + ' · ' + res.label.replace(L('ui.aa8457052a32'), L('ui.8dd8650eb135')) + ' ' + card.resistance.value + ' · ' + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + L('ui.2f50b34513d5') + ((card.skills || []).length);
            } else if (typeKey === 'equipment') {
              meta = (card.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + ' · ' + (modSummary(card.mods, true) || L('ui.455d56230713'));
            } else {
              meta = (card.faction === 'any' ? L('ui.d13a98752b5d') : card.faction) + ' · ' + (modSummary(card.mods, true) || L('ui.455d56230713'));
            }
            return '<div class="deck-entry" data-action="builder-pick" data-type="' + typeKey + '" data-id="' + attr(card.id) + L('ui.adb902b09146') +
              '<img class="entry-thumb" src="' + attr(cardArt(card)) + '" alt="">' +
              '<div class="entry-main"><strong>' + esc(card.name) + '</strong><small>' + esc(meta) + '</small></div>' +
              '<button class="entry-remove" type="button" data-action="builder-remove" data-type="' + type + '" data-id="' + attr(card.id) + L('ui.4b3fbd1cde83');
          }).join('') : L('ui.e544a1990a27') + labels[type] + '</div></div>') +
        '</div>' +
      '</div>';
    };
    let detailAction = '';
    if (selected) {
      const selectedList = state.selectedType === 'unit' ? (state.deck.units || []) : state.selectedType === 'equipment' ? (state.deck.equipment || []) : (state.deck.runes || []);
      const inDeck = selectedList.includes(selected.id);
      const duplicateBlocked = state.selectedType === 'unit' && inDeck && !rules.allowDuplicates;
      const runeBlocked = state.selectedType === 'rune' && selectedList.length >= 3;
      const detailLabel = duplicateBlocked ? L('ui.3e31f575fa47') : runeBlocked ? L('ui.ab5eaeac2722') : inDeck ? L('ui.779f626312f3') : L('ui.b5d822e35710');
      detailAction = '<div class="detail-actions"><button class="btn btn-primary" type="button" data-action="builder-add" data-type="' + attr(state.selectedType) + '" data-id="' + attr(selected.id) + '"' + (duplicateBlocked || runeBlocked ? ' disabled' : '') + '>' + detailLabel + '</button></div>';
    }
    const detail = selected ? renderCardDetail(selected, state.selectedType === 'unit' ? 'unit' : state.selectedType, { actions: detailAction }) : L('ui.2542f51ca5d2');
    const duplicateRuleText = rules.allowDuplicates ? L('ui.bf9f46b84828') : L('ui.c0c2a7fbdc00');
    return '' +
      '<div class="page-wrap builder-page">' +
        '<div class="page-head">' +
          L('ui.176cdeb2ab82') + this.builderSideName(state.side) + L('ui.a35624836d06') + state.side + L('ui.fe2ef2c0ac5d') +
          '<div class="page-head-side"><div class="segmented mini"><button class="segment' + (state.side === 'A' ? ' active' : '') + '" type="button" data-action="builder-side" data-side="A">' + L('ui.13d56d03d73a') + '</button><button class="segment' + (state.side === 'B' ? ' active' : '') + '" type="button" data-action="builder-side" data-side="B">' + L('ui.4bdaf46d2363') + '</button></div><span class="chip ' + (validation.ok ? 'green' : 'red') + '">' + (validation.ok ? L('ui.391327e176a3') : L('ui.464b5123c53c')) + L('ui.ef8c6b81b882') +
        '</div>' +
        '<div class="builder-layout">' +
          '<aside class="builder-left">' +
            '<section class="panel pool-panel">' +
              L('ui.2ca2c2bc5fc5') + duplicateRuleText + '</div></div></div>' +
              '<div class="panel-body">' +
                '<div class="segmented pool-tabs">' + poolTabs + '</div>' +
                L('ui.3296f6274296') + attr(state.search) + '" data-builder-search></div>' +
                '<div class="pool-scroll" id="builder-pool-list">' + this.renderBuilderPoolList() + '</div>' +
                L('ui.9336a4c231ab') + this.builderPool(state.type).length + L('ui.5089575b3256') +
              '</div>' +
            '</section>' +
          '</aside>' +
          '<section class="builder-center">' +
            '<div class="panel deck-board">' +
              '<div class="deck-board-head"><div class="deck-board-title"><span class="side-mark ' + (state.side === 'B' ? 'enemy' : '') + '">' + (this.builderSideName(state.side) === L('ui.13d56d03d73a') ? L('ui.5e3127724b85') : this.builderSideName(state.side) === L('ui.4bdaf46d2363') ? L('ui.a44c5936fb41') : state.side) + '</span><h2>' + this.builderSideName(state.side) + L('ui.b66528c0cbac') +
                '<div class="deck-board-meta"><span class="chip">' + cards.units.length + L('ui.8d4b1c335716') + cards.equipment.length + L('ui.526114e152b6') + cards.runes.length + L('ui.f02b5b2acbb0') + (validation.ok ? 'green' : 'red') + '">' + (validation.ok ? L('ui.7035f86dd0f0') : L('ui.4abb02b25213')) + '</span></div></div>' +
              '<div class="deck-columns">' + deckColumn('units') + deckColumn('equipment') + deckColumn('runes') + '</div>' +
              '<div class="deck-builder-foot"><div class="validity-list">' +
                '<span class="chip ' + (validation.cards.units.some(u => u.counted !== false) ? 'green' : 'red') + L('ui.3721873ec5d5') + validation.cards.units.filter(u => u.counted !== false).length + '</span>' +
                '<span class="chip ' + (cards.runes.length <= 3 ? '' : 'red') + L('ui.b1aded73f0c1') + cards.runes.length + ' / 3</span>' +
              L('ui.ddc8551b304b') +
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
    const rules = (this.builder && this.builder.rules) || DEFAULT_RULES;
    if (type === 'unit' && !rules.allowDuplicates && list.includes(id)) {
      this.toast(L('ui.daa8f16ae05e'), 'error');
      return;
    }
    if (type === 'rune' && list.length >= 3) {
      this.toast(L('ui.750d70304046'), 'error');
      return;
    }
    const map = type === 'unit' ? Store.index.maps.units : type === 'equipment' ? Store.index.maps.equipment : Store.index.maps.runes;
    if (!map.has(id)) { this.toast(L('ui.11a025299c96'), 'error'); return; }
    list.push(id);
    this.builder.selectedType = type;
    this.builder.selectedId = id;
    this.renderBuilderAndToast(L('ui.e7ac62aa6365') + map.get(id).name + '」。');
  },

  builderRemove(type, id) {
    if (!this.builder) return;
    const key = type === 'units' ? 'units' : type === 'equipment' ? 'equipment' : 'runes';
    const list = this.builder.deck[key] || [];
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    this.renderBuilderAndToast(L('ui.59b2c216193f'));
  },

  renderBuilderAndToast(text) {
    this.render();
    if (text) this.toast(text, 'success');
  },

  builderSaved() {
    if (!this.builder) return;
    const validation = this.validateDeck(this.builder.deck, this.builder.rules || DEFAULT_RULES);
    if (!validation.ok) {
      this.toast(validation.errors.join('；'), 'error', L('ui.90972156f4cc'));
      return;
    }
    Store.saveDeck(this.builder.side, this.builder.deck);
    const side = this.builder.side;
    const returnRoute = this.builder.returnRoute || 'home';
    this.builder = null;
    this.go(returnRoute);
    this.toast(this.builderSideName(side) + L('ui.0bf5a48144df'), 'success');
  },

  builderBack() {
    if (!this.builder) { this.go('home'); return; }
    const returnRoute = this.builder.returnRoute || 'home';
    this.builder = null;
    this.go(returnRoute);
  },

  builderRecommended() {
    if (!this.builder) return;
    this.builder.deck = deepClone(this.builder.side === 'A' ? DEFAULT_LOADOUT_A : DEFAULT_LOADOUT_B);
    this.builder.type = 'unit';
    this.builder.selectedType = 'unit';
    this.builder.selectedId = this.builder.deck.units[0];
    this.render();
    this.toast(L('ui.bca1a21e0447'), 'success');
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
    if (!items.length) return L('ui.0e1d384d186b');
    return items.map(item => {
      const card = item.card;
      const selected = this.library.selectedId === card.id && this.library.selectedType === item.type;
      let sub = '';
      let stats = '';
      if (item.type === 'unit') {
        sub = L('ui.3fa6e6baec47') + card.hp + ' · ' + (RESISTANCE_TYPES[card.resistance.type] || { label: L('ui.aa8457052a32') }).label + ' ' + card.resistance.value;
        stats = '<span class="stat"><b>' + card.hp + L('ui.934e80ab36e9') + card.resistance.value + L('ui.10d818dc63cc') + (card.counted === false ? '' : ' green') + '">' + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</span>';
      } else if (item.type === 'equipment') {
        sub = L('ui.56bd2bba6de9') + (card.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd'));
        stats = '<span class="chip gold">' + esc(modSummary(card.mods, true) || L('ui.8422a8ff327d')) + '</span>';
      } else {
        sub = L('ui.644e0790b977') + (card.faction === 'any' ? L('ui.d13a98752b5d') : card.faction);
        stats = '<span class="chip violet">' + esc(modSummary(card.mods, true) || L('ui.8422a8ff327d')) + '</span>';
      }
      return '<button class="display-card ' + qualityClass(card.quality) + ' ' + (item.type === 'unit' && card.quality === 'rainbow' ? 'rainbow-frame ' : '') + (card.quality === 'gold' ? 'gold-frame ' : '') + (selected ? 'selected' : '') + '" type="button" data-action="library-select" data-type="' + item.type + '" data-id="' + attr(card.id) + '">' +
        '<div class="display-card-art"><img src="' + attr(cardArt(card)) + '" alt=""><span class="art-shade"></span><span class="quality-badge ' + qualityClass(card.quality) + '" aria-hidden="true"></span><span class="type-tag">' + cardTypeLabel(item.type) + '</span><span class="card-id">' + esc(card.id) + '</span></div>' +
        '<div class="display-card-body"><h3>' + esc(card.name) + '</h3><div class="card-sub">' + esc(sub) + '</div><div class="display-card-stats">' + stats + '</div></div>' +
      '</button>';
    }).join('');
  },

  updateLibraryResults() {
    const grid = document.getElementById('library-results');
    if (grid) { grid.innerHTML = this.renderLibraryResults(); if (window.I18n) I18n.apply(grid); }
    const count = document.getElementById('library-count');
    if (count) count.textContent = this.libraryFiltered().length + L('ui.9a67466c8bc4');
  },

  renderLibrary() {
    const items = this.libraryFiltered();
    const selected = this.currentLibraryCard();
    const qualityOptions = L('ui.cb65e296bb0f') +
      '<button class="quality-choice all' + (this.library.quality === 'all' ? ' active' : '') + L('ui.2c76780388ad') +
      Object.keys(QUALITIES).map(q => '<button class="quality-choice ' + qualityClass(q) + (this.library.quality === q ? ' active' : '') + '" type="button" data-action="library-quality" data-quality="' + q + L('ui.ecee28477871') + QUALITIES[q].label + '"></button>').join('') +
    '</div>';
    const tabs = [{ id: 'all', label: L('ui.778fc8f99453') }, { id: 'unit', label: L('ui.6b26695e4dce') }, { id: 'equipment', label: L('ui.1faf3321a84f') }, { id: 'rune', label: L('ui.52bd5ee23b8d') }].map(tab => '<button class="segment' + (this.library.type === tab.id ? ' active' : '') + '" type="button" data-action="library-type" data-type="' + tab.id + '">' + tab.label + '</button>').join('');
    let detail = '';
    if (selected) {
      if (this.library.selectedType === 'skill') {
        detail = '<article class="card-detail"><div class="card-detail-body"><div class="detail-title-row"><div><h2>' + esc(selected.name) + L('ui.692d167513b9') + esc(selected.id) + '</p></div></div>' + renderSkillDetailCard(selected) + L('ui.99f788d094a3') + renderFlowTree(selected.steps) + '</div></article>';
      } else if (this.library.selectedType === 'effect') {
        detail = '<article class="card-detail"><div class="card-detail-body"><div class="detail-title-row"><div><h2>' + esc(selected.name) + L('ui.f7e9d1d94fa0') + esc(selected.id) + '</p></div></div><p class="detail-flavor">' + esc(selected.description || L('ui.2070d97c0d0c')) + '</p><div class="validity-list"><span class="chip">' + esc(EFFECT_TYPES[selected.type] ? EFFECT_TYPES[selected.type].label : L('ui.971b6e5a0a75')) + '</span><span class="chip">' + (selected.removable === false ? L('ui.b8d15f7d9c7c') : L('ui.15af0820cc6d')) + '</span><span class="chip">' + (selected.stackable ? L('ui.13fe50e524e9') + selected.stackMax : L('ui.79f36e6fdda8')) + L('ui.da66a8238a53') + renderFlowTree(selected.steps) + '</div></article>';
      } else {
        detail = renderCardDetail(selected, this.library.selectedType);
      }
    }
    return '' +
      '<div class="page-wrap library-page">' +
        L('ui.ec9f7d4c7a70') + items.length + ' / ' + Store.index.cards + L('ui.cbdf63572b5f') +
        '<div class="library-toolbar"><div class="segmented">' + tabs + '</div>' + qualityOptions + '<div class="search-wrap"><input class="input" type="search" value="' + attr(this.library.search) + L('ui.14ba6b581310') + items.length + L('ui.0b3b108b77ac') +
        '<div class="library-layout">' +
          '<div class="card-grid" id="library-results">' + this.renderLibraryResults() + '</div>' +
          '<aside class="library-aside">' + (detail || L('ui.634700c758d7')) + '</aside>' +
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
    el.innerHTML = '<div><strong>' + esc(title || (type === 'error' ? L('ui.223fb3c8fb54') : L('ui.ab3656a956f5'))) + '</strong><span>' + (title ? '<br>' : '') + esc(text) + '</span></div>';
    if (window.I18n) I18n.apply(el);
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
    const closeButton = options.closable === false ? '' : L('ui.f8190fb8d36f');
    const modalHtml = '' +
      '<div class="modal-backdrop" data-action="modal-backdrop">' +
        '<section class="modal ' + (options.size === 'small' ? 'small ' : options.size === 'large' ? 'large ' : '') + '" role="dialog" aria-modal="true" aria-label="' + attr(options.title || L('ui.21a58979fe70')) + '">' +
          '<div class="modal-head"><div><h2>' + esc(options.title || '') + '</h2>' + (options.subtitle ? '<p>' + esc(options.subtitle) + '</p>' : '') + '</div>' + closeButton + '</div>' +
          '<div class="modal-body">' + (options.body || '') + '</div>' +
          (options.foot ? '<div class="modal-foot">' + options.foot + '</div>' : '') +
        '</section>' +
      '</div>';
    if (root.classList.contains('active') && root.firstElementChild) {
      const template = document.createElement('template');
      template.innerHTML = modalHtml;
      morphDomChildren(root, template.content);
    } else {
      root.innerHTML = modalHtml;
    }
    root.classList.add('active');
    this.modalOpen = true;
    document.body.style.overflow = 'hidden';
    if (window.I18n) I18n.apply(root);
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
    this.clearAutoTimer();
    this._battleInteractionPause = true;
  },

  confirm(options) {
    this._modalConfirm = options.onConfirm || null;
    this.openModal({
      title: options.title || L('ui.3161d348cc96'),
      subtitle: options.subtitle || '',
      size: 'small',
      closable: true,
      body: '<p class="modal-copy">' + esc(options.message || '') + '</p>' + (options.detail ? '<div class="notice mt-2">' + esc(options.detail) + '</div>' : ''),
      foot: L('ui.b0f150955f48') + (options.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-action="modal-confirm">' + esc(options.confirmLabel || L('ui.b56d9ac6c5a0')) + '</button>'
    });
  },

  copyText(text, successMessage) {
    const done = () => this.toast(successMessage || L('ui.b6049f99d98c'), 'success');
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
        this.openModal({ title: L('ui.9a6ee0c5a9c4'), size: 'large', body: L('ui.ae8e9f247c63') + esc(text) + '</textarea>' });
      }
    } catch (error) {
      this.openModal({ title: L('ui.9a6ee0c5a9c4'), size: 'large', body: L('ui.ce379620318e') + esc(text) + '</textarea>' });
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
      this.toast(L('ui.0d1ea2dfa031') + filename, 'success');
    } catch (error) {
      this.toast(L('ui.38ab58387065') + error.message, 'error');
    }
  }
};

/* ---------- Battle ---------- */
App.startBattle = function (config) {
  config = config || {};
  try {
    this.clearAiTimer();
    this.clearAutoTimer();
    const settings = Store.state.settings || {};
    const rules = Object.assign({}, DEFAULT_RULES, config.rules || {}, { showFormula: settings.showFormula !== false });
    const battle = new Battle({
      loadouts: config.loadouts,
      rules,
      controllers: config.controllers || { A: 'human', B: 'ai' },
      mode: config.mode || 'versus',
      noDraw: !!config.noDraw,
      drawFromPool: !!config.drawFromPool,
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
    this.clearAutoTimer();
    this._fxToken = (this._fxToken || 0) + 1;
    this._battleVisualCursor = battle.visualFeed.length ? battle.visualFeed[battle.visualFeed.length - 1].id : 0;
    if (window.BattleFX) BattleFX.cancel();
    this._screenRoute = null;
    this._screenHtml = null;
    this.route = 'battle';
    this.go('battle');
  } catch (error) {
    console.error(error);
    this.toast(L('ui.6ef44296c601') + error.message, 'error');
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
  if (this.battle.status === 'ended') return L('ui.28363ab272e2');
  return { setup: L('ui.4f1f8aa3ffd7'), muster: L('ui.e735458ad5f0'), awaiting: L('ui.af466b624d81'), resolving: L('ui.0327cd3d96eb'), roundEnd: L('ui.58687e83f177'), ended: L('ui.28363ab272e2') }[this.battle.phase] || L('ui.af466b624d81');
};

App.renderBattle = function () {
  if (!this.battle) return this.renderMissingModule(L('ui.0ebbcd444986'));
  const battle = this.battle;
  const current = battle.currentSide ? battle.sides[battle.currentSide] : null;
  const currentController = current ? battle.controllers[current.side] : null;
  const remaining = current ? battle.getFieldUnits(current.id).filter(unit => !unit.acted).length : 0;
  const modeName = this.battleContext && GAME_MODES[this.battleContext.mode] ? GAME_MODES[this.battleContext.mode].name : L('ui.d70538c4852a');
  const phase = this.phaseLabel();
  const result = battle.status === 'ended' ? this.battleResultSummary() : null;
  const customBattle = this.battleContext && this.battleContext.custom;
  const ruleTags = [
    customBattle ? L('ui.5139313bb9ee') : battle.rules.initialDraw + L('ui.cc7dc631b47c'),
    battle.rules.maxField + L('ui.773840252eb8'),
    battle.rules.allowDuplicates ? L('ui.9c711c54e30f') : L('ui.a8665b7904cb')
  ];
  const winnerBanner = result ? '<div class="battle-end-banner"><img src="' + (result.playerWin ? 'assets/pictures/brand-mark.svg' : 'assets/icons/challenge.svg') + '" alt="" width="25" height="25"><div><strong>' + esc(result.title) + '</strong><br><span>' + esc(result.subtitle) + L('ui.0bf98988de94') : '';
  return '' +
    '<div class="battle-page' + (this._battleFxActive ? ' fx-locked' : '') + '">' +
      '<div class="battle-titlebar">' +
        L('ui.5cd290c6326f') + esc(modeName) + L('ui.f641d1fed95d') + esc(battle.sides[battle.firstSide].name) + '</p></div><div class="battle-rule-tags">' + ruleTags.map(tag => '<span class="chip tiny">' + esc(tag) + '</span>').join('') + '</div></div>' +
        L('ui.3a7a9795007d') + (battle.status !== 'active' ? ' disabled' : '') + L('ui.9128feb8219c') +
      '</div>' +
      '<div class="battle-statusbar' + (battle.status === 'ended' ? ' ended' : '') + '">' +
        L('ui.0d2d914fd308') + battle.round + '</b></div></div>' +
        L('ui.1211bf7cd65c') + esc(phase) + '</div></div>' +
        L('ui.f7571e72a3af') + (battle.currentSide === 'B' ? 'enemy' : '') + '"></span><span>' + (result ? esc(result.title) : current ? esc(current.name) : '—') + '</span>' + (current && !result ? '<span class="tiny faint">' + (currentController === 'ai' ? L('ui.4afad877551a') : L('ui.e7c31937dbde')) + '</span>' : '') + '</div></div>' +
        L('ui.fea340a2a2f9') + esc(battle.sides[battle.firstSide].name) + ' / ' + battle.firstSide + '</div></div>' +
        L('ui.8810852109ee') + (result ? '—' : remaining) + L('ui.205053e1c45e') +
      '</div>' +
      winnerBanner +
      '<div class="battle-grid">' +
        this.renderBattleField('A') +
        this.renderBattleActionPanel() +
        this.renderBattleField('B') +
        this.renderBattleLoadout() +
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
  const occupied = battle.occupiedFieldCount(sideId);
  const emptySlots = Math.max(0, battle.rules.maxField - occupied);
  const canDeploy = isHuman && battle.status === 'active' && (battle.phase === 'awaiting' || battle.phase === 'muster') && side.hand.length > 0;
  const slotHtml = Array.from({ length: emptySlots }).map(() => canDeploy
    ? '<button class="unit-empty-slot deployable" type="button" data-action="battle-deploy-open" data-side="' + sideId + '">' + (battle.phase === 'muster' ? L('ui.a2b3787c398d') : L('ui.93e91308f357')) + '<small>' + side.hand.length + L('ui.5276fb3453e2')
    : '<div class="unit-empty-slot"><span class="plus">+</span>' + (battle.phase !== 'awaiting' && battle.phase !== 'muster' ? L('ui.f293b187bb5a') : side.hand.length ? L('ui.022ac12f149f') : L('ui.496e93ff1e71')) + '</div>').join('');
  const sideLabel = side.name + L('ui.9fdd27834e9e');
  const runeSlots = Array.from({ length: 3 }).map((_, index) => side.runes[index]
    ? '<span class="rune-mini previewable" data-action="battle-preview-card" data-type="rune" data-id="' + attr(side.runes[index].id) + '" title="' + attr(side.runes[index].description || '') + '">' + esc(side.runes[index].name) + '</span>'
    : '<span class="rune-mini empty">+</span>').join('');
  const runeFooter = '<span class="field-runes-static">' + runeSlots + '</span>';
  const activeLabel = isActive ? (battle.controllers[sideId] === 'ai' ? L('ui.9456ff9f51bf') : L('ui.dd1df425f7f9')) : '';
  return '' +
    '<section class="battle-field field-' + sideId.toLowerCase() + '">' +
      '<div class="panel field-panel' + (isActive ? ' side-active' : '') + '">' +
        '<div class="field-head">' +
          '<div class="field-head-left"><span class="field-side-mark">' + esc((this.isHotseatBattle() ? (sideId === 'A' ? L('ui.5e3127724b85') : L('ui.a44c5936fb41')) : (sideId === 'A' ? L('ui.34f201bc507e') : L('ui.1729f61b01d3')))) + '</span><div><h2>' + esc(sideLabel) + '</h2><div class="field-sub">' + esc(side.name) + ' · ' + (isHuman ? L('ui.34ef7b8af0de') : L('ui.769bc169aa9f')) + '</div></div></div>' +
          '<div class="field-status"><span class="chip ' + (isActive ? 'gold' : '') + '">' + esc(activeLabel || L('ui.8dead12de75a')) + '</span><span class="chip' + (occupied > battle.rules.maxField ? ' over-limit' : '') + '">' + occupied + '/' + battle.rules.maxField + (occupied > battle.rules.maxField ? L('ui.3a8a18220440') : '') + '</span></div>' +
        '</div>' +
        '<div class="field-body"><div class="unit-stack">' + (units.length ? units.map(unit => this.renderBattleUnit(unit)).join('') : L('ui.b333a1a4c84e')) + slotHtml + '</div></div>' +
        L('ui.35a18cda82c9') + side.equipmentPool.length + L('ui.967450fee80c') + side.hand.length + '</span>' + runeFooter + '</div>' +
      '</div>' +
    '</section>';
};

App.renderUnitModChips = function (unit) {
  if (!this.battle || !unit) return '';
  const mods = this.battle.getMods(unit) || {};
  const keys = ['atkFlat', 'atkPct', 'dmgFlat', 'dmgPct', 'finalDmgFlat', 'finalDmgPct', 'healFlat', 'healPct', 'resistFlat', 'resistPct', 'physicalResist', 'mentalResist', 'takenFlat', 'takenPct', 'maxHpFlat'];
  return keys.filter(key => Number(mods[key])).map(key => {
    const value = Number(mods[key]);
    const suffix = key.toLowerCase().includes('pct') ? '%' : '';
    return '<span class="unit-effect-chip unit-mod-chip" title="' + attr(STAT_KEYS[key] || key) + '"><span>' + esc(STAT_KEYS[key] || key) + '</span><b>' + (value > 0 ? '+' : '') + value + suffix + '</b></span>';
  }).join('');
};

App.renderBattleUnit = function (unit) {
  const battle = this.battle;
  const ui = this.battleUI;
  const isTarget = this.isBattleTarget(unit);
  const isTargetChosen = ui.targetUid === unit.battleId;
  const isSelected = ui.selectedUid === unit.battleId && !ui.skillId;
  const isOwnTurn = battle.currentSide === unit.side && battle.status === 'active';
  const isHuman = battle.controllers[unit.side] === 'human';
  const isAutoUnit = !!(unit.card && unit.card.autoAttack);
  const autoWaiting = isOwnTurn && isHuman && battle.getAutoUnits(unit.side).some(item => !item.acted);
  const canSelect = isOwnTurn && !unit.acted && isHuman && !ui.skillId && !isAutoUnit && !autoWaiting;
  const res = battle.resistanceSummary(unit);
  const effects = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    if (!def) return '';
    return '<span class="unit-effect-chip ' + esc(def.type) + '" title="' + attr(def.description || '') + '"><span>' + esc(def.name) + '</span>' + (def.stackable ? '<b>×' + inst.stacks + '</b>' : '') + '</span>';
  }).join('');
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<span class="unit-effect-chip"><span>' + esc(battle.countLabel(key)) + '</span><b>' + unit.counts[key] + '</b></span>').join('');
  const modChips = this.renderUnitModChips(unit);
  const gear = ['weapon', 'accessory'].map(slot => {
    const item = unit.equipment[slot];
    return '<span class="gear-slot' + (item ? ' filled' : '') + '"' + (item ? ' data-action="battle-preview-card" data-type="equipment" data-id="' + attr(item.id) + '"' : '') + ' title="' + attr(slot === 'weapon' ? L('ui.22dfca867179') : L('ui.ba579c7d0a4e')) + '">' + (item ? esc(item.name) : (slot === 'weapon' ? L('ui.b26a320cc217') : L('ui.a5b968e57adc'))) + '</span>';
  }).join('');
  const hpPct = Math.max(0, Math.min(100, Math.round(unit.hp / Math.max(1, unit.maxHp) * 100)));
  const baseResLabel = (RESISTANCE_TYPES[unit.card.resistance.type] || { label: L('ui.aa8457052a32') }).label;
  const classes = ['unit-card', qualityClass(unit.quality)];
  if (canSelect) classes.push('selectable');
  if (isSelected) classes.push('selected-action');
  if (isTarget) classes.push('targetable');
  if (isTargetChosen) classes.push('target-selected');
  if (unit.acted) classes.push('acted');
  if (unit.pendingDefeat) classes.push('pending-defeat');
  if (isAutoUnit) classes.push('auto-unit');
  return '' +
    '<article class="' + classes.join(' ') + '" data-action="battle-unit" data-uid="' + attr(unit.battleId) + '" role="button" tabindex="0" aria-label="' + attr(unit.name) + '">' +
      (isTarget ? L('ui.59df40f55ff0') : '') +
      '<div class="unit-top"><div class="unit-name-wrap"><div class="unit-name"><strong data-action="battle-preview-card" data-type="unit" data-id="' + attr(unit.card.id) + '" data-uid="' + attr(unit.battleId) + '" title="' + attr(L('ui.34a6af38b8ac')) + '">' + esc(unit.name) + '</strong><span class="unit-uid">' + esc(unit.battleId) + '</span></div><div class="unit-tags">' + qualityBadge(unit.quality) + '<span class="chip">' + (unit.counted ? L('ui.37802b1dfc26') : L('ui.79b46e5f7db7')) + '</span>' + (isAutoUnit ? L('ui.a4b2c63b6709') : '') + (unit.acted ? L('ui.e5bba186348c') : '') + '</div></div></div>' +
      '<div class="unit-body"><div class="unit-portrait previewable" data-action="battle-preview-card" data-type="unit" data-id="' + attr(unit.card.id) + '" data-uid="' + attr(unit.battleId) + '" title="' + attr(L('ui.34a6af38b8ac')) + '"><img src="' + attr(cardArt(unit.card)) + '" alt=""><span class="unit-counted-mark">' + (unit.counted ? L('ui.94da9e6f36bd') : L('ui.8fa7401e9077')) + '</span></div><div class="unit-info">' +
        L('ui.2c05f3b28021') + (unit.hp < unit.maxHp ? ' hurt' : '') + '">' + unit.hp + '<small> / ' + unit.maxHp + '</small></span></div>' +
        '<div class="hp-bar' + (hpPct > 50 ? ' green' : '') + '"><span style="width:' + hpPct + '%"></span></div>' +
        '<div class="unit-statline"><span class="chip" title="' + attr(L('ui.648f602905d5') + baseResLabel + ' ' + unit.card.resistance.value) + L('ui.37e19f689902') + res.physical + L('ui.2dd83c18a982') + res.mental + L('ui.a3dc4af8ce5b') + unit.atk + '</b></span></div>' +
      '</div></div>' +
      ((effects || counts || modChips) ? '<div class="unit-effects">' + effects + counts + modChips + '</div>' : '') +
      '<div class="unit-foot"><div class="unit-foot-left">' + gear + '</div><div class="unit-foot-actions"><button class="mini-action" type="button" data-action="battle-unit-counts" data-uid="' + attr(unit.battleId) + L('ui.1026f875e091') + attr(unit.battleId) + L('ui.cbc4c45e1d04') +
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
    body = '<div class="action-empty"><img src="assets/pictures/brand-mark.svg" alt="" width="45" height="45"><h3>' + esc(result.title) + '</h3><p>' + esc(result.subtitle) + L('ui.82e3ba86f7f1');
    footer = L('ui.c77ad8099178') + battle.round + L('ui.60df091919ab');
  } else if (battle.phase === 'muster') {
    const countedA = battle.getFieldUnits('A').filter(unit => unit.counted).length;
    const countedB = battle.getFieldUnits('B').filter(unit => unit.counted).length;
    const ready = countedA > 0 && countedB > 0;
    body = L('ui.0d2166aad1ac') + (countedA ? 'green' : 'red') + L('ui.e549f982faa2') + countedA + '</span><span class="chip ' + (countedB ? 'green' : 'red') + L('ui.51a6344f4a05') + countedB + '</span></div><div class="btn-row mt-2"><button class="btn btn-primary" type="button" data-action="battle-begin-muster"' + (ready ? '' : ' disabled') + L('ui.a4cde1b97d2b');
    footer = L('ui.d09ecb5efd28');
  } else if (pending) {
    const skill = pending.skill;
    const mode = skill.targetMode || 'none';
    const targetMode = TARGET_MODES[mode] || TARGET_MODES.none;
    const validTargets = this.battleTargetPreview();
    const chosen = ui.targetUid ? battle.getUnit(ui.targetUid) : null;
    const canConfirm = !targetMode.needsTarget || !!chosen;
    const prompt = targetMode.needsTarget
      ? L('ui.70d76b9a423f') + (chosen ? L('ui.9c5605840c67') + esc(chosen.name) + '（' + esc(chosen.battleId) + '）' : L('ui.c7b797e7b4a7')) + '</div></div>'
      : L('ui.1d8da6460c8a') + esc(targetMode.label) + L('ui.3b344f14aee8');
    body = '<div class="action-unit-line"><img src="' + attr(cardArt(pending.actor.card)) + '" alt=""><div class="grow"><strong>' + esc(pending.actor.name) + '</strong><small>' + esc(skillTypeLabel(skill.type)) + L('ui.a52be04332bd') + esc(skillOpLabel(skill.op)) + L('ui.5a74d995af6a') + esc(targetMode.label) + '</small></div><span class="chip ' + opClass(skill.op) + '">' + esc(skill.name) + '</span></div>' +
      prompt +
      '<div class="notice">' + esc(skill.description || '') + '</div>' +
      '<div class="confirm-dock"><button class="btn btn-primary" type="button" data-action="battle-confirm-skill"' + (canConfirm ? '' : ' disabled') + '>' + (pending.kind === 'extra' ? L('ui.b38d959c6d04') : L('ui.c47624d87ede')) + L('ui.22eee1d15b87') + (validTargets.length ? L('ui.74cb6bb62264') + validTargets.length + L('ui.6ee50f2dfa57') : L('ui.97be43f1964f')) + '</span></div>' +
      (skill.requirements && skill.requirements.length ? L('ui.4711af87eedd') + esc(requirementSummary(skill)) + '</div>' : '');
    footer = '<div class="turn-help">' + (pending.kind === 'extra' ? L('ui.c775619dddff') : L('ui.7e95d4a9d689')) + L('ui.1ffdf49c4ed0');
  } else if (selectedUnit) {
    const skills = battle.getActiveSkills(selectedUnit);
    const skillRows = skills.map(skill => {
      const state = battle.getSkillState(selectedUnit, skill);
      const chosen = ui.skillId === skill.id;
      return '<button class="skill-choice ' + (state.usable ? 'usable' : 'disabled') + (chosen ? ' chosen' : '') + '" type="button" data-action="battle-skill" data-uid="' + attr(selectedUnit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled') + '>' +
        '<span class="skill-choice-icon"><img src="' + (skill.op === 'heal' ? 'assets/icons/heal.svg' : 'assets/icons/damage.svg') + '" alt=""></span>' +
        '<span class="skill-choice-main"><span class="skill-choice-top"><strong>' + esc(skill.name) + '</strong><span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span><span class="op-badge ' + opClass(skill.op) + '">' + esc(skillOpLabel(skill.op)) + '</span></span><span class="skill-choice-desc">' + esc(skill.description || '') + '</span>' + (state.usable ? '' : '<span class="req-line">' + esc(state.reason) + '</span>') + '</span>' +
        '<span class="skill-choice-state' + (state.usable ? '' : ' locked') + '">' + (state.usable ? (TARGET_MODES[skill.targetMode] || TARGET_MODES.none).label : L('ui.beff4a1cd1a6')) + '</span>' +
      '</button>';
    }).join('') || L('ui.20948f218cf1');
    const extraSkills = battle.getExtraSkills(selectedUnit);
    body = '<div class="action-unit-line"><img src="' + attr(cardArt(selectedUnit.card)) + '" alt=""><div class="grow"><strong>' + esc(selectedUnit.name) + L('ui.8e2355a4acc3') + selectedUnit.hp + ' / ' + selectedUnit.maxHp + ' · ' + esc(selectedUnit.battleId) + ' · ' + (selectedUnit.counted ? L('ui.52cb1d3915a1') : L('ui.360daa2c9859')) + L('ui.d64c9b850d92') +
      L('ui.1a25cd92503b') +
      '<div class="skill-choice-list">' + skillRows + '</div>' +
      (extraSkills.length ? L('ui.2e7174e8525a') + extraSkills.length + '</span></div><div class="extra-list">' + extraSkills.map(skill => {
        const state = battle.getSkillState(selectedUnit, skill);
        return '<button class="extra-skill-btn" type="button" data-action="battle-extra" data-uid="' + attr(selectedUnit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled title="' + attr(state.reason) + '"') + '>' + esc(skill.name) + '</button>';
      }).join('') + '</div></div>' : '');
    footer = L('ui.b0d0f25db40d') + attr(selectedUnit.battleId) + L('ui.03f99d767456');
  } else {
    const allUnacted = current ? battle.getFieldUnits(current.id).filter(unit => !unit.acted) : [];
    const autoUnits = current ? allUnacted.filter(unit => unit.card && unit.card.autoAttack) : [];
    const selectable = autoUnits.length ? [] : allUnacted;
    const extraLines = autoUnits.length ? [] : (current ? battle.getFieldUnits(current.id).flatMap(unit => battle.getExtraSkills(unit).map(skill => ({ unit, skill }))) : []);
    const extras = extraLines.length ? L('ui.d48cc0018ad7') + extraLines.length + '</span></div><div class="extra-list">' + extraLines.map(({ unit, skill }) => {
      const state = battle.getSkillState(unit, skill);
      return '<button class="extra-skill-btn" type="button" data-action="battle-extra" data-uid="' + attr(unit.battleId) + '" data-skill="' + attr(skill.id) + '"' + (state.usable ? '' : ' disabled title="' + attr(state.reason) + '"') + '>' + esc(unit.name) + ' · ' + esc(skill.name) + '</button>';
    }).join('') + '</div></div>' : '';
    const canRefill = current && battle.controllers[current.id] === 'human' && current.hand.length &&
      (battle.occupiedFieldCount(current.id) < battle.rules.maxField || current.hand.some(id => {
        const card = battle.deckUnitCard(id);
        return card && card.noFieldSlot;
      }));
    const autoText = autoUnits.length ? L('ui.9264d69190a3') : '';
    body = autoUnits.length
      ? L('ui.e9c70634db5c') + autoText + (canRefill ? L('ui.eaa76bc67e25') : '') + '</div>'
      : L('ui.69995b213b5e') + (selectable.length ? L('ui.1391dc385e96') : L('ui.9bbd8148a04e')) + '</h3><p>' + (selectable.length ? L('ui.c0a74578a048') : L('ui.4d2c3c386db3')) + '</p>' + (canRefill ? L('ui.eaa76bc67e25') : '') + extras + '</div>';
    footer = L('ui.4de48fe3efcd') + esc(current ? current.name : '') + L('ui.1d0ee535f7d2') + remainingCountLabel(this.battle) + L('ui.4bc3662b4366');
  }
  return '<div class="battle-action"><div class="action-panel">' +
    '<div class="action-head"><div><div class="eyebrow">' + (ending ? 'RESULT' : isAi ? 'AUTOMATED TURN' : 'ACTION SELECTION') + '</div><h2>' + (ending ? L('ui.64ff8c68dd57') : isAi ? L('ui.c2bc9c2d185f') : L('ui.5d89d8537e8d')) + L('ui.3502a05619c2') + battle.round + L('ui.880b7258b49b') + (current && !ending ? '<span class="chip ' + (current.id === 'B' ? 'blue' : 'gold') + '">' + esc(current.name) + '</span>' : '') + '<span class="chip">' + esc(this.phaseLabel()) + '</span></div></div>' +
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
  const shouldAnimate = visuals.length > 0 && !!window.BattleFX && typeof BattleFX.play === 'function';
  this._battleFxActive = shouldAnimate;
  if (!shouldAnimate) {
    this._battleFxActive = false;
    this.render();
    this.afterBattleRender();
    return;
  }

  // Keep the pre-action DOM on screen while the attack animation plays.
  // Engine state is already resolved synchronously, but the visible HP bars,
  // hand, turn indicator and logs are committed only when the FX completes.
  const page = document.querySelector('.battle-page');
  if (page) {
    page.classList.add('fx-locked');
    page.setAttribute('aria-busy', 'true');
  }
  const token = ++this._fxToken;
  const currentPositions = this.captureBattleUnitPositions();
  const positions = Object.assign({}, previousPositions, currentPositions);
  BattleFX.play(visuals, positions, () => {
    if (token !== this._fxToken || this.route !== 'battle' || this.battle !== battle) return;
    this._battleFxActive = false;
    const currentPage = document.querySelector('.battle-page');
    if (currentPage) {
      currentPage.classList.remove('fx-locked');
      currentPage.removeAttribute('aria-busy');
    }
    this.render();
    this.afterBattleRender();
  }, (event) => this.previewBattleHp(event));
};

App.previewBattleHp = function (event) {
  if (!event || (event.kind !== 'damage' && event.kind !== 'heal')) return;
  const uid = event.targetUid || event.uid;
  const card = uid ? document.querySelector('.unit-card[data-uid="' + String(uid).replace(/"/g, '\\"') + '"]') : null;
  if (!card) return;
  const hp = Math.max(0, Number(event.afterHp));
  const maxHp = Number(event.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return;
  const hpNum = card.querySelector('.hp-num');
  if (hpNum) {
    hpNum.innerHTML = hp + '<small> / ' + maxHp + '</small>';
    hpNum.classList.toggle('hurt', hp < maxHp);
  }
  const barFill = card.querySelector('.hp-bar > span');
  if (barFill) barFill.style.width = Math.max(0, Math.min(100, Math.round(hp / maxHp * 100))) + '%';
  card.classList.toggle('defeat-preview', event.kind === 'damage' && !!event.defeated && hp <= 0);
  card.classList.remove('hp-hit', 'hp-heal-preview');
  const flashClass = event.kind === 'heal' ? 'hp-heal-preview' : 'hp-hit';
  void card.offsetWidth;
  card.classList.add(flashClass);
  clearTimeout(card._hpPreviewTimer);
  card._hpPreviewTimer = setTimeout(() => card.classList.remove(flashClass), event.kind === 'heal' ? 420 : 260);
  card.setAttribute('data-preview-hp', hp + '/' + maxHp);
};

App.cancelBattleFx = function () {
  this._fxToken = (this._fxToken || 0) + 1;
  this._battleFxActive = false;
  const page = document.querySelector('.battle-page');
  if (page) {
    page.classList.remove('fx-locked');
    page.removeAttribute('aria-busy');
  }
  if (window.BattleFX) BattleFX.cancel();
};

App.isHotseatBattle = function () {
  return !!(this.battle && this.battle.controllers.A === 'human' && this.battle.controllers.B === 'human');
};

App.battleSideLabel = function (sideId) {
  if (!this.battle || !sideId) return '';
  return this.battle.sides[sideId] ? this.battle.sides[sideId].name : '';
};

App.renderBattleLoadout = function () {
  const battle = this.battle;
  if (!battle) return '';
  const hotseat = this.isHotseatBattle();
  const sideIds = ['A', 'B'].filter(sideId => {
    if (battle.controllers[sideId] === 'human') return true;
    return hotseat;
  });
  if (!sideIds.length) return '';
  const columns = sideIds.map(sideId => {
    const side = battle.sides[sideId];
    const canEdit = battle.status === 'active' && battle.phase === 'awaiting' && battle.currentSide === sideId && battle.controllers[sideId] === 'human' && !this._battleFxActive;
    const gear = (side.equipmentPool || []).map(id => battle.maps.equipment.get(id)).filter(Boolean);
    const gearCards = gear.length ? gear.map(item => {
      const content = '<img src="' + attr(cardArt(item)) + '" alt="" data-action="battle-preview-card" data-type="equipment" data-id="' + attr(item.id) + '" title="' + attr(L('ui.34a6af38b8ac')) + '"><span class="loadout-equip-main"><strong data-action="battle-preview-card" data-type="equipment" data-id="' + attr(item.id) + '">' + esc(item.name) + '</strong><small>' + esc((item.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + ' · ' + (modSummary(item.mods, true) || L('ui.455d56230713'))) + '</small></span>';
      return canEdit
        ? '<button class="loadout-equip" type="button" data-action="battle-equipment-open" data-side="' + sideId + '" data-id="' + attr(item.id) + '">' + content + '</button>'
        : '<div class="loadout-equip is-static">' + content + '</div>';
    }).join('') : L('ui.9517f5af584b');
    const runeSlots = Array.from({ length: 3 }).map((_, index) => {
      const rune = side.runes[index];
      return '<span class="loadout-rune' + (rune ? ' filled previewable' : '') + '"' + (rune ? ' data-action="battle-preview-card" data-type="rune" data-id="' + attr(rune.id) + '"' : '') + ' title="' + attr(rune ? (rune.description || '') : L('ui.716791b90bf3')) + '">' + (rune ? esc(rune.name) : '+') + '</span>';
    }).join('');
    const title = hotseat ? side.name + L('ui.46023c2ba2d0') : L('ui.46023c2ba2d0');
    return '<section class="loadout-side' + (battle.currentSide === sideId && battle.status === 'active' ? ' active' : '') + '">' +
      '<div class="loadout-head"><div><h3>' + esc(title) + '</h3><p>' + (canEdit ? L('ui.71a11949f8e8') : L('ui.8b8c979e6599')) + '</p></div><span class="chip">' + (canEdit ? L('ui.abcc63da9870') : L('ui.3cc7a5af4c19')) + '</span></div>' +
      L('ui.dd10ff5ac3cd') + gear.length + L('ui.11e6539c08e8') + gearCards + '</div></div>' +
      L('ui.a775bbe9f7ef') + side.runes.length + ' / 3</span></div><div class="loadout-runes-row">' + runeSlots + (canEdit ? '<button class="btn btn-sm loadout-rune-btn" type="button" data-action="battle-rune-config" data-side="' + sideId + L('ui.97d5b63370f5') : '') + '</div></div>' +
    '</section>';
  }).join('');
  return L('ui.71d67221e0aa') + (hotseat ? L('ui.16547d162a2e') : L('ui.a237ceda988b')) + '</span></div><div class="loadout-columns' + (sideIds.length === 1 ? ' single' : '') + '">' + columns + '</div></section>';
};

App.renderBattleHand = function () {
  const battle = this.battle;
  const renderSide = (sideId) => {
    const side = battle.sides[sideId];
    const hand = (side.hand || []).map(id => battle.deckUnitCard(id)).filter(Boolean);
    const handCards = hand.length ? hand.slice(0, 30).map(card => {
      return '<button class="hand-card" type="button" data-action="battle-hand-info" data-id="' + attr(card.id) + '">' +
        '<img src="' + attr(cardArt(card)) + '" alt="">' +
        '<span class="hc-name">' + esc(card.name) + '</span>' +
        '<span class="hc-badges">' + qualityBadge(card.quality) + '<span>' + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</span></span>' +
      '</button>';
    }).join('') : L('ui.f7f40b11cdc5');
    return '<section class="hand-zone panel"><div class="hand-head"><div class="hand-head-left"><span class="field-side-mark">' + (side.id === 'A' ? L('ui.34f201bc507e') : L('ui.1729f61b01d3')) + '</span><h2>' + esc(side.name) + L('ui.967450fee80c') + hand.length + '</h2></div><span class="chip">' + (battle.phase === 'muster' ? L('ui.a2b3787c398d') : L('ui.8c83f7cda7aa')) + '</span></div>' +
      '<div class="hand-body">' + handCards + '</div>' +
      '<div class="hand-foot">' + (battle.drawFromPool ? L('ui.0ae25fe39394') : '') + '</div></section>';
  };
  if (battle.drawFromPool) return '<div class="hand-columns">' + renderSide('A') + renderSide('B') + '</div>';
  return renderSide(battle.currentSide || 'A');
};

App.renderBattleRail = function () {
  const battle = this.battle;
  const settings = Store.state.settings;
  let logs = battle.logs.slice(-120);
  if (settings.compactLog) logs = logs.filter(entry => entry.kind !== 'formula' && entry.kind !== 'system');
  const logHtml = logs.length ? logs.map(entry => '<div class="log-entry ' + esc(entry.kind) + '"><span class="log-round">R' + entry.round + '</span><span class="log-kind">' + esc(entry.label) + '</span><span class="log-text">' + esc(entry.text) + '</span></div>').join('') : L('ui.60f7180840ae');
  const countDefs = Store.index.countDefs || {};
  const allCountIds = [...new Set(Object.keys(countDefs).concat(Object.keys(battle.globalCounts).concat(Object.keys(battle.sides.A.counts), Object.keys(battle.sides.B.counts))))].filter(id => {
    return battle.globalCounts[id] || battle.sides.A.counts[id] || battle.sides.B.counts[id] || Object.keys(countDefs).includes(id);
  });
  const globalRows = allCountIds.map(id => '<div class="count-row"><span>' + esc(battle.countLabel(id)) + '</span><b>' + (battle.globalCounts[id] || 0) + '</b></div>').join('') || L('ui.5c325e4ab9ac');
  const sideCountRows = (sideId) => {
    const side = battle.sides[sideId];
    const rows = allCountIds.map(id => '<div class="count-row"><span>' + esc(battle.countLabel(id)) + '</span><b>' + (side.counts[id] || 0) + '</b></div>').join('');
    return rows || L('ui.751df30e738e');
  };
  const unitStatus = (sideId) => {
    const units = battle.getFieldUnits(sideId);
    if (!units.length) return L('ui.c0d8d0599ef5');
    return units.map(unit => {
      const countText = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => battle.countLabel(key) + ' ' + unit.counts[key]).join(' · ');
      const effectText = unit.effects.map(inst => (battle.maps.effects.get(inst.effectId) || {}).name + (inst.stacks > 1 ? '×' + inst.stacks : '')).filter(Boolean).join(' · ');
      const tempText = Object.keys(unit.tempMods || {}).filter(key => unit.tempMods[key]).map(key => (STAT_KEYS[key] || key) + ' ' + unit.tempMods[key]).join(' · ');
      return '<div class="status-unit-entry"><div class="status-unit-name"><span>' + esc(unit.name) + '</span><span>' + esc(unit.battleId) + '</span></div><div class="status-unit-name"><span class="tiny">HP ' + unit.hp + '/' + unit.maxHp + '</span><span class="tiny">' + (unit.counted ? L('ui.37802b1dfc26') : L('ui.79b46e5f7db7')) + '</span></div>' +
        ((countText || effectText || tempText) ? '<div class="status-unit-meta">' + (countText ? '<span class="chip gold">' + esc(countText) + '</span>' : '') + (effectText ? '<span class="chip violet">' + esc(effectText) + '</span>' : '') + (tempText ? '<span class="chip">' + esc(tempText) + '</span>' : '') + '</div>' : '') +
      '</div>';
    }).join('');
  };
  const listenerItems = [];
  for (const sideId of ['A', 'B']) {
    for (const unit of battle.getFieldUnits(sideId)) {
      for (const skill of battle.getUnitSkills(unit)) {
        if (skill.type === 'passive' && skill.trigger && skill.trigger.event !== 'rule' && skill.trigger.event !== 'none') {
          listenerItems.push({ owner: unit.name, uid: unit.battleId, name: skill.name, event: triggerLabel(skill.trigger.event), type: L('ui.53da139b6a5c') });
        }
      }
      for (const inst of unit.effects) {
        const def = battle.maps.effects.get(inst.effectId);
        if (def && def.trigger && def.trigger.event && def.trigger.event !== 'none') {
          listenerItems.push({ owner: unit.name, uid: unit.battleId, name: def.name, event: triggerLabel(def.trigger.event), type: L('ui.151ddd4f1f9f') });
        }
      }
    }
  }
  const feedItems = battle.triggerFeed.slice(0, 8).map(item => '<div class="trigger-item"><div class="trigger-name"><span>' + esc(item.owner) + ' · ' + esc(item.name) + '</span><span>' + esc(item.type) + '</span></div><div class="trigger-event">' + esc(item.event) + '</div></div>').join('');
  const feedHtml = feedItems || L('ui.a8b9d34dd72b');
  const listenerHtml = listenerItems.slice(0, 12).map(item => '<div class="listener-item"><span class="listener-type">' + esc(item.type) + '</span><span>' + esc(item.owner) + ' · ' + esc(item.name) + '</span><span class="listener-event">' + esc(item.event) + '</span></div>').join('') || L('ui.7f367266fe47');
  return '<aside class="battle-rail">' +
    L('ui.17a54b83c6f2') + logs.length + '</span></div><div class="rail-body"><div class="battle-log" id="battle-log">' + logHtml + '</div></div></section>' +
    L('ui.71d248ad5c59') +
      L('ui.236dc5c97142') + globalRows + '</div></details>' +
      L('ui.fe5fe6f03c2f') + esc(battle.sides.A.name) + '</div>' + sideCountRows('A') + '<div class="status-group-label">' + esc(battle.sides.B.name) + '</div>' + sideCountRows('B') + '</div></details>' +
      '<details class="status-group"><summary>' + esc(battle.sides.A.name) + L('ui.e469c14b437d') + unitStatus('A') + '</div></details>' +
      '<details class="status-group"><summary>' + esc(battle.sides.B.name) + L('ui.e469c14b437d') + unitStatus('B') + '</div></details>' +
    '</div></div></section>' +
    L('ui.8205548f7b08') + listenerItems.length + '</span></div><div class="rail-body"><div class="trigger-list">' + feedHtml + L('ui.27f8801c5e79') + listenerHtml + '</div></div></section>' +
  '</aside>';
};

App.scrollLogToBottom = function () {
  const log = document.getElementById('battle-log');
  if (log) log.scrollTop = log.scrollHeight;
};

App.autoUnitWaiting = function () {
  if (!this.battle || this.battle.status !== 'active' || this.battle.phase !== 'awaiting') return false;
  const side = this.battle.currentSide;
  if (!side || this.battle.controllers[side] !== 'human') return false;
  return this.battle.getAutoUnits(side).length > 0;
};

App.selectBattleUnit = function (uid) {
  if (!this.battle || this.battle.status !== 'active') return;
  if (this._autoPendingUid || this.autoUnitWaiting()) { this.toast(L('ui.96cc2e9615ef'), 'error'); return; }
  const ui = this.battleUI;
  const unit = this.battle.getUnit(uid);
  if (!unit) return;
  if (ui.skillId) {
    if (this.isBattleTarget(unit)) {
      ui.targetUid = unit.battleId;
      this.render();
      return;
    }
    this.toast(L('ui.96d7d82ebd39'), 'error');
    return;
  }
  const side = this.battle.sides[unit.side];
  if (unit.side !== this.battle.currentSide) {
    this.openBattleUnitInfo(unit.battleId);
    return;
  }
  if (this.battle.controllers[unit.side] !== 'human') {
    this.toast(L('ui.3a197d1d04db'), 'error');
    return;
  }
  if (unit.acted) {
    this.toast(L('ui.87910350093c'), 'error');
    return;
  }
  this.beginBattleEngineAction();
  const prep = this.battle.prepareUnit(unit.battleId);
  if (!prep.ok) {
    this._battlePreRects = null;
    this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
    this.toast(prep.error || L('ui.de18b373bda0'), 'error');
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
  if (this._autoPendingUid || this.autoUnitWaiting()) { this.toast(L('ui.96cc2e9615ef'), 'error'); return; }
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

App.battleUncountWarning = function (actor, skill, targetUid) {
  const battle = this.battle;
  if (!battle || !actor || !skill) return '';
  const effectIds = new Set();
  for (const effect of battle.maps.effects.values()) {
    if (effect && effect.setUncounted) effectIds.add(effect.id);
  }
  if (!effectIds.size) return '';
  const chosen = battle.resolveChosenTargets(actor, skill, targetUid);
  const targetFor = (mode, step) => {
    if (battle.isNewTargetExpression && battle.isNewTargetExpression(mode)) {
      try {
        return battle.resolveSetExpression(mode, { unit: actor, source: actor, chosen });
      } catch (error) {
        return [];
      }
    }
    if (mode === 'owner' && step && step.ownerEffectId) {
      const holders = [];
      for (const sideId of ['A', 'B']) {
        for (const candidate of battle.getFieldUnits(sideId)) {
          if (battle.getEffectStacks(candidate, step.ownerEffectId) > 0) holders.push(candidate);
        }
      }
      return holders;
    }
    if (mode === 'self' || mode === 'item' || mode === 'owner') return [actor];
    if (mode === 'allEnemies') return battle.getEnemies(actor);
    if (mode === 'allAllies') return battle.getLivingAllies(actor);
    return chosen;
  };
  const findWarning = (steps, depth) => {
    if (!Array.isArray(steps) || depth > 5) return '';
    for (const step of steps) {
      if (!step) continue;
      if (step.kind === 'addEffect' && effectIds.has(step.effectId)) {
        for (const target of targetFor(battle.stepTargetExpression(step), step)) {
          if (!target || !target.alive || !target.counted) continue;
          const otherCounted = battle.getFieldUnits(target.side).filter(unit => unit !== target && unit.alive && unit.counted).length;
          if (otherCounted === 0) {
            return L('ui.099a5b42d8b9') + skill.name + L('ui.eba671e81745') + target.name + L('ui.de74ff39e4a7');
          }
        }
      }
      if (step.kind === 'castSkill' && step.skillId) {
        const nested = battle.maps.skills.get(step.skillId);
        if (nested) {
          const nestedWarning = findWarning(nested.steps || [], depth + 1);
          if (nestedWarning) return nestedWarning;
        }
      }
      if (step.kind === 'branch') {
        const warning = findWarning(step.then || [], depth + 1) || findWarning(step.elseSteps || [], depth + 1);
        if (warning) return warning;
      }
      if (step.kind === 'forEach' || step.kind === 'loop') {
        const warning = findWarning(step.steps || [], depth + 1);
        if (warning) return warning;
      }
    }
    return '';
  };
  return findWarning(skill.steps || [], 0);
};

App.executeBattleSkill = function (actor, skill, kind) {
  this.beginBattleEngineAction();
  let result;
  if (kind === 'extra') {
    result = this.battle.useExtraSkill(actor.battleId, skill.id, this.battleUI.targetUid || null);
  } else {
    result = this.battle.useSkill(actor.battleId, skill.id, this.battleUI.targetUid || null);
  }
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || L('ui.2b04441fab4a'), 'error');
    return;
  }
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.confirmBattleSkill = function () {
  if (!this.battle || this.battle.status !== 'active') return;
  if (this._autoPendingUid || this.autoUnitWaiting()) return;
  const context = this.battleSkillContext();
  if (!context) return;
  const { actor, skill, kind } = context;
  const mode = skill.targetMode || 'none';
  if ((mode === 'enemy' || mode === 'ally') && !this.battleUI.targetUid) {
    const preview = this.battleTargetPreview();
    if (!preview.length) { this.toast(L('ui.145ad9524b89'), 'error'); return; }
    this.toast(L('ui.7ad17dd030a1'), 'error'); return;
  }
  const warning = this.battleUncountWarning(actor, skill, this.battleUI.targetUid || null);
  if (warning) {
    this.confirm({
      title: L('ui.b6f1e6afd272'),
      message: warning,
      confirmLabel: L('ui.28149b746b71'),
      danger: true,
      onConfirm: () => {
        if (!this.battle || this.battle.status !== 'active' || !actor.alive || actor.acted) {
          this.toast(L('ui.3a3ab9b06ff5'), 'error');
          return;
        }
        this.executeBattleSkill(actor, skill, kind);
      }
    });
    return;
  }
  this.executeBattleSkill(actor, skill, kind);
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

App.beginMusterAction = function () {
  if (!this.battle || this.battle.status !== 'active' || this.battle.phase !== 'muster') return;
  this.beginBattleEngineAction();
  const result = this.battle.beginMuster();
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error, 'error');
    return;
  }
  this.finishBattleEngineAction();
};

App.passBattleAction = function (uid) {
  if (!this.battle || this.battle.status !== 'active') return;
  if (this._autoPendingUid || this.autoUnitWaiting()) { this.toast(L('ui.96cc2e9615ef'), 'error'); return; }
  this.beginBattleEngineAction();
  const result = this.battle.passAction(uid);
  if (!result.ok) { this._battlePreRects = null; this.toast(result.error, 'error'); return; }
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  this.finishBattleEngineAction();
};

App.openDeployMenu = function (sideId) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active' || (battle.phase !== 'awaiting' && battle.phase !== 'muster') || this._battleFxActive) return;
  const side = battle.sides[sideId];
  if (!side || battle.controllers[sideId] !== 'human') return;
  const deployableNoSlot = side.hand.some(id => {
    const card = battle.deckUnitCard(id);
    return card && card.noFieldSlot;
  });
  if (!deployableNoSlot && battle.occupiedFieldCount(sideId) >= battle.rules.maxField) return;
  if (!side.hand.length) { this.toast(L('ui.3a30f27c492a'), 'error'); return; }
  this.pauseBattleInteraction();
  this._deploySide = sideId;
  const cards = side.hand.map((cardId, index) => {
    const card = battle.deckUnitCard(cardId);
    if (!card) return '';
    const res = RESISTANCE_TYPES[card.resistance.type] || { label: L('ui.aa8457052a32') };
    return '<button class="deploy-card" type="button" data-action="battle-deploy-card" data-side="' + sideId + '" data-index="' + index + '">' +
      '<img src="' + attr(cardArt(card)) + '" alt="">' +
      '<span class="deploy-card-main"><strong>' + esc(card.name) + L('ui.8e2355a4acc3') + card.hp + ' · ' + esc(res.label) + ' ' + card.resistance.value + ' · ' + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></span>' +
      qualityBadge(card.quality) +
    '</button>';
  }).join('');
  this.openModal({
    title: L('ui.cbef2ad72c4e') + side.name,
    subtitle: L('ui.473821832462'),
    size: 'large',
    body: L('ui.6fe09e95aeb6') + Math.max(0, battle.rules.maxField - battle.occupiedFieldCount(sideId)) + L('ui.fc81b9a37919') + (cards || L('ui.71849a3372fd')) + '</div>',
    foot: L('ui.406b7353bd9e') + side.hand.length + L('ui.3ab3ebdfd3c9') + battle.rules.maxField + L('ui.1fbf3761b1df')
  });
};

App.deployBattleCard = function (sideId, index) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  this.beginBattleEngineAction();
  const result = battle.manualDeployCard(sideId, Number(index));
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || L('ui.1b2a93da4f54'), 'error');
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
      '<span class="choice-mark">' + (gear.slot === 'weapon' ? L('ui.4fed5660e6a5') : L('ui.f648cc44fdbf')) + '</span><span class="choice-main"><strong>' + esc(unit.name) + '</strong><small>' + (occupied ? (gear.slot === 'weapon' ? L('ui.22dfca867179') : L('ui.ba579c7d0a4e')) + L('ui.184187e648d1') : L('ui.11d4fcf2be9c') + unit.hp + ' / ' + unit.maxHp + L('ui.5b538b05a524') + (gear.slot === 'weapon' ? L('ui.22dfca867179') : L('ui.ba579c7d0a4e'))) + '</small></span>' +
    '</button>';
  }).join('') : L('ui.13171cd50a00');
  this.openModal({
    title: gear.name,
    subtitle: L('ui.be8e7ed36a00') + (gear.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + L('ui.fb914d484b78'),
    size: 'large',
    body: '<div class="row between wrap mb-2"><div class="row">' + qualityBadge(gear.quality) + '<span class="chip">' + esc(gear.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + '</span><span class="chip gold">' + esc(modSummary(gear.mods, true) || L('ui.8422a8ff327d')) + L('ui.19ef45dd3490') +
      '<p class="modal-copy">' + esc(gear.description || L('ui.5cf756bdf0ea')) + '</p>' +
      L('ui.7bf9ffb0e9f3') + unitRows + '</div>' +
      L('ui.c2ed3be335be'),
    foot: '<button class="btn btn-danger" type="button" data-action="battle-equipment-destroy" data-side="' + sideId + '" data-id="' + attr(equipmentId) + L('ui.3853bdaa014f')
  });
};

App.equipBattleCard = function (sideId, equipmentId, unitUid) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  this.beginBattleEngineAction();
  const result = battle.equipFromPool(sideId, unitUid, equipmentId);
  if (!result.ok) {
    this._battlePreRects = null;
    this.toast(result.error || L('ui.a6bb328d808b'), 'error');
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
  if (!result.ok) { this.toast(result.error || L('ui.97a5946a65e2'), 'error'); return; }
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
  if (battle.currentSide !== sideId) { this.toast(L('ui.ccc41ad407a6'), 'error'); return; }
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
      '<span class="rune-choice-top">' + qualityBadge(rune.quality) + '<strong>' + esc(rune.name) + '</strong><span class="rune-check">' + (selected ? L('ui.25d284315063') : L('ui.d4e9ca3dd494')) + '</span></span>' +
      '<span class="rune-choice-mods">' + esc(modSummary(rune.mods, true) || L('ui.455d56230713')) + '</span>' +
      '<span class="rune-choice-desc">' + esc(rune.description || '') + '</span>' +
    '</button>';
  }).join('') : L('ui.52a33207bb80');
  this.openModal({
    title: L('ui.e8731bea152c') + side.name,
    subtitle: L('ui.819ad2ab7193'),
    size: 'large',
    body: L('ui.b916e9a0236e') + draft.ids.length + L('ui.7e9c61419ba6') + cards + '</div>',
    foot: L('ui.22971d25959a') + (side.runes.map(rune => rune.name).join('、') || L('ui.72077749f794')) + L('ui.6eccd0a49482') + side.id + L('ui.633fc97df6e6')
  });
};

App.toggleRuneDraft = function (sideId, runeId) {
  const draft = this._runeDraft;
  if (!draft || draft.sideId !== sideId) return;
  const index = draft.ids.indexOf(runeId);
  if (index >= 0) draft.ids.splice(index, 1);
  else if (draft.ids.length >= 3) { this.toast(L('ui.98e100fd718b'), 'error'); return; }
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

App.previewCard = function (type, id, subtitle) {
  const map = { unit: Store.index.maps.units, equipment: Store.index.maps.equipment, rune: Store.index.maps.runes }[type];
  const card = map && map.get(id);
  if (!card) return;
  this.openModal({
    title: card.name,
    subtitle: subtitle || (L('ui.ee061a1f9feb') + cardTypeLabel(type) + ' · ' + card.id),
    size: 'large',
    body: renderCardDetail(card, type)
  });
};

App.previewBattleCard = function (type, id, uid) {
  const battle = this.battle;
  let subtitle = L('ui.34a6af38b8ac');
  if (uid && battle && type === 'unit') {
    const unit = battle.getUnit(uid);
    if (unit) subtitle = battle.sides[unit.side].name + ' · ' + (unit.counted ? L('ui.52cb1d3915a1') : L('ui.360daa2c9859')) + L('ui.9b7caa90be18') + unit.hp + ' / ' + unit.maxHp;
  }
  this.previewCard(type, id, subtitle);
};

App.openBattleUnitInfo = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const skillRows = battle.getUnitSkills(unit).map(skill => '<div class="skill-detail-card"><div class="skill-detail-head"><span class="chip ' + opClass(skill.op) + '">' + esc(skillTypeLabel(skill.type)) + '</span><strong>' + esc(skill.name) + '</strong></div><div class="skill-detail-desc">' + esc(skill.description || '') + L('ui.0239c2b12d6c') + esc(triggerLabel(skill.trigger && skill.trigger.event)) + '</span></div></div>').join('');
  const effects = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    return def ? '<div class="kv"><span class="k">' + esc(def.name) + ' ×' + inst.stacks + '</span><span class="v">' + esc(EFFECT_TYPES[def.type] ? EFFECT_TYPES[def.type].label : L('ui.971b6e5a0a75')) + (def.removable === false ? L('ui.d0357e1e5a5f') : '') + '</span></div>' : '';
  }).join('') || L('ui.8fa4b8172042');
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<div class="kv"><span class="k">' + esc(battle.countLabel(key)) + '</span><span class="v">' + unit.counts[key] + '</span></div>').join('') || L('ui.047129e16fb1');
  const gear = ['weapon', 'accessory'].map(slot => '<div class="kv"><span class="k">' + (slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + '</span><span class="v">' + esc(unit.equipment[slot] ? unit.equipment[slot].name : L('ui.82ca4a6ba635')) + '</span></div>').join('');
  this.openModal({
    title: unit.name,
    subtitle: unit.battleId + ' · ' + (battle.sides[unit.side] ? battle.sides[unit.side].name : '') + ' · ' + (unit.counted ? L('ui.52cb1d3915a1') : L('ui.360daa2c9859')),
    size: 'large',
    body: '<div class="row" style="align-items:flex-start;gap:16px"><img src="' + attr(cardArt(unit.card)) + '" alt="" style="width:120px;border-radius:5px;border:1px solid var(--line-strong)"><div class="grow"><div class="validity-list mb-2">' + qualityBadge(unit.quality) + L('ui.ab9be04766f1') + unit.hp + ' / ' + unit.maxHp + L('ui.a88f5bfc9e98') + unit.atk + L('ui.457d88826e5b') + battle.getResistance(unit, 'physical') + L('ui.5de88b822ce7') + battle.getResistance(unit, 'mental') + '</span></div><div class="hp-bar"><span style="width:' + Math.round(unit.hp / Math.max(1, unit.maxHp) * 100) + L('ui.a210d4860305') + effects + L('ui.ce98958cdb46') + counts + L('ui.bedd3cffc281') + gear + L('ui.0bfbb9828cc1') + skillRows + '</div>'
  });
};

App.openBattleCounts = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const counts = Object.keys(unit.counts).filter(key => unit.counts[key]).map(key => '<div class="kv"><span class="k">' + esc(battle.countLabel(key)) + '</span><span class="v">' + unit.counts[key] + '</span></div>').join('') || L('ui.047129e16fb1');
  const effectRows = unit.effects.map(inst => {
    const def = battle.maps.effects.get(inst.effectId);
    return def ? '<div class="kv"><span class="k">' + esc(def.name) + '</span><span class="v">' + inst.stacks + L('ui.83e4f0bdf862') : '';
  }).join('') || L('ui.8fa4b8172042');
  this.openModal({ title: unit.name + L('ui.9085f785979c'), subtitle: unit.battleId + L('ui.ababe7c638e6'), size: 'small', body: L('ui.ce98958cdb46') + counts + L('ui.057d13701c9c') + effectRows });
};

App.openBattleGear = function (uid) {
  const battle = this.battle;
  const unit = battle && battle.getUnit(uid);
  if (!unit) return;
  const canEdit = battle.status === 'active' && battle.phase === 'awaiting' && battle.currentSide === unit.side && battle.controllers[unit.side] === 'human' && !this._battleFxActive;
  const slots = ['weapon', 'accessory'].map(slot => {
    const item = unit.equipment[slot];
    return '<div class="kv gear-detail-row"><span class="k">' + (slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + '</span><span class="v">' + esc(item ? item.name : L('ui.82ca4a6ba635')) + '</span>' + (item && canEdit ? '<button class="btn btn-sm" type="button" data-action="battle-unequip" data-uid="' + attr(unit.battleId) + '" data-slot="' + slot + L('ui.9598fc571cdc') : '') + '</div>';
  }).join('');
  const mods = modSummary(battle.getMods(unit), true);
  const runes = battle.getSideOf(unit).runes.map(rune => '<div class="kv"><span class="k">' + esc(rune.name) + '</span><span class="v">' + esc(modSummary(rune.mods, true) || L('ui.455d56230713')) + '</span></div>').join('') || L('ui.1055d37215a0');
  this.openModal({ title: unit.name + L('ui.ad63bbe8e2b8'), subtitle: L('ui.5fa2d9b0022d') + (canEdit ? L('ui.2f7a97e01774') : L('ui.f8ad110825f4')), size: 'small', body: L('ui.bedd3cffc281') + slots + (mods ? L('ui.bc802d42a6a0') + esc(mods) + '</span></div>' : '') + L('ui.a7790d5efe04') + runes });
};

App.unequipBattleGear = function (uid, slot) {
  const battle = this.battle;
  if (!battle || battle.status !== 'active') return;
  const unit = battle.getUnit(uid);
  if (!unit) return;
  const result = battle.unequipFromUnit(unit.side, uid, slot);
  if (!result.ok) { this.toast(result.error || L('ui.a555ae10ec0e'), 'error'); return; }
  this.closeModal(true);
  this.render();
  this.afterBattleRender();
};

App.openBattleHandInfo = function (cardId) {
  const card = Store.index.maps.units.get(cardId);
  if (!card) return;
  this.openModal({
    title: card.name,
    subtitle: L('ui.409b433bd997') + card.id,
    size: 'large',
    body: renderCardDetail(card, 'unit')
  });
};

App.openBattleDeckInfo = function () {
  const battle = this.battle;
  if (!battle) return;
  const sideRows = ['A', 'B'].map(id => {
    const side = battle.sides[id];
    return '<div class="detail-section-title">' + esc(side.name) + L('ui.52ed03b02a08') +
      L('ui.0f2998a4c1b8') + side.hand.length + '</span></div>' +
      L('ui.4c655403e06e') + side.deck.length + '</span></div>' +
      L('ui.6329e7785e35') + side.discard.length + '</span></div>' +
      L('ui.c39056103df8') + side.retreat.length + '</span></div>' +
      L('ui.863ddef5cca5') + side.equipmentPool.length + '</span></div>' +
      L('ui.28165a49537a') + side.runes.length + '</span></div></div>';
  }).join('');
  this.openModal({ title: L('ui.7836b14909c9'), subtitle: L('ui.8168d4f1c6aa'), body: sideRows });
};

App.openBattleLog = function () {
  const battle = this.battle;
  if (!battle) return;
  const logs = battle.logs.slice(-160).map(entry => '<div class="log-entry ' + esc(entry.kind) + '" style="grid-template-columns:26px 30px 1fr"><span class="log-round">R' + entry.round + '</span><span class="log-kind">' + esc(entry.label) + '</span><span class="log-text">' + esc(entry.text) + '</span></div>').join('');
  this.openModal({ title: L('ui.ac9b1da7aee2'), subtitle: L('ui.b7c3e11a2c8d'), body: '<div class="battle-log" style="max-height:58vh">' + (logs || L('ui.60f7180840ae')) + '</div>' });
};

App.battleResultSummary = function () {
  const battle = this.battle;
  if (!battle || battle.status !== 'ended') return null;
  const playerWin = battle.winner === 'A';
  const winnerName = battle.winner ? battle.sides[battle.winner].name : L('ui.66402ea5332d');
  return {
    title: battle.winner ? winnerName + L('ui.3d90ba4a0934') : L('ui.66402ea5332d'),
    subtitle: battle.winner ? L('ui.f495347d6acf') + battle.round + L('ui.c105f3b290ad') : L('ui.ec7a98deb26f'),
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
    if (context.mode === 'tutorial') {
      actions = battle.winner === 'A'
        ? [{ label: L('ui.626b115e34c1'), action: 'battle-return-home', kind: 'primary' }]
        : [{ label: L('ui.156064dbc234'), action: 'tutorial-battle-start', kind: 'primary' }, { label: L('ui.5be43b4906a0'), action: 'battle-return-home', kind: '' }];
    } else {
      actions = [
        { label: L('ui.861c30fbcfa1'), action: 'battle-return-setup', kind: 'primary' },
        { label: L('ui.5be43b4906a0'), action: 'battle-return-home', kind: '' }
      ];
    }
  }
  const actionHtml = actions.map(action => '<button class="btn ' + (action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger' : '') + '" type="button" data-action="' + attr(action.action) + '"' + (action.data ? Object.keys(action.data).map(key => ' data-' + key + '="' + attr(action.data[key]) + '"').join('') : '') + '>' + esc(action.label) + '</button>').join('');
  const damageCount = battle.logs.filter(entry => entry.kind === 'damage').length;
  const passiveCount = battle.logs.filter(entry => entry.kind === 'passive' || entry.kind === 'trigger').length;
  const activeSide = battle.sides[battle.winner || 'A'];
  this.openModal({
    title: L('ui.64ff8c68dd57'),
    subtitle: context.mode && GAME_MODES[context.mode] ? GAME_MODES[context.mode].name : L('ui.d70538c4852a'),
    closable: true,
    body: '<div class="result-badge"><img class="result-emblem" src="assets/pictures/brand-mark.svg" alt=""><div class="eyebrow">BATTLE REPORT</div><h2>' + esc(summary.title) + '</h2><p>' + esc(summary.subtitle) + '</p></div><div class="result-stats"><div class="result-stat"><b>' + battle.round + L('ui.7f2317727430') + damageCount + L('ui.4026488b6c9b') + passiveCount + L('ui.71c7ea744c1b') + (battle.logs.length ? '<div class="notice mt-3">' + esc(battle.logs[battle.logs.length - 1].text) + '</div>' : ''),
    foot: '<span class="left">' + esc((activeSide && activeSide.name) || '') + L('ui.19dce6823697') + actionHtml
  });
};

App.afterBattleRender = function () {
  if (!this.battle) return;
  if (this.battle.status === 'ended') {
    this.clearAiTimer();
    this.clearAutoTimer();
    if (this.battleContext && this.battleContext.mode === 'tutorial' && this.battle.winner === 'A') {
      Store.state.tutorialCompleted = true;
      Store.save();
    }
    if (this._resultShownFor !== this.battle) {
      this._resultShownFor = this.battle;
      const self = this;
      setTimeout(() => { if (self.route === 'battle' && self.battle === self._resultShownFor) self.showBattleResult(); }, 260);
    }
    return;
  }
  this.scheduleAutoUnitIfNeeded();
  this.scheduleAiIfNeeded();
};

App.clearAutoTimer = function () {
  if (this._autoTimer) {
    clearTimeout(this._autoTimer);
    this._autoTimer = null;
  }
  this._autoPendingUid = null;
};

App.scheduleAutoUnitIfNeeded = function () {
  this.clearAutoTimer();
  if (!this.battle || this.route !== 'battle' || this.battle.status !== 'active') return;
  if (this._battleFxActive || this._battleInteractionPause) return;
  if (this.battle.phase !== 'awaiting') return;
  const side = this.battle.currentSide;
  if (!side || this.battle.controllers[side] !== 'human') return;
  const unit = this.battle.getAutoUnits(side)[0];
  if (!unit) return;
  this._autoPendingUid = unit.battleId;
  this._autoTimer = setTimeout(() => {
    this._autoTimer = null;
    this.runAutoUnitTurn(unit.battleId);
  }, 420);
};

App.runAutoUnitTurn = function (unitId) {
  if (!this.battle || this.route !== 'battle' || this.battle.status !== 'active' || this.battle.phase !== 'awaiting') { this._autoPendingUid = null; return; }
  if (this._battleFxActive || this._battleInteractionPause) { this._autoPendingUid = null; return; }
  const unit = this.battle.getUnit(unitId);
  if (!unit || !unit.alive || unit.acted || unit.side !== this.battle.currentSide || !unit.card.autoAttack) {
    this._autoPendingUid = null;
    this.afterBattleRender();
    return;
  }
  this._autoPendingUid = null;
  this.beginBattleEngineAction();
  this.battleUI = { selectedUid: null, skillId: null, kind: 'active', extraUid: null, targetUid: null };
  const prep = this.battle.prepareUnit(unitId);
  if (!prep.ok) {
    this._battlePreRects = null;
    this.finishBattleEngineAction();
    return;
  }
  if (prep.skipped || this.battle.status !== 'active' || this.battle.phase !== 'awaiting') {
    this.finishBattleEngineAction();
    return;
  }
  const plan = this.battle.autoUnitPlan(unit);
  let result = null;
  if (!plan || !plan.skillId) {
    result = this.battle.passAction(unitId);
  } else {
    result = this.battle.useSkill(unitId, plan.skillId, plan.targetUid);
    if (!result.ok) result = this.battle.passAction(unitId);
  }
  if (!result || !result.ok) {
    this._battlePreRects = null;
    this.finishBattleEngineAction();
    return;
  }
  this.finishBattleEngineAction();
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
    this.clearAutoTimer();
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
    title: L('ui.41b4ff1f6cab'),
    message: L('ui.841e00ec1aa3'),
    confirmLabel: L('ui.d28b927a368e'),
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
    this.confirm({ title: L('ui.85e141be3290'), message: L('ui.45e818b12e7b'), confirmLabel: L('ui.3dad5134040b'), danger: true, onConfirm: doSurrender });
  } else {
    doSurrender();
  }
};

App.retryBattle = function () {
  const context = this.battleContext;
  this.clearAiTimer();
  this.clearAutoTimer();
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
  this.clearAutoTimer();
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
      '<div class="pack-banner"><div class="pack-emblem"><img src="' + (isCore ? 'assets/pictures/brand-mark.svg' : 'assets/icons/packs.svg') + '" alt=""></div><div class="pack-title"><h3>' + esc(pack.name) + '</h3><div class="pack-path">' + esc(pack.id) + ' · v' + esc(pack.version) + '</div></div><span class="pack-state ' + (enabled ? 'on' : 'off') + '">' + (enabled ? L('ui.25d284315063') : L('ui.0fe5a98e9f8c')) + '</span></div>' +
      '<div class="pack-body">' +
        '<p class="pack-desc">' + esc(pack.description || L('ui.79ab3c9a837f')) + '</p>' +
        '<div class="pack-stats">' +
          [['units', L('ui.6b26695e4dce')], ['equipment', L('ui.1faf3321a84f')], ['runes', L('ui.52bd5ee23b8d')], ['skills', L('ui.53da139b6a5c')], ['effects', L('ui.151ddd4f1f9f')]].map(([key, label]) => '<div class="pack-stat"><b>' + (counts[key] || []).length + '</b><span>' + label + '</span></div>').join('') +
        '</div>' +
        L('ui.05d4e977ad59') + esc(pack.author || L('ui.d9c32a4c3dda')) + '</span>' + ((pack.dependencies || []).length ? pack.dependencies.map(dep => L('ui.b457039b2ce6') + esc(dep) + '</span>').join('') : L('ui.0a6aa6e5b54a')) + (isCore ? L('ui.c9d07f86553b') : '') + '</div>' +
        (Store.index.errors.length && pack.id !== CORE_PACK_ID ? '' : '') +
        '<div class="pack-actions">' +
          (isCore ? L('ui.9cc2edd9be1b') : '<button class="btn btn-sm" type="button" data-action="pack-toggle" data-pack="' + attr(pack.id) + '">' + (enabled ? L('ui.be70be5a2e12') : L('ui.d4e9ca3dd494')) + '</button>') +
          '<button class="btn btn-sm" type="button" data-action="pack-inspect" data-pack="' + attr(pack.id) + L('ui.a4d7c1891342') +
          '<button class="btn btn-sm" type="button" data-action="pack-export" data-pack="' + attr(pack.id) + L('ui.84065f817e5b') +
          '<button class="btn btn-sm" type="button" data-action="pack-share" data-pack="' + attr(pack.id) + L('ui.4bd34e803580') +
          '<button class="btn btn-sm btn-gold" type="button" data-action="pack-export-both" data-pack="' + attr(pack.id) + L('ui.9143f03e85b6') +
          (!isCore ? '<button class="btn btn-sm btn-danger" type="button" data-action="pack-delete" data-pack="' + attr(pack.id) + L('ui.0f60ca93741b') : '') +
        '</div>' +
      '</div>' +
    '</article>';
  };
  const errorList = idx.errors.length ? L('ui.51ab35befa59') + idx.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul></div>' : L('ui.a80a7effc468');
  const warningList = idx.warnings.length ? L('ui.70bc20c39d45') + idx.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '';
  const resultHtml = importResult ? '<div class="import-result"><div class="notice ' + (importResult.errors.length ? 'danger' : 'success') + '"><strong>' + (importResult.errors.length ? L('ui.84429ddabb7f') : L('ui.75c33f5c2ecc')) + '</strong>' +
    (importResult.errors.length ? '<ul>' + importResult.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul>' : '') +
    (importResult.warnings && importResult.warnings.length ? '<ul>' + importResult.warnings.map(w => L('ui.9921d5429fd5') + esc(w) + '</li>').join('') + '</ul>' : '') +
    '</div></div>' : '';
  return '' +
    '<div class="page-wrap packs-page">' +
      L('ui.cf2feb697a64') + idx.packCount + L('ui.cbdeb672c677') + packs.length + L('ui.55ec1447a46f') +
      errorList + warningList +
      '<div class="pack-grid mt-2">' + packs.map(packCard).join('') + '</div>' +
      L('ui.fe80ebb0cccc') +
        '<div class="import-grid">' +
          L('ui.47ac83ef1750') + esc(this._packImportText || '') + L('ui.894c75211f52') + resultHtml + '</div></section>' +
          L('ui.7bfa942bc014') +
        '</div>' +
      '</div>' +
      L('ui.c2bc55180052') +
    '</div>';
};

App.handlePackPayload = function (raw, options) {
  try {
    let payload = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) throw new Error(L('ui.1e80938a7e90'));
      if (trimmed.startsWith('CAE1.')) payload = decodeShareCode(trimmed);
      else payload = JSON.parse(trimmed);
    }
    if (!payload || typeof payload !== 'object') throw new Error(L('ui.5d82c28078e8'));
    const result = Store.importPack(payload, options || {});
    this._packImportResult = { errors: result.ok ? [] : result.errors, warnings: result.warnings || [] };
    if (result.ok) {
      this._packImportText = '';
      this.toast(L('ui.769b4bb398da') + result.pack.name + L('ui.4c7bc21a5c57'), 'success');
      this.render();
    } else {
      this.toast(result.errors[0] || L('ui.9631d5294de7'), 'error', L('ui.a01a8d53938f'));
      this.render();
    }
    return result;
  } catch (error) {
    this._packImportResult = { errors: [error.message], warnings: [] };
    this.toast(error.message, 'error', L('ui.a01a8d53938f'));
    this.render();
    return { ok: false, errors: [error.message], warnings: [] };
  }
};

App.importPackFromFile = function (file) {
  if (!file) return;
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    this.toast(L('ui.a520c51b44c2'), 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    this.handlePackPayload(String(reader.result || ''));
  };
  reader.onerror = () => this.toast(L('ui.578c51f1cf5c'), 'error');
  reader.readAsText(file);
};

App.exportPack = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  this.downloadJson(pack.id + '.caerogue.json', pack);
};

App.exportPackBoth = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  const code = encodeShareCode(pack);
  this.downloadJson(pack.id + '.caerogue.json', pack);
  this.copyText(code, L('ui.ed51f0ab3736'));
  this.openModal({
    title: L('ui.f06e7355f02a') + pack.name,
    subtitle: L('ui.604d70955171'),
    size: 'large',
    body: L('ui.c9e99eec53d5') + esc(code) + '</textarea><div class="share-actions mt-2"><button class="btn" type="button" data-action="pack-copy-share" data-pack="' + attr(pack.id) + L('ui.75bab6dad2f5') + attr(pack.id) + L('ui.5eb5c8e945c9')
  });
};

App.inspectPack = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  const groups = ['units', 'equipment', 'runes', 'skills', 'effects'].map(category => {
    const labels = { units: L('ui.6b26695e4dce'), equipment: L('ui.1faf3321a84f'), runes: L('ui.52bd5ee23b8d'), skills: L('ui.53da139b6a5c'), effects: L('ui.6a4f4be10d6e') };
    const items = pack.content[category] || [];
    return '<div class="detail-section-title">' + labels[category] + ' · ' + items.length + '<span class="line"></span></div><div class="row wrap">' + (items.length ? items.map(item => '<span class="chip">' + esc(item.name || item.id) + '</span>').join('') : L('ui.af18475ff24e')) + '</div>';
  }).join('');
  this.openModal({ title: pack.name, subtitle: pack.id + ' · v' + pack.version + ' · ' + pack.author, size: 'large', body: groups + '<div class="notice mt-2">' + esc(pack.description || '') + '</div>' });
};

App.sharePackModal = function (packId) {
  const pack = Store.getPack(packId);
  if (!pack) return;
  const code = encodeShareCode(pack);
  this.openModal({
    title: L('ui.456209105694') + pack.name,
    subtitle: L('ui.af0e6b7b52f4'),
    size: 'large',
    body: '<textarea class="share-code" readonly rows="7" data-share-code>' + esc(code) + '</textarea><div class="share-actions"><button class="btn" type="button" data-action="pack-copy-share" data-pack="' + attr(pack.id) + L('ui.6c34d4dfa4bd') + code.length + L('ui.60b6b1420072')
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
    return '<button class="workshop-item' + (selected && selected.id === pack.id ? ' active' : '') + '" type="button" data-action="workshop-select" data-pack="' + attr(pack.id) + '"><img src="assets/icons/workshop.svg" alt=""><span class="wi-main"><strong>' + esc(pack.name) + '</strong><small>' + esc(pack.id) + ' · v' + esc(pack.version) + '</small></span>' + (fav ? L('ui.cd5522600386') : '') + '</button>';
  }).join('') : L('ui.82d12e6959ec');
  let detail = '';
  if (selected) {
    const code = encodeShareCode(selected);
    const fav = Store.state.favorites.includes(selected.id);
    const note = Store.state.notes[selected.id] || '';
    const counts = selected.content || { units: [], skills: [], effects: [], equipment: [], runes: [] };
    detail = '' +
      '<section class="panel workshop-detail"><div class="panel-body">' +
        '<div class="workshop-hero"><img src="assets/icons/workshop.svg" alt=""><div class="wh-main"><h2>' + esc(selected.name) + '</h2><p>' + esc(selected.id) + ' · v' + esc(selected.version) + L('ui.4e37fa7c5f35') + esc(selected.author) + '</p><div class="pack-meta mt-1">' + (fav ? L('ui.c784f69dc9d7') : L('ui.b7eb287d7b2d')) + '<span class="chip ' + (Store.isEnabled(selected.id) ? 'green' : '') + '">' + (Store.isEnabled(selected.id) ? L('ui.25d284315063') : L('ui.0fe5a98e9f8c')) + '</span>' + ((selected.dependencies || []).length ? L('ui.f762a23f0458') + selected.dependencies.map(esc).join('、') + '</span>' : '') + '</div></div><div class="wh-actions"><button class="btn btn-sm" type="button" data-action="workshop-favorite" data-pack="' + attr(selected.id) + '">' + (fav ? L('ui.26acae04cf87') : L('ui.d07cee786ae5')) + '</button><button class="btn btn-sm" type="button" data-action="pack-export" data-pack="' + attr(selected.id) + L('ui.db62a5a4b0da') + attr(selected.id) + L('ui.1e44e49559be') + attr(selected.id) + L('ui.e193dd288569') +
        '<p class="modal-copy mt-2">' + esc(selected.description || L('ui.da8193c5ea8f')) + '</p>' +
        '<div class="pack-stats">' + [['units', L('ui.6b26695e4dce')], ['equipment', L('ui.1faf3321a84f')], ['runes', L('ui.52bd5ee23b8d')], ['skills', L('ui.53da139b6a5c')], ['effects', L('ui.151ddd4f1f9f')]].map(([key, label]) => '<div class="pack-stat"><b>' + (counts[key] || []).length + '</b><span>' + label + '</span></div>').join('') + '</div>' +
        L('ui.e90e7de83140') + esc(code) + '</textarea><div class="share-actions"><button class="btn" type="button" data-action="workshop-copy-share" data-pack="' + attr(selected.id) + L('ui.38c880f832da') + attr(selected.id) + L('ui.cd168e923971') +
        L('ui.2628d3b4c6b8') + attr(selected.id) + L('ui.ad2ae4ea8213') + esc(note) + L('ui.c938a29d4b78') + attr(selected.id) + L('ui.ba5a3bb99d81') +
      '</div></section>';
  } else {
    detail = L('ui.8b75ff2479c4');
  }
  const draft = Store.state.editorPack;
  const draftCount = draft ? ['units', 'skills', 'effects', 'equipment', 'runes'].reduce((sum, key) => sum + ((draft.content && draft.content[key]) || []).length, 0) : 0;
  return '' +
    '<div class="page-wrap workshop-page">' +
      L('ui.0b53de16516c') + packs.length + L('ui.c006463c731b') +
      '<div class="workshop-layout">' +
        '<div class="stack">' +
          L('ui.10de4a85b92b') + list + L('ui.35b4c6cd2003') + (draft && draftCount ? esc(draft.name) + ' · ' + draftCount + L('ui.f93087708086') : L('ui.0e81c2725169')) + '</div></div></section>' +
          L('ui.662acf9959ee') +
        '</div>' +
        detail +
      '</div>' +
    '</div>';
};

App.publishEditorDraft = function () {
  const draft = Store.state.editorPack;
  if (!draft) {
    this.toast(L('ui.711e593340f6'), 'error');
    return;
  }
  const counts = ['units', 'skills', 'effects', 'equipment', 'runes'].map(key => (draft.content[key] || []).length);
  if (counts.reduce((sum, n) => sum + n, 0) === 0) {
    this.toast(L('ui.29f098d8e19b'), 'error');
    return;
  }
  const skilllessUnits = (draft.content.units || []).filter(unit => !(unit.skills || []).length);
  if (skilllessUnits.length) {
    this.toast(L('ui.b95ba619b925') + skilllessUnits.map(unit => unit.name || unit.id).join('、') + L('ui.4f63518bc3a4'), 'error');
    return;
  }
  const raw = deepClone(draft);
  raw.id = raw.id || 'draft.local';
  for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
    (raw.content[category] || []).forEach(item => { item.packId = raw.id; });
  }
  const existing = Store.getPack(raw.id);
  const result = Store.validatePack(raw, { replace: !!existing });
  if (!result.ok) {
    this.openModal({ title: L('ui.877aa3e293f6'), subtitle: L('ui.e967904ca97a'), body: '<div class="notice danger"><ul>' + result.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul></div>' });
    return;
  }
  const imported = Store.importPack(raw, { replace: true });
  if (!imported.ok) {
    this.toast(imported.errors[0], 'error');
    return;
  }
  this.workshopSelected = imported.pack.id;
  Store.clearEditorDraft();
  if (window.EditorUI) {
    EditorUI.targetPackId = null;
    EditorUI.selectedId = null;
  }
  this.render();
  this.toast(L('ui.f851fbe7cf9a'), 'success');
};

App.setInterfaceLocale = function (locale) {
  const safe = locale === 'en_us' ? 'en_us' : 'zh_cn';
  Store.state.settings.locale = safe;
  Store.save();
  window.location.reload();
};

App.importWorkshopCode = function () {
  const input = document.querySelector('[data-workshop-import]');
  const raw = input ? input.value : '';
  if (!raw.trim()) { this.toast(L('ui.d76016f6e173'), 'error'); return; }
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
      L('ui.7e69b6a92e80') + (Store.storageAvailable ? 'green' : 'red') + '">' + (Store.storageAvailable ? L('ui.21833dc6fe37') : L('ui.4b778139d7b4')) + L('ui.83d0890e7f93') + APP_VERSION + '</span></div></div>' +
      '<div class="settings-layout">' +
        '<div class="settings-main">' +
          L('ui.4a9d0d46f637') +
            toggle('reduceMotion', L('ui.446d25164732'), L('ui.859f498490e9')) +
            toggle('compactLog', L('ui.dfe8325904a4'), L('ui.950f0c46b2cd')) +
            toggle('confirmAction', L('ui.00a4f665f7d4'), L('ui.1a8cb2815f0b')) +
            toggle('showFormula', L('ui.acf0ccf24e07'), L('ui.3627ad9b10cf')) +
            L('ui.9ab591d8fb12') + (Number(settings.aiDelay) === 250 ? ' selected' : '') + L('ui.bf55820d742d') + (Number(settings.aiDelay) === 650 ? ' selected' : '') + L('ui.ed5fd72e9697') + (Number(settings.aiDelay) === 1100 ? ' selected' : '') + L('ui.d9ecf1554718') +
            L('ui.1d616253567b') + I18n.supported.map(locale => '<option value="' + locale.id + '"' + ((settings.locale || 'zh_cn') === locale.id ? ' selected' : '') + '>' + esc(locale.name) + '</option>').join('') + '</select></div>' +
          '</div></section>' +
          L('ui.5bf06a6000fc') +
            L('ui.4c1ef82f4b38') + idx.packCount + L('ui.b588f4d6969f') + idx.cards + L('ui.6d7726b332b0') + idx.skills.length + L('ui.c9d70a03539f') + idx.effects.length + L('ui.2321cf0f54e5') + (Store.storageAvailable ? L('ui.e91365cf9ed9') : L('ui.beff4a1cd1a6')) + L('ui.dc0da2e81d42') + STORAGE_KEY + '</p></div></div>' +
            L('ui.bb9302f93420') +
            L('ui.7431424c1196') +
          '</div></section>' +
        '</div>' +
        '<aside class="settings-aside stack">' +
          L('ui.2505286d5ef3') + APP_VERSION + L('ui.f261406f8c97') +
          L('ui.d87ac6984e82') +
            [[L('ui.1b184f0b496c')], [L('ui.fce08d332840')], [L('ui.2affd937957c')], [L('ui.2c1a02192453')], [L('ui.ea5a8fec781b')]].map((text, index) => '<div class="rule-principle"><span class="no">' + (index + 1) + '</span><span>' + text + '</span></div>').join('') +
          '</div></div></section>' +
          L('ui.168c76612442') +
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
  if (target.matches('[data-setting-locale]')) {
    this.setInterfaceLocale(target.value);
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
  if (this._battleFxActive && action && action.startsWith('battle-')) return;
  if (window.EditorUI && typeof EditorUI.handleAction === 'function' && EditorUI.handleAction(action, el, this, event)) return;
  if (window.ModesUI && typeof ModesUI.handleAction === 'function' && ModesUI.handleAction(action, el, this, event)) return;
  const data = el.dataset;
  switch (action) {
    case 'goto-home':
      if (this.battle && this.route === 'battle') {
        if (Store.state.settings.confirmAction) this.confirm({ title: L('ui.5be43b4906a0'), message: L('ui.42a85b9ca555'), confirmLabel: L('ui.64d38937da51'), danger: true, onConfirm: () => this.leaveBattle(true, 'home') });
        else this.leaveBattle(true, 'home');
        return;
      }
      this.go('home');
      break;
    case 'quick-battle':
      if (this.battle && this.route === 'battle') { this.toast(L('ui.9bffd7300cd3'), 'error'); return; }
      this.openSetup('versus');
      break;
    case 'tutorial-battle-start':
      this.startTutorialBattle();
      break;
    case 'open-setup':
      if (this.battle && this.route === 'battle') { this.toast(L('ui.a24fbc601bcd'), 'error'); return; }
      this.openSetup(data.mode || 'versus');
      break;
    case 'open-route':
      if (this.battle && this.route === 'battle') { this.toast(L('ui.a24fbc601bcd'), 'error'); return; }
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
    case 'setup-opponent':
      if (this.setup) {
        this.setup.opponent = data.opponent === 'ai' ? 'ai' : 'human';
        this.render();
      }
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
    case 'builder-side':
      this.builderSwitchSide(data.side);
      break;
    case 'builder-back':
      this.builderBack();
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
    case 'battle-begin-muster':
      this.beginMusterAction();
      break;
    case 'battle-pass':
      this.passBattleAction(data.uid);
      break;
    case 'battle-preview-card':
      this.previewBattleCard(data.type, data.id, data.uid);
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
    case 'battle-unequip':
      this.unequipBattleGear(data.uid, data.slot);
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
      if (Store.state.settings.confirmAction) this.confirm({ title: L('ui.41b4ff1f6cab'), message: L('ui.42a85b9ca555'), confirmLabel: L('ui.d28b927a368e'), danger: true, onConfirm: () => this.leaveBattle(true) });
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
      else this.toast(L('ui.769b4bb398da') + pack.name + '」' + (Store.isEnabled(data.pack) ? L('ui.25d284315063') : L('ui.0fe5a98e9f8c')) + '。', 'success');
      this.render();
      break;
    }
    case 'pack-export':
      this.exportPack(data.pack);
      break;
    case 'pack-export-both':
      this.exportPackBoth(data.pack);
      break;
    case 'pack-inspect':
      this.inspectPack(data.pack);
      break;
    case 'pack-share':
      this.sharePackModal(data.pack);
      break;
    case 'pack-copy-share': {
      const pack = Store.getPack(data.pack);
      if (pack) this.copyText(encodeShareCode(pack), L('ui.d96df9d16d9f'));
      break;
    }
    case 'pack-delete': {
      const pack = Store.getPack(data.pack);
      if (!pack) break;
      this.confirm({ title: L('ui.f66cc2aa579c'), message: L('ui.c00714d938cd') + pack.name + L('ui.cd643a4b5c21'), confirmLabel: L('ui.3755f56f2f83'), danger: true, onConfirm: () => {
        const result = Store.removePack(data.pack);
        if (!result.ok) this.toast(result.error, 'error');
        else this.toast(L('ui.121a1bb0c288'), 'success');
        this.render();
      } });
      break;
    }
    case 'pack-check':
      Store.rebuild();
      this.render();
      this.toast(Store.index.errors.length ? L('ui.454dc0cf8c45') + Store.index.errors.length + L('ui.c3422433cf7a') : L('ui.cd612397b936'), Store.index.errors.length ? 'error' : 'success');
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
      this.openModal({ title: L('ui.6a7b81fe0a1d'), subtitle: 'caerogue.expansion', size: 'large', body: L('ui.6905bb56f203') + esc(JSON.stringify({ format: 'caerogue.expansion', id: 'my.pack', name: L('ui.221256ccb46c'), version: '0.1.0', author: L('ui.21a877f585cc'), description: '', dependencies: ['core'], content: { units: [], skills: [], effects: [], equipment: [], runes: [] } }, null, 2)) + '</pre>' });
      break;
    case 'workshop-select':
      this.workshopSelected = data.pack;
      this.render();
      break;
    case 'workshop-favorite': {
      const active = Store.toggleFavorite(data.pack);
      this.toast(active ? L('ui.95e9204a7f7b') : L('ui.813c2149c756'), 'success');
      this.render();
      break;
    }
    case 'workshop-copy-share': {
      const pack = Store.getPack(data.pack);
      if (pack) this.copyText(encodeShareCode(pack), L('ui.d96df9d16d9f'));
      break;
    }
    case 'workshop-save-note': {
      const area = document.querySelector('[data-workshop-note]');
      if (area) Store.setNote(data.pack, area.value);
      this.toast(L('ui.bdc94568b0db'), 'success');
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
    case 'editor-publish-draft':
      this.publishEditorDraft();
      break;
    case 'setting-toggle':
      Store.toggleSetting(data.setting);
      if (data.setting === 'reduceMotion') document.body.classList.toggle('reduce-motion', !!Store.state.settings.reduceMotion);
      this.render();
      break;
    case 'settings-reset':
      this.confirm({ title: L('ui.017349b43485'), message: L('ui.b2ee9a8aff12'), confirmLabel: L('ui.30a6079ce340'), danger: true, onConfirm: () => {
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
        this.toast(L('ui.dbd20ab5385c'), 'success');
      } });
      break;
    case 'settings-export-save':
      this.downloadJson('caerogue-save.json', Store.state);
      break;
    case 'setting-pick-save':
      this.openModal({ title: L('ui.962d4680f188'), subtitle: L('ui.e5c6a2fb5dfc'), size: 'large', body: '<pre class="code-block" style="max-height:55vh">' + esc(JSON.stringify(Store.state, null, 2)) + '</pre>' });
      break;
    case 'modal-close':
      this.closeModal();
      break;
    default:
      this.toast(L('ui.2ba06b6df03a') + action, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
