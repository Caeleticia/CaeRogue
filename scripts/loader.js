/* CaeRogue - external content loader.
   Core cards and default decks are read from data/ so local edits are visible
   without touching application code. Additional packs live in data/pack and
   are listed in data/pack/index.json. */
'use strict';

const DataLoader = {
  manifest: { packs: [] },
  manifestError: '',
  loadedPacks: [],
  rogueEvents: [],
  rogueEventError: '',
  rogueConfig: null,
  rogueConfigError: '',

  async fetchJson(path) {
    const response = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error(path + L('ui.e1268ee276fb') + response.status + '）');
    return response.json();
  },

  async loadCore() {
    const pack = await this.fetchJson('data/pack/defaultcards.json');
    if (!pack || !pack.content) throw new Error(L('ui.961bea0ad837'));
    pack.id = 'core';
    pack.format = 'caerogue.expansion';
    pack.builtin = true;
    for (const category of ['units', 'skills', 'effects', 'equipment', 'runes']) {
      if (!Array.isArray(pack.content[category])) pack.content[category] = [];
      pack.content[category].forEach(item => { item.packId = 'core'; });
    }
    CORE_PACK = pack;
    window.CORE_PACK_BASE = deepClone(pack);

    const [deckA, deckB] = await Promise.all([
      this.fetchJson('data/deck/default_a.json'),
      this.fetchJson('data/deck/default_b.json')
    ]);
    for (const [target, source] of [[DEFAULT_LOADOUT_A, deckA], [DEFAULT_LOADOUT_B, deckB]]) {
      target.units = Array.isArray(source.units) ? source.units.slice() : [];
      target.equipment = Array.isArray(source.equipment) ? source.equipment.slice() : [];
      target.runes = Array.isArray(source.runes) ? source.runes.slice() : [];
    }
    if (typeof Store !== 'undefined' && Store.setDefaultDecks) Store.setDefaultDecks({ A: DEFAULT_LOADOUT_A, B: DEFAULT_LOADOUT_B });
    return pack;
  },

  async loadLocale() {
    // Locale resources are preloaded synchronously by scripts/i18n.js before the
    // application modules are evaluated, so this is intentionally a no-op.
    return window.I18n || null;
  },

  async loadRogueEvents() {
    this.rogueEventError = '';
    try {
      const data = await this.fetchJson('data/rogue/events.json');
      this.rogueEvents = data && Array.isArray(data.events) ? data.events : [];
      if (!Array.isArray(this.rogueEvents)) this.rogueEvents = [];
    } catch (error) {
      this.rogueEvents = [];
      this.rogueEventError = 'data/rogue/events.json: ' + error.message;
    }
    return this.rogueEvents;
  },

  async loadRogueConfig() {
    this.rogueConfigError = '';
    try {
      const data = await this.fetchJson('data/rogue/config.json');
      this.rogueConfig = data && typeof data === 'object' ? data : {};
    } catch (error) {
      this.rogueConfig = {};
      this.rogueConfigError = 'data/rogue/config.json: ' + error.message;
    }
    return this.rogueConfig;
  },

  async loadManifest() {
    this.manifestError = '';
    try {
      const manifest = await this.fetchJson('data/pack/index.json');
      if (!manifest || !Array.isArray(manifest.packs)) {
        this.manifestError = L('ui.c5ad35600a7a');
        this.manifest = { packs: [] };
        return this.manifest;
      }
      this.manifest = manifest;
    } catch (error) {
      this.manifestError = 'data/pack/index.json: ' + error.message;
      this.manifest = { packs: [] };
    }
    return this.manifest;
  },

  async loadExtraPacks(StoreApi) {
    await this.loadManifest();
    const errors = this.manifestError ? [this.manifestError] : [];
    for (const file of this.manifest.packs || []) {
      const clean = String(file || '').trim();
      if (!clean || clean === 'defaultcards.json') continue;
      try {
        const raw = await this.fetchJson('data/pack/' + clean);
        if (!raw || raw.id === CORE_PACK_ID) continue;
        const existing = StoreApi.getPack(raw.id);
        const result = StoreApi.importPack(raw, { replace: !!existing, disabled: false });
        if (!result.ok) throw new Error((result.errors || []).join('；'));
        if (StoreApi.isEnabled && !StoreApi.isEnabled(raw.id)) StoreApi.setEnabled(raw.id, true);
        StoreApi.rebuild();
        this.loadedPacks.push(raw.id);
      } catch (error) {
        errors.push(clean + ': ' + error.message);
      }
    }
    return { errors };
  }
};

window.DataLoader = DataLoader;
