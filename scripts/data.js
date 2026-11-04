/* CaeRogue - default content and shared definitions.
   All runtime state is plain data. Skills and effects are interpreted by engine.js. */
'use strict';

const APP_VERSION = '1.9.31';
const CORE_PACK_ID = 'core';

const QUALITIES = {
  white:   { id: 'white',   label: L('ui.4a1ae3cda4be'), name: L('ui.7cda072d452b'), sigil: 'N', color: '#6f6a60' },
  blue:    { id: 'blue',    label: L('ui.a44c5936fb41'), name: L('ui.0b95bd3a2e02'), sigil: 'R', color: '#496c8a' },
  gold:    { id: 'gold',    label: L('ui.b59df8c44a27'), name: L('ui.bf92a753269a'), sigil: 'S', color: '#9a7738' },
  rainbow: { id: 'rainbow', label: L('ui.d514ab99fff4'), name: L('ui.fb6f06ae0f2d'), sigil: 'X', color: '#7c5b7f' }
};

const SKILL_TYPES = {
  active:  { label: L('ui.bb44dbbcbc17'), hint: L('ui.ed06f9ff9705') },
  passive: { label: L('ui.2e8155cbe0b1'), hint: L('ui.592ea1121df5') },
  extra:   { label: L('ui.4e83c9b6c0ae'), hint: L('ui.7048d444a875') }
};

const SKILL_OPS = {
  attack:  { label: L('ui.8669d2926958'), tone: 'red' },
  heal:    { label: L('ui.ffc7850925e7'), tone: 'green' },
  support: { label: L('ui.6b7ced6690df'), tone: 'blue' },
  debuff:  { label: L('ui.c64b01b4d2ae'), tone: 'violet' },
  special: { label: L('ui.971b6e5a0a75'), tone: 'gold' }
};

const DAMAGE_TYPES = {
  physical: { label: L('ui.0c7c55d841ba'), color: '#FF0000', css: '#c93b35' },
  mental:   { label: L('ui.70ea6ee22925'), color: '#0000FF', css: '#3d51c7' },
  true:     { label: L('ui.bf3d98c8bb4e'), color: '#00FF00', css: '#2f8a50' }
};

const RESISTANCE_TYPES = {
  physical: { label: L('ui.b093013deb74') },
  mental:   { label: L('ui.59840ddb0cd3') },
  general:  { label: L('ui.360fb1266c5e') }
};

const EFFECT_TYPES = {
  positive: { label: L('ui.70c2195016b7') },
  negative: { label: L('ui.1814334f0ae2') },
  special:  { label: L('ui.971b6e5a0a75') }
};

const TRIGGER_EVENTS = {
  actionStart: { label: L('ui.d72893e5f444'), group: L('ui.52d27a21f811') },
  selfActiveSkill: { label: L('ui.8bbfe76b5100'), group: L('ui.bc5a114f901a') },
  roundStart:  { label: L('ui.c9a4a17b9f70'), group: L('ui.52d27a21f811') },
  roundEnd:    { label: L('ui.1b613f8749a8'), group: L('ui.52d27a21f811') },
  allyAttack:  { label: L('ui.35d87db58140'), group: L('ui.bc5a114f901a') },
  selfAttack:  { label: L('ui.a2549b10937e'), group: L('ui.bc5a114f901a') },
  selfAttacked:{ label: L('ui.7b59ce197589'), group: L('ui.bc5a114f901a') },
  fatalDamage: { label: L('ui.0e0bab6c558b'), group: L('ui.bc5a114f901a') },
  retreat:     { label: L('ui.7d55cb7a726e'), group: L('ui.bc5a114f901a') },
  defeated:    { label: L('ui.3751b56658a3'), group: L('ui.bc5a114f901a') },
  enterField:  { label: L('ui.f483f683eb02'), group: L('ui.bc5a114f901a') },
  immediate:   { label: L('ui.38876210d69c'), group: L('ui.151ddd4f1f9f') },
  continuous:  { label: L('ui.ca98a94869b9'), group: L('ui.151ddd4f1f9f') },
  allyHpChange: { label: L('ui.0e2ce7f5ff3c'), group: L('ui.bc5a114f901a') },
  rule:        { label: L('ui.8518fa33bbf3'), group: L('ui.1a26edf94a81') },
  manual:      { label: L('ui.d832a9f5153a'), group: L('ui.1a26edf94a81') }
};

