/* CaeRogue - canvas effects for battle actions.
   Effects are purely visual; battle state is already resolved before play(). */
'use strict';

const BattleFX = {
  canvas: null,
  ctx: null,
  running: false,
  raf: null,
  fallbackTimer: null,
  done: null,
  effects: [],
  pending: [],
  startTime: 0,
  lastTimestamp: 0,
  width: 0,
  height: 0,
  dpr: 1,
  maxParticles: 900,

  palettes: {
    physical: ['#FF0000', '#E63B35', '#FF6755', '#B71C1C', '#FFAAA0', '#FFD8CC'],
    mental: ['#0000FF', '#3D4BFF', '#6C55FF', '#4433BB', '#9E83FF', '#D9E2FF'],
    true: ['#00FF00', '#27D96A', '#007E3B', '#8BFF9A', '#D9FFD9', '#00B85A'],
    gold: ['#E3BF69', '#B88A38', '#FFF0B8', '#F7D98D', '#8C6726', '#FFF8DF'],
    heal: ['#B7F4C0', '#7DDC9A', '#E3FFE7', '#4CAF76', '#CFF7D9', '#9FE8C7'],
    burn: ['#4E0707', '#771414', '#A3261D', '#C24A2E', '#2B0303', '#E07A4A'],
    violet: ['#665170', '#8F7A9B', '#B9A8C8', '#4D3A58', '#E6DCEC', '#9980A8']
  },

  color(type, index) {
    if (this.palettes[type]) return this.palettes[type][(index || 0) % this.palettes[type].length];
    return this.palettes.true[0];
  },

  init() {
    let canvas = document.getElementById('battle-fx-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'battle-fx-canvas';
      canvas.className = 'battle-fx-canvas';
      canvas.setAttribute('aria-hidden', 'true');
    }
    if (canvas.parentNode !== document.body) document.body.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d');
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return !!this.ctx;
  },

  posFor(event, key, positions) {
    const uid = event[key + 'Uid'];
    if (uid && positions[uid]) return positions[uid];
    const other = event[key === 'source' ? 'targetUid' : 'sourceUid'];
    if (other && positions[other]) {
      const p = positions[other];
      return { x: p.x + 26, y: p.y - 8 };
    }
    const side = event[key + 'Side'];
    const fallback = positions[side === 'A' ? 'field:A' : side === 'B' ? 'field:B' : 'center'];
    if (fallback) return fallback;
    return { x: this.width / 2, y: this.height / 2 };
  },

  play(events, positions, done) {
    this.cancel();
    if (!events || !events.length) { if (done) done(); return; }
    if (!this.init()) { if (done) done(); return; }
    if (typeof Store !== 'undefined' && Store.state && Store.state.settings.reduceMotion) { if (done) done(); return; }
    this.running = true;
    this.done = done || null;
    this.effects = [];
    this.pending = [];
    this.startTime = performance.now();
    this.lastTimestamp = this.startTime;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => { if (this.running) this.finish(); }, 2800);
    positions = positions || {};

    this.floaterStacks = {};
    let offset = 0;
    for (const event of events) {
      if (event.kind === 'damage') {
        const target = this.posFor(event, 'target', positions);
        const source = this.posFor(event, 'source', positions);
        const type = event.type || 'true';
        if (event.burn) {
          this.pending.push({ at: 160 + offset, run: () => this.spawnExplosion(target, 'burn', event.amount, event) });
          offset += 55;
        } else if (event.rider) {
          this.pending.push({ at: 220 + offset, run: () => { this.spawnAura(target, 'gold'); this.spawnExplosion(target, 'true', event.amount, event, 9); } });
          offset += 55;
        } else {
          this.pending.push({
            at: offset,
            run: () => this.spawnProjectile(source, target, type, () => {
              this.spawnExplosion(target, type, event.amount, event);
            }, event.bonus ? 'bonus' : 'attack')
          });
          offset += event.bonus ? 90 : 55;
        }
      } else if (event.kind === 'heal') {
        const target = this.posFor(event, 'target', positions);
        const source = this.posFor(event, 'source', positions);
        if (event.self) {
          this.pending.push({ at: offset, run: () => { this.spawnAura(target, 'heal'); this.spawnFloater(target, event.amount, { type: 'heal', prefix: '+' }); } });
        } else {
          this.pending.push({
            at: offset,
            run: () => this.spawnProjectile(source, target, 'heal', () => {
              this.spawnAura(target, 'heal');
              this.spawnFloater(target, event.amount, { type: 'heal', prefix: '+' });
            }, 'support')
          });
        }
        offset += 70;
      } else if (event.kind === 'support') {
        const target = this.posFor(event, 'target', positions);
        const source = this.posFor(event, 'source', positions);
        if (event.self) {
          this.pending.push({ at: offset, run: () => this.spawnAura(target, 'gold') });
        } else {
          this.pending.push({
            at: offset,
            run: () => this.spawnProjectile(source, target, 'gold', () => this.spawnAura(target, 'gold'), 'support')
          });
        }
        offset += 80;
      } else if (event.kind === 'skill') {
        const source = this.posFor(event, 'source', positions);
        this.pending.push({
          at: offset,
          run: () => this.spawnCastPulse(source, this.castPalette(event), event.name || '技能', false)
        });
        offset += 80;
      } else if (event.kind === 'effect') {
        const target = this.posFor(event, 'target', positions);
        this.pending.push({
          at: offset,
          run: () => this.spawnCastPulse(target, this.castPalette(event), event.name || '效果', event.action === 'remove')
        });
        offset += 70;
      }
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
  },

  cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    this.raf = null;
    const callback = this.done;
    this.running = false;
    this.done = null;
    this.effects = [];
    this.pending = [];
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    if (callback) callback();
  },

  frame(timestamp) {
    if (!this.running) return;
    const ctx = this.ctx;
    const elapsed = timestamp - this.startTime;
    const dt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    while (this.pending.length && this.pending[0].at <= elapsed) {
      const item = this.pending.shift();
      item.run();
    }
    ctx.clearRect(0, 0, this.width, this.height);
    const alive = [];
    for (const effect of this.effects) {
      try {
        if (effect.update(dt)) {
          effect.draw(ctx);
          alive.push(effect);
        }
      } catch (error) {
        console.error(error);
      }
    }
    this.effects = alive;
    if (!this.pending.length && !this.effects.length) {
      this.finish();
      return;
    }
    if (elapsed > 2800) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
  },

  finish() {
    if (!this.running) return;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    this.raf = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    const callback = this.done;
    this.done = null;
    this.effects = [];
    this.pending = [];
    if (callback) callback();
  },

  spawnProjectile(source, target, type, onHit, kind) {
    const center = type === 'heal' ? this.color('heal', 2) : type === 'gold' ? this.color('gold', 0) : this.color(type, 0);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(24, Math.hypot(dx, dy));
    const ux = dx / distance;
    const uy = dy / distance;
    const speed = kind === 'support' ? 430 : 520;
    const acceleration = kind === 'support' ? 520 : 760;
    const headRadius = kind === 'support' ? 5.5 : 6.5;
    const trailPalette = type === 'heal' ? 'heal' : type === 'gold' ? 'gold' : type;
    let px = source.x + ux * 12;
    let py = source.y + uy * 12;
    let travelled = 0;
    let currentSpeed = speed;
    const totalDistance = Math.max(1, distance - 12);
    const effect = {
      update: (dt) => {
        currentSpeed += acceleration * dt;
        const step = currentSpeed * dt;
        travelled += step;
        px += ux * step;
        py += uy * step;
        const trailCount = Math.random() < 0.5 ? 2 : 3;
        for (let i = 0; i < trailCount; i += 1) {
          this.spawnTrail(px, py, ux, uy, currentSpeed, trailPalette, headRadius);
        }
        if (travelled >= totalDistance) {
          px = target.x;
          py = target.y;
          onHit();
          return false;
        }
        return true;
      },
      draw: (ctx) => {
        if (this.effects.length > this.maxParticles) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(px, py, 0, px, py, headRadius * 2.8);
        halo.addColorStop(0, center);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, headRadius * 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = center;
        ctx.beginPath();
        ctx.arc(px, py, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.beginPath();
        ctx.arc(px - ux * 1.4, py - uy * 1.4, headRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
    this.effects.push(effect);
  },

  spawnTrail(px, py, ux, uy, speed, type, headRadius) {
    if (this.effects.length > this.maxParticles) return;
    const index = Math.floor(Math.random() * 6);
    const color = this.color(type, index);
    const inherit = speed * (0.3 + Math.random() * 0.3);
    const back = 18 + Math.random() * 44;
    const vx = ux * (inherit - back) + -uy * (Math.random() * 44 - 22);
    const vy = uy * (inherit - back) + ux * (Math.random() * 44 - 22);
    const speedMag = Math.hypot(vx, vy);
    const decel = 120 + Math.random() * 160;
    const life = 0.24 + Math.random() * 0.34;
    let vxNow = vx;
    let vyNow = vy;
    let age = 0;
    let x = px + (Math.random() * 2 - 1) * 3;
    let y = py + (Math.random() * 2 - 1) * 3;
    const radius = 0.9 + Math.random() * 1.8;
    const effect = {
      update: (dt) => {
        age += dt;
        const cur = Math.hypot(vxNow, vyNow);
        if (cur > 0) {
          const next = Math.max(0, cur - decel * dt);
          vxNow *= next / cur;
          vyNow *= next / cur;
        }
        x += vxNow * dt;
        y += vyNow * dt;
        return age < life;
      },
      draw: (ctx) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / life) * 0.8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius * (1 - age / life * 0.45), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
    this.effects.push(effect);
  },

  damageColor(event) {
    if (event.type === 'physical') return '#FF0000';
    if (event.type === 'mental') return '#0000FF';
    return '#00FF00';
  },

  spawnExplosion(position, type, amount, event, count) {
    const total = count || 15;
    for (let i = 0; i < total; i += 1) {
      if (this.effects.length > this.maxParticles) break;
      const palette = type === 'burn' ? 'burn' : type;
      const color = this.color(palette, i + Math.floor(Math.random() * 6));
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 165;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed * (0.7 + Math.random() * 0.6);
      const decel = 130 + Math.random() * 150;
      const life = 0.35 + Math.random() * 0.45;
      const radius = 1.5 + Math.random() * 3.2;
      let age = 0;
      let x = position.x;
      let y = position.y;
      const effect = {
        update: (dt) => {
          age += dt;
          const cur = Math.hypot(vx, vy);
          if (cur > 0) {
            const next = Math.max(0, cur - decel * dt);
            vx *= next / cur;
            vy *= next / cur;
          }
          x += vx * dt;
          y += vy * dt;
          return age < life;
        },
        draw: (ctx) => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - age / life) * 0.9;
          ctx.fillStyle = color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = color;
          ctx.beginPath();
          ctx.arc(x, y, radius * (1 - age / life * 0.65), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };
      this.effects.push(effect);
    }
    if (event) this.spawnFloater(position, event.amount, { type: event.type, bonus: event.bonus, prefix: '-' });
    this.spawnShockwave(position, type === 'burn' ? '#7A1811' : this.color(type === 'bonus' ? 'true' : type, 0));
  },

  spawnShockwave(position, color) {
    const life = 0.4;
    let age = 0;
    this.effects.push({
      update: (dt) => { age += dt; return age < life; },
      draw: (ctx) => {
        const progress = age / life;
        ctx.save();
        ctx.globalAlpha = (1 - progress) * 0.55;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2 * (1 - progress) + 0.4;
        ctx.beginPath();
        ctx.arc(position.x, position.y, 5 + progress * 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  },

  spawnAura(position, type) {
    const gold = type === 'gold';
    const color = gold ? this.color('gold', 0) : this.color('heal', 1);
    const soft = gold ? this.color('gold', 2) : this.color('heal', 2);
    const life = 0.85;
    let age = 0;
    this.effects.push({
      update: (dt) => { age += dt; return age < life; },
      draw: (ctx) => {
        const progress = Math.min(1, age / life);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, 62);
        glow.addColorStop(0, gold ? 'rgba(255,230,150,.36)' : 'rgba(190,255,205,.36)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(position.x, position.y, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        for (let ring = 0; ring < 2; ring += 1) {
          const local = Math.max(0, progress - ring * 0.16);
          ctx.globalAlpha = Math.max(0, 0.48 * (1 - local));
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(position.x, position.y, 8 + local * (30 + ring * 13), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = Math.max(0, 0.7 * (1 - progress));
        ctx.fillStyle = soft;
        for (let i = 0; i < 9; i += 1) {
          const angle = (i / 9) * Math.PI * 2 + progress * 1.4;
          const radius = 14 + Math.sin(i * 2.3 + progress * 5) * 13 + progress * 12;
          const x = position.x + Math.cos(angle) * radius;
          const y = position.y + Math.sin(angle) * radius * 0.52 - progress * 28;
          ctx.beginPath();
          ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  },

  castPalette(event) {
    if (event.kind === 'effect') {
      if (event.action === 'remove') return 'violet';
      if (event.effectType === 'negative') return 'violet';
      if (event.effectType === 'positive') return 'gold';
      return 'mental';
    }
    switch (event.op) {
      case 'attack': return 'physical';
      case 'heal': return 'heal';
      case 'support': return 'gold';
      case 'debuff': return 'violet';
      default: return 'mental';
    }
  },

  spawnCastPulse(position, paletteName, label, collapsed) {
    const color = this.color(paletteName, 0);
    const soft = this.color(paletteName, 2);
    const life = 0.72;
    let age = 0;
    this.effects.push({
      update: (dt) => { age += dt; return age < life; },
      draw: (ctx) => {
        const progress = Math.min(1, age / life);
        const fade = Math.max(0, 1 - progress);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, 38);
        glow.addColorStop(0, color + '44');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(position.x, position.y, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = color;
        for (let ring = 0; ring < 2; ring += 1) {
          const local = Math.max(0, progress - ring * 0.18);
          const radius = collapsed ? Math.max(2, 28 - local * 24) : 7 + local * (22 + ring * 12);
          ctx.lineWidth = 1 + (1 - local) * 1.2;
          ctx.beginPath();
          ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = fade * 0.65;
        ctx.fillStyle = soft;
        for (let i = 0; i < 8; i += 1) {
          const angle = (i / 8) * Math.PI * 2 + progress * 1.8;
          const radius = (collapsed ? 24 - progress * 16 : 10 + progress * 24) + (i % 3) * 3;
          const x = position.x + Math.cos(angle) * radius;
          const y = position.y + Math.sin(angle) * radius * 0.55 - (collapsed ? 0 : progress * 16);
          ctx.beginPath();
          ctx.arc(x, y, 1.1 + (i % 2) * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.7);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 10px "PingFang SC", "Noto Sans CJK SC", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,252,244,.92)';
        ctx.strokeText(label, position.x, position.y - 30 - progress * 14);
        ctx.fillStyle = color;
        ctx.fillText(label, position.x, position.y - 30 - progress * 14);
        ctx.restore();
      }
    });
  },

  spawnFloater(position, amount, options) {
    options = options || {};
    const color = options.type === 'heal' ? '#3C985F' : this.damageColor({ type: options.type });
    const prefix = options.prefix || '-';
    const label = options.bonus ? '附加' : '';
    const life = 1.05;
    let age = 0;
    const stackKey = Math.round(position.x) + ':' + Math.round(position.y);
    this.floaterStacks = this.floaterStacks || {};
    const stack = this.floaterStacks[stackKey] || 0;
    this.floaterStacks[stackKey] = stack + 1;
    const baseY = position.y - 18 - (stack % 4) * 16;
    this.effects.push({
      update: (dt) => { age += dt; return age < life; },
      draw: (ctx) => {
        const progress = age / life;
        const alpha = progress < 0.55 ? 1 : Math.max(0, 1 - (progress - 0.55) / 0.45);
        const fontSize = String(amount).length >= 7 ? 23 : 29;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 ' + fontSize + 'px "Songti SC", "Noto Serif CJK SC", Georgia, serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,252,244,.9)';
        ctx.strokeText(prefix + amount, position.x, baseY - progress * 28);
        ctx.fillStyle = color;
        ctx.fillText(prefix + amount, position.x, baseY - progress * 28);
        if (label) {
          ctx.font = '700 9px "PingFang SC", "Noto Sans CJK SC", sans-serif';
          ctx.fillStyle = '#5A268D';
          ctx.fillText(label, position.x + (String(amount).length > 5 ? 24 : 17), baseY - progress * 28 - 15);
        }
        ctx.restore();
      }
    });
  }
};

window.BattleFX = BattleFX;
