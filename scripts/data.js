/* CaeRogue - default content and shared definitions.
   All runtime state is plain data. Skills and effects are interpreted by engine.js. */
'use strict';

const APP_VERSION = '1.0.0';
const CORE_PACK_ID = 'core';

const QUALITIES = {
  white:   { id: 'white',   label: '白', name: '普通', sigil: 'N', color: '#6f6a60' },
  blue:    { id: 'blue',    label: '蓝', name: '强大', sigil: 'R', color: '#496c8a' },
  gold:    { id: 'gold',    label: '金', name: '极强', sigil: 'S', color: '#9a7738' },
  rainbow: { id: 'rainbow', label: '彩', name: '概念', sigil: 'X', color: '#7c5b7f' }
};

const SKILL_TYPES = {
  active:  { label: '主动技', hint: '仅在自己行动时主动释放，占用行动。' },
  passive: { label: '被动技', hint: '满足触发条件时自动释放，不占用行动。' },
  extra:   { label: '附加技', hint: '满足条件时随时主动释放，不占用行动。' }
};

const SKILL_OPS = {
  attack:  { label: '攻击', tone: 'red' },
  heal:    { label: '回复', tone: 'green' },
  support: { label: '辅助', tone: 'blue' },
  debuff:  { label: '减益', tone: 'violet' },
  special: { label: '特殊', tone: 'gold' }
};

const DAMAGE_TYPES = {
  physical: { label: '物理', color: '#FF0000', css: '#c93b35' },
  mental:   { label: '精神', color: '#0000FF', css: '#3d51c7' },
  true:     { label: '真实', color: '#00FF00', css: '#2f8a50' }
};

const RESISTANCE_TYPES = {
  physical: { label: '物理抗性' },
  mental:   { label: '精神抗性' },
  general:  { label: '通用抗性' }
};

const EFFECT_TYPES = {
  positive: { label: '正面' },
  negative: { label: '负面' },
  special:  { label: '特殊' }
};

const TRIGGER_EVENTS = {
  actionStart: { label: '自身行动开始时', group: '回合' },
  roundStart:  { label: '回合开始时', group: '回合' },
  roundEnd:    { label: '回合结束时', group: '回合' },
  allyAttack:  { label: '我方单位攻击时', group: '战斗' },
  selfAttacked:{ label: '受到攻击时', group: '战斗' },
  fatalDamage: { label: '受到致命伤害时', group: '战斗' },
  defeated:    { label: '被击败时', group: '战斗' },
  enterField:  { label: '入场时', group: '战斗' },
  rule:        { label: '规则被动（常驻）', group: '其他' },
  manual:      { label: '主动释放', group: '其他' }
};

const TARGET_MODES = {
  enemy:     { label: '单体敌方', needsTarget: true, side: 'enemy' },
  allEnemies:{ label: '全体敌方', needsTarget: false, side: 'enemy' },
  ally:      { label: '单体友方', needsTarget: true, side: 'ally' },
  allAllies: { label: '全体友方', needsTarget: false, side: 'ally' },
  self:      { label: '自身', needsTarget: false, side: 'ally' },
  none:      { label: '无目标', needsTarget: false, side: 'none' }
};

const COUNT_SCOPES = {
  unit:   { label: '角色计数' },
  side:   { label: '阵营计数' },
  global: { label: '全场计数' }
};

const STAT_KEYS = {
  atkFlat:       '攻击力提升值',
  atkPct:        '攻击力提升百分比',
  dmgFlat:       '伤害提升值',
  dmgPct:        '伤害提升百分比',
  finalDmgFlat:  '最终伤害提升值',
  finalDmgPct:   '最终伤害提升百分比',
  healFlat:      '回复提升值',
  healPct:       '回复提升百分比',
  resistFlat:    '属性抗性提升',
  resistPct:     '属性抗性提升百分比',
  physicalResist:'物理抗性提升',
  mentalResist:  '精神抗性提升',
  takenFlat:     '受伤降低值',
  takenPct:      '受伤降低百分比',
  maxHpFlat:     '生命上限提升值'
};

