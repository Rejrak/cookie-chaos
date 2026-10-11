import { P0, seededRandom, type ArenaKind, type CookieKind, type ShooterRules } from './config';

export type Body = { id: number; kind: CookieKind; x: number; y: number; vx: number; vy: number; hp: number; stuckMs: number };
export type Bullet = { x: number; y: number; vx: number; vy: number; lifeMs: number; bounces: number };
export type Phase = 'PREP' | 'RUNNING' | 'WON' | 'LOST' | 'AWAITING_BOSS_IMPLEMENTATION';
export type Event = { type: 'destroy' | 'escape' | 'hit' | 'shot' | 'bounce'; kind?: CookieKind; x?: number; y?: number };

function clamp(value: number, low: number, high: number) { return Math.min(high, Math.max(low, value)); }
function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: ax + t * dx, y: ay + t * dy };
}
function sweepCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): number | null {
  const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
  const a = dx * dx + dy * dy, b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const determinant = b * b - 4 * a * c;
  if (a === 0 || determinant < 0) return null;
  const t = (-b - Math.sqrt(determinant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export class P0Simulation {
  readonly seed: number;
  readonly arena: ArenaKind;
  readonly initialCredit: bigint;
  readonly rules: ShooterRules;
  readonly events: Event[] = [];
  readonly cookies: Body[] = [];
  readonly bullets: Bullet[] = [];
  readonly destroyed: Record<CookieKind, number> = { NORMAL: 0, HARD: 0, GOLDEN: 0 };
  readonly escaped: Record<CookieKind, number> = { NORMAL: 0, HARD: 0, GOLDEN: 0 };
  readonly waveDurations: { attempt: number; wave: number; durationMs: number }[] = [];
  readonly purchases: { kind: 'damage' | 'fireRate'; cost: string; timeMs: number }[] = [];
  readonly waveBudgets: { attempt: number; wave: number; scheduled: number; generated: number; unspawned: number; potentialSp: number }[] = [];
  phase: Phase = 'PREP';
  hp: number;
  maxHp: number;
  stageEntryHp: number = P0.maxHp;
  sp = 0;
  consolidated: bigint;
  provisional = 0n;
  damageLevel = 0;
  fireRateLevel = 0;
  retryCount = 0;
  recoveryCount = 0;
  totalRecoveryWaves = 0;
  wave = -1;
  waveTimeMs = 0;
  waveDurationMs: number = P0.waveMs;
  totalTimeMs = 0;
  shots = 0;
  hits = 0;
  ricochetHits = 0;
  damageTaken = 0;
  rejectedSpawns = 0;
  removedOnLoss = 0;
  generatedPotentialSp = 0;
  unspawned: Record<CookieKind, number> = { NORMAL: 0, HARD: 0, GOLDEN: 0 };
  private random: () => number;
  private id = 0;
  private queue: CookieKind[] = [];
  private waveScheduled = 0;
  private waveGenerated = 0;
  private wavePotentialSp = 0;
  private spawnElapsed = 0;
  private fireElapsed = 0;
  private accumulator = 0;
  private firing = false;
  private aimX = 0;
  private aimY = 0;

  constructor(public width: number, public height: number, arena: ArenaKind, seed: number, initialCredit = 0n,
    options: { rules?: ShooterRules; maxHp?: number; hp?: number } = {}) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 160 || height < 150 ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || initialCredit < 0n ||
      (arena !== 'FREE' && arena !== 'OBSTACLE')) throw new RangeError('Invalid P0 setup');
    this.arena = arena;
    this.rules = options.rules ?? { targetSp: P0.targetSp, waves: P0.waves, spawnMs: P0.spawnMs,
      waveMs: P0.waveMs, maxActive: Number.POSITIVE_INFINITY, bossCheckpoint: false };
    this.maxHp = options.maxHp ?? P0.maxHp;
    this.hp = options.hp ?? this.maxHp;
    if (!Number.isSafeInteger(this.maxHp) || this.maxHp < 1 || !Number.isSafeInteger(this.hp) || this.hp < 1 || this.hp > this.maxHp)
      throw new RangeError('Invalid base HP');
    this.stageEntryHp = this.hp;
    this.seed = seed;
    this.random = seededRandom(seed);
    this.initialCredit = initialCredit;
    this.consolidated = initialCredit;
    this.aimX = width / 2;
  }

  get obstacle() {
    return this.arena === 'OBSTACLE' ? {
      ax: this.width * 0.17, ay: this.height * 0.43,
      bx: this.width * 0.48, by: this.height * 0.36,
    } : null;
  }
  get cookieRadius() { return clamp(this.width * P0.cookieWidthFraction, P0.cookieRadius, P0.maxCookieRadius); }
  get bulletRadius() { return Math.max(P0.bulletRadius, this.cookieRadius * P0.projectileRadiusFraction); }
  get obstacleHalfWidth() { return this.cookieRadius * P0.obstacleHalfWidthFraction; }
  get groundY() { return this.height - Math.max(30, this.cookieRadius * 1.55); }
  get cannonX() { return this.width / 2; }
  get cannonY() { return this.height - this.cookieRadius - 1; }
  get projectileSpeed() { return this.height * 1000 / P0.projectileTravelMs; }
  get aimPoint() { return { x: this.aimX, y: this.aimY }; }
  get fireRate() { return 3 + this.fireRateLevel; }
  get damage() { return 1 + this.damageLevel; }
  get accuracy() { return this.shots ? this.hits / this.shots : 0; }
  get waveLabel() { return this.wave < this.rules.waves.length ? `Wave ${this.wave + 1}/${this.rules.waves.length}` : `Recovery ${this.wave - this.rules.waves.length + 1}/2`; }

  setAim(x: number, y: number, firing: boolean) {
    this.aimX = clamp(x, 0, this.width);
    this.aimY = clamp(y, 0, this.cannonY - 1);
    this.firing = firing;
  }
  release() { this.firing = false; }

  buy(kind: 'damage' | 'fireRate'): boolean {
    if (this.phase !== 'PREP') return false;
    const level = kind === 'damage' ? this.damageLevel : this.fireRateLevel;
    const cost = kind === 'damage' ? P0.damageCost : P0.fireRateCost;
    if (level >= 1 || this.consolidated < cost) return false;
    this.consolidated -= cost;
    if (kind === 'damage') this.damageLevel++;
    else this.fireRateLevel++;
    this.purchases.push({ kind, cost: cost.toString(), timeMs: this.totalTimeMs });
    return true;
  }

  startWave(): boolean {
    if (this.phase !== 'PREP') return false;
    this.wave++;
    if (this.wave < this.rules.waves.length) {
      const counts = this.rules.waves[this.wave];
      this.queue = [...Array(counts.NORMAL).fill('NORMAL'), ...Array(counts.HARD).fill('HARD'), ...Array(counts.GOLDEN).fill('GOLDEN')];
    } else {
      this.recoveryCount++;
      this.totalRecoveryWaves++;
      const deficit = Math.max(1, this.rules.targetSp - this.sp);
      const hard = Math.max(1, Math.ceil(deficit / 6) + this.recoveryCount - 1);
      const normal = Math.max(2, deficit - 3 * hard + 2);
      this.queue = [...Array(normal).fill('NORMAL'), ...Array(hard).fill('HARD')];
    }
    // Shuffle within the fixed wave budget; no hidden random source.
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.phase = 'RUNNING';
    this.waveDurationMs = this.wave < this.rules.waves.length ? this.rules.waveMs : Math.max(this.rules.waveMs, (this.queue.length + 1) * this.rules.spawnMs + 6_000);
    this.waveScheduled = this.queue.length;
    this.waveGenerated = 0;
    this.wavePotentialSp = 0;
    this.waveTimeMs = 0;
    this.spawnElapsed = 0;
    this.fireElapsed = 1000 / this.fireRate;
    this.spawn();
    return true;
  }

  retry(): boolean {
    if (this.phase !== 'LOST') return false;
    this.retryCount++;
    this.hp = Math.min(this.maxHp, Math.max(this.stageEntryHp, Math.ceil(this.maxHp / 2)));
    this.sp = 0;
    this.provisional = 0n;
    this.wave = -1;
    this.recoveryCount = 0;
    this.cookies.length = 0;
    this.bullets.length = 0;
    this.queue = [];
    this.accumulator = 0;
    this.phase = 'PREP';
    this.release();
    return true;
  }

  resize(width: number, height: number) {
    if (width < 160 || height < 150) return;
    const sx = width / this.width, sy = height / this.height;
    this.width = width; this.height = height;
    const radius = this.cookieRadius;
    for (const body of this.cookies) {
      body.x = clamp(body.x * sx, radius, width - radius);
      body.y = clamp(body.y * sy, radius, this.groundY - radius);
    }
    for (const bullet of this.bullets) { bullet.x *= sx; bullet.y *= sy; bullet.vx *= sy; bullet.vy *= sy; }
    this.aimX *= sx; this.aimY *= sy;
    for (const body of this.cookies) this.collideObstacle(body);
    this.separateCookies();
  }

  advance(deltaMs: number) {
    this.events.length = 0;
    if (this.phase !== 'RUNNING' || !Number.isFinite(deltaMs) || deltaMs < 0) return;
    this.accumulator += deltaMs;
    while (this.accumulator + 1e-7 >= P0.stepMs && this.phase === 'RUNNING') {
      this.step(P0.stepMs);
      if (this.phase !== 'RUNNING') { this.accumulator = 0; break; }
      this.accumulator -= P0.stepMs;
    }
  }

  private step(ms: number) {
    const dt = ms / 1000;
    this.totalTimeMs += ms;
    this.waveTimeMs += ms;
    this.spawnElapsed += ms;
    this.fireElapsed += ms;
    while (this.queue.length && this.spawnElapsed >= this.rules.spawnMs && this.waveTimeMs < this.waveDurationMs) {
      this.spawnElapsed -= this.rules.spawnMs;
      this.spawn();
    }
    if (this.waveTimeMs >= this.waveDurationMs && this.queue.length) {
      for (const kind of this.queue) this.unspawned[kind]++;
      this.queue.length = 0;
    }
    if (this.firing) {
      const interval = 1000 / this.fireRate;
      while (this.fireElapsed >= interval) { this.fireElapsed -= interval; this.shoot(); }
    } else this.fireElapsed = Math.min(this.fireElapsed, 1000 / this.fireRate);

    for (const body of this.cookies) {
      const fallDistance = Math.max(30, this.groundY - 2 * this.cookieRadius);
      const fallSeconds = P0.fallSeconds[body.kind];
      const gravity = 2 * fallDistance / (fallSeconds * fallSeconds);
      const terminal = 2.4 * fallDistance / fallSeconds;
      body.vy = Math.min(terminal, body.vy + gravity * dt);
      body.x += body.vx * dt; body.y += body.vy * dt;
      const r = this.cookieRadius;
      if (body.x < r || body.x > this.width - r) {
        body.x = clamp(body.x, r, this.width - r); body.vx *= -0.65;
      }
      if (body.y < r) { body.y = r; body.vy = Math.abs(body.vy) * 0.55; }
      this.collideObstacle(body);
      if (Math.hypot(body.vx, body.vy) < 13) body.stuckMs += ms;
      else body.stuckMs = 0;
      if (body.stuckMs > 800) { body.vy = Math.max(body.vy, 35 + body.stuckMs / 80); body.vx *= 0.95; }
      if (body.stuckMs > 2500) { body.y = Math.min(this.groundY - r, body.y + 1); body.vy = Math.max(body.vy, 80); }
    }
    this.separateCookies();
    for (let i = this.cookies.length - 1; i >= 0; i--) {
      const body = this.cookies[i];
      if (body.y + this.cookieRadius >= this.groundY) {
        this.cookies.splice(i, 1);
        this.escaped[body.kind]++;
        const damage = P0.cookies[body.kind].groundDamage;
        this.hp = Math.max(0, this.hp - damage);
        this.damageTaken += damage;
        this.events.push({ type: 'escape', kind: body.kind, x: body.x, y: body.y });
        if (!this.hp) { this.lose(); return; }
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.lifeMs -= ms;
      let remaining = dt, removed = false;
      for (let bounce = 0; bounce < 8 && remaining > 1e-8; bounce++) {
        const x0 = bullet.x, y0 = bullet.y, dx = bullet.vx * remaining, dy = bullet.vy * remaining;
        const x1 = x0 + dx, y1 = y0 + dy;
        let earliest = 1.000001;
        let target: Body | null = null;
        let surface: 'obstacle' | 'wall' | 'edge' | null = null;
        let nx = 0, ny = 0;
        const obstacle = this.obstacleHit(x0, y0, x1, y1);
        if (obstacle) { earliest = obstacle.t; surface = 'obstacle'; nx = obstacle.nx; ny = obstacle.ny; }
        if (dx < 0 && x1 < this.bulletRadius) { const t = (this.bulletRadius - x0) / dx; if (t >= 0 && t < earliest) { earliest = t; surface = 'wall'; nx = 1; ny = 0; } }
        if (dx > 0 && x1 > this.width - this.bulletRadius) { const t = (this.width - this.bulletRadius - x0) / dx; if (t >= 0 && t < earliest) { earliest = t; surface = 'wall'; nx = -1; ny = 0; } }
        if (dy < 0 && y1 < 0) { const t = -y0 / dy; if (t >= 0 && t < earliest) { earliest = t; surface = 'edge'; } }
        if (dy > 0 && y1 >= this.groundY) { const t = (this.groundY - y0) / dy; if (t >= 0 && t < earliest) { earliest = t; surface = 'edge'; } }
        for (const body of this.cookies) {
          const t = sweepCircle(x0, y0, x1, y1, body.x, body.y, this.cookieRadius + this.bulletRadius);
          if (t !== null && t < earliest - 1e-8) { earliest = t; target = body; surface = null; }
        }
        if (earliest > 1) { bullet.x = x1; bullet.y = y1; break; }
        bullet.x = x0 + dx * earliest; bullet.y = y0 + dy * earliest;
        if (target) {
          this.bullets.splice(i, 1); removed = true;
          this.hits++;
          if (bullet.bounces) this.ricochetHits++;
          this.events.push({ type: 'hit', kind: target.kind, x: target.x, y: target.y });
          target.hp = Math.max(0, target.hp - this.damage);
          if (!target.hp) this.destroy(target);
          break;
        }
        if (surface === 'edge') { this.bullets.splice(i, 1); removed = true; break; }
        if (surface === 'wall' || surface === 'obstacle') {
          const dot = bullet.vx * nx + bullet.vy * ny;
          bullet.vx -= 2 * dot * nx; bullet.vy -= 2 * dot * ny;
          bullet.x += nx * 0.1; bullet.y += ny * 0.1;
          bullet.bounces++;
          this.events.push({ type: 'bounce', x: bullet.x, y: bullet.y });
          remaining *= 1 - earliest;
        }
      }
      if (!removed && bullet.lifeMs <= 0) this.bullets.splice(i, 1);
    }
    if (!this.queue.length && !this.cookies.length) this.finishWave();
  }

  private spawn() {
    if (!this.queue.length) return;
    const radius = this.cookieRadius;
    if (this.cookies.length >= Math.min(this.rules.maxActive, Math.max(4, Math.floor(this.width / (radius * 3.4))))) { this.rejectedSpawns++; return; }
    const kind = this.queue[0];
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = radius + this.random() * (this.width - 2 * radius);
      const y = radius + this.random() * 10;
      if (this.cookies.some(body => Math.hypot(body.x - x, body.y - y) < 2 * radius + 3)) continue;
      this.cookies.push({ id: ++this.id, kind, x, y, vx: (this.random() - 0.5) * 38, vy: 0, hp: P0.cookies[kind].hp, stuckMs: 0 });
      this.queue.shift(); this.waveGenerated++; this.wavePotentialSp += P0.cookies[kind].sp;
      this.generatedPotentialSp += P0.cookies[kind].sp; return;
    }
    this.rejectedSpawns++;
  }

  private shoot() {
    const dx = this.aimX - this.cannonX, dy = this.aimY - this.cannonY;
    const length = Math.hypot(dx, dy) || 1;
    const speed = this.projectileSpeed;
    this.bullets.push({ x: this.cannonX, y: this.cannonY - this.cookieRadius * 0.85, vx: dx / length * speed, vy: dy / length * speed, lifeMs: P0.bulletLifeMs, bounces: 0 });
    this.shots++;
    this.events.push({ type: 'shot' });
  }

  private destroy(body: Body) {
    const index = this.cookies.indexOf(body);
    if (index < 0) return;
    this.cookies.splice(index, 1);
    this.destroyed[body.kind]++;
    this.sp += P0.cookies[body.kind].sp;
    this.provisional += P0.cookies[body.kind].reward;
    this.events.push({ type: 'destroy', kind: body.kind, x: body.x, y: body.y });
  }

  private separateCookies() {
    const min = 2 * this.cookieRadius;
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < this.cookies.length; i++) for (let j = i + 1; j < this.cookies.length; j++) {
        const a = this.cookies[i], b = this.cookies[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= min) continue;
        if (distance < 0.001) { dx = 1; dy = 0; distance = 1; }
        const nx = dx / distance, ny = dy / distance, overlap = (min - distance) / 2;
        a.x = clamp(a.x - nx * overlap, this.cookieRadius, this.width - this.cookieRadius);
        b.x = clamp(b.x + nx * overlap, this.cookieRadius, this.width - this.cookieRadius);
        a.y = Math.max(this.cookieRadius, a.y - ny * overlap);
        b.y = Math.max(this.cookieRadius, b.y + ny * overlap);
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative < 0) {
          const impulse = -0.7 * relative;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;
        }
      }
    }
  }

  private collideObstacle(body: Body) {
    const obstacle = this.obstacle;
    if (!obstacle) return;
    const point = distanceToSegment(body.x, body.y, obstacle.ax, obstacle.ay, obstacle.bx, obstacle.by);
    const dx = body.x - point.x, dy = body.y - point.y, distance = Math.hypot(dx, dy);
    const min = this.cookieRadius + this.obstacleHalfWidth;
    if (distance >= min) return;
    const nx = distance > 0.001 ? dx / distance : 0, ny = distance > 0.001 ? dy / distance : -1;
    body.x += nx * (min - distance); body.y += ny * (min - distance);
    const inward = body.vx * nx + body.vy * ny;
    if (inward < 0) { body.vx -= 1.5 * inward * nx; body.vy -= 1.5 * inward * ny; }
  }

  private obstacleHit(x0: number, y0: number, x1: number, y1: number): { t: number; nx: number; ny: number } | null {
    const obstacle = this.obstacle;
    if (!obstacle) return null;
    const ax = obstacle.ax, ay = obstacle.ay, bx = obstacle.bx, by = obstacle.by;
    const dx = x1 - x0, dy = y1 - y0;
    const length = Math.hypot(bx - ax, by - ay);
    const tx = (bx - ax) / length, ty = (by - ay) / length;
    const normalX = -ty, normalY = tx;
    const radius = this.bulletRadius + this.obstacleHalfWidth;
    let best: { t: number; nx: number; ny: number } | null = null;
    const signed = (x0 - ax) * normalX + (y0 - ay) * normalY;
    const normalMove = dx * normalX + dy * normalY;
    for (const side of [-1, 1]) {
      if (side * normalMove >= 0) continue;
      const t = (side * radius - signed) / normalMove;
      const along = (x0 + dx * t - ax) * tx + (y0 + dy * t - ay) * ty;
      if (t >= 0 && t <= 1 && along >= 0 && along <= length && (!best || t < best.t))
        best = { t, nx: side * normalX, ny: side * normalY };
    }
    for (const [ex, ey] of [[ax, ay], [bx, by]]) {
      const t = sweepCircle(x0, y0, x1, y1, ex, ey, radius);
      if (t === null || (best && t >= best.t)) continue;
      const nx = (x0 + dx * t - ex) / radius, ny = (y0 + dy * t - ey) / radius;
      if (dx * nx + dy * ny < 0) best = { t, nx, ny };
    }
    return best;
  }

  private finishWave() {
    this.waveBudgets.push({ attempt: this.retryCount + 1, wave: this.wave + 1, scheduled: this.waveScheduled, generated: this.waveGenerated,
      unspawned: this.waveScheduled - this.waveGenerated, potentialSp: this.wavePotentialSp });
    this.waveDurations.push({ attempt: this.retryCount + 1, wave: this.wave + 1, durationMs: this.waveTimeMs });
    this.release();
    this.bullets.length = 0;
    if (this.wave < this.rules.waves.length - 1) { this.phase = 'PREP'; return; }
    if (this.sp >= this.rules.targetSp) {
      if (this.rules.bossCheckpoint) { this.phase = 'AWAITING_BOSS_IMPLEMENTATION'; return; }
      this.phase = 'WON'; this.consolidated += this.provisional; this.provisional = 0n; return;
    }
    if (this.recoveryCount >= 2) { this.lose(); return; }
    this.phase = 'PREP';
  }

  private lose() {
    if (this.queue.length) {
      for (const kind of this.queue) this.unspawned[kind]++;
      this.queue.length = 0;
    }
    if (this.waveBudgets.at(-1)?.attempt !== this.retryCount + 1 || this.waveBudgets.at(-1)?.wave !== this.wave + 1)
      this.waveBudgets.push({ attempt: this.retryCount + 1, wave: this.wave + 1, scheduled: this.waveScheduled, generated: this.waveGenerated,
        unspawned: this.waveScheduled - this.waveGenerated, potentialSp: this.wavePotentialSp });
    const last = this.waveDurations.at(-1);
    if (this.phase === 'RUNNING' && (last?.attempt !== this.retryCount + 1 || last?.wave !== this.wave + 1))
      this.waveDurations.push({ attempt: this.retryCount + 1, wave: this.wave + 1, durationMs: this.waveTimeMs });
    this.phase = 'LOST'; this.removedOnLoss += this.cookies.length; this.cookies.length = 0; this.bullets.length = 0;
    this.provisional = 0n; this.release();
  }

  metrics() {
    return {
      seed: this.seed, arena: this.arena, initialCredit: this.initialCredit.toString(),
      config: { targetSp: this.rules.targetSp, maxHp: this.maxHp, ordinaryWaveMs: this.rules.waveMs, currentWaveMs: this.waveDurationMs, spawnMs: this.rules.spawnMs,
        cookieRadius: this.cookieRadius, bulletRadius: this.bulletRadius, projectileSpeed: this.projectileSpeed },
      viewport: { width: this.width, height: this.height },
      phase: this.phase, wave: this.waveLabel, waveDurationsMs: this.waveDurations,
      totalTimeMs: Math.round(this.totalTimeMs), shots: this.shots, hits: this.hits,
      accuracy: this.accuracy, ricochetHits: this.ricochetHits,
      destroyed: this.destroyed, escaped: this.escaped, hp: this.hp, damageTaken: this.damageTaken,
      stagePoints: this.sp, provisionalCookies: this.provisional.toString(),
      consolidatedCookies: this.consolidated.toString(), damageLevel: this.damageLevel,
      fireRateLevel: this.fireRateLevel, purchases: this.purchases,
      retries: this.retryCount, recoveryWaves: this.recoveryCount, totalRecoveryWaves: this.totalRecoveryWaves,
      rejectedSpawns: this.rejectedSpawns, removedOnLoss: this.removedOnLoss,
      waveBudgets: this.waveBudgets, generatedPotentialSp: this.generatedPotentialSp, unspawned: this.unspawned,
    };
  }
}
