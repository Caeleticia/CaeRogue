/* CaeRogue - rogue, challenge, and endless mode controllers. */
'use strict';

const MODE_NODE_META = {
  battle: { label: '普通战', short: '战', name: '普通战' },
  elite: { label: '精英战', short: '精', name: '精英战' },
  boss: { label: '首领战', short: '首', name: '首领战' },
  event: { label: '事件', short: '事', name: '事件' },
  shop: { label: '商店', short: '商', name: '商店' },
  rest: { label: '休整', short: '憩', name: '休整' }
};

function modeRandom(list) { return list[Math.floor(Math.random() * list.length)]; }
function modeShuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function modeNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

const ModesUI = {
  rogueDraft: null,
  _shop: null,
  _rewardTimer: null,
  _lockAction: false,

  reset() {
    this.rogueDraft = null;
    this._shop = null;
    this.clearRewardTimer();
  },

  clearRewardTimer() {
    if (this._rewardTimer) { clearTimeout(this._rewardTimer); this._rewardTimer = null; }
  },

  enter(route, app) {
    // A pending rogue or endless reward survives reloads; offer it again after the screen exists.
    this.clearRewardTimer();
    if (route === 'rogue') {
      const run = Store.state.runs.rogue;
      if (run && run.active && run.awaitingReward) {
        this._rewardTimer = setTimeout(() => {
          if (app.route === 'rogue' || app.route === 'battle') this.openPendingReward(app, 'rogue');
        }, 160);
      }
    }
    if (route === 'endless') {
      const run = Store.state.runs.endless;
      if (run && run.active && run.awaitingReward) {
        this._rewardTimer = setTimeout(() => {
          if (app.route === 'endless' || app.route === 'battle') this.openPendingReward(app, 'endless');
        }, 160);
      }
    }
  },

  render(route, app) {
    if (route === 'rogue') return this.renderRogue(app);
    if (route === 'challenge') return this.renderChallenge(app);
    if (route === 'endless') return this.renderEndless(app);
    return '<div class="page-wrap"><div class="empty-state"><h3>未知模式</h3></div></div>';
  },

  /* ---------- Shared helpers ---------- */
  storedDeck(app) {
    let deck = deepClone(Store.state.decks.A || DEFAULT_LOADOUT_A);
    const rules = Object.assign({}, DEFAULT_RULES, { allowDuplicates: false });
    const validation = app && app.validateDeck ? app.validateDeck(deck, rules) : { ok: true, errors: [] };
    if (!validation.ok) {
      deck = deepClone(DEFAULT_LOADOUT_A);
      return { deck, repaired: true, errors: validation.errors };
    }
    return { deck, repaired: false, errors: [] };
  },

  deckPreview(deck, unitsOnly) {
    const cards = {
      units: (deck.units || []).map(id => Store.index.maps.units.get(id)).filter(Boolean),
      equipment: (deck.equipment || []).map(id => Store.index.maps.equipment.get(id)).filter(Boolean),
      runes: (deck.runes || []).map(id => Store.index.maps.runes.get(id)).filter(Boolean)
    };
    return cards;
  },

  playerModifiers(run) {
    const upgrades = run.upgrades || {};
    return {
      hpFlat: modeNumber(upgrades.hpFlat, 0),
      dmgFlat: modeNumber(upgrades.dmgFlat, 0),
      startingEffects: (upgrades.startEffects || []).map(item => ({ effectId: item.effectId, stacks: item.stacks || 1 }))
    };
  },

  makeBattleRules(extra) {
    return Object.assign({}, DEFAULT_RULES, {
      initialDraw: 10,
      maxField: 3,
      allowDuplicates: true,
      defeatedToDeck: false,
      drawDuringBattle: false
    }, extra || {});
  },

  buildEnemy(layer, kind) {
    layer = Math.max(0, layer);
    kind = kind || 'battle';
    const isElite = kind === 'elite';
    const isBoss = kind === 'boss';
    const power = layer + (isElite ? 2 : 0) + (isBoss ? 4 : 0);
    const pools = [
      'slime_small', 'slime_small', 'slime_big', 'catgirl_jk', 'catgirl_jk'
    ];
    if (power >= 3) pools.push('philia093');
    if (power >= 5) pools.push('yonava', 'slime_big');
    if (power >= 7) pools.push('philia093', 'catgirl_jk', 'yonava');
    const available = pools.filter(id => Store.index.maps.units.has(id));
    const picked = [];
    const targetCount = isBoss ? 5 : isElite ? 4 : 3;
    let guard = 0;
    while (picked.length < targetCount && guard < 24) {
      guard += 1;
      const candidate = modeRandom(available);
      if (!candidate) break;
      if (!isBoss && !isElite) {
        const count = picked.filter(id => id === candidate).length;
        if (count >= 1 && picked.length < targetCount - 1) continue;
      }
      picked.push(candidate);
    }
    if (!picked.some(id => {
      const card = Store.index.maps.units.get(id);
      return card && card.counted !== false;
    })) picked.unshift('catgirl_jk');
    const runes = [];
    if (power >= 2) runes.push('agility');
    if (power >= 4) runes.push('war_spirit');
    const equipment = power >= 3 ? ['soap'] : [];
    const mods = {
      hpFlat: Math.min(10, Math.floor(power / 2)),
      dmgFlat: Math.min(5, Math.max(0, Math.floor(power / 3))),
      startingEffects: []
    };
    if (isBoss) mods.hpFlat += 3;
    if (isElite) mods.hpFlat += 1;
    if (picked.includes('philia093') && power >= 5) {
      mods.startingEffects.push({ unitId: 'philia093', effectId: 'poem', stacks: isBoss ? 4 : 2 });
    }
    return {
      loadout: { units: picked, equipment, runes },
      modifiers: mods
    };
  },

  createRogueMap() {
    const layerTypes = [
      ['battle', 'event'],
      ['battle', 'shop'],
      ['elite', 'rest'],
      ['battle', 'event'],
      ['shop', 'rest'],
      ['elite', 'battle'],
      ['boss']
    ];
    const names = {
      battle: ['裂谷回廊', '纸灯庭院', '无声的回声'],
      elite: ['持诗者', '黏液王座'],
      boss: ['不死之终', '诗与诅咒'],
      event: ['折叠书页', '无主遗物'],
      shop: ['行脚商队', '灰烬摊位'],
      rest: ['篝火残页', '安静的房间']
    };
    return layerTypes.map((types, layerIndex) => types.map((type, index) => ({
      id: 'r' + (layerIndex + 1) + (index === 0 ? 'a' : 'b'),
      layer: layerIndex,
      type,
      title: modeRandom(names[type] || ['未知节点']),
      done: false,
      current: false,
      event: type === 'event' ? this.createEvent(layerIndex) : null
    })));
  },

  createEvent(layer) {
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      return {
        kind: 'poem',
        title: '拾起一页诗',
        text: '纸页从空中落下，上面的字迹在你触碰时改变了排列。你可以收下它，也可以让某个尚未成形的人进入队伍。',
        choices: [
          { text: '收下残页', hint: '获得 30 金币。', effect: 'gold', value: 30 },
          { text: '让诗篇入队', hint: '随机获得一名当前牌组中没有的计数角色。', effect: 'unit' }
        ]
      };
    }
    if (roll === 1) {
      return {
        kind: 'trial',
        title: '无主试炼',
        text: '折断的兵器围成一圈，中央留出了一块干净的场地。这里仍然认得战斗。',
        choices: [
          { text: '接受试炼', hint: '立即进入一场普通战斗，胜利后继续前进。', effect: 'battle' },
          { text: '拒绝并整理装备', hint: '本局生命上限 +1。', effect: 'hp', value: 1 }
        ]
      };
    }
    return {
      kind: 'rewrite',
      title: '改写路标',
      text: '路标上写着尚未发生的下一层。墨迹仍然湿润，你可以在它干透前重写。',
      choices: [
        { text: '改道商队', hint: '将下一层的节点改为商店。', effect: 'rewrite-shop' },
        { text: '带走补给', hint: '获得 40 金币。', effect: 'gold', value: 40 }
      ]
    };
  },

  rewardPool(run) {
    const rewards = [];
    const ownedUnits = new Set(run.deck.units || []);
    const availableUnits = Store.index.units.filter(unit => !ownedUnits.has(unit.id));
    if (availableUnits.length) {
      const unit = modeRandom(availableUnits);
      rewards.push({ kind: 'unit', id: unit.id, title: unit.name, desc: '角色加入本局牌组。生命 ' + unit.hp + '，' + (unit.counted === false ? '不计数' : '计数') + '。' });
    }
    if ((run.deck.equipment || []).length < 6 && Store.index.equipment.length) {
      const gear = modeRandom(Store.index.equipment);
      rewards.push({ kind: 'equipment', id: gear.id, title: gear.name, desc: '装备加入本局整备区。' + (modSummary(gear.mods, true) || '') });
    }
    if ((run.deck.runes || []).length < 3 && Store.index.runes.length) {
      const rune = modeRandom(Store.index.runes);
      rewards.push({ kind: 'rune', id: rune.id, title: rune.name, desc: '符文对阵营全体生效。' + (modSummary(rune.mods, true) || '') });
    }
    const positiveEffects = Store.index.effects.filter(effect => effect.type === 'positive');
    if (positiveEffects.length && (!run.upgrades || !run.upgrades.startEffects || run.upgrades.startEffects.length < 3)) {
      const effect = modeRandom(positiveEffects);
      rewards.push({ kind: 'effect', id: effect.id, title: '祝福 · ' + effect.name, desc: '本局所有角色入场时获得 ' + effect.name + ' 2 层。' });
    }
    rewards.push({ kind: 'upgradeHp', title: '生命强化', desc: '本局所有角色生命上限 +2。' });
    rewards.push({ kind: 'upgradeDmg', title: '伤害强化', desc: '本局所有角色伤害提升值 +1。' });
    rewards.push({ kind: 'gold', title: '战利品兑换', desc: '获得 35 金币。' });
    const shuffled = modeShuffle(rewards);
    const result = [];
    const kinds = new Set();
    for (const reward of shuffled) {
      if (result.length >= 3) break;
      if (kinds.has(reward.kind) && result.length < 2) continue;
      kinds.add(reward.kind);
      result.push(reward);
    }
    while (result.length < 3 && shuffled.length) {
      const extra = shuffled.find(item => !result.includes(item));
      if (!extra) break;
      result.push(extra);
    }
    return result;
  },

  generateRewards(run) {
    run.pendingRewards = this.rewardPool(run);
    run.awaitingReward = true;
  },

  applyReward(app, run, reward) {
    if (!reward) return;
    if (reward.kind === 'unit') { run.deck.units.push(reward.id); app.toast('角色「' + reward.title + '」加入牌组。', 'success'); }
    else if (reward.kind === 'equipment') { run.deck.equipment.push(reward.id); app.toast('装备已加入整备区。', 'success'); }
    else if (reward.kind === 'rune') { run.deck.runes.push(reward.id); app.toast('符文已加入本局。', 'success'); }
    else if (reward.kind === 'effect') { run.upgrades.startEffects = run.upgrades.startEffects || []; run.upgrades.startEffects.push({ effectId: reward.id, stacks: 2 }); app.toast('祝福已记录，下一场战斗生效。', 'success'); }
    else if (reward.kind === 'upgradeHp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + 2; app.toast('本局角色生命上限 +2。', 'success'); }
    else if (reward.kind === 'upgradeDmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + 1; app.toast('本局伤害提升值 +1。', 'success'); }
    else if (reward.kind === 'gold') { run.gold = modeNumber(run.gold) + 35; app.toast('获得 35 金币。', 'success'); }
  },

  openPendingReward(app, mode) {
    const run = Store.state.runs[mode];
    if (!run || !run.active || !run.awaitingReward) return;
    if (!Array.isArray(run.pendingRewards) || !run.pendingRewards.length) this.generateRewards(run);
    const rewards = run.pendingRewards || [];
    const body = '<p class="modal-copy">从本场战斗的发现中选择一项。选择后，本层结算完成；未选择的物品不会保留。</p><div class="reward-grid mt-2">' +
      rewards.map((reward, index) => '<button class="reward-card" type="button" data-action="mode-reward-take" data-mode="' + mode + '" data-index="' + index + '"><strong>' + esc(reward.title) + '</strong><small>' + esc(reward.desc) + '</small></button>').join('') +
    '</div><div class="notice mt-2">当前金币：' + modeNumber(run.gold) + ' · ' + (mode === 'rogue' ? '选择后将推进到下一层。' : '选择后可继续进入下一层。') + '</div>';
    app.openModal({ title: '选择战利品', subtitle: mode === 'rogue' ? '第 ' + (run.currentLayer + 1) + ' 层结束' : '无尽第 ' + (run.wins || 1) + ' 层', closable: false, body, foot: '<span class="left">战利品三选一 · 单链式结算已完成</span>' });
  },

  openRogueReward(app) {
    const run = Store.state.runs.rogue;
    if (!run || !run.awaitingReward) return;
    this.openPendingReward(app, 'rogue');
  },

  storeRun(mode, run) { Store.recordRun(mode, run); },

  markNodeDone(run, node) {
    if (node) { node.done = true; node.current = false; }
    run.currentNodeId = null;
  },

  advanceNode(app, node) {
    const run = Store.state.runs.rogue;
    if (!run) return;
    this._shop = null;
    this.markNodeDone(run, node);
    if (node) run.currentLayer = node.layer + 1;
    this.storeRun('rogue', run);
    app.closeModal();
    app.render();
  },

  finishRogue(app, completed) {
    const run = Store.state.runs.rogue;
    if (!run) return;
    run.active = false;
    run.completed = !!completed;
    run.failed = !completed;
    run.pendingRewards = [];
    run.awaitingReward = false;
    this.storeRun('rogue', run);
    Store.archiveRun({
      mode: 'rogue',
      result: completed ? '通关' : '失败',
      detail: completed ? '抵达终点并完成首领战' : '队伍在途中失去全部计数单位',
      layer: run.currentLayer + 1,
      wins: run.wins || 0
    });
    app.exitBattleTo('rogue');
  },

  /* ---------- Rogue rendering ---------- */
  defaultRogueDraft() {
    const valid = (type, ids) => ids.filter(id => type === 'unit' ? Store.index.maps.units.has(id) : type === 'equipment' ? Store.index.maps.equipment.has(id) : Store.index.maps.runes.has(id));
    const draft = {
      units: valid('unit', ['catgirl_jk', 'philia093', 'slime_big']),
      equipment: valid('equipment', ['soap']),
      runes: valid('rune', ['war_spirit'])
    };
    if (!draft.units.length) {
      const first = Store.index.units.filter(unit => unit.counted !== false).slice(0, 3).map(unit => unit.id);
      draft.units = first;
    }
    return draft;
  },

  ensureRogueDraft() {
    if (!this.rogueDraft) this.rogueDraft = this.defaultRogueDraft();
    const scrub = (type, ids) => ids.filter(id => {
      if (type === 'unit') return Store.index.maps.units.has(id);
      if (type === 'equipment') return Store.index.maps.equipment.has(id);
      return Store.index.maps.runes.has(id);
    });
    this.rogueDraft.units = scrub('unit', this.rogueDraft.units || []);
    this.rogueDraft.equipment = scrub('equipment', this.rogueDraft.equipment || []);
    this.rogueDraft.runes = scrub('rune', this.rogueDraft.runes || []);
    return this.rogueDraft;
  },

  renderRogue(app) {
    const run = Store.state.runs.rogue;
    if (run && run.active) return this.renderRogueRun(app, run);
    return this.renderRogueLanding(app, run);
  },

  renderRogueLanding(app, previous) {
    const draft = this.ensureRogueDraft();
    const selectedUnits = draft.units.map(id => Store.index.maps.units.get(id)).filter(Boolean);
    const counted = selectedUnits.filter(unit => unit.counted !== false).length;
    const error = !selectedUnits.length ? '至少选择一名角色。' : !counted ? '起始队伍至少需要一名计数角色。' : '';
    const cardButton = (type, card, selected) => '<button class="choice-card' + (selected ? ' selected' : '') + '" type="button" data-action="mode-rogue-draft" data-type="' + type + '" data-id="' + attr(card.id) + '"><span class="choice-mark">' + (selected ? '选' : '+') + '</span><span class="choice-main"><strong>' + esc(card.name) + '</strong><small>' + qualityBadge(card.quality) + ' ' + (type === 'unit' ? '生命 ' + card.hp + ' · ' + ((RESISTANCE_TYPES[card.resistance.type] || { label: '抗性' }).label) + ' ' + card.resistance.value + ' · ' + (card.counted === false ? '不计数' : '计数') : (modSummary(card.mods, true) || '无数值')) + '</small></span></button>';
    const unitPool = Store.index.units.slice(0, 8);
    const gearPool = Store.index.equipment.slice(0, 5);
    const runePool = Store.index.runes.slice(0, 5);
    const lastSummary = previous && !previous.active ? '<section class="panel"><div class="panel-head"><div><h3>上一次探索</h3><div class="panel-sub">' + (previous.completed ? '已抵达终点' : '未能抵达终点') + '</div></div><span class="chip">' + (previous.completed ? '通关' : '失败') + '</span></div><div class="panel-body"><div class="run-stat-row"><span>抵达层数</span><b>' + (modeNumber(previous.currentLayer) + 1) + ' / 7</b></div><div class="run-stat-row"><span>战斗胜利</span><b>' + modeNumber(previous.wins) + '</b></div><div class="run-stat-row"><span>获得金币</span><b>' + modeNumber(previous.gold) + '</b></div></div></section>' : '';
    return '' +
      '<div class="page-wrap mode-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ROGUELIKE EXPEDITION / NODE MAP</div><h1>肉鸽</h1><p>从初始角色与少量装备、符文中选择起点，沿节点地图推进。队伍与资源跨节点保留，失败则本局结束。</p></div><div class="page-head-side"><span class="chip">7 层节点</span><span class="chip">资源保留</span></div></div>' +
        '<section class="mode-hero"><img class="mode-hero-icon" src="assets/icons/rogue.svg" alt=""><div class="mh-main"><h2>纸页之外的路线</h2><p>普通战、精英战、事件、商店、休整与首领节点交替出现。战斗胜利后可从角色、装备、符文、高级效果与强化中选择奖励。</p><div class="mh-actions"><span class="chip">起始编队自选</span><span class="chip">战斗失败即结束</span><span class="chip">首领节点通关</span></div></div><span class="mode-stamp">ROGUE / EXPEDITION</span></section>' +
        (lastSummary ? '<div class="mt-3">' + lastSummary + '</div>' : '') +
        '<div class="mt-3"><div class="section-heading"><div><h2>起始编队</h2><p>角色最多 4 名，装备最多 2 件，符文最多 3 张。至少包含一名计数角色。</p></div><button class="btn btn-sm" type="button" data-action="mode-rogue-recommended">使用推荐起始</button></div>' +
          '<div class="rogue-start-grid">' +
            '<section class="panel"><div class="panel-head"><div><h3>角色</h3><div class="panel-sub">已选 ' + selectedUnits.length + ' / 4</div></div></div><div class="panel-body"><div class="choice-list">' + unitPool.map(unit => cardButton('unit', unit, draft.units.includes(unit.id))).join('') + '</div></div></section>' +
            '<section class="panel"><div class="panel-head"><div><h3>装备</h3><div class="panel-sub">已选 ' + draft.equipment.length + ' / 2</div></div></div><div class="panel-body"><div class="choice-list">' + (gearPool.length ? gearPool.map(gear => cardButton('equipment', gear, draft.equipment.includes(gear.id))).join('') : '<div class="empty-state" style="min-height:80px"><p>没有可用装备。</p></div>') + '</div></div></section>' +
            '<section class="panel"><div class="panel-head"><div><h3>符文</h3><div class="panel-sub">已选 ' + draft.runes.length + ' / 3</div></div></div><div class="panel-body"><div class="choice-list">' + (runePool.length ? runePool.map(rune => cardButton('rune', rune, draft.runes.includes(rune.id))).join('') : '<div class="empty-state" style="min-height:80px"><p>没有可用符文。</p></div>') + '</div></div></section>' +
          '</div>' +
          '<div class="panel mt-2"><div class="panel-body"><div class="row between wrap"><div><div class="row wrap"><span class="chip ' + (counted ? 'green' : 'red') + '">计数角色 ' + counted + '</span><span class="chip">角色 ' + selectedUnits.length + '</span><span class="chip gold">装备 ' + draft.equipment.length + '</span><span class="chip violet">符文 ' + draft.runes.length + '</span></div><p class="field-hint mt-1">起始金币 60。关卡中的强化会作用于整局队伍。</p></div><div class="row"><button class="btn btn-lg btn-primary" type="button" data-action="mode-rogue-start"' + (error ? ' disabled' : '') + '>开始探索</button></div></div>' + (error ? '<div class="notice danger mt-2">' + esc(error) + '</div>' : '') + '</div></div>' +
        '</div>' +
      '</div>';
  },

  renderRogueRun(app, run) {
    const map = run.map && Array.isArray(run.map.layers) ? run.map : { layers: this.createRogueMap() };
    if (!run.map) { run.map = map; this.storeRun('rogue', run); }
    const layersHtml = map.layers.map((nodes, layerIndex) => {
      const isCurrentLayer = layerIndex === run.currentLayer;
      return '<div class="map-layer"><div class="map-layer-label">第 ' + (layerIndex + 1) + ' 层</div>' + nodes.map(node => {
        const meta = MODE_NODE_META[node.type] || MODE_NODE_META.battle;
        const available = isCurrentLayer && !node.done && !run.awaitingReward;
        const cls = ['map-node'];
        if (node.done) cls.push('done');
        if (available) cls.push('available');
        if (!available && !node.done) cls.push('locked');
        if (run.currentNodeId === node.id) cls.push('current');
        return '<button class="' + cls.join(' ') + '" type="button" data-action="mode-rogue-enter" data-node="' + attr(node.id) + '"' + (available ? '' : ' disabled') + '><span class="node-icon">' + meta.short + '</span><span class="node-type">' + meta.label + '</span><span class="node-name">' + esc(node.title) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    const deckCards = this.deckPreview(run.deck);
    const upgrades = run.upgrades || {};
    const startEffects = upgrades.startEffects || [];
    return '' +
      '<div class="page-wrap mode-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ROGUELIKE EXPEDITION / ACTIVE</div><h1>探索路线</h1><p>选择当前层的可用节点。战斗、事件与商店结果会在单链式状态中提交；队伍与资源在节点之间保留。</p></div><div class="page-head-side"><span class="chip">第 ' + (run.currentLayer + 1) + ' / 7 层</span><button class="btn btn-sm btn-danger" type="button" data-action="mode-rogue-abandon">放弃本局</button></div></div>' +
        (run.awaitingReward ? '<div class="run-banner"><img src="assets/icons/rogue.svg" alt=""><div class="grow"><strong>战利品等待选择</strong><p>本层已结束，请先处理战利品，再继续地图。</p></div><div class="banner-actions"><button class="btn btn-sm btn-gold" type="button" data-action="mode-rogue-open-reward">选择战利品</button></div></div>' : '') +
        '<div class="run-layout mt-2">' +
          '<section class="panel map-panel"><div class="panel-head"><div><h3>节点地图</h3><div class="panel-sub">完成节点后推进到下一层；未选择的路线会关闭。</div></div><span class="map-progress">' + (run.completed ? '完成' : '推进 ' + (run.currentLayer + 1) + ' / 7') + '</span></div><div class="rogue-map">' + layersHtml + '</div><div class="map-legend"><span class="available">可进入</span><span class="done">已完成</span><span class="locked">未开放 / 已关闭</span></div></section>' +
          '<aside class="run-sidebar">' +
            '<section class="panel"><div class="panel-head"><div><h3>探索状态</h3><div class="panel-sub">资源与强化跨节点保留</div></div></div><div class="panel-body">' +
              '<div class="run-stat-row"><span>当前层</span><b>' + (run.currentLayer + 1) + ' / 7</b></div>' +
              '<div class="run-stat-row"><span>金币</span><b>' + modeNumber(run.gold) + '</b></div>' +
              '<div class="run-stat-row"><span>战斗胜利</span><b>' + modeNumber(run.wins) + '</b></div>' +
              '<div class="run-stat-row"><span>生命强化</span><b>+' + modeNumber(upgrades.hpFlat) + '</b></div>' +
              '<div class="run-stat-row"><span>伤害强化</span><b>+' + modeNumber(upgrades.dmgFlat) + '</b></div>' +
              '<div class="detail-section-title">整局祝福<span class="line"></span></div><div class="run-relic-list">' + (startEffects.length ? startEffects.map(item => '<span class="chip violet">' + esc((Store.index.maps.effects.get(item.effectId) || { name: item.effectId }).name) + ' ×' + item.stacks + '</span>').join('') : '<span class="faint tiny">尚无祝福</span>') + '</div>' +
            '</div></section>' +
            '<section class="panel"><div class="panel-head"><div><h3>当前牌组</h3><div class="panel-sub">' + deckCards.units.length + ' 角色 · ' + deckCards.equipment.length + ' 装备 · ' + deckCards.runes.length + ' 符文</div></div></div><div class="panel-body"><div class="run-deck-list">' + deckCards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? '不计数' : '计数') + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + deckCards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + deckCards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></section>' +
            '<section class="panel"><div class="panel-head"><h3>节点规则</h3></div><div class="panel-body"><p class="field-hint">普通战与精英战使用当前牌组，战斗结束后生命与状态重置。首领战胜利即通关。事件可以触发额外战斗、改变后续节点或提供资源。</p></div></section>' +
          '</aside>' +
        '</div>' +
      '</div>';
  },

  /* ---------- Rogue actions ---------- */
  toggleRogueDraft(app, type, id) {
    const draft = this.ensureRogueDraft();
    const key = type === 'unit' ? 'units' : type === 'equipment' ? 'equipment' : 'runes';
    const max = type === 'unit' ? 4 : type === 'equipment' ? 2 : 3;
    if (draft[key].includes(id)) draft[key] = draft[key].filter(item => item !== id);
    else if (draft[key].length < max) draft[key].push(id);
    else { app.toast('该区域最多选择 ' + max + ' 项。', 'error'); return; }
    app.render();
  },

  startRogue(app) {
    this._shop = null;
    const draft = this.ensureRogueDraft();
    const units = draft.units.slice();
    if (!units.length) { app.toast('至少选择一名角色。', 'error'); return; }
    const counted = units.map(id => Store.index.maps.units.get(id)).filter(Boolean).filter(unit => unit.counted !== false);
    if (!counted.length) { app.toast('起始队伍至少需要一名计数角色。', 'error'); return; }
    const run = {
      active: true,
      completed: false,
      failed: false,
      map: { layers: this.createRogueMap() },
      currentLayer: 0,
      currentNodeId: null,
      deck: { units, equipment: draft.equipment.slice(), runes: draft.runes.slice() },
      gold: 60,
      wins: 0,
      upgrades: { hpFlat: 0, dmgFlat: 0, startEffects: [] },
      awaitingReward: false,
      pendingRewards: [],
      startedAt: Date.now()
    };
    this.storeRun('rogue', run);
    app.render();
    app.toast('探索开始。请选择一个节点。', 'success');
  },

  enterRogueNode(app, nodeId) {
    const run = Store.state.runs.rogue;
    if (!run || !run.active) return;
    if (run.awaitingReward) { app.toast('请先选择战利品。', 'error'); this.openPendingReward(app, 'rogue'); return; }
    const node = run.map.layers.flat().find(item => item.id === nodeId);
    if (!node || node.done || node.layer !== run.currentLayer) return;
    run.currentNodeId = node.id;
    this.storeRun('rogue', run);
    if (['battle', 'elite', 'boss'].includes(node.type)) {
      this.startRogueBattle(app, run, node, 'node');
      return;
    }
    if (node.type === 'event') this.openEventModal(app, run, node);
    else if (node.type === 'shop') this.openShopModal(app, run, node);
    else if (node.type === 'rest') this.openRestModal(app, run, node);
  },

  startRogueBattle(app, run, node, source) {
    const enemy = this.buildEnemy(node.layer, node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'battle');
    app.startBattle({
      loadouts: {
        A: { units: run.deck.units.slice(), equipment: run.deck.equipment.slice(), runes: run.deck.runes.slice() },
        B: enemy.loadout
      },
      rules: this.makeBattleRules({ allowDuplicates: true }),
      controllers: { A: 'human', B: 'ai' },
      modifiers: { A: this.playerModifiers(run), B: enemy.modifiers },
      mode: 'rogue',
      context: {
        mode: 'rogue',
        source: 'rogue',
        sourceKind: source || 'node',
        nodeId: node.id,
        nodeType: node.type,
        layer: node.layer,
        resolveReward: true
      }
    });
  },

  openEventModal(app, run, node) {
    const event = node.event || this.createEvent(node.layer);
    node.event = event;
    const body = '<div class="modal-copy">' + esc(event.text) + '</div><div class="choice-list mt-2">' + event.choices.map((choice, index) => '<button class="choice-card" type="button" data-action="mode-rogue-event-choice" data-index="' + index + '"><span class="choice-mark">' + (index + 1) + '</span><span class="choice-main"><strong>' + esc(choice.text) + '</strong><small>' + esc(choice.hint) + '</small></span></button>').join('') + '</div>';
    app.openModal({ title: event.title, subtitle: '事件节点 · 第 ' + (node.layer + 1) + ' 层', size: 'small', body });
  },

  handleEventChoice(app, index) {
    const run = Store.state.runs.rogue;
    if (!run || !run.currentNodeId) return;
    const node = run.map.layers.flat().find(item => item.id === run.currentNodeId);
    if (!node || !node.event) return;
    const choice = node.event.choices[index];
    if (!choice) return;
    if (choice.effect === 'gold') {
      run.gold = modeNumber(run.gold) + modeNumber(choice.value);
      app.toast('获得 ' + choice.value + ' 金币。', 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'hp') {
      run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + modeNumber(choice.value);
      app.toast('本局生命上限提升。', 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'unit') {
      const currentUnits = new Set(run.deck.units);
      const candidates = Store.index.units.filter(unit => !currentUnits.has(unit.id) && unit.counted !== false);
      const pick = candidates.length ? modeRandom(candidates) : null;
      if (pick) {
        run.deck.units.push(pick.id);
        app.toast('「' + pick.name + '」加入了牌组。', 'success');
      } else {
        run.gold = modeNumber(run.gold) + 40;
        app.toast('没有可用新角色，改为获得 40 金币。', 'success');
      }
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'rewrite-shop') {
      const nextLayer = node.layer + 1;
      if (run.map.layers[nextLayer]) {
        run.map.layers[nextLayer].forEach((item, idx) => {
          item.type = 'shop';
          item.title = idx === 0 ? '改写后的行商' : '墨迹未干的摊位';
          item.event = null;
        });
      }
      app.toast('下一层节点已改写为商店。', 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'battle') {
      app.closeModal();
      this.startRogueBattle(app, run, node, 'event');
      return;
    }
    this.advanceNode(app, node);
  },

  shopOffers(run) {
    const offers = [];
    const owned = new Set(run.deck.units);
    const candidates = Store.index.units.filter(unit => !owned.has(unit.id));
    if (candidates.length) {
      const unit = modeRandom(candidates);
      offers.push({ kind: 'unit', id: unit.id, title: unit.name, desc: '角色 · 生命 ' + unit.hp, price: 35, sold: false });
    }
    if (Store.index.equipment.length && (run.deck.equipment || []).length < 6) {
      const gear = modeRandom(Store.index.equipment);
      offers.push({ kind: 'equipment', id: gear.id, title: gear.name, desc: '装备 · ' + (modSummary(gear.mods, true) || '特效'), price: 25, sold: false });
    }
    if (Store.index.runes.length && (run.deck.runes || []).length < 3) {
      const rune = modeRandom(Store.index.runes);
      offers.push({ kind: 'rune', id: rune.id, title: rune.name, desc: '符文 · ' + (modSummary(rune.mods, true) || '特效'), price: 25, sold: false });
    }
    offers.push({ kind: 'upgradeHp', title: '生命强化', desc: '本局生命上限 +2', price: 30, sold: false });
    offers.push({ kind: 'upgradeDmg', title: '伤害强化', desc: '本局伤害提升值 +1', price: 30, sold: false });
    if ((run.deck.units || []).length > 1) offers.push({ kind: 'removeUnit', title: '移除服务', desc: '从本局牌组移除一名角色，至少保留一名计数角色。', price: 20, sold: false });
    return modeShuffle(offers).slice(0, 4);
  },

  openShopModal(app, run, node) {
    if (!this._shop || this._shop.nodeId !== node.id) this._shop = { nodeId: node.id, offers: this.shopOffers(run) };
    const offers = this._shop.offers;
    const body = '<div class="row between mb-2"><span class="chip gold">金币 ' + modeNumber(run.gold) + '</span><span class="field-hint">选中物品后立即扣除金币。</span></div><div class="shop-grid">' + offers.map((offer, index) => '<div class="shop-item' + (offer.sold ? ' sold' : '') + '"><img src="' + (offer.kind === 'unit' ? attr(cardArt(Store.index.maps.units.get(offer.id) || {})) : offer.kind === 'rune' ? 'assets/pictures/rune-art.svg' : 'assets/pictures/equipment-soap.svg') + '" alt=""><div class="grow"><strong>' + esc(offer.title) + '</strong><small>' + esc(offer.desc) + '</small><div class="price">' + (offer.sold ? '已售出' : offer.price + ' 金币') + '</div></div>' + (offer.sold ? '' : '<button class="btn btn-sm" type="button" data-action="mode-shop-buy" data-index="' + index + '"' + (run.gold < offer.price ? ' disabled' : '') + '>购买</button>') + '</div>').join('') + '</div><div class="notice mt-2">购买后可以继续挑选。离开商店会完成本节点并推进地图。</div>';
    app.openModal({ title: '行脚商队', subtitle: '第 ' + (node.layer + 1) + ' 层 · 商店节点', body, foot: '<span class="left">金币 ' + modeNumber(run.gold) + '</span><button class="btn btn-primary" type="button" data-action="mode-shop-leave">离开商店</button>' });
  },

  buyShop(app, index) {
    const run = Store.state.runs.rogue;
    if (!run || !this._shop) return;
    const offer = this._shop.offers[index];
    if (!offer || offer.sold) return;
    if (modeNumber(run.gold) < offer.price) { app.toast('金币不足。', 'error'); return; }
    if (offer.kind === 'removeUnit') { this.openRemoveUnitModal(app, run, offer, index); return; }
    run.gold -= offer.price;
    offer.sold = true;
    this.applyReward(app, run, offer);
    this.storeRun('rogue', run);
    const node = run.map.layers.flat().find(item => item.id === this._shop.nodeId);
    if (node) this.openShopModal(app, run, node);
  },

  openRemoveUnitModal(app, run, offer, index) {
    const body = '<p class="modal-copy">选择一张角色牌移出本局牌组。费用 ' + offer.price + ' 金币，确认移除后立即扣除。</p><div class="choice-list mt-2">' +
      (run.deck.units || []).map((unitId, unitIndex) => {
        const unit = Store.index.maps.units.get(unitId);
        if (!unit) return '';
        return '<button class="choice-card" type="button" data-action="mode-shop-remove-unit" data-index="' + index + '" data-unit-index="' + unitIndex + '"><span class="choice-mark">' + (unit.counted === false ? '非' : '计') + '</span><span class="choice-main"><strong>' + esc(unit.name) + '</strong><small>生命 ' + unit.hp + ' · ' + (unit.counted === false ? '不计数' : '计数角色') + ' · 重选后仍须保留至少一名计数角色。</small></span></button>';
      }).join('') +
    '</div><div class="notice danger mt-2">移除后不会返还已投入的其他资源。</div>';
    app.openModal({ title: '移除角色', subtitle: '商店移除服务', body, foot: '<button class="btn" type="button" data-action="mode-shop-close-remove">返回商店</button>' });
  },

  removeUnitFromRun(app, index, unitIndex) {
    const run = Store.state.runs.rogue;
    if (!run || !this._shop) return;
    const offer = this._shop.offers[index];
    const unitId = (run.deck.units || [])[unitIndex];
    if (!offer || offer.sold || !unitId) return;
    if (modeNumber(run.gold) < offer.price) { app.toast('金币不足。', 'error'); return; }
    const remaining = run.deck.units.filter((id, idx) => idx !== unitIndex);
    const counted = remaining.map(id => Store.index.maps.units.get(id)).filter(unit => unit && unit.counted !== false);
    if (!counted.length) { app.toast('至少需要保留一名计数角色。', 'error'); return; }
    run.gold -= offer.price;
    offer.sold = true;
    run.deck.units.splice(unitIndex, 1);
    this.storeRun('rogue', run);
    app.toast('已移除角色，支付 ' + offer.price + ' 金币。', 'success');
    const node = run.map.layers.flat().find(item => item.id === this._shop.nodeId);
    if (node) this.openShopModal(app, run, node);
  },

  openRestModal(app, run, node) {
    const body = '<div class="modal-copy">篝火只够照亮很小的范围。选择一项有限恢复或强化；本局剩余节点共享这些加成。</div><div class="choice-list mt-2">' +
      '<button class="choice-card" type="button" data-action="mode-rest-choice" data-choice="hp"><span class="choice-mark">1</span><span class="choice-main"><strong>照料队伍</strong><small>本局所有角色生命上限 +2。整局保留。</small></span></button>' +
      '<button class="choice-card" type="button" data-action="mode-rest-choice" data-choice="dmg"><span class="choice-mark">2</span><span class="choice-main"><strong>磨砺武器</strong><small>本局所有角色伤害提升值 +1。整局保留。</small></span></button>' +
      '<button class="choice-card" type="button" data-action="mode-rest-choice" data-choice="gold"><span class="choice-mark">3</span><span class="choice-main"><strong>整理行囊</strong><small>获得 30 金币。</small></span></button>' +
    '</div>';
    app.openModal({ title: '休整', subtitle: '第 ' + (node.layer + 1) + ' 层 · 休整节点', size: 'small', body });
  },

  handleRestChoice(app, choice) {
    const run = Store.state.runs.rogue;
    if (!run || !run.currentNodeId) return;
    const node = run.map.layers.flat().find(item => item.id === run.currentNodeId);
    if (!node) return;
    if (choice === 'hp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + 2; app.toast('生命上限 +2。', 'success'); }
    else if (choice === 'dmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + 1; app.toast('伤害强化 +1。', 'success'); }
    else { run.gold = modeNumber(run.gold) + 30; app.toast('获得 30 金币。', 'success'); }
    this.advanceNode(app, node);
  },

  abandonRogue(app) {
    const run = Store.state.runs.rogue;
    if (!run) return;
    app.confirm({ title: '放弃本局探索', message: '当前队伍、资源与地图进度将结束，并记录为一次失败探索。', confirmLabel: '放弃本局', danger: true, onConfirm: () => {
      run.active = false;
      run.failed = true;
      run.completed = false;
      this.storeRun('rogue', run);
      Store.archiveRun({ mode: 'rogue', result: '放弃', detail: '玩家主动结束探索', layer: run.currentLayer + 1, wins: run.wins || 0 });
      app.render();
    } });
  },

  takeReward(app, mode, index) {
    const run = Store.state.runs[mode];
    if (!run || !run.active) return;
    const rewards = run.pendingRewards || [];
    const reward = rewards[index];
    if (!reward) return;
    this.applyReward(app, run, reward);
    run.pendingRewards = [];
    run.awaitingReward = false;
    if (mode === 'rogue') {
      const node = run.currentNodeId ? run.map.layers.flat().find(item => item.id === run.currentNodeId) : null;
      if (node) this.markNodeDone(run, node);
      if (run.pendingCompletion || (node && node.type === 'boss')) {
        run.pendingCompletion = false;
        this.storeRun('rogue', run);
        this.finishRogue(app, true);
        return;
      }
      if (node) run.currentLayer = node.layer + 1;
      run.currentNodeId = null;
      this.storeRun('rogue', run);
      app.closeModal();
      app.render();
      return;
    }
    if (mode === 'endless') {
      this.storeRun('endless', run);
      app.closeModal();
      app.render();
    }
  },

  /* ---------- Battle outcomes ---------- */
  battleResultActions(context, battle, summary, app) {
    context = context || {};
    const playerWin = battle.winner === 'A';
    if (context.mode === 'rogue') {
      if (playerWin) return [{ label: context.nodeType === 'boss' ? '完成探索并选择战利品' : '收取战利品', action: 'mode-rogue-victory', kind: 'primary' }];
      return [{ label: '结束本局', action: 'mode-rogue-defeat', kind: 'danger' }];
    }
    if (context.mode === 'challenge') {
      const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === context.challengeId);
      const isLast = challenge && context.stageIndex >= challenge.stages.length - 1;
      if (playerWin) return [{ label: isLast ? '完成挑战' : '进入下一幕', action: isLast ? 'mode-challenge-complete' : 'mode-challenge-next', kind: 'primary' }];
      return [{ label: '返回挑战', action: 'mode-challenge-defeat', kind: 'danger' }];
    }
    if (context.mode === 'endless') {
      if (playerWin) return [{ label: '处理战利品', action: 'mode-endless-victory', kind: 'primary' }];
      return [{ label: '结束无尽', action: 'mode-endless-defeat', kind: 'danger' }];
    }
    return null;
  },

  onBattleAbort(context, app) {
    if (!context || !['rogue', 'challenge', 'endless'].includes(context.mode)) return null;
    return context.mode;
  },

  rogueVictory(app) {
    const run = Store.state.runs.rogue;
    const context = app.battleContext || {};
    if (!run || !run.active) return;
    if (context.battleResolved) return;
    context.battleResolved = true;
    const node = context.nodeId ? run.map.layers.flat().find(item => item.id === context.nodeId) : null;
    if (node) { node.done = true; node.current = false; }
    run.wins = modeNumber(run.wins) + 1;
    run.gold = modeNumber(run.gold) + (node && node.type === 'boss' ? 60 : node && node.type === 'elite' ? 35 : 25);
    run.currentNodeId = node ? node.id : run.currentNodeId;
    run.pendingCompletion = !!(node && node.type === 'boss');
    this.generateRewards(run);
    this.storeRun('rogue', run);
    app.exitBattleTo('rogue');
    this.clearRewardTimer();
    this._rewardTimer = setTimeout(() => {
      if (app.route === 'rogue') this.openPendingReward(app, 'rogue');
    }, 220);
  },

  rogueDefeat(app) {
    const run = Store.state.runs.rogue;
    if (!run) return;
    run.active = false;
    run.failed = true;
    run.completed = false;
    run.awaitingReward = false;
    run.pendingRewards = [];
    this.storeRun('rogue', run);
    Store.archiveRun({ mode: 'rogue', result: '失败', detail: '队伍在节点战斗中失去全部计数单位', layer: run.currentLayer + 1, wins: run.wins || 0 });
    app.exitBattleTo('rogue');
  },

  endlessVictory(app) {
    const run = Store.state.runs.endless;
    const context = app.battleContext || {};
    if (!run || !run.active) return;
    if (context.battleResolved) return;
    context.battleResolved = true;
    run.wins = modeNumber(run.wins) + 1;
    run.layer = modeNumber(run.layer, 1) + 1;
    run.gold = modeNumber(run.gold) + 20;
    this.generateRewards(run);
    this.storeRun('endless', run);
    app.exitBattleTo('endless');
    this.clearRewardTimer();
    this._rewardTimer = setTimeout(() => {
      if (app.route === 'endless') this.openPendingReward(app, 'endless');
    }, 220);
  },

  endlessDefeat(app) {
    const run = Store.state.runs.endless;
    if (!run) return;
    run.active = false;
    run.failed = true;
    run.awaitingReward = false;
    run.pendingRewards = [];
    this.storeRun('endless', run);
    Store.archiveRun({ mode: 'endless', result: '失败', detail: '无尽层数结算', layer: run.layer, wins: modeNumber(run.wins) });
    app.exitBattleTo('endless');
  },

  /* ---------- Challenge ---------- */
  renderChallenge(app) {
    const stored = this.storedDeck(app);
    const run = Store.state.runs.challenge;
    const activeRun = run && run.active ? run : null;
    const cards = this.deckPreview(stored.deck);
    const counts = cards.units.filter(unit => unit.counted !== false).length;
    const runBanner = activeRun ? (() => {
      const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === activeRun.challengeId);
      const stage = challenge && challenge.stages[activeRun.stageIndex];
      return '<div class="run-banner"><img src="assets/icons/challenge.svg" alt=""><div class="grow"><strong>进行中：' + esc(challenge ? challenge.name : '挑战') + '</strong><p>第 ' + (activeRun.stageIndex + 1) + ' / ' + (challenge ? challenge.stages.length : '?') + ' 幕 · ' + esc(stage ? stage.name : '') + '。挑战预设使用当前通关状态。</p></div><div class="banner-actions"><button class="btn btn-sm btn-primary" type="button" data-action="mode-challenge-fight">进入第 ' + (activeRun.stageIndex + 1) + ' 幕</button><button class="btn btn-sm" type="button" data-action="mode-challenge-abandon">放弃</button></div></div>';
    })() : '';
    const failedRun = run && !run.active ? '<div class="notice mt-2"><div class="row between wrap"><span>上一次挑战：' + (run.completed ? '已完成' : '未完成') + '。' + (run.completed ? '可以重新挑战更高效率的路线。' : '失败后可重新挑战。') + '</span>' + (!run.completed && run.challengeId ? '<button class="btn btn-sm" type="button" data-action="mode-challenge-retry">重新挑战</button>' : '') + '</div></div>' : '';
    return '' +
      '<div class="page-wrap mode-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">CHALLENGE TRIALS / PRESET GAUNTLET</div><h1>挑战</h1><p>使用我方存档牌组挑战预设的连续战斗。每场战斗的敌方配置、规则修正与阶段目标由挑战定义；完成全部阶段即通关。</p></div><div class="page-head-side"><span class="chip ' + (stored.repaired ? 'red' : 'green') + '">' + (stored.repaired ? '牌组已回退至推荐' : '我方牌组已载入') + '</span><button class="btn" type="button" data-action="open-setup" data-mode="versus">调整牌组</button></div></div>' +
        '<section class="mode-hero"><img class="mode-hero-icon" src="assets/icons/challenge.svg" alt=""><div class="mh-main"><h2>为已知结局准备不同的答案</h2><p>每项挑战包含若干连续战斗。当前实现的阶段间状态会重置，角色与资源重新入场；部分挑战会修正敌方生命、伤害或入场效果。</p><div class="mh-actions"><span class="chip">连续战斗</span><span class="chip">预设规则修正</span><span class="chip">失败可重试</span></div></div><span class="mode-stamp">TRIALS / 3</span></section>' +
        (stored.repaired ? '<div class="notice danger mt-2">当前存档牌组不满足出战条件，已使用推荐构筑预览。请先在对战配置中修正我方牌组。</div>' : '') +
        (runBanner ? '<div class="mt-2">' + runBanner + '</div>' : '') + failedRun +
        '<div class="mt-3"><div class="section-heading"><div><h2>预设挑战</h2><p>当前队伍：' + cards.units.length + ' 角色 / ' + counts + ' 计数 / ' + cards.equipment.length + ' 装备 / ' + cards.runes.length + ' 符文。</p></div><span class="chip">存档牌组</span></div><div class="challenge-grid">' +
          CHALLENGE_DEFINITIONS.map((challenge, index) => {
            const artUnit = challenge.id === 'challenge_curse' ? 'yonava' : challenge.id === 'challenge_endless' ? 'catgirl_jk' : 'philia093';
            const art = (Store.index.maps.units.get(artUnit) || {}).art || 'assets/pictures/unit-philia.svg';
            const isActive = activeRun && activeRun.challengeId === challenge.id;
            const blockedByOther = activeRun && !isActive;
            return '<article class="panel challenge-card"><div class="challenge-art"><img src="' + attr(art) + '" alt=""><span class="ch-tag">' + esc(challenge.tag) + '</span><span class="ch-name">' + esc(challenge.name) + '</span></div><div class="challenge-body"><p>' + esc(challenge.description) + '</p><div class="challenge-stages">' + challenge.stages.map((stage, stageIndex) => '<div class="challenge-stage-row"><span class="stage-no">' + (stageIndex + 1) + '</span><span>' + esc(stage.name) + '</span><small>' + esc(stage.rule && stage.rule.modifier ? stage.rule.modifier : '标准战斗') + '</small></div>').join('') + '</div><button class="btn ' + (isActive ? 'btn-primary' : '') + '" type="button" data-action="' + (isActive ? 'mode-challenge-fight' : 'mode-challenge-start') + '" data-id="' + attr(challenge.id) + '"' + (blockedByOther ? ' disabled' : '') + '>' + (isActive ? '继续挑战' : blockedByOther ? '已有挑战进行中' : '开始挑战') + '</button></div></article>';
          }).join('') +
        '</div></div>' +
        '<div class="panel mt-3"><div class="panel-head"><div><h3>当前牌组预览</h3><div class="panel-sub">可在面对面对战配置中修改后返回挑战。</div></div><button class="btn btn-sm" type="button" data-action="mode-challenge-view-deck">查看完整牌组</button></div><div class="panel-body"><div class="row wrap">' + cards.units.map(unit => '<span class="chip">' + esc(unit.name) + '</span>').join('') + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></div>' +
      '</div>';
  },

  startChallenge(app, challengeId) {
    const existing = Store.state.runs.challenge;
    if (existing && existing.active) {
      app.toast('已有挑战进行中，请先完成或放弃。', 'error');
      return;
    }
    const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === challengeId);
    if (!challenge) return;
    const stored = this.storedDeck(app);
    if (stored.repaired) {
      app.toast('当前我方牌组无效，请先调整牌组。', 'error');
      return;
    }
    const run = {
      active: true,
      challengeId,
      stageIndex: 0,
      deck: stored.deck,
      startedAt: Date.now(),
      completed: false,
      failed: false
    };
    Store.recordRun('challenge', run);
    this.startChallengeStage(app);
  },

  challengeModifiers(stage) {
    const mods = {};
    const rule = stage.rule || {};
    if (rule.enemyHp) mods.hpFlat = modeNumber(rule.enemyHp);
    if (rule.enemyDmg) mods.dmgFlat = modeNumber(rule.enemyDmg);
    mods.startingEffects = [];
    if (rule.enemyStartEffect && rule.enemyStartEffect.effect) {
      mods.startingEffects.push({ unitId: rule.enemyStartEffect.target, effectId: rule.enemyStartEffect.effect, stacks: rule.enemyStartEffect.stacks || 1 });
    }
    return mods;
  },

  startChallengeStage(app) {
    const run = Store.state.runs.challenge;
    if (!run || !run.active) return;
    const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === run.challengeId);
    if (!challenge) return;
    const stage = challenge.stages[run.stageIndex];
    if (!stage) return;
    const modifiers = { A: { hpFlat: 0, dmgFlat: 0 }, B: this.challengeModifiers(stage) };
    if (challenge.id === 'challenge_curse' && run.stageIndex === 0) {
      modifiers.B.startingEffects.push({ unitId: 'yonava', effectId: 'undying', stacks: 1 });
    }
    app.startBattle({
      loadouts: { A: run.deck, B: stage.opponent },
      rules: this.makeBattleRules({ allowDuplicates: true }),
      controllers: { A: 'human', B: 'ai' },
      modifiers,
      mode: 'challenge',
      context: { mode: 'challenge', challengeId: challenge.id, stageIndex: run.stageIndex, challengeName: challenge.name, stageName: stage.name }
    });
  },

  challengeNext(app) {
    const run = Store.state.runs.challenge;
    const context = app.battleContext || {};
    if (!run || !run.active) return;
    if (context.battleResolved) return;
    context.battleResolved = true;
    const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === run.challengeId);
    if (!challenge) return;
    if (run.stageIndex < challenge.stages.length - 1) {
      run.stageIndex += 1;
      Store.recordRun('challenge', run);
      app.exitBattleTo('challenge');
      app.toast('进入第 ' + (run.stageIndex + 1) + ' 幕。', 'success');
    } else {
      this.completeChallenge(app);
    }
  },

  completeChallenge(app) {
    const run = Store.state.runs.challenge;
    if (!run) return;
    run.active = false;
    run.completed = true;
    run.failed = false;
    Store.recordRun('challenge', run);
    const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === run.challengeId);
    Store.archiveRun({ mode: 'challenge', result: '通关', detail: challenge ? challenge.name : run.challengeId, stage: run.stageIndex + 1 });
    app.exitBattleTo('challenge');
    app.toast('挑战完成。', 'success');
  },

  challengeDefeat(app) {
    const run = Store.state.runs.challenge;
    if (!run) return;
    run.active = false;
    run.failed = true;
    run.completed = false;
    Store.recordRun('challenge', run);
    Store.archiveRun({ mode: 'challenge', result: '失败', detail: (CHALLENGE_DEFINITIONS.find(item => item.id === run.challengeId) || {}).name || '', stage: run.stageIndex + 1 });
    app.exitBattleTo('challenge');
  },

  abandonChallenge(app) {
    const run = Store.state.runs.challenge;
    if (!run) return;
    app.confirm({ title: '放弃挑战', message: '当前挑战进度会被记录为放弃。可以之后重新开始。', confirmLabel: '放弃挑战', danger: true, onConfirm: () => {
      run.active = false;
      run.failed = true;
      this.storeRun('challenge', run);
      app.render();
    } });
  },

  /* ---------- Endless ---------- */
  bestEndlessLayer() {
    const history = Store.state.history || [];
    const relevant = history.filter(entry => entry.mode === 'endless');
    return relevant.reduce((max, entry) => Math.max(max, modeNumber(entry.layer)), 0);
  },

  renderEndless(app) {
    const run = Store.state.runs.endless;
    const active = run && run.active;
    const stored = this.storedDeck(app);
    const best = this.bestEndlessLayer();
    const historyCount = (Store.state.history || []).filter(entry => entry.mode === 'endless').length;
    if (active) {
      const cards = this.deckPreview(run.deck);
      const upgrades = run.upgrades || {};
      const startEffects = upgrades.startEffects || [];
      return '' +
        '<div class="page-wrap mode-page">' +
          '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ENDLESS ASCENT / LAYER ' + run.layer + '</div><h1>无尽 · 第 ' + run.layer + ' 层</h1><p>难度随层数上升。每层胜利后从三项奖励中选择一项，强化队伍并进入下一层。失败时结算到达层数。</p></div><div class="page-head-side"><span class="chip">最高到达 ' + Math.max(best, run.layer) + ' 层</span><button class="btn btn-sm btn-danger" type="button" data-action="mode-endless-abandon">结束本局</button></div></div>' +
          (run.awaitingReward ? '<div class="run-banner"><img src="assets/icons/endless.svg" alt=""><div class="grow"><strong>战利品等待选择</strong><p>选择后即可进入第 ' + run.layer + ' 层。</p></div><div class="banner-actions"><button class="btn btn-sm btn-gold" type="button" data-action="mode-endless-open-reward">选择战利品</button></div></div>' : '') +
          '<div class="endless-layout mt-2">' +
            '<div class="stack">' +
              '<section class="panel"><div class="panel-head"><div><h3>本局状态</h3><div class="panel-sub">资源与强化持续生效</div></div><span class="chip">无尽</span></div><div class="panel-body">' +
                '<div class="result-stats" style="margin-top:0"><div class="result-stat"><b>' + run.layer + '</b><span>当前层</span></div><div class="result-stat"><b>' + modeNumber(run.wins) + '</b><span>已胜场</span></div><div class="result-stat"><b>' + modeNumber(run.gold) + '</b><span>金币</span></div></div>' +
                '<div class="row wrap mt-2"><span class="chip">生命强化 +' + modeNumber(upgrades.hpFlat) + '</span><span class="chip">伤害强化 +' + modeNumber(upgrades.dmgFlat) + '</span>' + (startEffects.map(item => '<span class="chip violet">祝福 · ' + esc((Store.index.maps.effects.get(item.effectId) || { name: item.effectId }).name) + ' ×' + item.stacks + '</span>').join('')) + '</div>' +
                '<div class="progress-track mt-2"><span style="width:' + Math.min(100, 8 + run.layer * 7) + '%"></span></div><p class="field-hint mt-1">每层敌人数量、品质、属性与技能复杂度随层数提高，并获得额外规则修正。</p>' +
                '<div class="btn-row mt-2"><button class="btn btn-primary btn-lg" type="button" data-action="mode-endless-battle"' + (run.awaitingReward ? ' disabled' : '') + '>进入第 ' + run.layer + ' 层</button><button class="btn" type="button" data-action="mode-endless-view-deck">查看牌组</button></div>' +
              '</div></section>' +
              '<section class="panel"><div class="panel-head"><div><h3>下一层预览</h3><div class="panel-sub">难度按层数递增</div></div></div><div class="panel-body"><div class="layer-list">' + [1, 2, 3, 4].map(offset => { const layer = run.layer + offset; return '<div class="layer-row"><span class="layer-no">' + layer + '</span><div class="layer-main"><strong>第 ' + layer + ' 层</strong><small>' + (layer % 5 === 0 ? '精英轮换 · 额外符文' : '随机敌人 · 属性修正') + '</small></div><span class="layer-reward">' + (layer % 3 === 0 ? '强化奖励' : '战利品') + '</span></div>'; }).join('') + '</div></div></section>' +
            '</div>' +
            '<aside class="stack">' +
              '<section class="panel"><div class="panel-head"><h3>当前牌组</h3></div><div class="panel-body"><div class="run-deck-list">' + cards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? '不计数' : '计数') + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></section>' +
              '<section class="panel"><div class="panel-head"><h3>层数记录</h3></div><div class="panel-body"><div class="run-stat-row"><span>历史最高</span><b>' + Math.max(best, run.layer) + ' 层</b></div><div class="run-stat-row"><span>历史挑战</span><b>' + historyCount + ' 次</b></div><p class="field-hint mt-1">结束本局会记录当前层数。</p></div></section>' +
            '</aside>' +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div class="page-wrap mode-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ENDLESS ASCENT / RANDOMIZED</div><h1>无尽</h1><p>随机生成敌人，难度随层数上升。每层胜利后从三项奖励中选择一项强化队伍，失败时结算到达层数。</p></div><div class="page-head-side"><span class="chip">历史最高 ' + best + ' 层</span><span class="chip">挑战 ' + historyCount + ' 次</span></div></div>' +
        '<section class="mode-hero"><img class="mode-hero-icon" src="assets/icons/endless.svg" alt=""><div class="mh-main"><h2>没有终点，只有下一层</h2><p>使用我方存档牌组开始。每层敌人由随机角色、装备和符文组成，并随层数获得生命、伤害与入场效果修正。</p><div class="mh-actions"><button class="btn btn-primary" type="button" data-action="mode-endless-start">以此牌组开始</button><button class="btn" type="button" data-action="open-setup" data-mode="versus">调整我方牌组</button></div></div><span class="mode-stamp">ENDLESS / ASCENT</span></section>' +
        '<div class="endless-layout mt-3"><div class="stack"><section class="panel"><div class="panel-head"><div><h3>我方牌组</h3><div class="panel-sub">' + (stored.repaired ? '存档牌组无效，将使用推荐构筑' : '来自对战配置的当前构筑') + '</div></div></div><div class="panel-body"><div class="row wrap">' + this.deckPreview(stored.deck).units.map(unit => '<span class="chip">' + esc(unit.name) + '</span>').join('') + this.deckPreview(stored.deck).equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + this.deckPreview(stored.deck).runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></section>' +
          '<section class="panel"><div class="panel-head"><h3>难度曲线</h3></div><div class="panel-body"><div class="layer-list">' + [1, 2, 3, 4, 5].map(layer => '<div class="layer-row"><span class="layer-no">' + layer + '</span><div class="layer-main"><strong>第 ' + layer + ' 层</strong><small>' + (layer === 1 ? '三名随机敌人' : layer >= 4 ? '四人编队 / 额外符文' : '属性修正开始生效') + '</small></div><span class="layer-reward">' + (layer === 1 ? '起始' : '递增') + '</span></div>').join('') + '</div></div></section></div>' +
          '<aside class="stack"><section class="panel"><div class="panel-head"><h3>规则</h3></div><div class="panel-body"><div class="rule-principles"><div class="rule-principle"><span class="no">1</span><span>每层胜利必须选择一项战利品。</span></div><div class="rule-principle"><span class="no">2</span><span>生命与伤害强化对整局牌组生效。</span></div><div class="rule-principle"><span class="no">3</span><span>失败时记录到达层数并结束本局。</span></div><div class="rule-principle"><span class="no">4</span><span>奖励池包括角色、装备、符文、高级效果、强化与金币。</span></div></div></div></section></aside></div>' +
      '</div>';
  },

  startEndless(app) {
    const stored = this.storedDeck(app);
    if (stored.repaired) { app.toast('当前我方牌组无效，请先调整牌组。', 'error'); return; }
    const run = {
      active: true,
      layer: 1,
      wins: 0,
      gold: 30,
      deck: stored.deck,
      upgrades: { hpFlat: 0, dmgFlat: 0, startEffects: [] },
      awaitingReward: false,
      pendingRewards: [],
      startedAt: Date.now(),
      completed: false,
      failed: false
    };
    this.storeRun('endless', run);
    this.startEndlessBattle(app);
  },

  startEndlessBattle(app) {
    const run = Store.state.runs.endless;
    if (!run || !run.active) return;
    if (run.awaitingReward) { this.openPendingReward(app, 'endless'); return; }
    const layer = modeNumber(run.layer, 1);
    const kind = layer % 5 === 0 ? 'boss' : layer % 3 === 0 ? 'elite' : 'battle';
    const enemy = this.buildEnemy(layer, kind);
    app.startBattle({
      loadouts: { A: run.deck, B: enemy.loadout },
      rules: this.makeBattleRules({ allowDuplicates: true }),
      controllers: { A: 'human', B: 'ai' },
      modifiers: { A: this.playerModifiers(run), B: enemy.modifiers },
      mode: 'endless',
      context: { mode: 'endless', layer, kind }
    });
  },

  endEndless(app) {
    const run = Store.state.runs.endless;
    if (!run) return;
    app.confirm({ title: '结束无尽本局', message: '当前到达层数与强化会被结算，本局结束。', confirmLabel: '结束本局', danger: true, onConfirm: () => {
      run.active = false;
      run.failed = true;
      this.storeRun('endless', run);
      Store.archiveRun({ mode: 'endless', result: '结束', detail: '玩家主动结束无尽', layer: run.layer, wins: modeNumber(run.wins) });
      app.render();
    } });
  },

  viewDeck(app, deck) {
    const cards = this.deckPreview(deck);
    const body = '<div class="detail-section-title">角色<span class="line"></span></div><div class="stack gap-sm">' + cards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>生命 ' + unit.hp + ' · ' + (unit.counted === false ? '不计数' : '计数') + '</small></div>').join('') + '</div><div class="detail-section-title">装备与符文<span class="line"></span></div><div class="row wrap">' + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div>';
    app.openModal({ title: '当前牌组', subtitle: '角色牌进入抽牌堆；装备与符文在整备时生效。', body });
  },

  /* ---------- Action dispatch ---------- */
  handleAction(action, el, app, event) {
    if (!action || !action.startsWith('mode-')) return false;
    const data = el.dataset;
    if (this._lockAction) return true;
    switch (action) {
      case 'mode-rogue-draft':
        this.toggleRogueDraft(app, data.type, data.id);
        return true;
      case 'mode-rogue-recommended':
        this.rogueDraft = this.defaultRogueDraft();
        app.render();
        return true;
      case 'mode-rogue-start':
        this.startRogue(app);
        return true;
      case 'mode-rogue-enter':
        this.enterRogueNode(app, data.node);
        return true;
      case 'mode-rogue-event-choice':
        this.handleEventChoice(app, Number(data.index));
        return true;
      case 'mode-shop-buy':
        this.buyShop(app, Number(data.index));
        return true;
      case 'mode-shop-close-remove':
        this.openShopModal(app, Store.state.runs.rogue, Store.state.runs.rogue.map.layers.flat().find(item => item.id === this._shop.nodeId));
        return true;
      case 'mode-shop-remove-unit':
        this.removeUnitFromRun(app, Number(data.index), Number(data.unitIndex));
        return true;
      case 'mode-shop-leave': {
        const run = Store.state.runs.rogue;
        const node = run && this._shop ? run.map.layers.flat().find(item => item.id === this._shop.nodeId) : null;
        if (node) { app.closeModal(); this.advanceNode(app, node); }
        return true;
      }
      case 'mode-rest-choice':
        app.closeModal();
        this.handleRestChoice(app, data.choice);
        return true;
      case 'mode-rogue-victory':
        this.rogueVictory(app);
        return true;
      case 'mode-rogue-defeat':
        this.rogueDefeat(app);
        return true;
      case 'mode-rogue-open-reward':
        this.openPendingReward(app, 'rogue');
        return true;
      case 'mode-rogue-abandon':
        this.abandonRogue(app);
        return true;
      case 'mode-reward-take':
        this.takeReward(app, data.mode, Number(data.index));
        return true;
      case 'mode-challenge-start':
        this.startChallenge(app, data.id);
        return true;
      case 'mode-challenge-fight':
        this.startChallengeStage(app);
        return true;
      case 'mode-challenge-next':
        this.challengeNext(app);
        return true;
      case 'mode-challenge-complete':
        this.completeChallenge(app);
        return true;
      case 'mode-challenge-defeat':
        this.challengeDefeat(app);
        return true;
      case 'mode-challenge-retry': {
        const run = Store.state.runs.challenge;
        if (run && run.challengeId) {
          const id = run.challengeId;
          Store.state.runs.challenge = null;
          Store.save();
          this.startChallenge(app, id);
        }
        return true;
      }
      case 'mode-challenge-abandon':
        this.abandonChallenge(app);
        return true;
      case 'mode-challenge-view-deck': {
        const run = Store.state.runs.challenge;
        const deck = run && run.active ? run.deck : this.storedDeck(app).deck;
        this.viewDeck(app, deck);
        return true;
      }
      case 'mode-endless-start':
        this.startEndless(app);
        return true;
      case 'mode-endless-battle':
        this.startEndlessBattle(app);
        return true;
      case 'mode-endless-victory':
        this.endlessVictory(app);
        return true;
      case 'mode-endless-defeat':
        this.endlessDefeat(app);
        return true;
      case 'mode-endless-open-reward':
        this.openPendingReward(app, 'endless');
        return true;
      case 'mode-endless-view-deck': {
        const run = Store.state.runs.endless;
        if (run) this.viewDeck(app, run.deck);
        return true;
      }
      case 'mode-endless-abandon':
        this.endEndless(app);
        return true;
      default:
        return false;
    }
  }
};

window.ModesUI = ModesUI;
