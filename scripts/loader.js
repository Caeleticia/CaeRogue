/* CaeRogue - external content loader.
   Core cards and default decks are read from data/ so local edits are visible
   without touching application code. Additional packs live in data/pack and
   are listed in data/pack/index.json. */
'use strict';

const DataLoader = {
  manifest: { packs: [] },
  loadedPacks: [],

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

  async loadManifest() {
    try {
      const manifest = await this.fetchJson('data/pack/index.json');
      this.manifest = manifest && Array.isArray(manifest.packs) ? manifest : { packs: [] };
    } catch (error) {
      this.manifest = { packs: [] };
    }
    return this.manifest;
  },

  async loadExtraPacks(StoreApi) {
    await this.loadManifest();
    const errors = [];
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
        errors.push(clean + '：' + error.message);
      }
    }
    return { errors };
  }
};

window.DataLoader = DataLoader;