const STEP_LIBRARY = [
  { kind: 'damage', name: '造成伤害', group: '战斗', hint: '按公式结算物理、精神或真实伤害。' },
  { kind: 'heal', name: '回复生命', group: '战斗', hint: '按公式回复目标生命，不高于生命上限。' },
  { kind: 'addEffect', name: '附加效果', group: '效果', hint: '为目标附加高级效果，可指定层数。' },
  { kind: 'removeEffect', name: '移除效果', group: '效果', hint: '移除目标的一项或全部可解除效果。' },
  { kind: 'modifyCount', name: '修改计数', group: '计数', hint: '修改角色、阵营或全场计数。' },
  { kind: 'readCount', name: '读取计数', group: '计数', hint: '读取一个计数并写入临时变量。' },
  { kind: 'branch', name: '条件分支', group: '流程', hint: '按左右表达式的比较结果执行不同步骤。' },
  { kind: 'selectTarget', name: '选择目标', group: '流程', hint: '改变后续步骤默认指向的目标集合。' },
  { kind: 'forEach', name: '遍历目标', group: '流程', hint: '依次对目标集合中的单位执行子步骤。' },
  { kind: 'loop', name: '循环', group: '流程', hint: '将子步骤重复执行有限次数。' },
  { kind: 'castSkill', name: '释放技能', group: '流程', hint: '自动释放一个技能，无需手动选中。' },
  { kind: 'skipAction', name: '跳过行动', group: '状态', hint: '令目标本回合剩余行动被消耗。' },
  { kind: 'immuneDamage', name: '免疫此次伤害', group: '状态', hint: '仅在致命伤害或受伤触发中有效。' },
  { kind: 'forceRetreat', name: '强制退场', group: '状态', hint: '使目标离开场地，不结算普通伤害。' },
  { kind: 'summon', name: '召唤单位', group: '场地', hint: '从卡牌库生成单位进入己方空位。' },
  { kind: 'modifyStat', name: '修改属性', group: '状态', hint: '为本场战斗中的目标增加临时属性修正。' },
  { kind: 'setVar', name: '记录临时变量', group: '流程', hint: '把公式结果写入当前技能流程的临时变量。' }
];

const VARIABLE_PALETTE = [
  { token: '$atk', label: '攻击力', hint: '释放者的当前攻击力' },
  { token: '$hpMax', label: '生命上限', hint: '释放者的生命上限' },
  { token: '$hp', label: '当前生命', hint: '释放者的当前生命' },
  { token: '$resist', label: '抗性值', hint: '释放者的基础抗性值' },
  { token: '$lastHitCount', label: '上一击命中数', hint: '最近一次造成伤害命中的目标数' },
  { token: '$multiplier', label: '技能倍率', hint: '技能元数据中的倍率，100 表示 1 倍' },
  { token: '$targetCount', label: '目标数量', hint: '当前目标集合的大小' },
  { token: '$count.ha', label: '角色计数', hint: '把 ha 替换为计数 ID' },
  { token: '$sideCount.ha', label: '阵营计数', hint: '把 ha 替换为计数 ID' },
  { token: '$globalCount.ha', label: '全场计数', hint: '把 ha 替换为计数 ID' },
  { token: '$effect.poem', label: '效果层数', hint: '把 poem 替换为效果 ID' }
];