const TARGET_MODES = {
  enemy:     { label: L('ui.6ae8073c14c1'), needsTarget: true, side: 'enemy' },
  allEnemies:{ label: L('ui.426f21cc899b'), needsTarget: false, side: 'enemy' },
  ally:      { label: L('ui.9c23f46cfd9d'), needsTarget: true, side: 'ally' },
  allAllies: { label: L('ui.59a3c70f7d7c'), needsTarget: false, side: 'ally' },
  self:      { label: L('ui.e60de50dcabc'), needsTarget: false, side: 'ally' },
  none:      { label: L('ui.aff42fd2d481'), needsTarget: false, side: 'none' }
};

const COUNT_SCOPES = {
  unit:   { label: L('ui.b224097e8d8a') },
  side:   { label: L('ui.9d45b0283058') },
  global: { label: L('ui.5cff0a15833d') }
};

const STAT_KEYS = {
  atkFlat:       L('ui.783f186b88b9'),
  atkPct:        L('ui.6c64d44c3584'),
  defFlat:       L('ui.783f186b88b9').replace(L('ui.8669d2926958'), L('ui.2029e612c90d')),
  defPct:        L('ui.6c64d44c3584').replace(L('ui.8669d2926958'), L('ui.2029e612c90d')),
  hpFlat:        L('ui.783f186b88b9').replace(L('ui.8669d2926958'), L('ui.b894a8c9982d')),
  hpPct:         L('ui.6c64d44c3584').replace(L('ui.8669d2926958'), L('ui.b894a8c9982d')),
  damageBonus:   L('ui.4bd8ed2c962b'),
  damageBonusFlat:L('ui.68e544367d2b'),
  physicalDmgPct:L('ui.5c44ad9cb59f'),
  mentalDmgPct:  L('ui.32bdf299a118'),
  trueDmgPct:    L('ui.d9f5c61baa64'),
  critRate:      L('ui.1f12be66bf59'),
  critDamage:    L('ui.f9752740590f'),
  luckyRate:     L('ui.6fa3c17fa62e'),
  luckyDamage:   L('ui.00eb79354774'),
  defensePen:    L('ui.c952fc2b048a'),
  resistanceReduction:L('ui.3c43230536ce'),
  damageTakenBonus:L('ui.9da800e2a440'),
  vulnerability: L('ui.ebb32a3138c2'),
  physicalResist:L('ui.6833054c2f95'),
  mentalResist:  L('ui.625d25dc148b'),
  trueResist:    L('ui.e8713ef66248'),
  physicalPen:   L('ui.31039ba8f0e5'),
  mentalPen:     L('ui.ff6a0f3273be'),
  truePen:       L('ui.354bd15118e5'),
  dmgFlat:       L('ui.92d635744318'),
  dmgPct:        L('ui.ea36267c3557'),
  finalDmgFlat:  L('ui.bd760096803a'),
  finalDmgPct:   L('ui.e4619faa99a9'),
  healFlat:      L('ui.4ee4be018404'),
  healPct:       L('ui.f4baecc2fd1a'),
  resistFlat:    L('ui.69868a22f242'),
  takenFlat:     L('ui.b76f5482f3b0'),
  takenPct:      L('ui.4079290660a3'),
  maxHpFlat:     L('ui.04cc6f3f9867')
};


