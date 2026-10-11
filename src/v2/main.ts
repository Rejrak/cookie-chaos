import Phaser from 'phaser';
import { P0 } from '../p0/config';
import { Campaign, SHOP, type UpgradeKind } from './campaign';
import { KINGDOM_ONE } from './stages';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#v2')!;
root.innerHTML = `
<header><strong>COOKIE CHAOS <small>V2 · KINGDOM I</small></strong><span id="status"></span></header>
<div class="hud"><span id="stage"></span><span id="hp"></span><span id="sp"></span><span id="money"></span><span id="clock"></span></div>
<div id="arena" aria-label="Shooter arena: drag or point and hold to fire"></div>
<footer><button id="menu">Campaign</button><button id="shop">Shop</button><button id="action" class="primary">Start wave 1</button><button id="metrics">Metrics / JSON</button></footer>
<dialog id="menuDialog"><h2>Cookie Chaos V2</h2><p>Defend the base. Clear every wave and reach the Stage Points target.</p><p id="menuProgress"></p><ol id="stageList"></ol><label>Touch aim <select id="touch"><option value="DIRECT">Direct</option><option value="OFFSET">Offset</option></select></label><p id="warning"></p><div id="diagnostic" hidden><label>Diagnostic stage preview <select id="preview"></select></label><p>No campaign saves, currency or unlocks in preview.</p></div><div class="dialog-actions"><button id="closeMenu" class="primary">Play</button></div></dialog>
<dialog id="shopDialog"><h2>Kingdom Shop</h2><p>Only consolidated Cookies are spendable. Purchases persist after Retry.</p><p id="shopBalance"></p><div id="shopCards"></div><div class="dialog-actions"><button id="closeShop" class="primary">Return</button></div></dialog>
<dialog id="metricsDialog"><h2>Local campaign metrics</h2><pre id="metricsText"></pre><div class="dialog-actions"><button id="export">Download JSON</button><button id="closeMetrics">Close</button></div></dialog>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const arenaEl = el<HTMLDivElement>('arena');
arenaEl.style.maxWidth = `${P0.arenaMaxWidth}px`;
arenaEl.style.maxHeight = `${P0.arenaMaxHeight}px`;
let storage: Storage | null = null;
try { storage = window.localStorage; } catch { /* Private browsing may deny storage. */ }
let campaign = new Campaign(Math.max(160, arenaEl.clientWidth), Math.max(150, arenaEl.clientHeight), storage);
let focused = true, resumeFrame = false, previousPhase = '';
const menuDialog = el<HTMLDialogElement>('menuDialog');
const shopDialog = el<HTMLDialogElement>('shopDialog');
const metricsDialog = el<HTMLDialogElement>('metricsDialog');
const touchSelect = el<HTMLSelectElement>('touch');
touchSelect.value = campaign.state.control;

function drawMenu() {
  el('menuProgress').textContent = `Stage ${campaign.stageId}: ${campaign.stage.name} · Highest completed: ${campaign.state.highestCompleted}`;
  el('stageList').innerHTML = KINGDOM_ONE.map(stage => `<li class="${stage.id > campaign.state.highestCompleted + 1 ? 'locked' : ''}">Stage ${stage.id}${stage.boss ? ' · Boss gate' : ''}</li>`).join('');
  el('warning').textContent = campaign.persistenceWarning;
}
function drawShop() {
  el('shopBalance').textContent = `${campaign.balance} consolidated Cookies · HP for next attempt ${campaign.state.hp}/${campaign.state.maxHp}`;
  const names: Record<UpgradeKind, string> = { damage: 'Damage', fireRate: 'Fire Rate', maxHp: 'Max Health', repair: 'Repair base' };
  el('shopCards').innerHTML = (Object.keys(names) as UpgradeKind[]).map(kind => {
    const level = kind === 'repair' ? (campaign.state.repairUsed ? 'used this stage' : 'once this stage') : `Lv${campaign.state[`${kind}Level`]}`;
    const effect = kind === 'repair' ? `Restore ${SHOP.repair.percent}% of missing HP` : SHOP[kind].effect;
    const price = campaign.price(kind), available = price !== null && campaign.balance >= price;
    const label = price === null ? 'MAX / USED' : available ? `BUY ${price}` : `NEED ${price}`;
    return `<div class="shop-card"><span><b>${names[kind]} · ${level}</b><small>${effect}</small></span><button data-buy="${kind}" ${!available ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
}
function renderUi() {
  const sim = campaign.sim, phase = sim.phase;
  el('stage').textContent = `Stage ${campaign.stageId}/12`;
  el('hp').textContent = `BASE ${sim.hp}/${campaign.state.maxHp}`;
  el('sp').textContent = `SP ${sim.sp}/${campaign.stage.targetSp}`;
  el('money').textContent = `Cookies ${campaign.balance} +${sim.provisional} pending`;
  el('clock').textContent = phase === 'RUNNING' ? `${Math.max(0, (sim.waveDurationMs - sim.waveTimeMs) / 1000).toFixed(1)}s` : 'PAUSED';
  el('status').textContent = phase === 'RUNNING' ? sim.waveLabel : phase === 'WON' ? `STAGE ${campaign.stageId} COMPLETE` :
    phase === 'LOST' ? 'DEFEAT · pending Cookies lost' : phase === 'AWAITING_BOSS_IMPLEMENTATION' ? `${campaign.stage.boss} awaits P2` : `${campaign.stage.name} · Prepare`;
  const action = el<HTMLButtonElement>('action');
  action.hidden = phase === 'RUNNING' || phase === 'AWAITING_BOSS_IMPLEMENTATION';
  action.textContent = phase === 'WON' ? `Continue to Stage ${campaign.nextStage}` : phase === 'LOST' ? 'Retry stage' :
    sim.wave < 0 ? 'Start wave 1' : sim.wave < campaign.stage.waves.length - 1 ? `Start wave ${sim.wave + 2}` : `Start recovery ${sim.recoveryCount + 1}`;
  el<HTMLButtonElement>('shop').disabled = !campaign.canShop;
  el<HTMLButtonElement>('menu').disabled = phase === 'RUNNING';
}

class CampaignScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private aim!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private currentSim = campaign.sim;
  constructor() { super('campaign'); }
  preload() {
    this.load.svg('v2-normal', '/cookie.svg', { width: 96, height: 96 });
    this.load.svg('v2-hard', '/hard-cookie.svg', { width: 96, height: 96 });
    this.load.svg('v2-golden', '/golden-cookie.svg', { width: 96, height: 96 });
  }
  create() {
    this.graphics = this.add.graphics(); this.aim = this.add.graphics();
    const point = (pointer: Phaser.Input.Pointer, firing: boolean) => {
      const offset = pointer.wasTouch && touchSelect.value === 'OFFSET' ? 70 : 0;
      campaign.sim.setAim(pointer.x, pointer.y - offset, firing);
    };
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => point(pointer, true));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) point(pointer, true); else if (!pointer.wasTouch) point(pointer, false); });
    this.input.on('pointerup', () => campaign.sim.release());
    this.input.on('gameout', () => campaign.sim.release());
    this.scale.on('resize', (size: Phaser.Structs.Size) => { campaign.resize(size.width, size.height); renderUi(); });
  }
  update(_time: number, delta: number) {
    if (focused && !document.hidden && !menuDialog.open && !shopDialog.open && !metricsDialog.open && !resumeFrame) campaign.advance(delta);
    resumeFrame = false;
    this.draw();
    if (campaign.sim.phase !== previousPhase || campaign.sim.phase === 'RUNNING') { renderUi(); previousPhase = campaign.sim.phase; }
  }
  private draw() {
    const sim = campaign.sim, w = sim.width, h = sim.height;
    if (sim !== this.currentSim) {
      for (const sprite of this.sprites.values()) sprite.destroy();
      for (const label of this.labels.values()) label.destroy();
      this.sprites.clear(); this.labels.clear(); this.currentSim = sim;
    }
    this.graphics.clear(); this.aim.clear();
    this.graphics.fillGradientStyle(0xfff3d5, 0xfff3d5, 0xf1d19b, 0xf1d19b).fillRect(0, 0, w, h);
    this.graphics.lineStyle(2, 0xcda66e, 0.4);
    for (let x = 20; x < w; x += 48) this.graphics.lineBetween(x, 0, x, sim.groundY);
    const obstacle = sim.obstacle;
    if (obstacle) this.graphics.lineStyle(2 * sim.obstacleHalfWidth, 0x75503b).lineBetween(obstacle.ax, obstacle.ay, obstacle.bx, obstacle.by);
    this.graphics.fillStyle(0x4b2d23).fillRect(0, sim.groundY, w, h - sim.groundY);
    for (const bullet of sim.bullets) this.graphics.fillStyle(0x68402e).fillCircle(bullet.x, bullet.y, sim.bulletRadius);
    this.graphics.fillStyle(0x8b5b3d).fillCircle(sim.cannonX, sim.cannonY, sim.cookieRadius);
    const aim = sim.aimPoint, ax = aim.x - sim.cannonX, ay = aim.y - sim.cannonY;
    const length = Math.hypot(ax, ay) || 1;
    this.aim.lineStyle(3, 0x56372c).lineBetween(sim.cannonX, sim.cannonY, sim.cannonX + ax / length * sim.cookieRadius * 2.2, sim.cannonY + ay / length * sim.cookieRadius * 2.2);
    const present = new Set<number>();
    for (const body of sim.cookies) {
      present.add(body.id);
      let sprite = this.sprites.get(body.id);
      if (!sprite) { sprite = this.add.image(body.x, body.y, `v2-${body.kind.toLowerCase()}`); this.sprites.set(body.id, sprite); }
      sprite.setPosition(body.x, body.y).setDisplaySize(2 * sim.cookieRadius, 2 * sim.cookieRadius);
      if (body.kind === 'HARD') {
        let label = this.labels.get(body.id);
        if (!label) { label = this.add.text(body.x, body.y, '', { fontFamily: 'system-ui', fontSize: '14px', color: '#ffffff', stroke: '#301f19', strokeThickness: 3 }).setOrigin(0.5); this.labels.set(body.id, label); }
        label.setPosition(body.x, body.y).setText(String(body.hp));
      }
    }
    for (const [id, sprite] of this.sprites) if (!present.has(id)) { sprite.destroy(); this.sprites.delete(id); this.labels.get(id)?.destroy(); this.labels.delete(id); }
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'arena', backgroundColor: '#fff3d5',
  scale: { mode: Phaser.Scale.RESIZE, width: arenaEl.clientWidth, height: arenaEl.clientHeight },
  scene: CampaignScene, render: { pixelArt: false, antialias: true } });
