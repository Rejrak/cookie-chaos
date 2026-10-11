import Phaser from 'phaser';
import { P0, type ArenaKind } from './config';
import { P0Simulation } from './sim';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#p0')!;
root.innerHTML = `
  <header><strong>COOKIE CHAOS <small>V2 · P0</small></strong><span id="status">Prepare wave 1</span></header>
  <div class="toolbar">
    <label>Arena <select id="arenaSelect"><option value="FREE">Free</option><option value="OBSTACLE">Obstacle</option></select></label>
    <label>Touch <select id="touchSelect"><option value="DIRECT">Direct</option><option value="OFFSET">Offset</option></select></label>
    <label>Seed <input id="seedInput" type="number" value="1207" min="0" max="4294967295"></label>
    <label>Test credit <select id="creditSelect"><option value="0">0</option><option value="25">25</option><option value="50">50</option></select></label>
  </div>
  <div class="hud"><span id="hp">BASE 5/5</span><span id="sp">SP 0/25</span><span id="money">Cookies 0 +0 pending</span><span id="clock">14.0s</span></div>
  <div id="arena" aria-label="Shooter arena: drag or point and hold to fire"></div>
  <footer>
    <div class="shop"><button id="damage">Damage Lv0 · 20</button><button id="rate">Fire Rate Lv0 · 20</button></div>
    <button id="action" class="primary">Start wave 1</button>
    <button id="metricsButton">Metrics / JSON</button>
  </footer>
  <dialog id="metricsDialog"><h2>Local playtest metrics</h2><pre id="metricsText"></pre><button id="exportButton">Download JSON</button><button id="closeMetrics">Close</button></dialog>
  <p class="hint">Hold mouse or touch to aim and fire. Upgrades use only consolidated Cookies. This prototype does not change old saves.</p>`;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const arenaEl = el<HTMLDivElement>('arena');
arenaEl.style.maxWidth = `${P0.arenaMaxWidth}px`;
arenaEl.style.maxHeight = `${P0.arenaMaxHeight}px`;
const arenaSelect = el<HTMLSelectElement>('arenaSelect');
const touchSelect = el<HTMLSelectElement>('touchSelect');
const seedInput = el<HTMLInputElement>('seedInput');
const creditSelect = el<HTMLSelectElement>('creditSelect');
let sim: P0Simulation;
let focused = true;
let resumeFrame = false;
let started = false;
let lastPhase = '';

function makeSimulation() {
  const width = Math.max(160, arenaEl.clientWidth), height = Math.max(150, arenaEl.clientHeight);
  const seed = Math.min(0xffffffff, Math.max(0, Math.floor(Number(seedInput.value) || 0)));
  seedInput.value = String(seed);
  sim = new P0Simulation(width, height, arenaSelect.value as ArenaKind,
    seed, BigInt(creditSelect.value));
  started = false;
  renderUi();
}

function renderUi() {
  el('hp').textContent = `BASE ${sim.hp}/${P0.maxHp}`;
  el('sp').textContent = `SP ${sim.sp}/${P0.targetSp}`;
  el('money').textContent = `Cookies ${sim.consolidated} +${sim.provisional} pending`;
  el('clock').textContent = sim.phase === 'RUNNING' ? `${Math.max(0, (sim.waveDurationMs - sim.waveTimeMs) / 1000).toFixed(1)}s` : 'PAUSED';
  const action = el<HTMLButtonElement>('action');
  action.hidden = sim.phase === 'RUNNING';
  action.textContent = sim.phase === 'WON' ? 'Stage complete · New run' : sim.phase === 'LOST' ? 'Retry stage' :
    sim.wave < 0 ? 'Start wave 1' : `Start ${sim.wave < 2 ? `wave ${sim.wave + 2}` : `recovery ${sim.recoveryCount + 1}`}`;
  el('status').textContent = sim.phase === 'RUNNING' ? sim.waveLabel : sim.phase === 'WON' ? 'VICTORY · Cookies consolidated' :
    sim.phase === 'LOST' ? 'DEFEAT · pending Cookies lost' : sim.wave < 0 ? 'Prepare wave 1' : `${sim.waveLabel} cleared · Shop break`;
  const canBuy = sim.phase === 'PREP';
  const damage = el<HTMLButtonElement>('damage'), rate = el<HTMLButtonElement>('rate');
  damage.textContent = `Damage Lv${sim.damageLevel} · ${sim.damageLevel ? 'MAX' : `${P0.damageCost} Cookies`}`;
  rate.textContent = `Fire Rate Lv${sim.fireRateLevel} · ${sim.fireRateLevel ? 'MAX' : `${P0.fireRateCost} Cookies`}`;
  damage.disabled = !canBuy || sim.damageLevel > 0 || sim.consolidated < P0.damageCost;
  rate.disabled = !canBuy || sim.fireRateLevel > 0 || sim.consolidated < P0.fireRateCost;
  for (const input of [arenaSelect, seedInput, creditSelect]) input.disabled = started;
}