const CORE_PACK = {
  format: 'caerogue.expansion',
  id: CORE_PACK_ID,
  name: '基础牌组',
  version: '1.0.0',
  author: 'CaeRogue 制作组',
  description: '史莱姆、猫娘、诗篇与不死诅咒。包含游戏运行所需的基础卡牌、技能与高级效果。',
  dependencies: [],
  builtin: true,
  countDefs: { sakurafade: '樱落', ha: '哈气' },
  content: {
    units: [
      {
        id: 'slime_small', packId: CORE_PACK_ID, name: '普通的史莱姆', quality: 'white',
        type: 'unit', faction: 'slime', counted: true, hp: 4, attack: 2,
        resistance: { type: 'physical', value: 1 },
        skills: ['slime_strike'],
        equip: [],
        art: 'assets/pictures/unit-slime-small.svg',
        flavor: '常见的黏液生物。它并没有恶意，只是挡在了路上。'
      },
      {
        id: 'slime_big', packId: CORE_PACK_ID, name: '大大的史莱姆', quality: 'blue',
        type: 'unit', faction: 'slime', counted: true, hp: 6, attack: 2,
        resistance: { type: 'physical', value: 1 },
        skills: ['slime_strike', 'slime_brood'],
        equip: [],
        art: 'assets/pictures/unit-slime-big.svg',
        flavor: '史莱姆的聚合体。倒下去以后，分裂才刚刚开始。'
      },
      {
        id: 'catgirl_jk', packId: CORE_PACK_ID, name: '一般猫娘(jk)', quality: 'blue',
        type: 'unit', faction: 'sakura', counted: true, hp: 9, attack: 2,
        resistance: { type: 'general', value: 1 },
        skills: ['cat_sweep', 'cat_burst'],
        equip: [],
        art: 'assets/pictures/unit-catgirl.svg',
        flavor: '普通的女子高中生，普通的猫耳，普通的樱花。'
      },
      {
        id: 'philia093', packId: CORE_PACK_ID, name: 'Philia093', quality: 'gold',
        type: 'unit', faction: 'choir', counted: false, hp: 4, attack: 0,
        maxHpCap: 4,
        resistance: { type: 'general', value: 0 },
        skills: ['philia_verse', 'philia_epitaph_limit', 'philia_fatal', 'philia_echo'],
        equip: [],
        art: 'assets/pictures/unit-philia.svg',
        flavor: '把每一页诗行钉在世界的伤口上。生命上限固定为四。'
      },
      {
        id: 'yonava', packId: CORE_PACK_ID, name: '若娜瓦', quality: 'rainbow',
        type: 'unit', faction: 'covenant', counted: false, hp: 999, attack: 0,
        resistance: { type: 'general', value: 999 },
        skills: ['yonava_curse'],
        equip: [],
        art: 'assets/pictures/unit-yonava.svg',
        flavor: '她不计数，也不被计数。她只把诅咒递到别人手里，然后离开。'
      }
    ],
    skills: [
      {
        id: 'slime_strike', packId: CORE_PACK_ID, name: '普攻', type: 'active', op: 'attack',
        quality: 'white', targetMode: 'enemy', multiplier: 100,
        description: '主动技，操作攻击。对单个敌方单位造成 2 点物理伤害。',
        trigger: { event: 'manual' }, requirements: [],
        steps: [
          { kind: 'damage', target: 'chosen', damageType: 'physical', formula: '2', ignoreResistance: false }
        ]
      },
      {
        id: 'slime_brood', packId: CORE_PACK_ID, name: '分裂', type: 'passive', op: 'special',
        quality: 'blue', targetMode: 'none', multiplier: 100,
        description: '被动技。被击败时触发，召唤两个“普通的史莱姆”。该触发遵循退场、处决、击败优先级。',
        trigger: { event: 'defeated' }, requirements: [],
        steps: [
          { kind: 'summon', unitId: 'slime_small', count: '2', slot: 'field' }
        ]
      },
      {
        id: 'cat_sweep', packId: CORE_PACK_ID, name: '樱吹雪', type: 'active', op: 'attack',
        quality: 'blue', targetMode: 'allEnemies', multiplier: 80,
        description: '主动技，群攻物理伤害 2 点。造成伤害后，按本次命中的敌人数获得「樱落」。',
        trigger: { event: 'manual' }, requirements: [],
        steps: [
          { kind: 'damage', target: 'chosen', damageType: 'physical', formula: '2', ignoreResistance: false },
          { kind: 'modifyCount', scope: 'unit', countId: 'sakurafade', mode: 'add', formula: '$lastHitCount' }
        ]
      },
      {
        id: 'cat_burst', packId: CORE_PACK_ID, name: '樱落斩', type: 'active', op: 'attack',
        quality: 'blue', targetMode: 'enemy', multiplier: 200,
        description: '主动技，需要「樱落」大于等于 3 才能释放。消耗 3 层「樱落」，对单体造成 4 点物理伤害。',
        trigger: { event: 'manual' },
        requirements: [{ scope: 'unit', countId: 'sakurafade', op: 'gte', value: '3', label: '樱落不少于 3 层' }],
        steps: [
          { kind: 'damage', target: 'chosen', damageType: 'physical', formula: '4', ignoreResistance: false },
          { kind: 'modifyCount', scope: 'unit', countId: 'sakurafade', mode: 'add', formula: '-3' }
        ]
      },
      {
        id: 'philia_verse', packId: CORE_PACK_ID, name: '空白诗行', type: 'active', op: 'support',
        quality: 'gold', targetMode: 'self', multiplier: 100,
        description: '主动技，不造成攻击，获得一层高级效果「诗篇」。',
        trigger: { event: 'manual' }, requirements: [],
        steps: [
          { kind: 'addEffect', target: 'self', effectId: 'poem', stacks: '1' }
        ]
      },
      {
        id: 'philia_epitaph_limit', packId: CORE_PACK_ID, name: '短诗', type: 'passive', op: 'special',
        quality: 'gold', targetMode: 'none', multiplier: 100,
        description: '被动技，规则常驻。生命上限固定为 4。',
        trigger: { event: 'rule' }, requirements: [],
        steps: []
      },
      {
        id: 'philia_fatal', packId: CORE_PACK_ID, name: '尚未完成的诗', type: 'passive', op: 'special',
        quality: 'gold', targetMode: 'self', multiplier: 100,
        description: '被动技。受到致命伤害时，免疫此次伤害，强制回复生命至上限，然后获得一层「诗篇」。',
        trigger: { event: 'fatalDamage' }, requirements: [],
        steps: [
          { kind: 'immuneDamage' },
          { kind: 'heal', target: 'self', formula: '$hpMax - $hp' },
          { kind: 'addEffect', target: 'self', effectId: 'poem', stacks: '1' }
        ]
      },
      {
        id: 'philia_echo', packId: CORE_PACK_ID, name: '回声', type: 'passive', op: 'special',
        quality: 'gold', targetMode: 'none', multiplier: 100,
        description: '被动技。我方单位攻击时触发，对本次攻击目标追加真实伤害，数值为 Philia093 当前「诗篇」层数乘以 2，最多计入 9 层。',
        trigger: { event: 'allyAttack' }, requirements: [],
        steps: [
          { kind: 'damage', target: 'eventTarget', damageType: 'true', formula: 'min($effect.poem, 9) * 2', ignoreResistance: true }
        ]
      },
      {
        id: 'yonava_curse', packId: CORE_PACK_ID, name: '不死诅咒', type: 'active', op: 'special',
        quality: 'rainbow', targetMode: 'ally', multiplier: 100,
        description: '主动技。指定一个我方单位，为其附加高级效果「不死诅咒」，然后若娜瓦立刻退场。',
        trigger: { event: 'manual' }, requirements: [],
        steps: [
          { kind: 'addEffect', target: 'chosen', effectId: 'undying', stacks: '1' },
          { kind: 'forceRetreat', target: 'self' }
        ]
      }
    ],
    effects: [
      {
        id: 'poem', packId: CORE_PACK_ID, name: '诗篇', type: 'positive',
        removable: true, stackable: true, stackMax: 9, mods: {}, grantedSkills: [],
        trigger: { event: 'none' }, steps: [],
        description: '诗篇本身仅作为层数记录，由 Philia093 的被动技能读取。'
      },
      {
        id: 'undying', packId: CORE_PACK_ID, name: '不死诅咒', type: 'special',
        removable: false, stackable: false, stackMax: 1,
        mods: { finalDmgPct: -99999 }, grantedSkills: [],
        trigger: { event: 'fatalDamage' },
        steps: [
          { kind: 'immuneDamage' },
          { kind: 'heal', target: 'self', formula: '$hpMax - $hp' }
        ],
        description: '持有者造成的最终伤害被削减至极限。受到致命伤害或处决时，免疫伤害并强制回复生命至上限。若持有者造成伤害，伤害归零。'
      }
    ],
    equipment: [
      {
        id: 'soap', packId: CORE_PACK_ID, name: '肥皂', quality: 'white', type: 'equipment',
        slot: 'accessory', mods: { dmgFlat: 1 }, grantedSkills: [],
        description: '数值：伤害提升值 +1。滑手，但不影响挥出下一次攻击。',
        art: 'assets/pictures/equipment-soap.svg'
      }
    ],
    runes: [
      {
        id: 'war_spirit', packId: CORE_PACK_ID, name: '战意', quality: 'white', type: 'rune',
        faction: 'any', mods: { dmgFlat: 1 }, grantedSkills: [],
        description: '数值：伤害提升值 +1。所属阵营全体单位有效。',
        art: 'assets/pictures/rune-art.svg'
      },
      {
        id: 'agility', packId: CORE_PACK_ID, name: '敏捷', quality: 'white', type: 'rune',
        faction: 'any', mods: { physicalResist: 1 }, grantedSkills: [],
        description: '数值：物理属性抗性 +1。所属阵营全体单位有效。',
        art: 'assets/pictures/rune-art.svg'
      }
    ]
  }
};