const STEP_LIBRARY = [
  { kind: 'damage', name: L('ui.3b73d2c1c392'), group: L('ui.bc5a114f901a'), hint: L('ui.bf7246a06d6a') },
  { kind: 'heal', name: L('ui.d418d90651aa'), group: L('ui.bc5a114f901a'), hint: L('ui.276aff6947b2') },
  { kind: 'addEffect', name: L('ui.b832e92371f2'), group: L('ui.151ddd4f1f9f'), hint: L('ui.0ba3059bae80') },
  { kind: 'removeEffect', name: L('ui.afbb148eeae6'), group: L('ui.151ddd4f1f9f'), hint: L('ui.91a047e8e7a1') },
  { kind: 'modifyCount', name: L('ui.bd2856e29334'), group: L('ui.37802b1dfc26'), hint: L('ui.04fe3ca69379') },
  { kind: 'readCount', name: L('ui.5d7ec4086403'), group: L('ui.37802b1dfc26'), hint: L('ui.1ee816050042') },
  { kind: 'branch', name: L('ui.315a7ec1a389'), group: L('ui.09d316b96552'), hint: L('ui.98c156cbd4a9') },
  { kind: 'selectTarget', name: L('ui.bd2f8146fd3b'), group: L('ui.09d316b96552'), hint: L('ui.61105280213e') },
  { kind: 'forEach', name: L('ui.4647dbda4e72'), group: L('ui.09d316b96552'), hint: L('ui.9b3705d864cf') },
  { kind: 'loop', name: L('ui.a76d0b303106'), group: L('ui.09d316b96552'), hint: L('ui.372df7af9cd6') },
  { kind: 'castSkill', name: L('ui.0644b8ca4cc0'), group: L('ui.09d316b96552'), hint: L('ui.0843d7f4700f') },
  { kind: 'skipAction', name: L('ui.81390da3a8b1'), group: L('ui.62e951a692ff'), hint: L('ui.db782006ac20') },
  { kind: 'immuneDamage', name: L('ui.17d185d84555'), group: L('ui.62e951a692ff'), hint: L('ui.7775d7d73978') },
  { kind: 'forceRetreat', name: L('ui.040e3da5d8f6'), group: L('ui.62e951a692ff'), hint: L('ui.564d8fd3abb8') },
  { kind: 'summon', name: L('ui.7d5b80ab711f'), group: L('ui.9fdd27834e9e'), hint: L('ui.c673d196182e') },
  { kind: 'modifyStat', name: L('ui.9b0b7dd13e5b'), group: L('ui.62e951a692ff'), hint: L('ui.6d43946e133d') },
  { kind: 'setVar', name: L('ui.d855795cbcea'), group: L('ui.09d316b96552'), hint: L('ui.8dd836c424c2') }
];

const VARIABLE_PALETTE = [
  { token: '$atk', label: L('ui.ef28aed2341d'), hint: L('ui.da064dce5251') },
  { token: '$hpMax', label: L('ui.d941ce1a3da8'), hint: L('ui.d92c9e1ec5d6') },
  { token: '$hp', label: L('ui.cd1893638e3b'), hint: L('ui.388071aec1ec') },
  { token: '$resist', label: L('ui.ca2966dd40db'), hint: L('ui.2fc8e54fc8ee') },
  { token: '$lastHitCount', label: L('ui.fcd9aa7f6568'), hint: L('ui.9222edcb9382') },
  { token: '$multiplier', label: L('ui.7fd7f5dcb8e6'), hint: L('ui.db2c43d5d869') },
  { token: '$targetCount', label: L('ui.41162519d223'), hint: L('ui.84ba22780f49') },
  { token: '{self}.atk', label: L('ui.6f288f758a71'), hint: L('ui.59a60a9339d9') },
  { token: '{self}.max_hp', label: L('ui.6a8755e70791'), hint: L('ui.8c7bd1b88ecf') },
  { token: '{self}.res', label: L('ui.0dc4340c6d0d'), hint: L('ui.718cf4fac7d9') },
  { token: '{target}.hp', label: L('ui.64f3491b3ab6'), hint: L('ui.81ae7b637a62') },
  { token: '{target}.effect[love].count', label: L('ui.bea1991040b9'), hint: L('ui.a7f4417ce1ec') },
  { token: '{eventTarget}.name', label: L('ui.607a5e4f8794'), hint: L('ui.f354a745e741') },
  { token: '$event.amount', label: L('ui.335ab62809a4'), hint: L('ui.76389d13b36b') },
  { token: '$event.changeType', label: L('ui.5b2d75aa54d1'), hint: L('ui.e3dda53bb2af') },
  { token: '$target.hp', label: L('ui.64f3491b3ab6'), hint: L('ui.a8ab4fb9c7d4') },
  { token: '$target.hpMax', label: L('ui.df11866f9c88'), hint: L('ui.14437e721521') },
  { token: '$target.missingHp', label: L('ui.f74648f58960'), hint: L('ui.e59ffd75eda3') },
  { token: '$target.hpPct', label: L('ui.c9e606451a67'), hint: L('ui.2582d65fc810') },
  { token: '$target.hpRatio', label: L('ui.4aa634f299e0'), hint: L('ui.c58b0f4bc069') },
  { token: '$target.atk', label: L('ui.bba2579c4626'), hint: L('ui.1a265f05efe9') },
  { token: '$target.resist', label: L('ui.c125392c5a18'), hint: L('ui.7264bab0f00c') },
  { token: '$target.counted', label: L('ui.4d4e169737dc'), hint: L('ui.99b0fb54eec9') },
  { token: '$target.effectCount', label: L('ui.ee1238ecc804'), hint: L('ui.311d92b9d1ec') },
  { token: '$target.count.ha', label: L('ui.9a9ba4644ccb'), hint: L('ui.4b2d35601b18') },
  { token: '$target.sideCount.ha', label: L('ui.173d77a09106'), hint: L('ui.4b2d35601b18') },
  { token: '$target.effect.poem', label: L('ui.bea1991040b9'), hint: L('ui.9b0b5a94ebdc') },
  { token: '$source.effect.poem', label: L('ui.03e5749fe708'), hint: L('ui.171d42cf5255') },
  { token: '$count.ha', label: L('ui.b224097e8d8a'), hint: L('ui.4b2d35601b18') },
  { token: '$sideCount.ha', label: L('ui.9d45b0283058'), hint: L('ui.4b2d35601b18') },
  { token: '$globalCount.ha', label: L('ui.5cff0a15833d'), hint: L('ui.4b2d35601b18') },
  { token: '$effect.poem', label: L('ui.86ca55e99a3c'), hint: L('ui.739e2c0cf349') }
];

