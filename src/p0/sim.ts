import { P0, seededRandom, type ArenaKind, type CookieKind } from './config';

export type Body = { id: number; kind: CookieKind; x: number; y: number; vx: number; vy: number; hp: number; stuckMs: number };
export type Bullet = { x: number; y: number; vx: number; vy: number; lifeMs: number; bounces: number };
export type Phase = 'PREP' | 'RUNNING' | 'WON' | 'LOST';
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
  readonly events: Event[] = [];
  readonly cookies: Body[] = [];
  readonly bullets: Bullet[] = [];
  readonly destroyed: Record<CookieKind, number> = { NORMAL: 0, HARD: 0, GOLDEN: 0 };
  readonly escaped: Record<CookieKind, number> = { NORMAL: 0, HARD: 0, GOLDEN: 0 };
  readonly waveDurations: { attempt: number; wave: number; durationMs: number }[] = [];
  readonly purchases: { kind: 'damage' | 'fireRate'; cost: string; timeMs: number }[] = [];
  phase: Phase = 'PREP';
  hp: number = P0.maxHp;
  stageEntryHp = P0.maxHp;
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
  private random: () => number;
  private id = 0;
  private queue: CookieKind[] = [];
  private spawnElapsed = 0;
  private fireElapsed = 0;
  private accumulator = 0;
  private firing = false;
  private aimX = 0;
  private aimY = 0;

  constructor(public width: number, public height: number, arena: ArenaKind, seed: number, initialCredit = 0n) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 160 || height < 150 ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || initialCredit < 0n ||
      (arena !== 'FREE' && arena !== 'OBSTACLE')) throw new RangeError('Invalid P0 setup');
    this.arena = arena;
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
  get groundY() { return this.height - 30; }
  get cannonX() { return this.width / 2; }
  get cannonY() { return this.height - 20; }
  get aimPoint() { return { x: this.aimX, y: this.aimY }; }
  get fireRate() { return this.fireRateLevel ? 4 : 3; }
  get damage() { return 1 + this.damageLevel; }
  get accuracy() { return this.shots ? this.hits / this.shots : 0; }
  get waveLabel() { return this.wave < 3 ? `Wave ${this.wave + 1}/3` : `Recovery ${this.wave - 2}/2`; }

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
    if (this.wave < 3) {
      const counts = P0.waves[this.wave];
      this.queue = [...Array(counts.NORMAL).fill('NORMAL'), ...Array(counts.HARD).fill('HARD'), ...Array(counts.GOLDEN).fill('GOLDEN')];
    } else {
      this.recoveryCount++;
      this.totalRecoveryWaves++;
      const deficit = Math.max(1, P0.targetSp - this.sp);
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
    this.waveDurationMs = this.wave < 3 ? P0.waveMs : Math.max(P0.waveMs, (this.queue.length + 1) * P0.spawnMs + 6_000);
    this.waveTimeMs = 0;
    this.spawnElapsed = 0;
    this.fireElapsed = 1000 / this.fireRate;
    this.spawn();
    return true;
  }

  retry(): boolean {
    if (this.phase !== 'LOST') return false;
    this.retryCount++;
    this.hp = Math.min(P0.maxHp, Math.max(this.stageEntryHp, Math.ceil(P0.maxHp / 2)));
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
    for (const body of this.cookies) {
      body.x = clamp(body.x * sx, P0.cookieRadius, width - P0.cookieRadius);
      body.y = clamp(body.y * sy, P0.cookieRadius, height - 30 - P0.cookieRadius);
    }
    for (const bullet of this.bullets) { bullet.x *= sx; bullet.y *= sy; bullet.vx *= sy; bullet.vy *= sy; }
    this.aimX *= sx; this.aimY *= sy;
    this.width = width; this.height = height;
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
    while (this.queue.length && this.spawnElapsed >= P0.spawnMs && this.waveTimeMs < this.waveDurationMs) {
      this.spawnElapsed -= P0.spawnMs;
      this.spawn();
    }
    if (this.waveTimeMs >= this.waveDurationMs) this.queue.length = 0;
    if (this.firing) {
      const interval = 1000 / this.fireRate;
      while (this.fireElapsed >= interval) { this.fireElapsed -= interval; this.shoot(); }
    } else this.fireElapsed = Math.min(this.fireElapsed, 1000 / this.fireRate);

    for (const body of this.cookies) {
      const fallDistance = Math.max(30, this.groundY - 2 * P0.cookieRadius);
      const fallSeconds = P0.fallSeconds[body.kind];
      const gravity = 2 * fallDistance / (fallSeconds * fallSeconds);
      const terminal = 2.4 * fallDistance / fallSeconds;
      body.vy = Math.min(terminal, body.vy + gravity * dt);
      body.x += body.vx * dt; body.y += body.vy * dt;
      const r = P0.cookieRadius;
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
      if (body.y + P0.cookieRadius >= this.groundY) {
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
      const x0 = bullet.x, y0 = bullet.y;
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.lifeMs -= ms;
      if (bullet.x < P0.bulletRadius || bullet.x > this.width - P0.bulletRadius) {
        bullet.x = clamp(bullet.x, P0.bulletRadius, this.width - P0.bulletRadius);
        bullet.vx *= -1; bullet.bounces++;
        this.events.push({ type: 'bounce', x: bullet.x, y: bullet.y });
      }
      this.collideBulletObstacle(bullet, x0, y0);
      let closest = 2, target: Body | null = null;
      for (const body of this.cookies) {
        const t = sweepCircle(x0, y0, bullet.x, bullet.y, body.x, body.y, P0.cookieRadius + P0.bulletRadius);
        if (t !== null && t < closest) { closest = t; target = body; }
      }
      if (target) {
        this.bullets.splice(i, 1);
        this.hits++;
        if (bullet.bounces) this.ricochetHits++;
        this.events.push({ type: 'hit', kind: target.kind, x: target.x, y: target.y });
        target.hp = Math.max(0, target.hp - this.damage);
        if (!target.hp) this.destroy(target);
      } else if (bullet.y < 0 || bullet.y >= this.groundY || bullet.lifeMs <= 0) this.bullets.splice(i, 1);
    }
    if (!this.queue.length && !this.cookies.length) this.finishWave();
  }

  private spawn() {
    if (!this.queue.length) return;
    if (this.cookies.length >= Math.max(4, Math.floor(this.width / 65))) { this.rejectedSpawns++; return; }
    const kind = this.queue[0];
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = P0.cookieRadius + this.random() * (this.width - 2 * P0.cookieRadius);
      const y = P0.cookieRadius + this.random() * 10;
      if (this.cookies.some(body => Math.hypot(body.x - x, body.y - y) < 2 * P0.cookieRadius + 3)) continue;
      this.cookies.push({ id: ++this.id, kind, x, y, vx: (this.random() - 0.5) * 38, vy: 0, hp: P0.cookies[kind].hp, stuckMs: 0 });
      this.queue.shift(); return;
    }
    this.rejectedSpawns++;
  }

  private shoot() {
    const dx = this.aimX - this.cannonX, dy = this.aimY - this.cannonY;
    const length = Math.hypot(dx, dy) || 1;
    const speed = 1.7 * this.height;
    this.bullets.push({ x: this.cannonX, y: this.cannonY - 16, vx: dx / length * speed, vy: dy / length * speed, lifeMs: P0.bulletLifeMs, bounces: 0 });
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
    const min = 2 * P0.cookieRadius;
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < this.cookies.length; i++) for (let j = i + 1; j < this.cookies.length; j++) {
        const a = this.cookies[i], b = this.cookies[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= min) continue;
        if (distance < 0.001) { dx = 1; dy = 0; distance = 1; }
        const nx = dx / distance, ny = dy / distance, overlap = (min - distance) / 2;
        a.x = clamp(a.x - nx * overlap, P0.cookieRadius, this.width - P0.cookieRadius);
        b.x = clamp(b.x + nx * overlap, P0.cookieRadius, this.width - P0.cookieRadius);
        a.y = Math.max(P0.cookieRadius, a.y - ny * overlap);
        b.y = Math.max(P0.cookieRadius, b.y + ny * overlap);
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
    const min = P0.cookieRadius + 5;
    if (distance >= min) return;
    const nx = distance > 0.001 ? dx / distance : 0, ny = distance > 0.001 ? dy / distance : -1;
    body.x += nx * (min - distance); body.y += ny * (min - distance);
    const inward = body.vx * nx + body.vy * ny;
    if (inward < 0) { body.vx -= 1.5 * inward * nx; body.vy -= 1.5 * inward * ny; }
  }

  private collideBulletObstacle(bullet: Bullet, oldX: number, oldY: number) {
    const obstacle = this.obstacle;
    if (!obstacle) return;
    const ax = obstacle.ax, ay = obstacle.ay, bx = obstacle.bx, by = obstacle.by;
    const rx = bullet.x - oldX, ry = bullet.y - oldY, sx = bx - ax, sy = by - ay;
    const cross = rx * sy - ry * sx;
    const qx = ax - oldX, qy = ay - oldY;
    const t = Math.abs(cross) < 1e-8 ? -1 : (qx * sy - qy * sx) / cross;
    const u = Math.abs(cross) < 1e-8 ? -1 : (qx * ry - qy * rx) / cross;
    const crossing = t >= 0 && t <= 1 && u >= 0 && u <= 1;
    const contact = crossing ? { x: oldX + rx * t, y: oldY + ry * t } :
      distanceToSegment(bullet.x, bullet.y, ax, ay, bx, by);
    const radius = P0.bulletRadius + 6.5;
    if (!crossing && Math.hypot(bullet.x - contact.x, bullet.y - contact.y) >= radius) return;
    let nx = crossing ? -sy / Math.hypot(sx, sy) : (bullet.x - contact.x) / (Math.hypot(bullet.x - contact.x, bullet.y - contact.y) || 1);
    let ny = crossing ? sx / Math.hypot(sx, sy) : (bullet.y - contact.y) / (Math.hypot(bullet.x - contact.x, bullet.y - contact.y) || 1);
    if (crossing && bullet.vx * nx + bullet.vy * ny > 0) { nx *= -1; ny *= -1; }
    const dot = bullet.vx * nx + bullet.vy * ny;
    if (dot >= 0) return;
    bullet.vx -= 2 * dot * nx; bullet.vy -= 2 * dot * ny;
    bullet.x = contact.x + nx * (radius + 0.1);
    bullet.y = contact.y + ny * (radius + 0.1);
    bullet.bounces++;
    this.events.push({ type: 'bounce', x: bullet.x, y: bullet.y });
  }

  private finishWave() {
    this.waveDurations.push({ attempt: this.retryCount + 1, wave: this.wave + 1, durationMs: this.waveTimeMs });
    this.release();
    this.bullets.length = 0;
    if (this.wave < 2) { this.phase = 'PREP'; return; }
    if (this.sp >= P0.targetSp) {
      this.phase = 'WON'; this.consolidated += this.provisional; this.provisional = 0n; return;
    }
    if (this.recoveryCount >= 2) { this.lose(); return; }
    this.phase = 'PREP';
  }

  private lose() {
    const last = this.waveDurations.at(-1);
    if (this.phase === 'RUNNING' && (last?.attempt !== this.retryCount + 1 || last?.wave !== this.wave + 1))
      this.waveDurations.push({ attempt: this.retryCount + 1, wave: this.wave + 1, durationMs: this.waveTimeMs });
    this.phase = 'LOST'; this.queue.length = 0; this.cookies.length = 0; this.bullets.length = 0;
    this.provisional = 0n; this.release();
  }

  metrics() {
    return {
      seed: this.seed, arena: this.arena, initialCredit: this.initialCredit.toString(),
      config: { targetSp: P0.targetSp, maxHp: P0.maxHp, ordinaryWaveMs: P0.waveMs, currentWaveMs: this.waveDurationMs, spawnMs: P0.spawnMs },
      viewport: { width: this.width, height: this.height },
      phase: this.phase, wave: this.waveLabel, waveDurationsMs: this.waveDurations,
      totalTimeMs: Math.round(this.totalTimeMs), shots: this.shots, hits: this.hits,
      accuracy: this.accuracy, ricochetHits: this.ricochetHits,
      destroyed: this.destroyed, escaped: this.escaped, hp: this.hp, damageTaken: this.damageTaken,
      stagePoints: this.sp, provisionalCookies: this.provisional.toString(),
      consolidatedCookies: this.consolidated.toString(), damageLevel: this.damageLevel,
      fireRateLevel: this.fireRateLevel, purchases: this.purchases,
      retries: this.retryCount, recoveryWaves: this.recoveryCount, totalRecoveryWaves: this.totalRecoveryWaves,
      rejectedSpawns: this.rejectedSpawns,
    };
  }
}