const DEFAULT_LOADOUT_A = {
  units: ['catgirl_jk', 'philia093', 'yonava', 'slime_big', 'slime_small'],
  equipment: ['soap'],
  runes: ['war_spirit', 'agility']
};

const DEFAULT_LOADOUT_B = {
  units: ['slime_small', 'slime_big', 'catgirl_jk', 'philia093'],
  equipment: ['soap'],
  runes: ['agility']
};

const DEFAULT_RULES = {
  initialDraw: 10,
  allowDuplicates: false,
  defeatedToDeck: false,
  drawDuringBattle: false,
  drawInterval: 2,
  drawCount: 2,
  maxField: 3
};

const CHALLENGE_DEFINITIONS = [
  {
    id: 'challenge_poem', name: '无声的诗', tag: '标准',
    description: '在逐渐失控的回声里，击败拥有「诗篇」的守诗人。',
    stages: [
      { name: '第一幕：纸页', opponent: DEFAULT_LOADOUT_B, rule: { modifier: '敌方牌组获得战意', enemyDmg: 1 } },
      { name: '第二幕：回声', opponent: { units: ['philia093', 'catgirl_jk', 'slime_big'], equipment: [], runes: ['war_spirit'] }, rule: { modifier: 'Philia093 入场时获得 2 层诗篇', enemyStartEffect: { target: 'philia093', effect: 'poem', stacks: 2 } } },
      { name: '终幕：诗成', opponent: { units: ['philia093', 'yonava', 'slime_big', 'catgirl_jk'], equipment: ['soap'], runes: ['war_spirit', 'agility'] }, rule: { modifier: '敌方生命上限提高 2 点', enemyHp: 2 } }
    ]
  },
  {
    id: 'challenge_curse', name: '无死之约', tag: '高难',
    description: '若娜瓦的诅咒不会带来死亡，只会让死亡变得漫长。坚持到退场判定失效的一刻。',
    stages: [
      { name: '启约', opponent: { units: ['yonava', 'philia093', 'slime_small'], equipment: [], runes: [] }, rule: { modifier: '若娜瓦开局获得不死诅咒' } },
      { name: '缠约', opponent: { units: ['yonava', 'slime_big', 'slime_big', 'philia093'], equipment: ['soap'], runes: ['agility'] }, rule: { modifier: '敌方全体伤害提升 1', enemyDmg: 1 } }
    ]
  },
  {
    id: 'challenge_endless', name: '灰烬轮转', tag: '试炼',
    description: '三场连续战斗。每场之间不回复生命，但可以调整牌组。',
    stages: [
      { name: '灰一', opponent: DEFAULT_LOADOUT_B, rule: { modifier: '无回复' } },
      { name: '灰二', opponent: { units: ['catgirl_jk', 'slime_big', 'slime_small'], equipment: ['soap'], runes: ['war_spirit'] }, rule: { modifier: '无回复' } },
      { name: '灰三', opponent: { units: ['yonava', 'philia093', 'catgirl_jk'], equipment: [], runes: ['agility'] }, rule: { modifier: '无回复' } }
    ]
  }
];