class P0Scene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private hpLabels = new Map<number, Phaser.GameObjects.Text>();
  private aim!: Phaser.GameObjects.Graphics;
  constructor() { super('p0'); }
  preload() {
    this.load.svg('p0-normal', '/cookie.svg', { width: 96, height: 96 });
    this.load.svg('p0-hard', '/hard-cookie.svg', { width: 96, height: 96 });
    this.load.svg('p0-golden', '/golden-cookie.svg', { width: 96, height: 96 });
  }
  create() {
    this.graphics = this.add.graphics();
    this.aim = this.add.graphics();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.point(pointer, true));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) this.point(pointer, true); else if (!pointer.wasTouch) this.point(pointer, false); });
    this.input.on('pointerup', () => sim.release());
    this.input.on('gameout', () => sim.release());
    this.scale.on('resize', (size: Phaser.Structs.Size) => { sim.resize(size.width, size.height); renderUi(); });
  }
  private point(pointer: Phaser.Input.Pointer, firing: boolean) {
    const offset = pointer.wasTouch && touchSelect.value === 'OFFSET' ? 70 : 0;
    sim.setAim(pointer.x, pointer.y - offset, firing);
  }
  update(_time: number, delta: number) {
    if (focused && !document.hidden && !dialog.open && !resumeFrame) sim.advance(delta);
    resumeFrame = false;
    this.draw();
    if (sim.phase !== lastPhase || sim.phase === 'RUNNING') { renderUi(); lastPhase = sim.phase; }
  }
  private draw() {
    const w = sim.width, h = sim.height;
    this.graphics.clear(); this.aim.clear();
    this.graphics.fillGradientStyle(0xfff3d5, 0xfff3d5, 0xf1d19b, 0xf1d19b).fillRect(0, 0, w, h);
    this.graphics.lineStyle(2, 0xcda66e, 0.4);
    for (let x = 20; x < w; x += 48) this.graphics.lineBetween(x, 0, x, sim.groundY);
    const obstacle = sim.obstacle;
    if (obstacle) this.graphics.lineStyle(2 * sim.obstacleHalfWidth, 0x75503b).lineBetween(obstacle.ax, obstacle.ay, obstacle.bx, obstacle.by);
    this.graphics.fillStyle(0x4b2d23).fillRect(0, sim.groundY, w, h - sim.groundY);
    for (const bullet of sim.bullets) this.graphics.fillStyle(0x68402e).fillCircle(bullet.x, bullet.y, sim.bulletRadius);
    this.graphics.fillStyle(0x8b5b3d).fillCircle(sim.cannonX, sim.cannonY, sim.cookieRadius);
    const aim = sim.aimPoint;
    const ax = aim.x - sim.cannonX, ay = aim.y - sim.cannonY;
    const length = Math.hypot(ax, ay) || 1;
    this.aim.lineStyle(3, 0x56372c).lineBetween(sim.cannonX, sim.cannonY, sim.cannonX + ax / length * sim.cookieRadius * 2.2, sim.cannonY + ay / length * sim.cookieRadius * 2.2);
    const present = new Set<number>();
    for (const body of sim.cookies) {
      present.add(body.id);
      let sprite = this.sprites.get(body.id);
      if (!sprite) {
        sprite = this.add.image(body.x, body.y, `p0-${body.kind.toLowerCase()}`).setDisplaySize(2 * sim.cookieRadius, 2 * sim.cookieRadius);
        this.sprites.set(body.id, sprite);
      }
      sprite.setPosition(body.x, body.y).setDisplaySize(2 * sim.cookieRadius, 2 * sim.cookieRadius);
      if (body.kind === 'HARD') {
        let label = this.hpLabels.get(body.id);
        if (!label) { label = this.add.text(body.x, body.y, '', { fontFamily: 'system-ui', fontSize: '14px', color: '#ffffff', stroke: '#301f19', strokeThickness: 3 }).setOrigin(0.5); this.hpLabels.set(body.id, label); }
        label.setPosition(body.x, body.y).setText(String(body.hp));
      }
    }
    for (const [id, sprite] of this.sprites) if (!present.has(id)) { sprite.destroy(); this.sprites.delete(id); this.hpLabels.get(id)?.destroy(); this.hpLabels.delete(id); }
  }
}

makeSimulation();
new Phaser.Game({ type: Phaser.AUTO, parent: 'arena', backgroundColor: '#fff3d5',
  scale: { mode: Phaser.Scale.RESIZE, width: arenaEl.clientWidth, height: arenaEl.clientHeight },
  scene: P0Scene, render: { pixelArt: false, antialias: true } });

for (const input of [arenaSelect, seedInput, creditSelect]) input.addEventListener('change', makeSimulation);
touchSelect.addEventListener('change', renderUi);
el('action').addEventListener('click', () => {
  if (sim.phase === 'WON') { makeSimulation(); return; }
  if (sim.phase === 'LOST') sim.retry();
  else { started = true; sim.startWave(); }
  renderUi();
});
el('damage').addEventListener('click', () => { sim.buy('damage'); renderUi(); });
el('rate').addEventListener('click', () => { sim.buy('fireRate'); renderUi(); });
const dialog = el<HTMLDialogElement>('metricsDialog');
el('metricsButton').addEventListener('click', () => { sim.release(); el('metricsText').textContent = JSON.stringify({ ...sim.metrics(), control: touchSelect.value }, null, 2); dialog.showModal(); });
el('closeMetrics').addEventListener('click', () => dialog.close());
el('exportButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...sim.metrics(), control: touchSelect.value }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `cookie-chaos-p0-${sim.seed}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('blur', () => { focused = false; sim.release(); });
window.addEventListener('focus', () => { focused = true; resumeFrame = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) sim.release(); else resumeFrame = true; });
