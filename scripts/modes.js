/* CaeRogue - rogue, challenge, and endless mode controllers. */
'use strict';

const MODE_NODE_META = {
  battle: { label: L('ui.c03bfd0e129a'), short: L('ui.08238a2be2be'), name: L('ui.c03bfd0e129a') },
  elite: { label: L('ui.12ff86b1bfa3'), short: L('ui.fcb83b62bc0a'), name: L('ui.12ff86b1bfa3') },
  boss: { label: L('ui.9c0b4cd4df70'), short: L('ui.fe7df3634ec6'), name: L('ui.9c0b4cd4df70') },
  event: { label: L('ui.550e3280629d'), short: L('ui.aae488416289'), name: L('ui.550e3280629d') },
  shop: { label: L('ui.83eff41a2e6c'), short: L('ui.2ce413903b80'), name: L('ui.83eff41a2e6c') },
  rest: { label: L('ui.bee455dc2726'), short: L('ui.d0f183d07fcb'), name: L('ui.bee455dc2726') }
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
    return L('ui.eedf526fb64e');
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

  ensureRunLoadout(run) {
    const ownedEquipment = [...new Set((run.deck && run.deck.equipment) || [])];
    const ownedRunes = [...new Set((run.deck && run.deck.runes) || [])];
    if (!Array.isArray(run.activeEquipment)) run.activeEquipment = ownedEquipment.slice();
    else run.activeEquipment = run.activeEquipment.filter(id => ownedEquipment.includes(id));
    if (!Array.isArray(run.activeRunes)) run.activeRunes = ownedRunes.slice(0, 3);
    else run.activeRunes = run.activeRunes.filter(id => ownedRunes.includes(id)).slice(0, 3);
    return run;
  },

  battleLoadout(run) {
    this.ensureRunLoadout(run);
    const equipment = run.activeEquipment.filter(id => Store.index.maps.equipment.has(id));
    const activeRunes = run.activeRunes.filter(id => Store.index.maps.runes.has(id));
    return {
      units: (run.deck.units || []).slice(),
      equipment,
      runes: [...new Set(run.deck.runes || [])],
      activeRunes
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
      battle: [L('ui.7de4ae8ca95c'), L('ui.94205b700f71'), L('ui.32fa9eb19529')],
      elite: [L('ui.440ff5165598'), L('ui.ddb5a34d7a39')],
      boss: [L('ui.310625d7a83c'), L('ui.030cf845fe88')],
      event: [L('ui.392438324d35'), L('ui.072462aa15c6')],
      shop: [L('ui.e923af92e606'), L('ui.c0d497147ed0')],
      rest: [L('ui.b4b9e32db3a2'), L('ui.2c72cc104cd9')]
    };
    return layerTypes.map((types, layerIndex) => types.map((type, index) => ({
      id: 'r' + (layerIndex + 1) + (index === 0 ? 'a' : 'b'),
      layer: layerIndex,
      type,
      title: modeRandom(names[type] || [L('ui.e27f1d70eab1')]),
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
        title: L('ui.d62c40c0ef12'),
        text: L('ui.a66129acd398'),
        choices: [
          { text: L('ui.78c21b5807ac'), hint: L('ui.af653628fa7e'), effect: 'gold', value: 30 },
          { text: L('ui.c513456762ba'), hint: L('ui.2f403fb269c0'), effect: 'unit' }
        ]
      };
    }
    if (roll === 1) {
      return {
        kind: 'trial',
        title: L('ui.edb37e8dcd93'),
        text: L('ui.b3576680c296'),
        choices: [
          { text: L('ui.c7c3227063cc'), hint: L('ui.22ab306ded15'), effect: 'battle' },
          { text: L('ui.f780b7699371'), hint: L('ui.6cc180275b2a'), effect: 'hp', value: 1 }
        ]
      };
    }
    return {
      kind: 'rewrite',
      title: L('ui.a67caad34c88'),
      text: L('ui.b49720a70b8f'),
      choices: [
        { text: L('ui.0ab637532216'), hint: L('ui.be6a8cec050d'), effect: 'rewrite-shop' },
        { text: L('ui.3742a2d9c72e'), hint: L('ui.f06cd6b80396'), effect: 'gold', value: 40 }
      ]
    };
  },

  rewardPool(run) {
    const rewards = [];
    const guaranteedGear = [];
    const ownedUnits = new Set(run.deck.units || []);
    const availableUnits = Store.index.units.filter(unit => !ownedUnits.has(unit.id));
    if (availableUnits.length) {
      const unit = modeRandom(availableUnits);
      rewards.push({ kind: 'unit', id: unit.id, title: unit.name, desc: L('ui.21a4cc465cf8') + unit.hp + '，' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '。' });
    }
    if ((run.deck.equipment || []).length < 6 && Store.index.equipment.length) {
      const gear = modeRandom(Store.index.equipment);
      const reward = { kind: 'equipment', id: gear.id, title: gear.name, desc: L('ui.ed99f51a9c3b') + (modSummary(gear.mods, true) || '') };
      rewards.push(reward);
      guaranteedGear.push(reward);
    }
    if ((run.deck.runes || []).length < 6 && Store.index.runes.length) {
      const rune = modeRandom(Store.index.runes);
      const reward = { kind: 'rune', id: rune.id, title: rune.name, desc: L('ui.864bdea5847e') + (modSummary(rune.mods, true) || '') };
      rewards.push(reward);
      guaranteedGear.push(reward);
    }
    const positiveEffects = Store.index.effects.filter(effect => effect.type === 'positive');
    if (positiveEffects.length && (!run.upgrades || !run.upgrades.startEffects || run.upgrades.startEffects.length < 3)) {
      const effect = modeRandom(positiveEffects);
      rewards.push({ kind: 'effect', id: effect.id, title: L('ui.4a688a75762a') + effect.name, desc: L('ui.68b7f3139fb4') + effect.name + L('ui.9e97acf1c2c2') });
    }
    rewards.push({ kind: 'upgradeHp', title: L('ui.09a189a8bdcf'), desc: L('ui.d7e00031b670') });
    rewards.push({ kind: 'upgradeDmg', title: L('ui.4bc3136c40e6'), desc: L('ui.e0dc3db4d789') });
    rewards.push({ kind: 'gold', title: L('ui.a345c8d0df9a'), desc: L('ui.bcfa71000a12') });
    const shuffled = modeShuffle(rewards);
    const result = [];
    const kinds = new Set();
    if (guaranteedGear.length) {
      const guaranteed = modeRandom(guaranteedGear);
      result.push(guaranteed);
      kinds.add(guaranteed.kind);
    }
    for (const reward of shuffled) {
      if (result.length >= 3) break;
      if (result.includes(reward)) continue;
      if (kinds.has(reward.kind)) continue;
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
    if (reward.kind === 'unit') { run.deck.units.push(reward.id); app.toast(L('ui.9c9caa9a2a06') + reward.title + L('ui.3f0443ece9d6'), 'success'); }
    else if (reward.kind === 'equipment') {
      run.deck.equipment.push(reward.id);
      this.ensureRunLoadout(run);
      if (!run.activeEquipment.includes(reward.id)) run.activeEquipment.push(reward.id);
      app.toast(L('ui.aa958bd27769'), 'success');
    }
    else if (reward.kind === 'rune') {
      run.deck.runes.push(reward.id);
      this.ensureRunLoadout(run);
      if (!run.activeRunes.includes(reward.id) && run.activeRunes.length < 3) run.activeRunes.push(reward.id);
      app.toast(L('ui.e9efb0ced6c6'), 'success');
    }
    else if (reward.kind === 'effect') { run.upgrades.startEffects = run.upgrades.startEffects || []; run.upgrades.startEffects.push({ effectId: reward.id, stacks: 2 }); app.toast(L('ui.d972ce84852b'), 'success'); }
    else if (reward.kind === 'upgradeHp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + 2; app.toast(L('ui.f7545f74aa97'), 'success'); }
    else if (reward.kind === 'upgradeDmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + 1; app.toast(L('ui.d85e0f0048eb'), 'success'); }
    else if (reward.kind === 'gold') { run.gold = modeNumber(run.gold) + 35; app.toast(L('ui.bcfa71000a12'), 'success'); }
  },

  openPendingReward(app, mode) {
    const run = Store.state.runs[mode];
    if (!run || !run.active || !run.awaitingReward) return;
    if (!Array.isArray(run.pendingRewards) || !run.pendingRewards.length) this.generateRewards(run);
    const rewards = run.pendingRewards || [];
    const body = L('ui.b54a8c6791bc') +
      rewards.map((reward, index) => '<button class="reward-card" type="button" data-action="mode-reward-take" data-mode="' + mode + '" data-index="' + index + '"><strong>' + esc(reward.title) + '</strong><small>' + esc(reward.desc) + '</small></button>').join('') +
    L('ui.dd3d8aa380af') + modeNumber(run.gold) + ' · ' + (mode === 'rogue' ? L('ui.a95bd4d8b78b') : L('ui.9b2d0bb7c8d0')) + '</div>';
    app.openModal({ title: L('ui.fc50d0b122ba'), subtitle: mode === 'rogue' ? L('ui.f495347d6acf') + (run.currentLayer + 1) + L('ui.e15e25b92a0f') : L('ui.a94e884b071c') + (run.wins || 1) + L('ui.74b983070a79'), closable: false, body, foot: L('ui.20faa3e1f9bc') });
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
      result: completed ? L('ui.fae07039a5dc') : L('ui.3e3c8068bb0e'),
      detail: completed ? L('ui.2871f6de8fea') : L('ui.4e6e06106073'),
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
    const error = !selectedUnits.length ? L('ui.563310cf1837') : !counted ? L('ui.7cf719f84fe4') : '';
    const cardButton = (type, card, selected) => '<button class="choice-card' + (selected ? ' selected' : '') + '" type="button" data-action="mode-rogue-draft" data-type="' + type + '" data-id="' + attr(card.id) + '"><span class="choice-mark">' + (selected ? L('ui.471c7b464c0a') : '+') + '</span><span class="choice-main"><strong>' + esc(card.name) + '</strong><small>' + qualityBadge(card.quality) + ' ' + (type === 'unit' ? L('ui.11d4fcf2be9c') + card.hp + ' · ' + ((RESISTANCE_TYPES[card.resistance.type] || { label: L('ui.aa8457052a32') }).label) + ' ' + card.resistance.value + ' · ' + (card.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) : (modSummary(card.mods, true) || L('ui.d9f936d25fe4'))) + '</small></span></button>';
    const unitPool = Store.index.units.slice();
    const gearPool = Store.index.equipment.slice();
    const runePool = Store.index.runes.slice();
    const lastSummary = previous && !previous.active ? L('ui.75d1aaa20fe0') + (previous.completed ? L('ui.08f5a7c8ca7c') : L('ui.3726e5905da9')) + '</div></div><span class="chip">' + (previous.completed ? L('ui.fae07039a5dc') : L('ui.3e3c8068bb0e')) + L('ui.8fba690aa1a9') + (modeNumber(previous.currentLayer) + 1) + L('ui.9578a71936bd') + modeNumber(previous.wins) + L('ui.40536a8c1ddb') + modeNumber(previous.gold) + '</b></div></div></section>' : '';
    return '' +
      '<div class="page-wrap mode-page">' +
        L('ui.288f438232a2') +
        L('ui.a4ac8ef62c3b') +
        (lastSummary ? '<div class="mt-3">' + lastSummary + '</div>' : '') +
        L('ui.6b004c51a27b') +
          '<div class="rogue-start-grid">' +
            L('ui.a5d47dcff916') + selectedUnits.length + ' / 4</div></div></div><div class="panel-body"><div class="choice-list">' + unitPool.map(unit => cardButton('unit', unit, draft.units.includes(unit.id))).join('') + '</div></div></section>' +
            L('ui.524e1afd96a6') + draft.equipment.length + ' / 2</div></div></div><div class="panel-body"><div class="choice-list">' + (gearPool.length ? gearPool.map(gear => cardButton('equipment', gear, draft.equipment.includes(gear.id))).join('') : L('ui.2177237ee46e')) + '</div></div></section>' +
            L('ui.34261358dd20') + draft.runes.length + ' / 3</div></div></div><div class="panel-body"><div class="choice-list">' + (runePool.length ? runePool.map(rune => cardButton('rune', rune, draft.runes.includes(rune.id))).join('') : L('ui.a349678d618d')) + '</div></div></section>' +
          '</div>' +
          '<div class="panel mt-2"><div class="panel-body"><div class="row between wrap"><div><div class="row wrap"><span class="chip ' + (counted ? 'green' : 'red') + L('ui.3721873ec5d5') + counted + L('ui.17cc746a891f') + selectedUnits.length + L('ui.a3c2cec40651') + draft.equipment.length + L('ui.81a0b705a228') + draft.runes.length + L('ui.aa22f2486ba7') + (error ? ' disabled' : '') + L('ui.79b0349a7667') + (error ? '<div class="notice danger mt-2">' + esc(error) + '</div>' : '') + '</div></div>' +
        '</div>' +
      '</div>';
  },

  renderRogueRun(app, run) {
    this.ensureRunLoadout(run);
    const map = run.map && Array.isArray(run.map.layers) ? run.map : { layers: this.createRogueMap() };
    if (!run.map) { run.map = map; this.storeRun('rogue', run); }
    const layersHtml = map.layers.map((nodes, layerIndex) => {
      const isCurrentLayer = layerIndex === run.currentLayer;
      return L('ui.33fe5ef54ae2') + (layerIndex + 1) + L('ui.26c389b9fb64') + nodes.map(node => {
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
        L('ui.6d9238893180') + (run.currentLayer + 1) + L('ui.5adccffcacc0') +
        (run.awaitingReward ? L('ui.51b56ab59882') : '') +
        '<div class="run-layout mt-2">' +
          L('ui.5d2dc4123314') + (run.completed ? L('ui.33246f6a5e5b') : L('ui.1d171c7b3ca1') + (run.currentLayer + 1) + ' / 7') + '</span></div><div class="rogue-map">' + layersHtml + L('ui.031b23a812d1') +
          '<aside class="run-sidebar">' +
            L('ui.6e88098750d8') +
              L('ui.1ef80580c140') + (run.currentLayer + 1) + ' / 7</b></div>' +
              L('ui.b379b3ec53b6') + modeNumber(run.gold) + '</b></div>' +
              L('ui.d21ce632e202') + modeNumber(run.wins) + '</b></div>' +
              L('ui.2f28fcd3704d') + modeNumber(upgrades.hpFlat) + '</b></div>' +
              L('ui.0278a547fffe') + modeNumber(upgrades.dmgFlat) + '</b></div>' +
              L('ui.cc7a659b28cb') + (startEffects.length ? startEffects.map(item => '<span class="chip violet">' + esc((Store.index.maps.effects.get(item.effectId) || { name: item.effectId }).name) + ' ×' + item.stacks + '</span>').join('') : L('ui.ddedd16c5c79')) + '</div>' +
            '</div></section>' +
            L('ui.9033b2bd3bc2') + deckCards.units.length + L('ui.5fa026d18910') + (run.activeEquipment || []).length + L('ui.5804d65c8bf5') + (run.activeRunes || []).length + L('ui.c203c5fd39ee') + deckCards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + (run.activeEquipment || []).map(id => Store.index.maps.equipment.get(id)).filter(Boolean).map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + (run.activeRunes || []).map(id => Store.index.maps.runes.get(id)).filter(Boolean).map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + L('ui.37e626936ee7') +
            L('ui.8e045c395393') +
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
    else { app.toast(L('ui.04b17ac0e431') + max + L('ui.95de7c05ec60'), 'error'); return; }
    app.render();
  },

  startRogue(app) {
    this._shop = null;
    const draft = this.ensureRogueDraft();
    const units = draft.units.slice();
    if (!units.length) { app.toast(L('ui.563310cf1837'), 'error'); return; }
    const counted = units.map(id => Store.index.maps.units.get(id)).filter(Boolean).filter(unit => unit.counted !== false);
    if (!counted.length) { app.toast(L('ui.7cf719f84fe4'), 'error'); return; }
    const run = {
      active: true,
      completed: false,
      failed: false,
      map: { layers: this.createRogueMap() },
      currentLayer: 0,
      currentNodeId: null,
      deck: { units, equipment: draft.equipment.slice(), runes: draft.runes.slice() },
      activeEquipment: draft.equipment.slice(),
      activeRunes: draft.runes.slice(0, 3),
      gold: 60,
      wins: 0,
      upgrades: { hpFlat: 0, dmgFlat: 0, startEffects: [] },
      awaitingReward: false,
      pendingRewards: [],
      startedAt: Date.now()
    };
    this.storeRun('rogue', run);
    app.render();
    app.toast(L('ui.b5c77f9583cc'), 'success');
  },

  enterRogueNode(app, nodeId) {
    const run = Store.state.runs.rogue;
    if (!run || !run.active) return;
    if (run.awaitingReward) { app.toast(L('ui.61a240ffaa10'), 'error'); this.openPendingReward(app, 'rogue'); return; }
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
        A: this.battleLoadout(run),
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
    app.openModal({ title: event.title, subtitle: L('ui.d6597568ec62') + (node.layer + 1) + L('ui.74b983070a79'), size: 'small', body });
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
      app.toast(L('ui.1f5565c15f9b') + choice.value + L('ui.135132e08b2c'), 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'hp') {
      run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + modeNumber(choice.value);
      app.toast(L('ui.079b12747387'), 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'unit') {
      const currentUnits = new Set(run.deck.units);
      const candidates = Store.index.units.filter(unit => !currentUnits.has(unit.id) && unit.counted !== false);
      const pick = candidates.length ? modeRandom(candidates) : null;
      if (pick) {
        run.deck.units.push(pick.id);
        app.toast('「' + pick.name + L('ui.d1f5c3fd312c'), 'success');
      } else {
        run.gold = modeNumber(run.gold) + 40;
        app.toast(L('ui.2a34fd215c37'), 'success');
      }
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'rewrite-shop') {
      const nextLayer = node.layer + 1;
      if (run.map.layers[nextLayer]) {
        run.map.layers[nextLayer].forEach((item, idx) => {
          item.type = 'shop';
          item.title = idx === 0 ? L('ui.6259338b008d') : L('ui.b186b64e8f2d');
          item.event = null;
        });
      }
      app.toast(L('ui.bae464a54988'), 'success');
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
    const required = [];
    const optional = [];
    const owned = new Set(run.deck.units);
    const candidates = Store.index.units.filter(unit => !owned.has(unit.id));
    if (candidates.length) {
      const unit = modeRandom(candidates);
      optional.push({ kind: 'unit', id: unit.id, title: unit.name, desc: L('ui.3fa6e6baec47') + unit.hp, price: 35, sold: false });
    }
    if (Store.index.equipment.length && (run.deck.equipment || []).length < 6) {
      const gear = modeRandom(Store.index.equipment);
      required.push({ kind: 'equipment', id: gear.id, title: gear.name, desc: L('ui.56bd2bba6de9') + (modSummary(gear.mods, true) || L('ui.455d56230713')), price: 25, sold: false });
    }
    if (Store.index.runes.length && (run.deck.runes || []).length < 6) {
      const rune = modeRandom(Store.index.runes);
      required.push({ kind: 'rune', id: rune.id, title: rune.name, desc: L('ui.644e0790b977') + (modSummary(rune.mods, true) || L('ui.455d56230713')), price: 25, sold: false });
    }
    optional.push({ kind: 'upgradeHp', title: L('ui.09a189a8bdcf'), desc: L('ui.100f07370663'), price: 30, sold: false });
    optional.push({ kind: 'upgradeDmg', title: L('ui.4bc3136c40e6'), desc: L('ui.96b27500cc62'), price: 30, sold: false });
    if ((run.deck.units || []).length > 1) optional.push({ kind: 'removeUnit', title: L('ui.78b88aacca2f'), desc: L('ui.68289ce53a44'), price: 20, sold: false });
    return required.concat(modeShuffle(optional).slice(0, Math.max(2, 4 - required.length)));
  },

  openShopModal(app, run, node) {
    if (!this._shop || this._shop.nodeId !== node.id) this._shop = { nodeId: node.id, offers: this.shopOffers(run) };
    const offers = this._shop.offers;
    const body = L('ui.21df8512dba5') + modeNumber(run.gold) + L('ui.49beee3e4a54') + offers.map((offer, index) => '<div class="shop-item' + (offer.sold ? ' sold' : '') + '"><img src="' + (offer.kind === 'unit' ? attr(cardArt(Store.index.maps.units.get(offer.id) || {})) : offer.kind === 'rune' ? 'assets/pictures/rune-art.svg' : 'assets/pictures/equipment-soap.svg') + '" alt=""><div class="grow"><strong>' + esc(offer.title) + '</strong><small>' + esc(offer.desc) + '</small><div class="price">' + (offer.sold ? L('ui.c9d7f9ccccc9') : offer.price + L('ui.18780ade69b4')) + '</div></div>' + (offer.sold ? '' : '<button class="btn btn-sm" type="button" data-action="mode-shop-buy" data-index="' + index + '"' + (run.gold < offer.price ? ' disabled' : '') + L('ui.228724ff13d4')) + '</div>').join('') + L('ui.06414a5ebe45');
    app.openModal({ title: L('ui.e923af92e606'), subtitle: L('ui.f495347d6acf') + (node.layer + 1) + L('ui.002daf7ba36d'), body, foot: L('ui.fe4e1ca70d14') + modeNumber(run.gold) + L('ui.efcd594890e9') });
  },

  buyShop(app, index) {
    const run = Store.state.runs.rogue;
    if (!run || !this._shop) return;
    const offer = this._shop.offers[index];
    if (!offer || offer.sold) return;
    if (modeNumber(run.gold) < offer.price) { app.toast(L('ui.9ffa872e8a9e'), 'error'); return; }
    if (offer.kind === 'removeUnit') { this.openRemoveUnitModal(app, run, offer, index); return; }
    run.gold -= offer.price;
    offer.sold = true;
    this.applyReward(app, run, offer);
    this.storeRun('rogue', run);
    const node = run.map.layers.flat().find(item => item.id === this._shop.nodeId);
    if (node) this.openShopModal(app, run, node);
  },

  openRemoveUnitModal(app, run, offer, index) {
    const body = L('ui.7b1dec0016bd') + offer.price + L('ui.43525c9e0c23') +
      (run.deck.units || []).map((unitId, unitIndex) => {
        const unit = Store.index.maps.units.get(unitId);
        if (!unit) return '';
        return '<button class="choice-card" type="button" data-action="mode-shop-remove-unit" data-index="' + index + '" data-unit-index="' + unitIndex + '"><span class="choice-mark">' + (unit.counted === false ? L('ui.748eed1c9629') : L('ui.94da9e6f36bd')) + '</span><span class="choice-main"><strong>' + esc(unit.name) + L('ui.8e2355a4acc3') + unit.hp + ' · ' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.64e904249960')) + L('ui.05699521d07b');
      }).join('') +
    L('ui.2e2353095172');
    app.openModal({ title: L('ui.787c4122ef22'), subtitle: L('ui.3d7bd26bbce7'), body, foot: L('ui.adf574d35d28') });
  },

  removeUnitFromRun(app, index, unitIndex) {
    const run = Store.state.runs.rogue;
    if (!run || !this._shop) return;
    const offer = this._shop.offers[index];
    const unitId = (run.deck.units || [])[unitIndex];
    if (!offer || offer.sold || !unitId) return;
    if (modeNumber(run.gold) < offer.price) { app.toast(L('ui.9ffa872e8a9e'), 'error'); return; }
    const remaining = run.deck.units.filter((id, idx) => idx !== unitIndex);
    const counted = remaining.map(id => Store.index.maps.units.get(id)).filter(unit => unit && unit.counted !== false);
    if (!counted.length) { app.toast(L('ui.b325803275b1'), 'error'); return; }
    run.gold -= offer.price;
    offer.sold = true;
    run.deck.units.splice(unitIndex, 1);
    this.storeRun('rogue', run);
    app.toast(L('ui.b2d94a0163f9') + offer.price + L('ui.135132e08b2c'), 'success');
    const node = run.map.layers.flat().find(item => item.id === this._shop.nodeId);
    if (node) this.openShopModal(app, run, node);
  },

  openRestModal(app, run, node) {
    const body = L('ui.473ab5a2fb1b') +
      L('ui.a8480dd56c3e') +
      L('ui.7a956ffbfe46') +
      L('ui.98c79c52ffa1') +
      L('ui.9d7a627e2bb9') +
      L('ui.76e20149ca53') +
    '</div>';
    app.openModal({ title: L('ui.bee455dc2726'), subtitle: L('ui.f495347d6acf') + (node.layer + 1) + L('ui.65be5404de39'), size: 'small', body });
  },

  handleRestChoice(app, choice) {
    const run = Store.state.runs.rogue;
    if (!run || !run.currentNodeId) return;
    const node = run.map.layers.flat().find(item => item.id === run.currentNodeId);
    if (!node) return;
    if (choice === 'hp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + 2; app.toast(L('ui.575a1133ed69'), 'success'); }
    else if (choice === 'dmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + 1; app.toast(L('ui.52c1ca71b836'), 'success'); }
    else if (choice === 'gear') {
      const owned = new Set(run.deck.equipment || []);
      const candidates = Store.index.equipment.filter(item => !owned.has(item.id));
      const gear = candidates.length ? modeRandom(candidates) : null;
      if (gear) {
        run.deck.equipment.push(gear.id);
        this.ensureRunLoadout(run);
        if (!run.activeEquipment.includes(gear.id)) run.activeEquipment.push(gear.id);
        app.toast(L('ui.2667c8ca1853') + gear.name + '」。', 'success');
      } else { run.gold = modeNumber(run.gold) + 25; app.toast(L('ui.d6353723cb4a'), 'success'); }
    } else if (choice === 'rune') {
      const owned = new Set(run.deck.runes || []);
      const candidates = Store.index.runes.filter(item => !owned.has(item.id));
      const rune = candidates.length ? modeRandom(candidates) : null;
      if (rune) {
        run.deck.runes.push(rune.id);
        this.ensureRunLoadout(run);
        if (run.activeRunes.length < 3) run.activeRunes.push(rune.id);
        app.toast(L('ui.146c79ec28b5') + rune.name + '」。', 'success');
      } else { run.gold = modeNumber(run.gold) + 25; app.toast(L('ui.c85a704238b6'), 'success'); }
    } else { run.gold = modeNumber(run.gold) + 30; app.toast(L('ui.af653628fa7e'), 'success'); }
    this.storeRun('rogue', run);
    this.advanceNode(app, node);
  },

  abandonRogue(app) {
    const run = Store.state.runs.rogue;
    if (!run) return;
    app.confirm({ title: L('ui.e0ef7b226cc6'), message: L('ui.1e5686f8f90c'), confirmLabel: L('ui.f9e1958b12fd'), danger: true, onConfirm: () => {
      run.active = false;
      run.failed = true;
      run.completed = false;
      this.storeRun('rogue', run);
      Store.archiveRun({ mode: 'rogue', result: L('ui.b8a81b7a9cf8'), detail: L('ui.7695e8766410'), layer: run.currentLayer + 1, wins: run.wins || 0 });
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

  /* ---------- Pre-battle loadout ---------- */
  openLoadoutModal(app, mode) {
    const run = Store.state.runs[mode];
    if (!run || !run.active) return;
    this.ensureRunLoadout(run);
    this._loadoutDraft = {
      mode,
      equipment: run.activeEquipment.slice(),
      runes: run.activeRunes.slice(0, 3)
    };
    this.renderLoadoutModal(app);
  },

  renderLoadoutModal(app) {
    const run = Store.state.runs[this._loadoutDraft.mode];
    if (!run) return;
    const draft = this._loadoutDraft;
    const equipmentPool = [...new Set((run.deck.equipment || []))].map(id => Store.index.maps.equipment.get(id)).filter(Boolean);
    const runePool = [...new Set((run.deck.runes || []))].map(id => Store.index.maps.runes.get(id)).filter(Boolean);
    const equipmentRows = equipmentPool.length ? equipmentPool.map(item => {
      const selected = draft.equipment.includes(item.id);
      return '<div class="loadout-item' + (selected ? ' selected' : '') + '"><button class="loadout-toggle" type="button" data-action="mode-loadout-toggle-equipment" data-id="' + attr(item.id) + '"><span class="loadout-check">' + (selected ? L('ui.83f9b608c710') : L('ui.670bd9f23871')) + '</span><span class="loadout-main"><strong>' + esc(item.name) + '</strong><small>' + esc((item.slot === 'weapon' ? L('ui.6f0f16e0c098') : L('ui.2074803effdd')) + ' · ' + (modSummary(item.mods, true) || L('ui.455d56230713'))) + '</small></span>' + qualityBadge(item.quality) + '</button><button class="loadout-destroy" type="button" data-action="mode-loadout-destroy-equipment" data-id="' + attr(item.id) + L('ui.1de54ec6b05b');
    }).join('') : L('ui.aa70ac40be6f');
    const runeRows = runePool.length ? runePool.map(item => {
      const selected = draft.runes.includes(item.id);
      return '<button class="loadout-item rune' + (selected ? ' selected' : '') + '" type="button" data-action="mode-loadout-toggle-rune" data-id="' + attr(item.id) + '"><span class="loadout-check">' + (selected ? L('ui.d4e9ca3dd494') : L('ui.1a0db8dc434c')) + '</span><span class="loadout-main"><strong>' + esc(item.name) + '</strong><small>' + esc(modSummary(item.mods, true) || L('ui.455d56230713')) + '</small></span>' + qualityBadge(item.quality) + '</button>';
    }).join('') : L('ui.2a18dd90f485');
    app.openModal({
      title: L('ui.57993eef61b4') + (this._loadoutDraft.mode === 'rogue' ? L('ui.85646631c0e1') : L('ui.fb68101a77f8')),
      subtitle: L('ui.231ad523fcfa'),
      size: 'large',
      body: L('ui.4ec17c260ddb') + draft.equipment.length + L('ui.55d8318eec45') + equipmentRows + L('ui.6641680ff3d1') + draft.runes.length + L('ui.8cb9a693fdb2') + runeRows + '</div></section></div>',
      foot: L('ui.266af4a7778f') + (run.deck.units || []).length + L('ui.d65a0a66148c') + equipmentPool.length + L('ui.b604c4619b70') + runePool.length + L('ui.fbb852a2594a')
    });
  },

  toggleLoadoutEquipment(app, id) {
    if (!this._loadoutDraft) return;
    const list = this._loadoutDraft.equipment;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
    this.renderLoadoutModal(app);
  },

  toggleLoadoutRune(app, id) {
    if (!this._loadoutDraft) return;
    const list = this._loadoutDraft.runes;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else if (list.length >= 3) { app.toast(L('ui.a24a5da5855e'), 'error'); return; }
    else list.push(id);
    this.renderLoadoutModal(app);
  },

  destroyLoadoutEquipment(app, id) {
    const mode = this._loadoutDraft && this._loadoutDraft.mode;
    const run = mode && Store.state.runs[mode];
    if (!run) return;
    const idx = (run.deck.equipment || []).indexOf(id);
    if (idx < 0) return;
    run.deck.equipment.splice(idx, 1);
    run.activeEquipment = (run.activeEquipment || []).filter(item => item !== id);
    this._loadoutDraft.equipment = this._loadoutDraft.equipment.filter(item => item !== id);
    this.storeRun(mode, run);
    this.renderLoadoutModal(app);
    app.toast(L('ui.3274fc353b45'), 'success');
  },

  saveLoadout(app) {
    const draft = this._loadoutDraft;
    if (!draft) return;
    const run = Store.state.runs[draft.mode];
    if (!run) return;
    const ownedEquipment = new Set(run.deck.equipment || []);
    const ownedRunes = new Set(run.deck.runes || []);
    run.activeEquipment = draft.equipment.filter(id => ownedEquipment.has(id));
    run.activeRunes = draft.runes.filter(id => ownedRunes.has(id)).slice(0, 3);
    this.storeRun(draft.mode, run);
    this._loadoutDraft = null;
    app.closeModal(true);
    app.render();
    app.toast(L('ui.1797a38e63cf'), 'success');
  },

  /* ---------- Battle outcomes ---------- */
  battleResultActions(context, battle, summary, app) {
    context = context || {};
    const playerWin = battle.winner === 'A';
    if (context.mode === 'rogue') {
      if (playerWin) return [{ label: context.nodeType === 'boss' ? L('ui.8abb78cb1b85') : L('ui.d5d5e379b626'), action: 'mode-rogue-victory', kind: 'primary' }];
      return [{ label: L('ui.88d165fb89ab'), action: 'mode-rogue-defeat', kind: 'danger' }];
    }
    if (context.mode === 'challenge') {
      const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === context.challengeId);
      const isLast = challenge && context.stageIndex >= challenge.stages.length - 1;
      if (playerWin) return [{ label: isLast ? L('ui.e35e668dd7ec') : L('ui.8673d59b4cba'), action: isLast ? 'mode-challenge-complete' : 'mode-challenge-next', kind: 'primary' }];
      return [{ label: L('ui.14638b5f0f96'), action: 'mode-challenge-defeat', kind: 'danger' }];
    }
    if (context.mode === 'endless') {
      if (playerWin) return [{ label: L('ui.de31c16755a5'), action: 'mode-endless-victory', kind: 'primary' }];
      return [{ label: L('ui.25ac0aa27500'), action: 'mode-endless-defeat', kind: 'danger' }];
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
    Store.archiveRun({ mode: 'rogue', result: L('ui.3e3c8068bb0e'), detail: L('ui.2991edb61257'), layer: run.currentLayer + 1, wins: run.wins || 0 });
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
    Store.archiveRun({ mode: 'endless', result: L('ui.3e3c8068bb0e'), detail: L('ui.6de0c27e1b7a'), layer: run.layer, wins: modeNumber(run.wins) });
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
      return L('ui.91ce5653de6e') + esc(challenge ? challenge.name : L('ui.9294c931e171')) + L('ui.11f8fe25c36e') + (activeRun.stageIndex + 1) + ' / ' + (challenge ? challenge.stages.length : '?') + L('ui.1a033f436ed8') + esc(stage ? stage.name : '') + L('ui.d96201dcece1') + (activeRun.stageIndex + 1) + L('ui.0ed208779b09');
    })() : '';
    const failedRun = run && !run.active ? L('ui.7b7db09e0279') + (run.completed ? L('ui.e99b48a29bdf') : L('ui.b61b08aec3a9')) + '。' + (run.completed ? L('ui.4b11d45a4aff') : L('ui.1a3ef1f1a4f7')) + '</span>' + (!run.completed && run.challengeId ? L('ui.e2fc96c3d7aa') : '') + '</div></div>' : '';
    return '' +
      '<div class="page-wrap mode-page">' +
        L('ui.2087685dc16a') + (stored.repaired ? 'red' : 'green') + '">' + (stored.repaired ? L('ui.cd7b9cd6e35d') : L('ui.de37b61d0f38')) + L('ui.8c8e0317b864') +
        L('ui.f0e1cd058a68') +
        (stored.repaired ? L('ui.f0b8788fde7b') : '') +
        (runBanner ? '<div class="mt-2">' + runBanner + '</div>' : '') + failedRun +
        L('ui.f2660a038f4c') + cards.units.length + L('ui.2ef5f8c5c834') + counts + L('ui.39c472040790') + cards.equipment.length + L('ui.03befcf868ca') + cards.runes.length + L('ui.27205cbe2719') +
          CHALLENGE_DEFINITIONS.map((challenge, index) => {
            const artUnit = challenge.id === 'challenge_curse' ? 'yonava' : challenge.id === 'challenge_endless' ? 'catgirl_jk' : 'philia093';
            const art = (Store.index.maps.units.get(artUnit) || {}).art || 'assets/pictures/unit-philia.svg';
            const isActive = activeRun && activeRun.challengeId === challenge.id;
            const blockedByOther = activeRun && !isActive;
            return '<article class="panel challenge-card"><div class="challenge-art"><img src="' + attr(art) + '" alt=""><span class="ch-tag">' + esc(challenge.tag) + '</span><span class="ch-name">' + esc(challenge.name) + '</span></div><div class="challenge-body"><p>' + esc(challenge.description) + '</p><div class="challenge-stages">' + challenge.stages.map((stage, stageIndex) => '<div class="challenge-stage-row"><span class="stage-no">' + (stageIndex + 1) + '</span><span>' + esc(stage.name) + '</span><small>' + esc(stage.rule && stage.rule.modifier ? stage.rule.modifier : L('ui.68e99292d125')) + '</small></div>').join('') + '</div><button class="btn ' + (isActive ? 'btn-primary' : '') + '" type="button" data-action="' + (isActive ? 'mode-challenge-fight' : 'mode-challenge-start') + '" data-id="' + attr(challenge.id) + '"' + (blockedByOther ? ' disabled' : '') + '>' + (isActive ? L('ui.ea0a3697e479') : blockedByOther ? L('ui.eb5e9fb40d37') : L('ui.b77dfdad2269')) + '</button></div></article>';
          }).join('') +
        '</div></div>' +
        L('ui.7575dea8793b') + cards.units.map(unit => '<span class="chip">' + esc(unit.name) + '</span>').join('') + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></div>' +
      '</div>';
  },

  startChallenge(app, challengeId) {
    const existing = Store.state.runs.challenge;
    if (existing && existing.active) {
      app.toast(L('ui.ee8ae2d00079'), 'error');
      return;
    }
    const challenge = CHALLENGE_DEFINITIONS.find(item => item.id === challengeId);
    if (!challenge) return;
    const stored = this.storedDeck(app);
    if (stored.repaired) {
      app.toast(L('ui.ebb9b18bb0b0'), 'error');
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
      app.toast(L('ui.561845da102c') + (run.stageIndex + 1) + L('ui.b0d6337a66f0'), 'success');
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
    Store.archiveRun({ mode: 'challenge', result: L('ui.fae07039a5dc'), detail: challenge ? challenge.name : run.challengeId, stage: run.stageIndex + 1 });
    app.exitBattleTo('challenge');
    app.toast(L('ui.76dc0d0ecade'), 'success');
  },

  challengeDefeat(app) {
    const run = Store.state.runs.challenge;
    if (!run) return;
    run.active = false;
    run.failed = true;
    run.completed = false;
    Store.recordRun('challenge', run);
    Store.archiveRun({ mode: 'challenge', result: L('ui.3e3c8068bb0e'), detail: (CHALLENGE_DEFINITIONS.find(item => item.id === run.challengeId) || {}).name || '', stage: run.stageIndex + 1 });
    app.exitBattleTo('challenge');
  },

  abandonChallenge(app) {
    const run = Store.state.runs.challenge;
    if (!run) return;
    app.confirm({ title: L('ui.0431d5ddd3c4'), message: L('ui.de7bafc6d7ed'), confirmLabel: L('ui.0431d5ddd3c4'), danger: true, onConfirm: () => {
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
      this.ensureRunLoadout(run);
      const cards = this.deckPreview(run.deck);
      const upgrades = run.upgrades || {};
      const startEffects = upgrades.startEffects || [];
      return '' +
        '<div class="page-wrap mode-page">' +
          '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ENDLESS ASCENT / LAYER ' + run.layer + L('ui.64d1e1555d01') + run.layer + L('ui.b377b6973e62') + Math.max(best, run.layer) + L('ui.9caf006993cb') +
          (run.awaitingReward ? L('ui.8627adcf1292') + run.layer + L('ui.53384de97965') : '') +
          '<div class="endless-layout mt-2">' +
            '<div class="stack">' +
              L('ui.873bc77973c5') +
                '<div class="result-stats" style="margin-top:0"><div class="result-stat"><b>' + run.layer + L('ui.83199be44d01') + modeNumber(run.wins) + L('ui.f86658598113') + modeNumber(run.gold) + L('ui.838d617575a2') +
                L('ui.80828744e39f') + modeNumber(upgrades.hpFlat) + L('ui.f209adea79c8') + modeNumber(upgrades.dmgFlat) + '</span>' + (startEffects.map(item => L('ui.e1b32b38e61a') + esc((Store.index.maps.effects.get(item.effectId) || { name: item.effectId }).name) + ' ×' + item.stacks + '</span>').join('')) + '</div>' +
                '<div class="progress-track mt-2"><span style="width:' + Math.min(100, 8 + run.layer * 7) + L('ui.5f70f2f622c8') +
                '<div class="btn-row mt-2"><button class="btn btn-primary btn-lg" type="button" data-action="mode-endless-battle"' + (run.awaitingReward ? ' disabled' : '') + L('ui.cff0e1cdf1fe') + run.layer + L('ui.c57aad91eb14') +
              '</div></section>' +
              L('ui.baf7f1926075') + [1, 2, 3, 4].map(offset => { const layer = run.layer + offset; return '<div class="layer-row"><span class="layer-no">' + layer + L('ui.921c3e0df8ad') + layer + L('ui.ccfd77d07e56') + (layer % 5 === 0 ? L('ui.afdbca0747b2') : L('ui.974c9d35dfb4')) + '</small></div><span class="layer-reward">' + (layer % 3 === 0 ? L('ui.c17a54a1745f') : L('ui.34b4e7dab975')) + '</span></div>'; }).join('') + '</div></div></section>' +
            '</div>' +
            '<aside class="stack">' +
              L('ui.b807bab8993c') + cards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + (run.activeEquipment || []).map(id => Store.index.maps.equipment.get(id)).filter(Boolean).map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + (run.activeRunes || []).map(id => Store.index.maps.runes.get(id)).filter(Boolean).map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + L('ui.a80c9b739e83') +
              L('ui.ffa81b921d31') + Math.max(best, run.layer) + L('ui.7d613eb63063') + historyCount + L('ui.35c9279f6877') +
            '</aside>' +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div class="page-wrap mode-page">' +
        L('ui.cee2dbec0d15') + best + L('ui.e6b193c5845a') + historyCount + L('ui.50bf7a3f6f43') +
        L('ui.b1c457a82027') +
        L('ui.0b9fcb747abc') + (stored.repaired ? L('ui.67e9ecfc7982') : L('ui.9be43bd19e4d')) + '</div></div></div><div class="panel-body"><div class="row wrap">' + this.deckPreview(stored.deck).units.map(unit => '<span class="chip">' + esc(unit.name) + '</span>').join('') + this.deckPreview(stored.deck).equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + this.deckPreview(stored.deck).runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></section>' +
          L('ui.e6758d976422') + [1, 2, 3, 4, 5].map(layer => '<div class="layer-row"><span class="layer-no">' + layer + L('ui.921c3e0df8ad') + layer + L('ui.ccfd77d07e56') + (layer === 1 ? L('ui.aca99448861b') : layer >= 4 ? L('ui.cecafef99d3b') : L('ui.701c724e51be')) + '</small></div><span class="layer-reward">' + (layer === 1 ? L('ui.8a03f08a77b3') : L('ui.9e8a2fc208f5')) + '</span></div>').join('') + '</div></div></section></div>' +
          L('ui.15715b98de84') +
      '</div>';
  },

  startEndless(app) {
    const stored = this.storedDeck(app);
    if (stored.repaired) { app.toast(L('ui.ebb9b18bb0b0'), 'error'); return; }
    const run = {
      active: true,
      layer: 1,
      wins: 0,
      gold: 30,
      deck: stored.deck,
      activeEquipment: (stored.deck.equipment || []).slice(),
      activeRunes: [...new Set(stored.deck.runes || [])].slice(0, 3),
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
      loadouts: { A: this.battleLoadout(run), B: enemy.loadout },
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
    app.confirm({ title: L('ui.485d18206be7'), message: L('ui.f9427394f288'), confirmLabel: L('ui.88d165fb89ab'), danger: true, onConfirm: () => {
      run.active = false;
      run.failed = true;
      this.storeRun('endless', run);
      Store.archiveRun({ mode: 'endless', result: L('ui.76b9880829e0'), detail: L('ui.751948fa516c'), layer: run.layer, wins: modeNumber(run.wins) });
      app.render();
    } });
  },

  viewDeck(app, deck) {
    const cards = this.deckPreview(deck);
    const body = L('ui.7f95b811fa29') + cards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + L('ui.1b23a91f2f11') + unit.hp + ' · ' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>').join('') + L('ui.116075afd1f9') + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div>';
    app.openModal({ title: L('ui.3279eff11b01'), subtitle: L('ui.893d5f44b9fa'), body });
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
      case 'mode-loadout-open':
        this.openLoadoutModal(app, data.mode);
        return true;
      case 'mode-loadout-toggle-equipment':
        this.toggleLoadoutEquipment(app, data.id);
        return true;
      case 'mode-loadout-toggle-rune':
        this.toggleLoadoutRune(app, data.id);
        return true;
      case 'mode-loadout-destroy-equipment':
        this.destroyLoadoutEquipment(app, data.id);
        return true;
      case 'mode-loadout-save':
        this.saveLoadout(app);
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