let CORE_PACK = null;

const DEFAULT_LOADOUT_A = { units: [], equipment: [], runes: [] };

const DEFAULT_LOADOUT_B = { units: [], equipment: [], runes: [] };


const DEFAULT_RULES = {
  initialDraw: 10,
  allowDuplicates: false,
  defeatedToDeck: false,
  drawDuringBattle: false,
  drawInterval: 2,
  drawCount: 2,
  maxField: 4
};

const CHALLENGE_DEFINITIONS = [
  {
    id: 'challenge_starrail', name: L('ui.3045483a9fa3'), tag: L('ui.529943f784b7'),
    description: L('ui.20156a44eff0'),
    stages: [
      { name: L('ui.43cf4d571824'), opponent: { units: ['slime_small', 'slime_big', 'catgirl_jk'], equipment: [], runes: [] }, rule: { modifier: L('ui.bbd87f778cd3'), enemyDmg: 1 } },
      { name: L('ui.49bd567add5f'), opponent: { units: ['castorice', 'trainingdummy', 'catgirl_jk'], equipment: [], runes: ['agility'] }, rule: { modifier: L('ui.88162073c793'), enemyHp: 1 } },
      { name: L('ui.f24f0a322181'), opponent: { units: ['castorice', 'trainingdummy', 'catgirl_jk', 'slime_big'], equipment: ['soap'], runes: ['war_spirit', 'agility'] }, rule: { modifier: L('ui.9e1c3bc42abb'), enemyDmg: 1, enemyHp: 2 } }
    ]
  },
  {
    id: 'challenge_moon', name: L('ui.234dd1123ce0'), tag: L('ui.8cf843346916'),
    description: L('ui.174412b24bb8'),
    stages: [
      { name: L('ui.e36ee4d2eaa7'), opponent: { units: ['castorice', 'catgirl_jk', 'slime_big'], equipment: [], runes: [] }, rule: { modifier: L('ui.bbd87f778cd3'), enemyDmg: 1 } },
      { name: L('ui.58b721f9f147'), opponent: { units: ['castorice', 'trainingdummy', 'catgirl_jk'], equipment: ['soap'], runes: ['agility'] }, rule: { modifier: L('ui.8366f2d10dba'), enemyHp: 2 } }
    ]
  },
  {
    id: 'challenge_nectar', name: L('ui.79c95a201348'), tag: L('ui.1471787fb5be'),
    description: L('ui.4311489da66e'),
    stages: [
      { name: L('ui.b72ceeb99ab3'), opponent: { units: ['slime_small', 'slime_big', 'trainingdummy'], equipment: [], runes: ['agility'] }, rule: { modifier: L('ui.88162073c793'), enemyHp: 1 } },
      { name: L('ui.1f20f0636c87'), opponent: { units: ['castorice', 'catgirl_jk', 'trainingdummy', 'slime_big'], equipment: ['soap'], runes: ['war_spirit'] }, rule: { modifier: L('ui.cc5189615234'), enemyDmg: 1, enemyHp: 1 } }
    ]
  }
];