const GAME_MODES = {
  versus:    { name: '面对面对战', short: '面对面', icon: 'assets/icons/versus.svg', desc: '同屏双人，轮流行动。' },
  custom:    { name: '自定义对战', short: '自定义', icon: 'assets/icons/custom.svg', desc: '不抽牌，以初始构筑直接开战。' },
  rogue:     { name: '肉鸽', short: '肉鸽', icon: 'assets/icons/rogue.svg', desc: '节点地图，队伍与资源贯穿整局。' },
  challenge: { name: '挑战', short: '挑战', icon: 'assets/icons/challenge.svg', desc: '预设高难连续战斗。' },
  endless:   { name: '无尽', short: '无尽', icon: 'assets/icons/endless.svg', desc: '难度随层数上升。' },
  library:   { name: '卡牌库', short: '卡牌库', icon: 'assets/icons/library.svg', desc: '查看卡牌、技能与效果。' },
  editor:    { name: '技能与效果编辑器', short: '编辑器', icon: 'assets/icons/editor.svg', desc: '可视化设计技能流程与状态。' },
  expansions:{ name: '扩展包管理', short: '扩展包', icon: 'assets/icons/packs.svg', desc: '导入、启用、检查扩展内容。' },
  workshop:  { name: '创意工坊', short: '创意工坊', icon: 'assets/icons/workshop.svg', desc: '分享码与本地扩展包管理。' },
  settings:  { name: '设置', short: '设置', icon: 'assets/icons/settings.svg', desc: '显示、战斗与数据设置。' }
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
    name: name || '未命名扩展包',
    version: '0.1.0',
    author: author || '本地作者',
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
  return TRIGGER_EVENTS[eventId] ? TRIGGER_EVENTS[eventId].label : (eventId || '未设置');
}
