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
    const configVersion = modeNumber(this.rogueConfig().version, 1);
    for (const mode of ['rogue', 'endless']) {
      const stale = Store.state.runs[mode];
      if (stale && stale.active && modeNumber(stale.configVersion, 1) !== configVersion) {
        Store.state.runs[mode] = null;
        Store.save();
      }
    }
    const challengeRun = Store.state.runs.challenge;
    if (challengeRun && challengeRun.active && !this.getChallenge(challengeRun.challengeId)) {
      Store.state.runs.challenge = null;
      Store.save();
    }
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

  challengeList() {
    return CHALLENGE_DEFINITIONS.concat(Array.isArray(Store.state.customChallenges) ? Store.state.customChallenges : []);
  },

  getChallenge(id) {
    return this.challengeList().find(item => item.id === id) || null;
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
      startingEffects: []
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

  lineupDesired(run) {
    const owned = [...new Set((run.deck && run.deck.units) || [])].filter(id => Store.index.maps.units.has(id));
    return Math.min(3, owned.length);
  },

  ensureRunLineup(run) {
    const owned = [...new Set((run.deck && run.deck.units) || [])].filter(id => Store.index.maps.units.has(id));
    run.activeUnits = [...new Set(run.activeUnits || [])].filter(id => owned.includes(id)).slice(0, 3);
    return run.activeUnits;
  },

  lineupValid(run) {
    const owned = [...new Set((run.deck && run.deck.units) || [])].filter(id => Store.index.maps.units.has(id));
    const active = this.ensureRunLineup(run);
    if (!active.length) return false;
    return active.some(id => {
      const unit = Store.index.maps.units.get(id);
      return unit && unit.counted !== false;
    });
  },

  battleLoadout(run) {
    this.ensureRunLoadout(run);
    this.ensureRunLineup(run);
    const equipment = run.activeEquipment.filter(id => Store.index.maps.equipment.has(id));
    const activeRunes = run.activeRunes.filter(id => Store.index.maps.runes.has(id));
    return {
      units: run.activeUnits.slice(),
      equipment,
      runes: [...new Set(run.deck.runes || [])],
      activeRunes
    };
  },

  rogueConfig() {
    return (Store.rogueConfig ? Store.rogueConfig() : {}) || {};
  },

  qualityWeights(section) {
    const config = this.rogueConfig();
    const root = section ? (config[section] || {}) : config;
    const weights = Object.assign({ white: 50, blue: 40, gold: 10, rainbow: 0 }, root.qualityWeights || {});
    return weights;
  },

  weightedQuality(weights) {
    const normalized = Object.assign({ white: 0, blue: 0, gold: 0, rainbow: 0 }, weights || {});
    const total = Object.values(normalized).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return 'white';
    let roll = Math.random() * total;
    for (const quality of ['white', 'blue', 'gold', 'rainbow']) {
      roll -= Math.max(0, Number(normalized[quality]) || 0);
      if (roll <= 0) return quality;
    }
    return 'rainbow';
  },

  qualityPrice(quality, prices) {
    const map = Object.assign({ white: 5, blue: 10, gold: 15, rainbow: 20 }, prices || {});
    return modeNumber(map[quality], 5);
  },

  qualityWeightSummary(weights) {
    const normalized = Object.assign({ white: 50, blue: 40, gold: 10, rainbow: 0 }, weights || {});
    return ['white', 'blue', 'gold', 'rainbow'].map(quality => (QUALITIES[quality] ? QUALITIES[quality].label : quality) + ' ' + modeNumber(normalized[quality], 0) + '%').join(' · ');
  },

  pickWeightedCard(collection, weights, predicate) {
    const candidates = (collection || []).filter(item => item && (!predicate || predicate(item)));
    if (!candidates.length) return null;
    const quality = this.weightedQuality(weights);
    let pool = candidates.filter(item => item.quality === quality);
    if (!pool.length) pool = candidates;
    return modeRandom(pool);
  },

  characterPrice(quality) {
    return this.qualityPrice(quality, (this.rogueConfig().characterShop || {}).prices);
  },

  rollCharacterQuality() {
    return this.weightedQuality(this.qualityWeights('characterShop'));
  },

  generateCharacterShop(run) {
    if (!run) return [];
    const config = this.rogueConfig().characterShop || {};
    const shop = Object.assign({ offerCount: 5, prices: {} }, config);
    const owned = new Set((run.deck && run.deck.units) || []);
    const used = new Set();
    const offers = [];
    const shopUnits = Store.index.units.filter(unit => unit.quality !== 'rainbow' && unit.obtainable !== false);
    for (let i = 0; i < modeNumber(shop.offerCount, 5); i += 1) {
      const unit = this.pickWeightedCard(shopUnits, shop.qualityWeights || this.qualityWeights('characterShop'), candidate => !used.has(candidate.id) && !owned.has(candidate.id))
        || this.pickWeightedCard(shopUnits, shop.qualityWeights, candidate => !used.has(candidate.id));
      if (!unit) break;
      used.add(unit.id);
      offers.push({ unitId: unit.id, quality: unit.quality, price: this.qualityPrice(unit.quality, shop.prices), sold: false });
    }
    run.characterShop = offers;
    return offers;
  },

  ensureCharacterShop(run) {
    if (!run) return [];
    if (!Array.isArray(run.characterShop) || !run.characterShop.length) this.generateCharacterShop(run);
    return run.characterShop || [];
  },

  autoRefreshCharacterShop(run, key) {
    if (!run) return false;
    const config = this.rogueConfig().characterShop || {};
    if (config.autoRefreshPerNode === false) return false;
    const refreshKey = key || ('auto:' + Date.now());
    if (run.lastAutoShopRefresh === refreshKey) return false;
    this.generateCharacterShop(run);
    run.lastAutoShopRefresh = refreshKey;
    run.characterShopAutoRefreshCount = modeNumber(run.characterShopAutoRefreshCount, 0) + 1;
    return true;
  },

  battleDamageGold(app) {
    const battle = app && app.battle;
    if (!battle || !battle.sides || !battle.sides.A) return 0;
    const config = this.rogueConfig().battleGold || {};
    const perDamage = modeNumber(config.perDamage, 1);
    const minimum = modeNumber(config.minimum, 0);
    return Math.max(0, Math.floor(modeNumber(battle.sides.A.damageDealt, 0) * perDamage + minimum));
  },

  renderCharacterShop(app, run, mode) {
    const offers = this.ensureCharacterShop(run);
    const cards = offers.map((offer, index) => {
      const unit = Store.index.maps.units.get(offer.unitId);
      if (!unit) return '';
      const owned = (run.deck.units || []).includes(unit.id);
      const disabled = offer.sold || owned || modeNumber(run.gold) < offer.price;
      return '<div class="character-shop-card' + (offer.sold ? ' sold' : '') + '" data-action="mode-character-shop-preview" data-mode="' + mode + '" data-id="' + attr(unit.id) + L('ui.5b7ed558eb9d') +
        '<img src="' + attr(cardArt(unit)) + '" alt="">' +
        '<div class="character-shop-main"><strong>' + esc(unit.name) + '</strong><small>' + qualityBadge(unit.quality) + L('ui.f440b07d0ba3') + unit.hp + ' · ' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>' +
        '<button class="btn btn-sm" type="button" data-action="mode-character-shop-buy" data-mode="' + mode + '" data-index="' + index + '"' + (disabled ? ' disabled' : '') + '>' + (offer.sold ? L('ui.c9d7f9ccccc9') : owned ? L('ui.a2a9f7d96220') : offer.price + L('ui.18780ade69b4')) + '</button>' +
      '</div>';
    }).join('');
    const config = this.rogueConfig().characterShop || {};
    const refreshCost = modeNumber(config.refreshCost, 10);
    const weights = config.qualityWeights || this.qualityWeights('characterShop');
    const prices = config.prices || {};
    return L('ui.3e7ccb46ebe2') + offers.length + L('ui.2b134832600e') + modeNumber(run.gold) + L('ui.561c4f054a15') + (cards || L('ui.b1baec18c743')) + '</div><div class="row between wrap mt-2"><span class="field-hint">' + this.qualityWeightSummary(weights) + L('ui.6b4d2d13d374') + this.qualityPrice('white', prices) + '/' + this.qualityPrice('blue', prices) + '/' + this.qualityPrice('gold', prices) + '/' + this.qualityPrice('rainbow', prices) + (config.autoRefreshPerNode === false ? '' : L('ui.b8e08b416762')) + '</span><button class="btn btn-sm" type="button" data-action="mode-character-shop-refresh" data-mode="' + mode + '"' + (modeNumber(run.gold) < refreshCost ? ' disabled' : '') + L('ui.63ce39e299ca') + refreshCost + L('ui.1b52bfdb17cf');
  },

  buyCharacterFromShop(app, mode, index) {
    const run = Store.state.runs[mode];
    if (!run || !run.active) return;
    const offers = this.ensureCharacterShop(run);
    const offer = offers[Number(index)];
    if (!offer || offer.sold) return;
    const unit = Store.index.maps.units.get(offer.unitId);
    if (!unit) return;
    if ((run.deck.units || []).includes(unit.id)) { app.toast(L('ui.8ff8595c3edf'), 'error'); return; }
    if (modeNumber(run.gold) < offer.price) { app.toast(L('ui.9ffa872e8a9e'), 'error'); return; }
    run.gold = modeNumber(run.gold) - offer.price;
    run.deck.units.push(unit.id);
    offer.sold = true;
    this.storeRun(mode, run);
    app.render();
    app.toast('「' + unit.name + L('ui.1ada621eaf15'), 'success');
  },

  refreshCharacterShop(app, mode) {
    const run = Store.state.runs[mode];
    if (!run || !run.active) return;
    const cost = modeNumber((this.rogueConfig().characterShop || {}).refreshCost, 10);
    if (modeNumber(run.gold) < cost) { app.toast(L('ui.60643024db16') + cost + L('ui.135132e08b2c'), 'error'); return; }
    run.gold = modeNumber(run.gold) - cost;
    this.generateCharacterShop(run);
    this.storeRun(mode, run);
    app.render();
    app.toast(L('ui.03a6e4f3d446'), 'success');
  },

  previewCharacterShop(app, id) {
    app.previewCard('unit', id);
  },

  previewShopOffer(app, kind, id) {
    if (kind !== 'unit' && kind !== 'equipment' && kind !== 'rune') return;
    app.previewCard(kind, id);
  },

  makeBattleRules(extra) {
    return Object.assign({}, DEFAULT_RULES, {
      initialDraw: 10,
      maxField: 4,
      allowDuplicates: true,
      defeatedToDeck: false,
      drawDuringBattle: false
    }, extra || {});
  },

  buildEnemy(layer, kind) {
    layer = Math.max(0, layer);
    kind = kind || 'battle';
    const config = this.rogueConfig().encounters || {};
    const base = config.battle || {};
    const enc = Object.assign({}, base, config[kind] || {});
    const power = layer + modeNumber(enc.powerOffset, 0);
    const defaultPools = [
      { minPower: 0, units: ['slime_small', 'slime_small', 'slime_big', 'catgirl_jk', 'catgirl_jk'] },
      { minPower: 3, units: ['castorice', 'trainingdummy'] },
      { minPower: 5, units: ['catgirl_jk', 'slime_big'] }
    ];
    const pools = Array.isArray(enc.pools) ? enc.pools : defaultPools;
    const available = [];
    for (const pool of pools) {
      if (power < modeNumber(pool.minPower, 0)) continue;
      for (const id of pool.units || []) {
        const card = Store.index.maps.units.get(id);
        if (card && card.quality !== 'rainbow') available.push(id);
      }
    }
    if (!available.length) available.push(...Store.index.units.filter(unit => unit.quality !== 'rainbow' && unit.obtainable !== false).map(unit => unit.id));
    const targetCount = Math.max(1, modeNumber(enc.targetCount, kind === 'boss' ? 5 : kind === 'elite' ? 4 : 3));
    const avoidDuplicates = enc.avoidDuplicates !== false;
    const picked = [];
    let guard = 0;
    while (picked.length < targetCount && guard < 32) {
      guard += 1;
      const candidate = modeRandom(available);
      if (!candidate) break;
      if (avoidDuplicates) {
        const count = picked.filter(id => id === candidate).length;
        if (count >= 1 && picked.length < targetCount - 1) continue;
      }
      picked.push(candidate);
    }
    const countedFallback = enc.fallbackCounted || 'catgirl_jk';
    if (!picked.some(id => {
      const card = Store.index.maps.units.get(id);
      return card && card.counted !== false;
    }) && Store.index.maps.units.has(countedFallback)) {
      if (picked.length >= targetCount) picked[0] = countedFallback;
      else picked.unshift(countedFallback);
    }
    const equipment = [...new Set((enc.equipment || []).filter(item => power >= modeNumber(item.minPower, 0)).map(item => item.id).filter(id => Store.index.maps.equipment.has(id)))];
    const runes = [...new Set((enc.runes || []).filter(item => power >= modeNumber(item.minPower, 0)).map(item => item.id).filter(id => Store.index.maps.runes.has(id)))];
    const hpMax = modeNumber(enc.hpFlatMax, 10);
    const dmgMax = modeNumber(enc.dmgFlatMax, 5);
    const mods = {
      hpFlat: Math.min(hpMax, Math.floor(power * modeNumber(enc.hpFlatPerPower, 0.5)) + modeNumber(enc.hpFlatBonus, 0)),
      dmgFlat: Math.min(dmgMax, Math.max(0, Math.floor(power * modeNumber(enc.dmgFlatPerPower, 0.333333)))),
      startingEffects: []
    };
    for (const effect of enc.startingEffects || []) {
      if (power < modeNumber(effect.minPower, 0)) continue;
      if (!picked.includes(effect.unitId)) continue;
      if (!Store.index.maps.effects.has(effect.effectId)) continue;
      mods.startingEffects.push({
        unitId: effect.unitId,
        effectId: effect.effectId,
        stacks: modeNumber(kind === 'boss' && effect.bossStacks != null ? effect.bossStacks : effect.stacks, 1)
      });
    }
    return {
      loadout: { units: picked, equipment, runes },
      modifiers: mods
    };
  },

  createRogueMap() {
    const config = this.rogueConfig().map || {};
    const fallbackLayers = [
      ['battle', 'event'],
      ['battle', 'shop'],
      ['elite', 'rest'],
      ['battle', 'event'],
      ['shop', 'rest'],
      ['elite', 'battle'],
      ['boss']
    ];
    const layers = Array.isArray(config.layers) && config.layers.length ? config.layers : fallbackLayers;
    const titles = config.nodeTitles || {};
    const fallbackNames = {
      battle: [L('ui.7de4ae8ca95c'), L('ui.94205b700f71'), L('ui.32fa9eb19529')],
      elite: [L('ui.440ff5165598'), L('ui.ddb5a34d7a39')],
      boss: [L('ui.310625d7a83c'), L('ui.030cf845fe88')],
      event: [L('ui.392438324d35'), L('ui.072462aa15c6')],
      shop: [L('ui.e923af92e606'), L('ui.c0d497147ed0')],
      rest: [L('ui.b4b9e32db3a2'), L('ui.2c72cc104cd9')]
    };
    return layers.map((entry, layerIndex) => {
      const types = Array.isArray(entry) ? entry : (entry && Array.isArray(entry.types) ? entry.types : []);
      return types.map((rawType, index) => {
        const type = typeof rawType === 'string' ? rawType : (rawType && rawType.type) || 'battle';
        const namePool = Array.isArray(titles[type]) && titles[type].length ? titles[type] : (fallbackNames[type] || [type]);
        return {
          id: 'r' + (layerIndex + 1) + (index === 0 ? 'a' : 'b'),
          layer: layerIndex,
          type,
          title: modeRandom(namePool),
          done: false,
          current: false,
          event: type === 'event' ? this.createEvent(layerIndex) : null
        };
      });
    });
  },

  createEvent(layer) {
    const layerNumber = modeNumber(layer, 0);
    const pool = (Store.rogueEvents ? Store.rogueEvents() : []).filter(event => {
      if (!event || !Array.isArray(event.choices) || !event.choices.length) return false;
      if (event.minLayer != null && layerNumber < modeNumber(event.minLayer, 0)) return false;
      if (event.maxLayer != null && layerNumber > modeNumber(event.maxLayer, 999)) return false;
      return true;
    });
    if (!pool.length) {
      return {
        id: 'rogue.fallback',
        title: L('ui.221395c99026'),
        text: L('ui.8659a1089d8a'),
        choices: [{ text: L('ui.97af6fa852ee'), hint: L('ui.4c7ade005e2a'), effect: 'gold', value: 10 }]
      };
    }
    const total = pool.reduce((sum, event) => sum + Math.max(0.0001, Number(event.weight) || 1), 0);
    let roll = Math.random() * total;
    let picked = pool[pool.length - 1];
    for (const event of pool) {
      roll -= Math.max(0.0001, Number(event.weight) || 1);
      if (roll <= 0) { picked = event; break; }
    }
    return deepClone(picked);
  },

  rewardPool(run) {
    const config = this.rogueConfig();
    const loot = config.loot || {};
    const weights = loot.qualityWeights || this.qualityWeights('loot');
    const ownedUnits = new Set(run.deck.units || []);
    const maxEquipment = modeNumber(loot.maxEquipment, 6);
    const maxRunes = modeNumber(loot.maxRunes, 6);
    const entries = Array.isArray(loot.entries) ? loot.entries : [
      { kind: 'unit', enabled: true },
      { kind: 'equipment', enabled: true },
      { kind: 'rune', enabled: true },
      { kind: 'upgradeHp', enabled: true, value: 2 },
      { kind: 'upgradeDmg', enabled: true, value: 1 },
      { kind: 'gold', enabled: true, value: 10 }
    ];
    const rewards = [];
    const guaranteedGear = [];
    for (const entry of entries) {
      if (!entry || entry.enabled === false) continue;
      if (entry.kind === 'unit') {
        const unit = this.pickWeightedCard(Store.index.units.filter(item => item.quality !== 'rainbow' && item.obtainable !== false), weights, candidate => !ownedUnits.has(candidate.id));
        if (!unit) continue;
        rewards.push({ kind: 'unit', id: unit.id, title: unit.name, desc: L('ui.21a4cc465cf8') + unit.hp + '，' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '。' });
      } else if (entry.kind === 'equipment' || entry.kind === 'rune') {
        const isRune = entry.kind === 'rune';
        if ((isRune ? (run.deck.runes || []).length : (run.deck.equipment || []).length) >= (isRune ? maxRunes : maxEquipment)) continue;
        const card = this.pickWeightedCard(isRune ? Store.index.runes : Store.index.equipment, weights);
        if (!card) continue;
        const reward = {
          kind: entry.kind, id: card.id, title: card.name,
          desc: (isRune ? L('ui.864bdea5847e') : L('ui.ed99f51a9c3b')) + (modSummary(card.mods, true) || '')
        };
        rewards.push(reward);
        if (loot.guaranteedGear !== false) guaranteedGear.push(reward);
      } else if (entry.kind === 'upgradeHp') {
        const value = modeNumber(entry.value, 2);
        rewards.push({ kind: 'upgradeHp', value, title: L('ui.09a189a8bdcf'), desc: L('ui.8e46ade6045e') + value + '。' });
      } else if (entry.kind === 'upgradeDmg') {
        const value = modeNumber(entry.value, 1);
        rewards.push({ kind: 'upgradeDmg', value, title: L('ui.4bc3136c40e6'), desc: L('ui.46bc6a641622') + value + '。' });
      } else if (entry.kind === 'gold') {
        const value = modeNumber(entry.value, 10);
        rewards.push({ kind: 'gold', value, title: L('ui.a345c8d0df9a'), desc: L('ui.1f5565c15f9b') + value + L('ui.135132e08b2c') });
      }
    }
    const choiceCount = Math.max(1, modeNumber(loot.choiceCount, 3));
    const shuffled = modeShuffle(rewards);
    const result = [];
    const kinds = new Set();
    if (guaranteedGear.length) {
      const guaranteed = modeRandom(guaranteedGear);
      result.push(guaranteed);
      kinds.add(guaranteed.kind);
    }
    for (const reward of shuffled) {
      if (result.length >= choiceCount) break;
      if (result.includes(reward)) continue;
      if (kinds.has(reward.kind)) continue;
      kinds.add(reward.kind);
      result.push(reward);
    }
    while (result.length < choiceCount && shuffled.length) {
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
    else if (reward.kind === 'upgradeHp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + modeNumber(reward.value, 2); app.toast(L('ui.f7545f74aa97'), 'success'); }
    else if (reward.kind === 'upgradeDmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + modeNumber(reward.value, 1); app.toast(L('ui.d85e0f0048eb'), 'success'); }
    else if (reward.kind === 'gold') { const value = modeNumber(reward.value, 10); run.gold = modeNumber(run.gold) + value; app.toast(L('ui.1f5565c15f9b') + value + L('ui.135132e08b2c'), 'success'); }
  },

  openPendingReward(app, mode) {
    const run = Store.state.runs[mode];
    if (!run || !run.active || !run.awaitingReward) return;
    if (!Array.isArray(run.pendingRewards) || !run.pendingRewards.length) this.generateRewards(run);
    const rewards = run.pendingRewards || [];
    const battleGold = modeNumber(run.lastBattleDamageGold, 0);
    const battleGoldLine = battleGold > 0 ? L('ui.90c1d85c4ce3') + battleGold + L('ui.8292444dc2cc') + modeNumber(run.gold) + '。</div>' : '';
    const body = battleGoldLine + L('ui.b54a8c6791bc') +
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
    if (node) this.autoRefreshCharacterShop(run, 'rogue:' + node.id);
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
      const first = Store.index.units.filter(unit => unit.counted !== false && unit.obtainable !== false).slice(0, 3).map(unit => unit.id);
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
    const previousBlock = previous && !previous.active ? L('ui.74e29c9ae6b6') + (previous.completed ? L('ui.ddeabb8144ea') : L('ui.01c89d9334cd')) + L('ui.59d6ee9326f8') + (modeNumber(previous.currentLayer) + 1) + L('ui.a63dc2ffbd0f') + modeNumber(previous.wins) + L('ui.3502e786d1e1') : '';
    return '' +
      '<div class="page-wrap mode-page">' +
        L('ui.6f19a204d495') +
        '<section class="panel mt-2"><div class="panel-body"><div class="stack gap-sm">' +
          L('ui.afd5c8d71257') +
          L('ui.369a362145da') +
          L('ui.e06dde58a134') +
          L('ui.82fa11e0d98b') +
          previousBlock +
          L('ui.0cb480b0d26b') +
        '</div></div></section>' +
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
              '</div>' +
            '</div></section>' +
            L('ui.9033b2bd3bc2') + deckCards.units.length + L('ui.5fa026d18910') + (run.activeEquipment || []).length + L('ui.5804d65c8bf5') + (run.activeRunes || []).length + L('ui.c203c5fd39ee') + deckCards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + (run.activeEquipment || []).map(id => Store.index.maps.equipment.get(id)).filter(Boolean).map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + (run.activeRunes || []).map(id => Store.index.maps.runes.get(id)).filter(Boolean).map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + L('ui.37e626936ee7') +
            L('ui.8e045c395393') +
            this.renderCharacterShop(app, run, 'rogue') +
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
    const run = {
      active: true,
      configVersion: modeNumber(this.rogueConfig().version, 2),
      completed: false,
      failed: false,
      map: { layers: this.createRogueMap() },
      currentLayer: 0,
      currentNodeId: null,
      deck: { units: [], equipment: [], runes: [] },
      activeEquipment: [],
      activeRunes: [],
      activeUnits: [],
      characterShop: [],
      gold: modeNumber(this.rogueConfig().startingGold, 30),
      wins: 0,
      upgrades: { hpFlat: 0, dmgFlat: 0, startEffects: [] },
      awaitingReward: false,
      pendingRewards: [],
      startedAt: Date.now()
    };
    this.generateCharacterShop(run);
    this.storeRun('rogue', run);
    app.render();
    app.toast(L('ui.b43a237b76c4'), 'success');
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

  requireLineup(app, mode) {
    const run = Store.state.runs[mode];
    if (run && this.lineupValid(run)) return true;
    app.toast(L('ui.d36f0cb2eb4c'), 'error');
    this.openLoadoutModal(app, mode);
    return false;
  },

  startRogueBattle(app, run, node, source) {
    if (!this.requireLineup(app, 'rogue')) return;
    const enemy = this.buildEnemy(node.layer, node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'battle');
    app.startBattle({
      loadouts: {
        A: this.battleLoadout(run),
        B: enemy.loadout
      },
      rules: this.makeBattleRules(Object.assign({}, this.rogueConfig().battleRules || {}, { allowDuplicates: true })),
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
    if (choice.effect === 'dmg') {
      run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + modeNumber(choice.value);
      app.toast(L('ui.d85e0f0048eb'), 'success');
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'equipment' || choice.effect === 'rune') {
      const isRune = choice.effect === 'rune';
      const collection = isRune ? Store.index.runes : Store.index.equipment;
      const owned = new Set(isRune ? (run.deck.runes || []) : (run.deck.equipment || []));
      const candidates = collection.filter(item => !owned.has(item.id));
      const pick = choice.id ? collection.find(item => item.id === choice.id) : (candidates.length ? modeRandom(candidates) : null);
      if (pick) {
        if (isRune) run.deck.runes.push(pick.id); else run.deck.equipment.push(pick.id);
        this.ensureRunLoadout(run);
        if (isRune) { if (run.activeRunes.length < 3) run.activeRunes.push(pick.id); }
        else if (!run.activeEquipment.includes(pick.id)) run.activeEquipment.push(pick.id);
        app.toast('「' + pick.name + L('ui.ee5928dfd411'), 'success');
      } else {
        run.gold = modeNumber(run.gold) + 10;
        app.toast(L('ui.2a34fd215c37'), 'success');
      }
      this.advanceNode(app, node);
      return;
    }
    if (choice.effect === 'unit') {
      const currentUnits = new Set(run.deck.units);
      const candidates = Store.index.units.filter(unit => !currentUnits.has(unit.id) && unit.counted !== false && unit.obtainable !== false);
      const explicit = choice.id ? Store.index.maps.units.get(choice.id) : null;
      const pick = explicit && explicit.obtainable !== false ? explicit : (candidates.length ? modeRandom(candidates) : null);
      if (pick) {
        run.deck.units.push(pick.id);
        app.toast('「' + pick.name + L('ui.d1f5c3fd312c'), 'success');
      } else {
        run.gold = modeNumber(run.gold) + 10;
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
    const config = this.rogueConfig();
    const shop = config.shop || {};
    const prices = (config.characterShop || {}).prices || {};
    const weights = shop.qualityWeights || this.qualityWeights('shop');
    const priceBonus = modeNumber(shop.priceBonus, 3);
    const defaults = [
      { kind: 'unit', enabled: true, required: false, priceBonus: 3 },
      { kind: 'equipment', enabled: true, required: true, priceBonus: 3 },
      { kind: 'rune', enabled: true, required: true, priceBonus: 3 },
      { kind: 'upgradeHp', enabled: true, required: false, price: 20, value: 2 },
      { kind: 'upgradeDmg', enabled: true, required: false, price: 20, value: 1 },
      { kind: 'removeUnit', enabled: true, required: false, price: 10, minUnits: 2 }
    ];
    const entries = Array.isArray(shop.offers) ? shop.offers : defaults;
    const required = [];
    const optional = [];
    const ownedUnits = new Set(run.deck.units || []);
    const add = (entry, offer) => {
      if (!offer) return;
      if (entry.required) required.push(offer); else optional.push(offer);
    };
    for (const entry of entries) {
      if (!entry || entry.enabled === false) continue;
      if (entry.kind === 'unit') {
        const unit = this.pickWeightedCard(Store.index.units.filter(item => item.obtainable !== false && item.quality !== 'rainbow'), weights, candidate => !ownedUnits.has(candidate.id));
        if (!unit) continue;
        add(entry, {
          kind: 'unit', id: unit.id, title: unit.name,
          desc: L('ui.3fa6e6baec47') + unit.hp,
          price: this.qualityPrice(unit.quality, prices) + modeNumber(entry.priceBonus, priceBonus),
          sold: false
        });
      } else if (entry.kind === 'equipment' || entry.kind === 'rune') {
        const isRune = entry.kind === 'rune';
        const max = modeNumber(isRune ? shop.maxRunes : shop.maxEquipment, 6);
        if ((isRune ? (run.deck.runes || []).length : (run.deck.equipment || []).length) >= max) continue;
        const collection = (isRune ? Store.index.runes : Store.index.equipment).filter(item => item.quality !== 'rainbow');
        const card = this.pickWeightedCard(collection, weights);
        if (!card) continue;
        add(entry, {
          kind: entry.kind, id: card.id, title: card.name,
          desc: (isRune ? L('ui.644e0790b977') : L('ui.56bd2bba6de9')) + (modSummary(card.mods, true) || L('ui.455d56230713')),
          price: this.qualityPrice(card.quality, prices) + modeNumber(entry.priceBonus, priceBonus),
          sold: false
        });
      } else if (entry.kind === 'upgradeHp') {
        add(entry, { kind: 'upgradeHp', title: L('ui.09a189a8bdcf'), desc: L('ui.100f07370663'), price: modeNumber(entry.price, 20), value: modeNumber(entry.value, 2), sold: false });
      } else if (entry.kind === 'upgradeDmg') {
        add(entry, { kind: 'upgradeDmg', title: L('ui.4bc3136c40e6'), desc: L('ui.96b27500cc62'), price: modeNumber(entry.price, 20), value: modeNumber(entry.value, 1), sold: false });
      } else if (entry.kind === 'removeUnit') {
        if ((run.deck.units || []).length < modeNumber(entry.minUnits, 2)) continue;
        add(entry, { kind: 'removeUnit', title: L('ui.78b88aacca2f'), desc: L('ui.68289ce53a44'), price: modeNumber(entry.price, 10), sold: false });
      }
    }
    const count = Math.max(1, modeNumber(shop.offerCount, 4));
    const result = required.slice(0, count);
    for (const offer of modeShuffle(optional)) {
      if (result.length >= count) break;
      result.push(offer);
    }
    return result;
  },

  openShopModal(app, run, node) {
    if (!this._shop || this._shop.nodeId !== node.id) this._shop = { nodeId: node.id, offers: this.shopOffers(run) };
    const offers = this._shop.offers;
    const body = L('ui.21df8512dba5') + modeNumber(run.gold) + L('ui.49beee3e4a54') + offers.map((offer, index) => {
      const previewable = offer.kind === 'unit' || offer.kind === 'equipment' || offer.kind === 'rune';
      return '<div class="shop-item' + (offer.sold ? ' sold' : '') + '"' + (previewable ? ' data-action="mode-shop-preview" data-kind="' + attr(offer.kind) + '" data-id="' + attr(offer.id) + '"' : '') + '><img src="' + (offer.kind === 'unit' ? attr(cardArt(Store.index.maps.units.get(offer.id) || {})) : offer.kind === 'rune' ? 'assets/pictures/rune-art.svg' : 'assets/pictures/equipment-soap.svg') + '" alt=""><div class="grow"><strong>' + esc(offer.title) + '</strong><small>' + esc(offer.desc) + '</small><div class="price">' + (offer.sold ? L('ui.c9d7f9ccccc9') : offer.price + L('ui.18780ade69b4')) + '</div></div>' + (offer.sold ? '' : '<button class="btn btn-sm" type="button" data-action="mode-shop-buy" data-index="' + index + '"' + (run.gold < offer.price ? ' disabled' : '') + L('ui.228724ff13d4')) + '</div>';
    }).join('') + L('ui.06414a5ebe45');
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
    const options = this.rogueConfig().rest && Array.isArray(this.rogueConfig().rest.options) ? this.rogueConfig().rest.options : [];
    const choices = options.map((option, index) => '<button class="choice-card" type="button" data-action="mode-rest-choice" data-choice="' + attr(option.id) + '"><span class="choice-mark">' + (index + 1) + '</span><span class="choice-main"><strong>' + esc(option.label || option.id) + '</strong><small>' + esc(option.hint || '') + '</small></span></button>').join('');
    const body = L('ui.b2bcf9344d13') + (choices || L('ui.a21d384f9314')) + '</div>';
    app.openModal({ title: L('ui.bee455dc2726'), subtitle: L('ui.f495347d6acf') + (node.layer + 1) + L('ui.65be5404de39'), size: 'small', body });
  },

  handleRestChoice(app, choiceId) {
    const run = Store.state.runs.rogue;
    if (!run || !run.currentNodeId) return;
    const node = run.map.layers.flat().find(item => item.id === run.currentNodeId);
    if (!node) return;
    const config = this.rogueConfig().rest || {};
    const option = (config.options || []).find(item => item.id === choiceId) || { id: choiceId, effect: choiceId, value: 1 };
    const effect = option.effect || option.id;
    const value = modeNumber(option.value, 1);
    const weights = config.qualityWeights || (this.rogueConfig().shop || {}).qualityWeights || this.qualityWeights('shop');
    if (effect === 'hp') { run.upgrades.hpFlat = modeNumber(run.upgrades.hpFlat) + value; app.toast(L('ui.575a1133ed69'), 'success'); }
    else if (effect === 'dmg') { run.upgrades.dmgFlat = modeNumber(run.upgrades.dmgFlat) + value; app.toast(L('ui.52c1ca71b836'), 'success'); }
    else if (effect === 'equipment') {
      const owned = new Set(run.deck.equipment || []);
      const candidates = Store.index.equipment.filter(item => !owned.has(item.id));
      const gear = this.pickWeightedCard(candidates, weights);
      if (gear) {
        run.deck.equipment.push(gear.id);
        this.ensureRunLoadout(run);
        if (!run.activeEquipment.includes(gear.id)) run.activeEquipment.push(gear.id);
        app.toast(L('ui.2667c8ca1853') + gear.name + '」。', 'success');
      } else { run.gold = modeNumber(run.gold) + modeNumber(config.fallbackGold, 10); app.toast(L('ui.d6353723cb4a'), 'success'); }
    } else if (effect === 'rune') {
      const owned = new Set(run.deck.runes || []);
      const candidates = Store.index.runes.filter(item => !owned.has(item.id));
      const rune = this.pickWeightedCard(candidates, weights);
      if (rune) {
        run.deck.runes.push(rune.id);
        this.ensureRunLoadout(run);
        if (run.activeRunes.length < 3) run.activeRunes.push(rune.id);
        app.toast(L('ui.146c79ec28b5') + rune.name + '」。', 'success');
      } else { run.gold = modeNumber(run.gold) + modeNumber(config.fallbackGold, 10); app.toast(L('ui.c85a704238b6'), 'success'); }
    } else {
      const gold = effect === 'gold' ? value : modeNumber(config.fallbackGold, 10);
      run.gold = modeNumber(run.gold) + gold;
      app.toast(L('ui.1f5565c15f9b') + gold + L('ui.135132e08b2c'), 'success');
    }
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
      if (node) this.autoRefreshCharacterShop(run, 'rogue:' + node.id);
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
    this.ensureRunLineup(run);
    this._loadoutDraft = {
      mode,
      units: run.activeUnits.slice(),
      equipment: run.activeEquipment.slice(),
      runes: run.activeRunes.slice(0, 3)
    };
    this.renderLoadoutModal(app);
  },

  renderLoadoutModal(app) {
    const run = Store.state.runs[this._loadoutDraft.mode];
    if (!run) return;
    const draft = this._loadoutDraft;
    const unitPool = [...new Set((run.deck.units || []))].map(id => Store.index.maps.units.get(id)).filter(Boolean);
    const desiredUnits = this.lineupDesired(run);
    const unitRows = unitPool.length ? unitPool.map(unit => {
      const selected = draft.units.includes(unit.id);
      return '<button class="loadout-item unit' + (selected ? ' selected' : '') + '" type="button" data-action="mode-loadout-toggle-unit" data-id="' + attr(unit.id) + '"><span class="loadout-check">' + (selected ? L('ui.f24ddc2bef8f') : L('ui.e42bf97d82df')) + '</span><span class="loadout-main"><strong>' + esc(unit.name) + L('ui.8e2355a4acc3') + unit.hp + ' · ' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + ' · ' + esc((unit.skills || []).length) + L('ui.e8809b7880d4') + qualityBadge(unit.quality) + '</button>';
    }).join('') : L('ui.11812e8bb557');
    const unitSection = L('ui.bdf7a6f5ebda') + draft.units.length + ' / 3' + L('ui.86fca01cb883') + L('ui.94194f705dd9') + unitRows + '</div></section>';
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
      subtitle: L('ui.0239daab3cc8'),
      size: 'large',
      body: unitSection + L('ui.4ec17c260ddb') + draft.equipment.length + L('ui.55d8318eec45') + equipmentRows + L('ui.6641680ff3d1') + draft.runes.length + L('ui.8cb9a693fdb2') + runeRows + '</div></section></div>',
      foot: L('ui.266af4a7778f') + (run.deck.units || []).length + L('ui.d65a0a66148c') + equipmentPool.length + L('ui.b604c4619b70') + runePool.length + L('ui.fbb852a2594a')
    });
  },

  toggleLoadoutUnit(app, id) {
    if (!this._loadoutDraft) return;
    const run = Store.state.runs[this._loadoutDraft.mode];
    if (!run) return;
    const owned = new Set(run.deck.units || []);
    if (!owned.has(id)) return;
    const list = this._loadoutDraft.units;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else if (list.length >= 3) { app.toast(L('ui.0eb1a86c59ae'), 'error'); return; }
    else list.push(id);
    this.renderLoadoutModal(app);
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
    const ownedUnits = [...new Set(run.deck.units || [])].filter(id => Store.index.maps.units.has(id));
    const desiredUnits = Math.min(3, ownedUnits.length);
    const units = [...new Set(draft.units || [])].filter(id => ownedUnits.includes(id));
    if (units.length !== desiredUnits) {
      app.toast(L('ui.064c9b5da568') + desiredUnits + L('ui.c8132d86ef92'), 'error');
      return;
    }
    if (!units.some(id => {
      const unit = Store.index.maps.units.get(id);
      return unit && unit.counted !== false;
    })) {
      app.toast(L('ui.eb31e052982e'), 'error');
      return;
    }
    const ownedEquipment = new Set(run.deck.equipment || []);
    const ownedRunes = new Set(run.deck.runes || []);
    run.activeUnits = units;
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
      const challenge = this.getChallenge(context.challengeId);
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
    const damageGold = this.battleDamageGold(app);
    run.gold = modeNumber(run.gold) + damageGold;
    run.lastBattleDamageGold = damageGold;
    run.lastBattleDamage = this.battleDamageGold(app);
    run.currentNodeId = node ? node.id : run.currentNodeId;
    run.pendingCompletion = !!(node && node.type === 'boss');
    this.generateRewards(run);
    this.storeRun('rogue', run);
    app.toast(L('ui.68cb0f09b5f9') + damageGold + L('ui.406fc9f170a0') + damageGold + L('ui.135132e08b2c'), 'success');
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
    const damageGold = this.battleDamageGold(app);
    run.gold = modeNumber(run.gold) + damageGold;
    run.lastBattleDamageGold = damageGold;
    run.lastBattleDamage = damageGold;
    this.autoRefreshCharacterShop(run, 'endless:' + run.layer + ':' + run.wins);
    this.generateRewards(run);
    this.storeRun('endless', run);
    app.toast(L('ui.68cb0f09b5f9') + damageGold + L('ui.406fc9f170a0') + damageGold + L('ui.135132e08b2c'), 'success');
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
      const challenge = this.getChallenge(activeRun.challengeId);
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
          L('ui.1fa1dd178d12') +
          this.challengeList().map((challenge, index) => {
            const customUnit = challenge.custom && challenge.stages && challenge.stages[0] && challenge.stages[0].opponent && challenge.stages[0].opponent.units && challenge.stages[0].opponent.units[0];
            const artUnit = customUnit || 'castorice';
            const art = (Store.index.maps.units.get(artUnit) || {}).art || 'assets/pictures/unit-philia.svg';
            const isActive = activeRun && activeRun.challengeId === challenge.id;
            const blockedByOther = activeRun && !isActive;
            return '<article class="panel challenge-card"><div class="challenge-art"><img src="' + attr(art) + '" alt=""><span class="ch-tag">' + esc(challenge.tag) + '</span><span class="ch-name">' + esc(challenge.name) + '</span></div><div class="challenge-body"><p>' + esc(challenge.description) + '</p><div class="challenge-stages">' + challenge.stages.map((stage, stageIndex) => '<div class="challenge-stage-row"><span class="stage-no">' + (stageIndex + 1) + '</span><span>' + esc(stage.name) + '</span><small>' + esc(stage.rule && stage.rule.modifier ? stage.rule.modifier : L('ui.68e99292d125')) + '</small></div>').join('') + '</div><button class="btn ' + (isActive ? 'btn-primary' : '') + '" type="button" data-action="' + (isActive ? 'mode-challenge-fight' : 'mode-challenge-start') + '" data-id="' + attr(challenge.id) + '"' + (blockedByOther ? ' disabled' : '') + '>' + (isActive ? L('ui.ea0a3697e479') : blockedByOther ? L('ui.eb5e9fb40d37') : L('ui.b77dfdad2269')) + '</button>' + (challenge.custom ? '<div class="btn-row mt-2"><button class="btn btn-sm" type="button" data-action="mode-challenge-edit" data-id="' + attr(challenge.id) + L('ui.b2e3834e8a00') + attr(challenge.id) + L('ui.b6c779e66651') : '') + '</div></article>';
          }).join('') +
        '</div></div>' +
        L('ui.7575dea8793b') + cards.units.map(unit => '<span class="chip">' + esc(unit.name) + '</span>').join('') + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></div>' +
      '</div>';
  },

  openChallengeDesigner(app, challengeId) {
    const editing = challengeId ? this.getChallenge(challengeId) : null;
    if (editing && !editing.custom) return;
    const units = Store.index.units;
    const stageRows = [0, 1, 2].map(index => {
      const stage = editing && editing.stages[index] ? editing.stages[index] : {};
      const opponent = stage.opponent || {};
      const selected = new Set(opponent.units || []);
      return L('ui.b7b61798329a') + (index + 1) + L('ui.b070151a4ad5') +
        L('ui.79f261454fe5') + index + '" value="' + attr(stage.name || '') + L('ui.b7179a9344e5') +
        L('ui.0a88405ead38') + index + '" value="' + attr((stage.rule && stage.rule.modifier) || '') + L('ui.bb96a38ab2f6') +
        L('ui.91208ac21d1a') + index + '" value="' + attr((stage.rule && stage.rule.enemyHp) || 0) + '"></div>' +
        L('ui.6da2ad41cd5e') + index + '" value="' + attr((stage.rule && stage.rule.enemyDmg) || 0) + '"></div></div>' +
        L('ui.dc5bef10b85b') +
        units.map(unit => '<label class="form-check-inline"><input type="checkbox" data-stage-unit="' + index + '" value="' + attr(unit.id) + '"' + (selected.has(unit.id) ? ' checked' : '') + '> ' + esc(unit.name) + '</label>').join('') +
        '</div></div>';
    }).join('');
    app.openModal({
      title: editing ? L('ui.14df9f49d57a') : L('ui.32c05b5c0d3b'),
      subtitle: L('ui.7fe39afedc72'),
      size: 'large',
      body: L('ui.7605aafd3d73') + attr(editing ? editing.name : '') + L('ui.6ed956a88ae9') + esc(editing ? editing.description : '') + '</textarea></div></div>' +
        L('ui.6492ffc07686') +
        stageRows + '</div>',
      foot: L('ui.0aa62fb98897') + (editing ? ' data-id="' + attr(editing.id) + '"' : '') + L('ui.04124a8cf9e8')
    });
  },

  saveChallengeDesign(app) {
    const nameInput = document.getElementById('challenge-design-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) { app.toast(L('ui.fb3a893b9c5e'), 'error'); return; }
    const description = (document.getElementById('challenge-design-desc') || {}).value || '';
    const stages = [];
    for (let index = 0; index < 3; index += 1) {
      const stageName = (document.querySelector('[data-stage-name="' + index + '"]') || {}).value || '';
      const ruleText = (document.querySelector('[data-stage-rule="' + index + '"]') || {}).value || '';
      const units = [...document.querySelectorAll('[data-stage-unit="' + index + '"]:checked')].map(input => input.value);
      if (!stageName.trim() && !units.length) continue;
      if (!units.length) { app.toast(L('ui.f495347d6acf') + (index + 1) + L('ui.d3f767b41140'), 'error'); return; }
      if (units.length > 5) { app.toast(L('ui.ea9f2ea1e4ed'), 'error'); return; }
      const counted = units.some(id => {
        const unit = Store.index.maps.units.get(id);
        return unit && unit.counted !== false;
      });
      if (!counted) { app.toast(L('ui.f495347d6acf') + (index + 1) + L('ui.fc0796bc6813'), 'error'); return; }
      stages.push({
        name: stageName.trim() || (L('ui.f495347d6acf') + (index + 1) + L('ui.99aedc1c46d6')),
        opponent: { units, equipment: [], runes: [] },
        rule: {
          modifier: ruleText.trim() || L('ui.cc3c32099a74'),
          enemyHp: Math.max(0, Number((document.querySelector('[data-stage-hp="' + index + '"]') || {}).value) || 0),
          enemyDmg: Math.max(0, Number((document.querySelector('[data-stage-dmg="' + index + '"]') || {}).value) || 0)
        }
      });
    }
    if (!stages.length) { app.toast(L('ui.35716345b723'), 'error'); return; }
    const custom = Array.isArray(Store.state.customChallenges) ? Store.state.customChallenges : [];
    const existingId = document.querySelector('[data-action="mode-challenge-design-save"]').dataset.id;
    const existing = existingId ? custom.find(item => item.id === existingId) : null;
    const challenge = existing || { id: 'custom_challenge_' + Date.now().toString(36), custom: true, tag: L('ui.c493338e8c33') };
    challenge.name = name;
    challenge.description = description.trim() || L('ui.66816132b0e4');
    challenge.stages = stages;
    if (!existing) custom.push(challenge);
    Store.state.customChallenges = custom;
    Store.save();
    app.closeModal(true);
    app.render();
    app.toast(existing ? L('ui.26aea9f2cb0e') : L('ui.da4569cacd52'), 'success');
  },

  deleteCustomChallenge(app, challengeId) {
    const custom = Array.isArray(Store.state.customChallenges) ? Store.state.customChallenges : [];
    const target = custom.find(item => item.id === challengeId);
    if (!target) return;
    app.confirm({ title: L('ui.947c7896d3e4'), message: L('ui.3a61f7a24630') + target.name + L('ui.9c8d4e9c33e8'), confirmLabel: L('ui.3755f56f2f83'), danger: true, onConfirm: () => {
      Store.state.customChallenges = custom.filter(item => item.id !== challengeId);
      Store.save();
      app.render();
      app.toast(L('ui.d4c3dd13661c'), 'success');
    } });
  },

  startChallenge(app, challengeId) {
    const existing = Store.state.runs.challenge;
    if (existing && existing.active) {
      app.toast(L('ui.ee8ae2d00079'), 'error');
      return;
    }
    const challenge = this.getChallenge(challengeId);
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
    const challenge = this.getChallenge(run.challengeId);
    if (!challenge) return;
    const stage = challenge.stages[run.stageIndex];
    if (!stage) return;
    const modifiers = { A: { hpFlat: 0, dmgFlat: 0 }, B: this.challengeModifiers(stage) };
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
    const challenge = this.getChallenge(run.challengeId);
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
    const challenge = this.getChallenge(run.challengeId);
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
    Store.archiveRun({ mode: 'challenge', result: L('ui.3e3c8068bb0e'), detail: (this.getChallenge(run.challengeId) || {}).name || '', stage: run.stageIndex + 1 });
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
    const best = this.bestEndlessLayer();
    const historyCount = (Store.state.history || []).filter(entry => entry.mode === 'endless').length;
    if (!run || !run.active) {
      return '' +
        '<div class="page-wrap mode-page">' +
          L('ui.8854413b0ec0') +
          '<section class="panel mt-2"><div class="panel-body"><div class="stack gap-sm">' +
            L('ui.afd5c8d71257') +
            L('ui.369a362145da') +
            L('ui.d98792e3c2dc') + best + L('ui.83e4f0bdf862') +
            L('ui.3abcc2437c1f') +
            L('ui.f2360b965fe8') +
          '</div></div></section>' +
        '</div>';
    }
    this.ensureRunLoadout(run);
    this.ensureRunLineup(run);
    const cards = this.deckPreview(run.deck);
    const lineup = (run.activeUnits || []).map(id => Store.index.maps.units.get(id)).filter(Boolean);
    const upgrades = run.upgrades || {};
    return '' +
      '<div class="page-wrap mode-page">' +
        '<div class="page-head"><div class="page-head-main"><div class="page-kicker">ENDLESS ASCENT / LAYER ' + run.layer + L('ui.64d1e1555d01') + run.layer + L('ui.4ae9c6e4a26e') + Math.max(best, run.layer) + L('ui.69a846a6ebe6') + modeNumber(run.gold) + L('ui.852b858d8c23') + modeNumber(run.wins) + L('ui.50cb892f7534') + (run.awaitingReward ? ' disabled' : '') + L('ui.cff0e1cdf1fe') + run.layer + L('ui.8b5ec58b9bba') +
        (run.awaitingReward ? L('ui.f44a87b2049d') : '') +
        '<div class="endless-layout mt-2"><div class="stack">' +
          L('ui.454c8b2f994d') +
            '<div class="result-stat"><b>' + modeNumber(run.gold) + L('ui.76583e400b50') +
            '<div class="result-stat"><b>' + modeNumber(run.wins) + L('ui.ddbec77e26d6') +
            '<div class="result-stat"><b>+' + modeNumber(upgrades.hpFlat) + ' / +' + modeNumber(upgrades.dmgFlat) + L('ui.73a7c266a49d') +
          L('ui.cd9cb9719782') + (lineup.length ? lineup.map(unit => esc(unit.name)).join('、') : L('ui.22c7d7d787f4')) + '</div></div></section>' +
          L('ui.0cceb3af10c5') + cards.units.length + L('ui.29481633d3cc') + cards.units.map(unit => '<div class="run-deck-item"><img src="' + attr(cardArt(unit)) + '" alt=""><span>' + esc(unit.name) + '</span><small>' + (unit.counted === false ? L('ui.79b46e5f7db7') : L('ui.37802b1dfc26')) + '</small></div>').join('') + '</div><div class="row wrap mt-2">' + cards.equipment.map(item => '<span class="chip gold">' + esc(item.name) + '</span>').join('') + cards.runes.map(item => '<span class="chip violet">' + esc(item.name) + '</span>').join('') + '</div></div></section>' +
          this.renderCharacterShop(app, run, 'endless') +
        '</div><aside class="stack">' +
          L('ui.ffa81b921d31') + best + L('ui.7d613eb63063') + historyCount + L('ui.4cc78a6fe8e3') +
          L('ui.20484c5c6177') +
        '</aside></div>' +
      '</div>';
  },

  startEndless(app) {
    const run = {
      active: true,
      configVersion: modeNumber(this.rogueConfig().version, 2),
      layer: 1,
      wins: 0,
      gold: 30,
      deck: { units: [], equipment: [], runes: [] },
      activeEquipment: [],
      activeRunes: [],
      activeUnits: [],
      characterShop: [],
      upgrades: { hpFlat: 0, dmgFlat: 0, startEffects: [] },
      awaitingReward: false,
      pendingRewards: [],
      startedAt: Date.now(),
      completed: false,
      failed: false
    };
    this.generateCharacterShop(run);
    this.storeRun('endless', run);
    app.render();
    this.openLoadoutModal(app, 'endless');
    app.toast(L('ui.8ea0423bbf55'), 'success');
  },

  startEndlessBattle(app) {
    const run = Store.state.runs.endless;
    if (!run || !run.active) return;
    if (run.awaitingReward) { this.openPendingReward(app, 'endless'); return; }
    if (!this.requireLineup(app, 'endless')) return;
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
      case 'mode-shop-preview':
        this.previewShopOffer(app, data.kind, data.id);
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
      case 'mode-loadout-toggle-unit':
        this.toggleLoadoutUnit(app, data.id);
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
      case 'mode-character-shop-preview':
        this.previewCharacterShop(app, data.id);
        return true;
      case 'mode-character-shop-buy':
        this.buyCharacterFromShop(app, data.mode, Number(data.index));
        return true;
      case 'mode-character-shop-refresh':
        this.refreshCharacterShop(app, data.mode);
        return true;
      case 'mode-challenge-designer':
        this.openChallengeDesigner(app);
        return true;
      case 'mode-challenge-edit':
        this.openChallengeDesigner(app, data.id);
        return true;
      case 'mode-challenge-design-save':
        this.saveChallengeDesign(app);
        return true;
      case 'mode-challenge-delete':
        this.deleteCustomChallenge(app, data.id);
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