const GAME_MODES = {
  versus:    { name: L('ui.6dbf1f702a07'), short: L('ui.883524f86de6'), icon: 'assets/icons/versus.svg', desc: L('ui.10affce00163') },
  custom:    { name: L('ui.bdf4604699e6'), short: L('ui.c493338e8c33'), icon: 'assets/icons/custom.svg', desc: L('ui.3431a803753a') },
  builder:   { name: L('ui.d5858652d876'), short: L('ui.d5858652d876'), icon: 'assets/icons/library.svg', desc: L('ui.be921da1b1f4') },
  tutorial:  { name: L('ui.0de9c5503e7c'), short: L('ui.b6edf34dbad7'), icon: 'assets/icons/versus.svg', desc: L('ui.283c4cb9b7e3') },
  rogue:     { name: L('ui.85646631c0e1'), short: L('ui.85646631c0e1'), icon: 'assets/icons/rogue.svg', desc: L('ui.c2ec0defa623') },
  challenge: { name: L('ui.9294c931e171'), short: L('ui.9294c931e171'), icon: 'assets/icons/challenge.svg', desc: L('ui.93c4839f3ad2') },
  endless:   { name: L('ui.fb68101a77f8'), short: L('ui.fb68101a77f8'), icon: 'assets/icons/endless.svg', desc: L('ui.efce858b70b8') },
  library:   { name: L('ui.d7e338050780'), short: L('ui.d7e338050780'), icon: 'assets/icons/library.svg', desc: L('ui.942a3f99e9f8') },
  editor:    { name: L('ui.43b5c62dff65'), short: L('ui.86362a82bfb4'), icon: 'assets/icons/editor.svg', desc: L('ui.ac1ad014252c') },
  expansions:{ name: L('ui.a8ef9fc3d8eb'), short: L('ui.a0d4f3417c65'), icon: 'assets/icons/packs.svg', desc: L('ui.aed290d9896c') },
  workshop:  { name: L('ui.64ee9b365cad'), short: L('ui.64ee9b365cad'), icon: 'assets/icons/workshop.svg', desc: L('ui.c359320f80f4') },
  settings:  { name: L('ui.7debf9cb0372'), short: L('ui.7debf9cb0372'), icon: 'assets/icons/settings.svg', desc: L('ui.0548b0eb46d8') }
};

/* Shared helpers for content access. */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyPack(name, author) {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 999).toString(36);
  return {
    format: 'caerogue.expansion',
    id: 'draft-' + suffix,
    name: name || L('ui.5b19b080458f'),
    version: '0.1.0',
    author: author || L('ui.21a877f585cc'),
    description: '',
    dependencies: [],
    countDefs: {},
    content: { units: [], skills: [], effects: [], equipment: [], runes: [] }
  };
}

function contentCount(pack) {
  if (!pack || !pack.content) return 0;
  const cards = (pack.content.units || []).length + (pack.content.equipment || []).length + (pack.content.runes || []).length;
  return cards;
}

function allContentCount(pack) {
  if (!pack || !pack.content) return 0;
  return Object.values(pack.content).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

function getQuality(qualityId) {
  return QUALITIES[qualityId] || QUALITIES.white;
}

function getTriggerLabel(eventId) {
  return TRIGGER_EVENTS[eventId] ? TRIGGER_EVENTS[eventId].label : (eventId || L('ui.55a04b58cd2c'));
}