const diagnostic = import.meta.env.DEV && new URLSearchParams(location.search).get('diagnostic') === '1';
if (diagnostic) {
  el('diagnostic').hidden = false;
  const preview = el<HTMLSelectElement>('preview');
  preview.innerHTML = KINGDOM_ONE.map(stage => `<option value="${stage.id}">Stage ${stage.id}: ${stage.name}</option>`).join('');
  preview.addEventListener('change', () => {
    campaign = new Campaign(arenaEl.clientWidth, arenaEl.clientHeight, null, Number(preview.value));
    drawMenu(); renderUi();
  });
}
el('action').addEventListener('click', () => {
  if (campaign.sim.phase === 'WON') campaign.continue();
  else if (campaign.sim.phase === 'LOST') campaign.retry();
  else campaign.startWave();
  renderUi(); drawMenu();
});
el('shop').addEventListener('click', () => { if (!campaign.canShop) return; campaign.sim.release(); drawShop(); shopDialog.showModal(); shopDialog.scrollTop = 0; });
el('closeShop').addEventListener('click', () => shopDialog.close());
el('shopCards').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-buy]');
  if (!button) return;
  campaign.buy(button.dataset.buy as UpgradeKind, crypto.randomUUID());
  drawShop(); renderUi();
});
el('menu').addEventListener('click', () => { campaign.sim.release(); drawMenu(); menuDialog.showModal(); menuDialog.scrollTop = 0; });
el('closeMenu').addEventListener('click', () => menuDialog.close());
touchSelect.addEventListener('change', () => campaign.setControl(touchSelect.value as 'DIRECT' | 'OFFSET'));
el('metrics').addEventListener('click', () => { campaign.sim.release(); el('metricsText').textContent = JSON.stringify(campaign.metrics(), null, 2); metricsDialog.showModal(); });
el('closeMetrics').addEventListener('click', () => metricsDialog.close());
el('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(campaign.metrics(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `cookie-chaos-v2-stage-${campaign.stageId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('blur', () => { focused = false; campaign.sim.release(); });
window.addEventListener('focus', () => { focused = true; resumeFrame = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) campaign.sim.release(); else resumeFrame = true; });
drawMenu(); renderUi(); menuDialog.showModal(); menuDialog.scrollTop = 0;
