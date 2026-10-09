import Phaser from 'phaser';
import { COOKIE_SOURCE_RADIUS, COOKIE_TYPES, RULES, SpawnManager, type Cookie, type PlayArea } from './game';
import { Economy, formatAmount } from './economy';
import { applyBossHit, applyCookieHit, applyDamage, applyBombHit, applyExpiry } from './gameplay';
import { HealthManager, type DamageResult } from './health';
import { BOSSES, BossManager } from './boss';
import { BossAttackController } from './boss-attacks';
import { StageManager } from './stage';
import { UPGRADES, UPGRADE_IDS, UpgradeManager, type UpgradeId } from './upgrades';
import { hardHpForStage, kingdomName } from './cycle';
import { TimeWarp, timeWarpCost } from './time-warp';
import './style.css';

class GameScene extends Phaser.Scene {
  private model = new SpawnManager();
  private economy = new Economy();
  private upgrades = new UpgradeManager();
  private stage = new StageManager();
  private health = new HealthManager();
  private warp = new TimeWarp();
  private boss: BossManager | null = null;
  private bossAttack: BossAttackController | null = null;
  private bossSprite?: Phaser.GameObjects.Image;
  private parryTarget!: Phaser.GameObjects.Arc;
  private parryLabel!: Phaser.GameObjects.Text;
  private bossGuard?: Phaser.GameObjects.Shape;
  private bossPanel!: Phaser.GameObjects.Rectangle;
  private bossStatusText!: Phaser.GameObjects.Text;
  private bossProtectionText!: Phaser.GameObjects.Text;
  private bossProtectionBack!: Phaser.GameObjects.Rectangle;
  private bossProtectionFill!: Phaser.GameObjects.Rectangle;
  private lastBossBonus = 0n;
  private lastBossName = '';
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private cracks = new Map<number, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Text[] = [];
  private gameplayNow = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private shownSeconds = -1;
  private progressWidth = 0;
  private shopRows = new Map<UpgradeId, { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
  private shopOpen = false;
  private shopTab: 'OFFENSE' | 'DEFENSE' = 'OFFENSE';
  private spawnTimer!: Phaser.Time.TimerEvent;
  private titleText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private warpButton!: Phaser.GameObjects.Rectangle;
  private warpButtonText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressBack!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private shopBackground!: Phaser.GameObjects.Rectangle;
  private shopTitle!: Phaser.GameObjects.Text;
  private shopTabs!: { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[];
  private warpBuyButton!: Phaser.GameObjects.Rectangle;
  private warpBuyLabel!: Phaser.GameObjects.Text;
  private toggleButton!: Phaser.GameObjects.Rectangle;
  private toggleText!: Phaser.GameObjects.Text;
  private terminalBackground!: Phaser.GameObjects.Rectangle;
  private terminalText!: Phaser.GameObjects.Text;
  private terminalButton!: Phaser.GameObjects.Rectangle;
  private terminalButtonText!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  preload() {
    for (const type of Object.values(COOKIE_TYPES)) this.load.svg(type.texture, type.asset, { width: 96, height: 96 });
    this.load.svg('hard-cracks', '/hard-cracks.svg', { width: 96, height: 96 });
    for (const boss of Object.values(BOSSES)) this.load.svg(boss.texture, `/${boss.texture}.svg`, { width: 128, height: 128 });
    this.load.svg('boss-cookieng-golden', '/boss-cookieng-golden.svg', { width: 128, height: 128 });
  }

  create() {
    this.cameras.main.setBackgroundColor('#fff2d4');
    const heading = { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#713b20' };
    this.titleText = this.add.text(20, 6, 'Cookie Chaos', { ...heading, fontSize: '26px' }).setDepth(2);
    this.balanceText = this.add.text(20, 37, '', { ...heading, fontSize: '20px' }).setDepth(2);
    this.healthText = this.add.text(0, 40, '', { ...heading, fontSize: '14px' }).setOrigin(1, 0).setDepth(2);
    this.warpButton = this.add.rectangle(0, 20, 86, 28, 0x627cad).setDepth(3).setInteractive({ useHandCursor: true });
    this.warpButtonText = this.add.text(0, 20, '', { fontFamily: 'system-ui, sans-serif',
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(4);
    this.warpButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.modalShop || (this.stage.status !== 'RUNNING' && this.stage.status !== 'BOSS_FIGHT')) return;
      if (this.warp.activate()) { this.updateWarpButton(); this.floatText(this.warpButton, 'TIME WARP', '#426da0'); }
    });
    this.stageText = this.add.text(20, 65, '', { ...heading, fontSize: '17px' }).setDepth(2);
    this.timerText = this.add.text(0, 65, '', { ...heading, fontSize: '17px' }).setOrigin(1, 0).setDepth(2);
    this.progressText = this.add.text(20, 86, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#713b20' }).setDepth(2);
    this.progressBack = this.add.rectangle(20, 107, 1, 10, 0xd6b88a).setOrigin(0).setDepth(2);
    this.progressFill = this.add.rectangle(20, 107, 1, 10, 0xc97831).setOrigin(0).setDepth(3);
    this.statsText = this.add.text(350, 16, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#713b20' }).setDepth(2);
    this.bossPanel = this.add.rectangle(0, 0, 1, 72, 0xffe5b6).setOrigin(0).setDepth(1);
    this.bossStatusText = this.add.text(20, 0, '', { ...heading, fontSize: '16px' }).setDepth(2);
    this.bossProtectionText = this.add.text(20, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#713b20' }).setDepth(2);
    this.bossProtectionBack = this.add.rectangle(20, 0, 1, 8, 0xd6b88a).setOrigin(0).setDepth(2);
    this.bossProtectionFill = this.add.rectangle(20, 0, 1, 8, 0x6685a1).setOrigin(0).setDepth(3);
    this.parryTarget = this.add.circle(0, 0, 27, 0x9a5540).setStrokeStyle(4, 0xffffff).setDepth(7).setVisible(false);
    this.parryLabel = this.add.text(0, 0, 'PARRY', { fontFamily: 'system-ui, sans-serif',
      fontSize: '13px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(8).setVisible(false);
    this.parryTarget.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.stage.status !== 'BOSS_FIGHT' || !this.bossAttack?.attemptParry()) return;
      this.floatText(this.parryTarget, 'PARRY!', '#426da0');
      this.renderAttack();
    });
    this.shopBackground = this.add.rectangle(0, 0, 1, 1, 0xffe5b6).setOrigin(0).setDepth(4).setInteractive();
    this.shopTitle = this.add.text(0, 0, 'UPGRADES', { ...heading, fontSize: '20px' }).setDepth(5);
    this.shopTabs = (['OFFENSE', 'DEFENSE'] as const).map(tab => {
      const button = this.add.rectangle(0, 0, 1, 26, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, tab, { fontFamily: 'system-ui, sans-serif',
        fontSize: '13px', fontStyle: 'bold', color: '#57301d' }).setOrigin(0.5, 0).setDepth(6);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => { this.shopTab = tab; this.layout(); });
      return { button, label };
    });
    for (const id of UPGRADE_IDS) {
      const button = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#57301d', lineSpacing: 0 }).setDepth(6);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => this.buy(id));
      this.shopRows.set(id, { button, label });
    }
    this.warpBuyButton = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
    this.warpBuyLabel = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif',
      fontSize: '14px', color: '#57301d' }).setDepth(6);
    this.warpBuyButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.stage.status === 'BOSS_FIGHT' || !this.warp.buy(this.economy, this.stage.stageNumber)) return;
      this.updateHud();
      this.warpBuyButton.setStrokeStyle(3, 0xffffff);
      this.time.delayedCall(250, () => this.warpBuyButton.setStrokeStyle(0));
    });
    this.toggleButton = this.add.rectangle(0, 0, 180, 52, 0xb76b36).setDepth(11).setInteractive({ useHandCursor: true });
    this.toggleText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(12);
    this.toggleButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.toggleShop());
    this.terminalBackground = this.add.rectangle(0, 0, 1, 1, 0x3d271c, 0.94).setOrigin(0).setDepth(8).setInteractive();
    this.terminalText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#ffffff', align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(9);
    this.terminalButton = this.add.rectangle(0, 0, 180, 48, 0xe9ad63).setDepth(9).setInteractive({ useHandCursor: true });
    this.terminalButtonText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#4b291c' }).setOrigin(0.5).setDepth(10);
    this.terminalButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.advanceStage());
    this.updateHud();
    this.layout();
    this.addCookie(true);
    this.startSpawnTimer();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.spawnTimer.remove(false);
      this.clearCookies();
      this.clearEffects();
      this.clearBoss();
    });
  }

  update(_time: number, delta: number) {
    if (this.modalShop || (this.stage.status !== 'RUNNING' && this.stage.status !== 'BOSS_FIGHT')) return;
    let remaining = delta;
    do {
      const step = Math.min(remaining, 100, this.stage.remainingMs);
      const threatDelta = this.warp.tick(step);
      this.gameplayNow = this.warp.gameplayNow;
      this.updateWarpButton();
      const status = this.stage.tick(step);
      if (status === 'FAILED') { this.finishStage(); return; }
      this.updateTimer();
      if (status === 'BOSS_FIGHT') {
        if (this.boss?.tick(this.gameplayNow)) this.updateHud();
        const hits = this.bossAttack?.tick(threatDelta, this.boss?.phase ?? 'NORMAL') ?? 0;
        for (let index = 0; index < hits; index++) this.takeDamage(1, this.bossSprite?.x ?? 0, this.bossSprite?.y ?? 0);
        if (this.health.isDead) return;
        this.renderAttack();
      } else {
        for (const cookie of this.model.expire(this.warp.threatNow)) {
          this.removeCookie(cookie.id);
          if (cookie.type === 'BOMB') this.floatText(cookie, 'SAFE', '#3d877c');
          const result = applyExpiry(cookie, this.health, this.stage, this.gameplayNow);
          if (result) this.showDamage(result, 1, cookie.x, cookie.y);
          if (this.health.isDead) return;
        }
      }
      remaining -= step;
    } while (remaining > 0);
  }

  private get sideShop() { return this.scale.width >= 560 && this.scale.height >= 320; }
  private get modalShop() { return !this.sideShop && this.shopOpen; }

  private get playArea(): PlayArea {
    return { left: 0, top: RULES.hudHeight, right: this.sideShop ? this.scale.width - 312 : this.scale.width,
      bottom: this.sideShop ? this.scale.height : this.scale.height - 72 };
  }

  private addCookie(first = false) {
    if (this.modalShop || this.stage.status !== 'RUNNING') return;
    const cookie = this.model.spawn({ width: this.scale.width, height: this.scale.height }, this.warp.threatNow,
      this.upgrades.radius, this.playArea, { goldenChanceBp: this.upgrades.goldenChanceBp,
        stageNumber: this.stage.stageNumber, hardHp: hardHpForStage(this.stage.stageNumber),
        toughNeeded: this.stage.toughDestroyed < this.stage.toughRequired,
        forcedType: first ? 'NORMAL' : undefined });
    if (cookie) this.drawCookie(cookie);
  }

  private drawCookie(cookie: Cookie) {
    const sprite = this.add.image(cookie.x, cookie.y, COOKIE_TYPES[cookie.type].texture).setAlpha(0).setScale(cookie.radius / (COOKIE_SOURCE_RADIUS * 2));
    if (cookie.tough) {
      const cracks = this.add.image(cookie.x, cookie.y, 'hard-cracks').setScale(cookie.radius / COOKIE_SOURCE_RADIUS).setDepth(1);
      this.cracks.set(cookie.id, cracks);
      this.updateCracks(cookie);
    }
    sprite.setInteractive(new Phaser.Geom.Circle(48, 48, COOKIE_SOURCE_RADIUS), Phaser.Geom.Circle.Contains);
    sprite.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (cookie.type === 'BOMB') {
        const result = applyBombHit(this.model, this.health, this.stage, cookie.id, this.gameplayNow, this.modalShop);
        if (!result) return;
        this.removeCookie(cookie.id);
        this.floatText(cookie, 'BOOM!', '#bd3527');
        this.showDamage(result, 1, cookie.x, cookie.y);
        return;
      }
      const hit = applyCookieHit(this.model, this.economy, this.stage, cookie.id, this.upgrades.damage, this.upgrades.reward);
      if (!hit) return;
      this.updateHud();
      if (!hit.destroyed) {
        this.updateCracks(cookie);
        if (!this.reducedMotion) this.tweens.add({ targets: sprite,
          scale: cookie.radius / COOKIE_SOURCE_RADIUS * 0.9, yoyo: true, duration: 70 });
        this.floatText(cookie, `${hit.hp}/${cookie.maxHp} HP`, '#713b20');
        return;
      }
      sprite.disableInteractive();
      this.sprites.delete(cookie.id);
      this.cracks.get(cookie.id)?.destroy();
      this.cracks.delete(cookie.id);
      if (this.reducedMotion) sprite.destroy();
      else this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS * 1.15,
        alpha: 0, duration: 170, onComplete: () => sprite.destroy() });
      this.floatText(cookie, `+${formatAmount(hit.stagePoints!)} SP\n+${formatAmount(hit.currencyReward!)} Cookies`,
        cookie.type === 'GOLDEN' ? '#bd780a' : '#713b20');
      if (cookie.type === 'GOLDEN' && !this.reducedMotion) {
        const halo = this.add.circle(cookie.x, cookie.y, cookie.radius + 5).setStrokeStyle(3, 0xffd45f).setDepth(1);
        this.tweens.add({ targets: halo, scale: 1.35, alpha: 0, duration: 260, onComplete: () => halo.destroy() });
      }
      if (this.stage.status === 'BOSS_FIGHT') this.enterBossFight();
      else if (this.stage.status === 'COMPLETED') this.finishStage();
    });
    this.sprites.set(cookie.id, sprite);
    this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS, alpha: 1,
      duration: this.reducedMotion ? 0 : 180 });
  }

  private floatText(cookie: { x: number; y: number }, value: string, color: string) {
    if (this.effects.length >= 10) {
      const oldest = this.effects.shift();
      if (oldest) { this.tweens.killTweensOf(oldest); oldest.destroy(); }
    }
    const effect = this.add.text(value.includes('\n') ? Math.max(85, Math.min(this.scale.width - 85, cookie.x)) : cookie.x,
      cookie.y - 24, value, {
      fontFamily: 'system-ui, sans-serif', fontSize: value.includes('\n') ? '18px' : '26px',
      fontStyle: 'bold', color, align: 'center',
    }).setOrigin(0.5).setDepth(3);
    this.effects.push(effect);
    if (this.reducedMotion) this.time.delayedCall(600, () => {
      effect.destroy(); this.effects = this.effects.filter(item => item !== effect);
    });
    else this.tweens.add({ targets: effect, y: effect.y - 38, alpha: 0, duration: 600,
      onComplete: () => { effect.destroy(); this.effects = this.effects.filter(item => item !== effect); } });
  }

  private updateCracks(cookie: Cookie) {
    this.cracks.get(cookie.id)?.setAlpha(0.3 + 0.7 * (1 - cookie.hp / cookie.maxHp))
      .setVisible(!this.modalShop && cookie.hp < cookie.maxHp);
  }

  private removeCookie(id: number) {
    const sprite = this.sprites.get(id);
    if (sprite) { this.tweens.killTweensOf(sprite); sprite.destroy(); }
    this.sprites.delete(id);
    this.cracks.get(id)?.destroy();
    this.cracks.delete(id);
  }

  private clearCookies() {
    for (const id of this.sprites.keys()) this.removeCookie(id);
    this.model.active.clear();
  }

  private clearEffects() {
    for (const effect of this.effects) { this.tweens.killTweensOf(effect); effect.destroy(); }
    this.effects = [];
  }

  private clearBoss() {
    if (this.bossSprite) { this.tweens.killTweensOf(this.bossSprite); this.bossSprite.destroy(); }
    this.bossSprite = undefined;
    this.bossGuard?.destroy();
    this.bossGuard = undefined;
    this.bossAttack?.stop();
    this.bossAttack = null;
    this.parryTarget.setVisible(false).disableInteractive();
    this.parryLabel.setVisible(false);
    this.boss = null;
  }

  private enterBossFight() {
    this.spawnTimer.paused = true;
    this.clearCookies();
    this.clearEffects();
    this.boss = new BossManager(this.stage.stageNumber);
    this.bossAttack = new BossAttackController(this.stage.stageNumber);
    this.bossSprite = this.add.image(0, 0, this.boss.config.texture).setDepth(2)
      .setInteractive(new Phaser.Geom.Circle(64, 64, 60), Phaser.Geom.Circle.Contains);
    this.bossSprite.on(Phaser.Input.Events.POINTER_DOWN, () => this.hitBoss());
    if (this.boss.config.id === 'barbarian') {
      this.bossGuard = this.add.circle(0, 0, 57).setStrokeStyle(5, 0x8a6e58).setDepth(1);
    } else if (this.boss.config.id === 'knight') {
      this.bossGuard = this.add.ellipse(0, 0, 84, 72, 0x8299ae, 0.94).setStrokeStyle(4, 0x4f6170).setDepth(3);
    }
    this.shownSeconds = -1;
    this.updateHud();
    this.layout();
    this.renderAttack();
  }

  private hitBoss() {
    if (!this.boss || !this.bossSprite) return;
    const hit = applyBossHit(this.boss, this.economy, this.stage, this.upgrades.damage, this.gameplayNow, this.upgrades.reward);
    if (!hit) return;
    const position = { x: this.bossSprite.x, y: this.bossSprite.y };
    this.floatText(position, `-${hit.damageDealt}`, '#b83225');
    this.tweens.killTweensOf(this.bossSprite);
    this.bossSprite.setAlpha(1);
    if (!this.reducedMotion) this.tweens.add({ targets: this.bossSprite, alpha: 0.65, yoyo: true, duration: 65 });
    if (hit.phaseChanged) {
      this.bossGuard?.destroy();
      this.bossGuard = undefined;
      if (hit.phase === 'GOLDEN') this.bossSprite.setTexture('boss-cookieng-golden');
      if (hit.phase === 'RAGE') this.bossSprite.setTint(0xff8585);
      if (this.scale.height >= 480) this.floatText({ x: position.x, y: position.y - 36 },
        hit.phase === 'VULNERABLE' ? 'ARMOR BROKEN · 2×' : hit.phase === 'GOLDEN' ? 'GOLDEN FORM' :
          hit.phase === 'RAGE' ? 'RAGE!' : hit.phase === 'BODY' && this.boss.config.id === 'barbarian' ?
            'DOUBLE DAMAGE ENDED' : hit.phase === 'BODY' ? 'SHIELD BROKEN' : 'BODY EXPOSED', '#a94b28');
    }
    this.updateHud();
    this.renderAttack();
    if (hit.defeated) {
      this.lastBossName = this.boss.config.name;
      this.lastBossBonus = hit.reward!;
      if (!this.reducedMotion) this.cameras.main.flash(220, 255, 213, 108);
      this.finishStage();
    }
  }

  private layoutBoss() {
    if (!this.boss || !this.bossSprite) return;
    const playWidth = this.scale.width;
    const bottom = this.scale.height - 72;
    const radius = Math.min(96, (playWidth - 32) / 2, (bottom - RULES.hudHeight - 16) / 2);
    const x = playWidth / 2;
    const y = (RULES.hudHeight + bottom) / 2;
    this.bossSprite.setPosition(x, y).setScale(radius / 60);
    if (this.bossGuard) {
      this.bossGuard.setPosition(x, this.boss.config.id === 'knight' ? y + radius * 0.25 : y).setScale(radius / 60);
    }
    const parryX = Math.max(30, x - radius - 34);
    this.parryTarget.setPosition(parryX, y);
    this.parryLabel.setPosition(parryX, y);
  }

  private renderAttack() {
    const attack = this.bossAttack;
    const visible = this.stage.status === 'BOSS_FIGHT' &&
      (attack?.state === 'WARNING' || attack?.state === 'PARRY_WINDOW');
    this.parryTarget.setVisible(visible);
    this.parryLabel.setVisible(visible).setText(attack?.state === 'PARRY_WINDOW' ? 'PARRY' : 'WAIT');
    if (attack?.canParry && visible) this.parryTarget.setFillStyle(0x3d877c).setInteractive();
    else this.parryTarget.setFillStyle(0x9a5540).disableInteractive();
    if (visible) this.bossStatusText.setText(`${attack.name} ${attack.strike}/${attack.strikesTotal} · ${attack.state === 'PARRY_WINDOW' ? 'PARRY NOW' : 'WARNING'}`);
  }

  private startSpawnTimer() {
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({ delay: this.upgrades.spawnMs, loop: true, callback: () => this.addCookie() });
    this.spawnTimer.paused = this.modalShop || this.stage.status !== 'RUNNING';
  }

  private finishStage() {
    this.warp.endStage();
    this.upgrades.unlockThroughStage(this.stage.maxCompletedStage);
    this.spawnTimer.paused = true;
    this.clearCookies();
    this.clearEffects();
    this.clearBoss();
    this.updateHud();
    this.layout();
  }

  private takeDamage(amount: number, x: number, y: number) {
    const result = applyDamage(this.health, this.stage, amount, this.gameplayNow, this.modalShop);
    if (result) this.showDamage(result, amount, x, y);
  }

  private showDamage(result: DamageResult, amount: number, x: number, y: number) {
    if (result === 'invulnerable') { this.floatText({ x, y }, 'IMMUNE', '#426da0'); return; }
    this.floatText({ x, y }, result === 'shield' ? 'SHIELD BLOCK' : `-${amount} HP`,
      result === 'shield' ? '#426da0' : '#bd3527');
    this.updateHud();
    if (this.stage.status === 'FAILED') this.finishStage();
  }

  private advanceStage() {
    const advanced = this.stage.status === 'COMPLETED' ? this.stage.continue() : this.stage.retry();
    if (!advanced) return;
    this.health.resetForStage(this.upgrades.maxHp, this.upgrades.stageShields);
    this.model.resetFairness();
    this.lastBossBonus = 0n;
    this.lastBossName = '';
    this.shownSeconds = -1;
    this.updateHud();
    this.layout();
    this.addCookie(true);
    this.startSpawnTimer();
  }

  private buy(id: UpgradeId) {
    if (this.stage.status === 'BOSS_FIGHT') return;
    if (!this.upgrades.buy(id, this.economy)) return;
    if (id === 'health') this.health.increaseMaxHealth(this.stage.status === 'RUNNING');
    if (id === 'shield' && this.stage.status === 'RUNNING') this.health.addShield(this.upgrades.stageShields);
    if (id === 'speed') this.startSpawnTimer();
    this.updateHud();
    const row = this.shopRows.get(id)!;
    row.button.setStrokeStyle(3, 0xffffff);
    this.time.delayedCall(250, () => row.button.setStrokeStyle(0));
  }

  private updateHud() {
    this.balanceText.setText(`Cookies: ${formatAmount(this.economy.balance)}`);
    this.healthText.setText(`HP ${this.health.hp}/${this.health.maxHp} · S ${this.health.shields}`);
    this.updateWarpButton();
    const bossFight = this.stage.status === 'BOSS_FIGHT' && this.boss !== null;
    const playRight = bossFight ? this.scale.width : this.sideShop ? this.scale.width - 312 : this.scale.width;
    this.stageText.setText(`Stage ${this.stage.stageNumber} · ${kingdomName(this.stage.cycle.cycleNumber)}`)
      .setFontSize(playRight < 400 ? 14 : 17);
    const missingTough = this.stage.toughRequired - this.stage.toughDestroyed;
    this.progressText.setFontSize(playRight < 400 ? 12 : 14).setText(bossFight ? `${this.boss!.config.name} · HP ${this.boss!.hp}/${this.boss!.config.bodyHp}` :
      `${formatAmount(this.stage.progress)} / ${formatAmount(this.stage.target)} SP${missingTough > 0 && this.stage.progress === this.stage.target ?
        ` · Break ${missingTough} more Tough Cookie${missingTough === 1 ? '' : 's'}` :
        this.stage.toughRequired ? ` · Tough ${this.stage.toughDestroyed}/${this.stage.toughRequired}` :
          this.stage.isBossCheckpoint ? ' · Boss ahead' : ''}`);
    this.progressFill.setSize(this.progressWidth * (bossFight ? this.boss!.hp / this.boss!.config.bodyHp : this.stage.progressPercent / 100), 10)
      .setFillStyle(bossFight ? 0xb84d35 : 0xc97831);
    this.bossStatusText.setText(bossFight ? this.boss!.phase === 'VULNERABLE' ? 'ARMOR BROKEN · 2× DAMAGE' :
      this.boss!.phase === 'RAGE' ? `RAGE · COMBO ${this.boss!.comboCount}/3` :
        this.boss!.phase === 'GOLDEN' ? 'GOLDEN FORM · BODY EXPOSED' :
          this.boss!.protectionHp > 0 ? `${this.boss!.config.protection?.toUpperCase()} ACTIVE` : 'BODY EXPOSED' : '');
    this.bossProtectionText.setText(bossFight && this.boss!.protectionHp > 0 ?
      `${this.boss!.config.protection} ${this.boss!.protectionHp}/${this.boss!.config.protectionHp}` : '');
    this.bossProtectionBack.setVisible(bossFight && this.boss!.protectionHp > 0);
    this.bossProtectionFill.setVisible(bossFight && this.boss!.protectionHp > 0)
      .setSize(bossFight ? (this.scale.width - 40) * this.boss!.protectionHp / (this.boss!.config.protectionHp || 1) : 0, 8);
    this.updateTimer();
    this.shopTitle.setText(this.modalShop && this.scale.height < 420 ? `Shop · ${formatAmount(this.economy.balance)}` : 'UPGRADES');
    this.statsText.setText(`Earned ${formatAmount(this.economy.lifetimeEarned)}  ·  Destroyed ${this.economy.cookiesDestroyed}  ·  Hits ${this.economy.validHits}`);
    for (const id of UPGRADE_IDS) {
      const upgrade = UPGRADES[id];
      const cost = this.upgrades.cost(id);
      const effect = id === 'value' ? `${formatAmount(this.upgrades.reward)} Cookies / Normal` :
        id === 'size' ? `Radius ${this.upgrades.radius}px` :
        id === 'speed' ? `${this.upgrades.spawnMs} ms / spawn` :
        id === 'power' ? `${this.upgrades.damage} damage / click` :
          id === 'luck' ? `Golden chance ${this.upgrades.goldenChanceBp / 100}%` :
            id === 'health' ? `${this.upgrades.maxHp} maximum HP` : `${this.upgrades.stageShields} shields / stage`;
      const status = !upgrade.available ? 'Price —  ·  Locked: M3' : cost === null && id === 'power' ?
        `Unlock at Stage ${12n * (BigInt(Math.floor(this.stage.maxCompletedStage / 12)) + 1n)}` : cost === null ? 'Price —  ·  MAX' :
        `Price ${formatAmount(cost)}  ·  ${this.economy.balance >= cost ? 'BUY' : 'Need more'}`;
      const row = this.shopRows.get(id)!;
      const shortPrice = cost === null ? id === 'power' ?
        `Unlock Stage ${12n * (BigInt(Math.floor(this.stage.maxCompletedStage / 12)) + 1n)}` : 'MAX' :
        `${formatAmount(cost)} Cookies`;
      row.label.setText(this.scale.height < 420 ?
        `${upgrade.name} Lv ${this.upgrades.level(id)} · ${shortPrice}\n${effect} · ${cost === null ? id === 'power' ? 'WAIT' : 'MAX' : this.economy.balance >= cost ? 'BUY' : 'Need more'}` :
        `${upgrade.name}  ·  Lv ${this.upgrades.level(id)}${id === 'power' ? `/${this.upgrades.powerLimit}` : ''}\n${effect}\n${status}`);
      row.button.setFillStyle(cost !== null && this.economy.balance >= cost ? 0xe9ad63 : 0xe4d4b9);
    }
    const warpCost = timeWarpCost(this.stage.stageNumber);
    this.warpBuyLabel.setText(this.scale.height < 420 ?
      `Time Warp · ${this.warp.charges}/3 · ${formatAmount(warpCost)} Cookies\n6s slower threats · ${this.warp.charges >= 3 ? 'FULL' : this.economy.balance >= warpCost ? 'BUY' : 'Need more'}` :
      `Time Warp · ${this.warp.charges}/3 charges\n6s slower threats; stage timer normal\nPrice ${formatAmount(warpCost)} · ${this.warp.charges >= 3 ? 'FULL' : this.economy.balance >= warpCost ? 'BUY' : 'Need more'}`);
    this.warpBuyButton.setFillStyle(this.warp.charges < 3 && this.economy.balance >= warpCost ? 0xe9ad63 : 0xe4d4b9);
  }

  private updateWarpButton() {
    const activeStage = this.stage.status === 'RUNNING' || this.stage.status === 'BOSS_FIGHT';
    const visible = activeStage && !this.modalShop && (this.warp.charges > 0 || this.warp.active);
    this.warpButton.setVisible(visible).setFillStyle(this.warp.active ? 0x3d877c : 0x627cad);
    this.warpButtonText.setVisible(visible).setText(this.warp.active ?
      `WARP ${Math.ceil(this.warp.remainingMs / 1000)}s` : `WARP ×${this.warp.charges}`);
    if (visible && !this.warp.active) this.warpButton.setInteractive();
    else this.warpButton.disableInteractive();
  }

  private updateTimer() {
    const seconds = Math.ceil(this.stage.remainingMs / 1000);
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    this.timerText.setText(`Time ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
      .setColor(seconds <= 10 ? '#bd3527' : '#713b20');
  }

  private toggleShop() {
    if (this.stage.status === 'BOSS_FIGHT') return;
    this.shopOpen = !this.shopOpen;
    this.layout();
    this.spawnTimer.paused = this.modalShop || this.stage.status !== 'RUNNING';
    this.syncCookieVisibility();
    if (!this.modalShop && this.stage.status === 'RUNNING' && !this.model.active.size) this.addCookie();
  }

  private syncCookieVisibility() {
    for (const [id, sprite] of this.sprites) {
      sprite.setVisible(!this.modalShop);
      if (this.modalShop) sprite.disableInteractive();
      else sprite.setInteractive(new Phaser.Geom.Circle(48, 48, COOKIE_SOURCE_RADIUS), Phaser.Geom.Circle.Contains);
      const cookie = this.model.active.get(id);
      if (cookie) this.updateCracks(cookie);
    }
  }

  private layout() {
    const width = this.scale.width;
    const height = this.scale.height;
    const side = this.sideShop;
    const bossFight = this.stage.status === 'BOSS_FIGHT';
    const playRight = bossFight ? width : side ? width - 312 : width;
    const compact = !side && height < 420;
    const visible = (side || this.shopOpen) && !bossFight;
    this.titleText.setFontSize(playRight < 400 ? 18 : 26);
    this.balanceText.setFontSize(playRight < 400 ? 16 : 20);
    this.healthText.setPosition(playRight - 16, 40).setFontSize(playRight < 400 ? 12 : 14);
    this.warpButton.setPosition(playRight - 59, 20);
    this.warpButtonText.setPosition(playRight - 59, 20);
    this.timerText.setPosition(playRight - 16, 65).setFontSize(playRight < 300 ? 14 : 17);
    this.statsText.setVisible(width >= 1100 && !bossFight);
    this.progressWidth = Math.min(420, playRight - 40);
    this.progressBack.setSize(this.progressWidth, 10);
    this.progressFill.setSize(this.progressWidth * (bossFight && this.boss ? this.boss.hp / this.boss.config.bodyHp : this.stage.progressPercent / 100), 10);
    this.bossPanel.setPosition(0, height - 72).setSize(playRight, 72).setVisible(bossFight);
    this.bossStatusText.setPosition(20, height - 65).setFontSize(width < 400 ? 14 : 16).setVisible(bossFight);
    this.bossProtectionText.setPosition(20, height - 43).setVisible(bossFight && !!this.boss?.protectionHp);
    this.bossProtectionBack.setPosition(20, height - 19).setSize(playRight - 40, 8)
      .setVisible(bossFight && !!this.boss?.protectionHp);
    this.bossProtectionFill.setPosition(20, height - 19)
      .setSize(this.boss ? (playRight - 40) * this.boss.protectionHp / (this.boss.config.protectionHp || 1) : 0, 8)
      .setVisible(bossFight && !!this.boss?.protectionHp);
    this.shopBackground.setPosition(side ? width - 312 : compact ? 0 : 8, side || compact ? 0 : RULES.hudHeight)
      .setSize(side ? 312 : compact ? width : width - 16, side || compact ? height : height - RULES.hudHeight).setVisible(visible);
    this.shopTitle.setPosition(side ? width - 296 : compact ? 16 : 20, side ? 20 : compact ? 12 : RULES.hudHeight + 10)
      .setText(compact && this.shopOpen ? `Shop · ${formatAmount(this.economy.balance)}` : 'UPGRADES').setVisible(visible);
    this.toggleButton.setVisible(!side && !bossFight).setPosition(this.shopOpen ? width - (compact ? 58 : 78) : width / 2, this.shopOpen ? (compact ? 24 : RULES.hudHeight + 20) : height - 36)
      .setSize(this.shopOpen ? (compact ? 100 : 116) : 180, this.shopOpen ? 36 : 52);
    this.toggleText.setVisible(!side && !bossFight).setPosition(this.toggleButton.x, this.toggleButton.y)
      .setText(this.shopOpen ? 'Close' : 'Shop / Upgrades');
    const shopX = side ? width - 300 : compact ? 8 : 16;
    const shopWidth = side ? 288 : compact ? width - 16 : width - 32;
    const tabY = side ? 52 : compact ? 50 : RULES.hudHeight + 42;
    this.shopTabs.forEach((tab, index) => {
      tab.button.setPosition(shopX + index * shopWidth / 2, tabY)
        .setSize(shopWidth / 2 - 2, 26).setVisible(visible)
        .setFillStyle(this.shopTab === (index === 0 ? 'OFFENSE' : 'DEFENSE') ? 0xe9ad63 : 0xe4d4b9);
      tab.label.setPosition(tab.button.x + tab.button.width / 2, tabY + 5).setVisible(visible);
      if (visible) tab.button.setInteractive({ useHandCursor: true });
      else tab.button.disableInteractive();
    });
    const ids: UpgradeId[] = this.shopTab === 'OFFENSE' ? UPGRADE_IDS.filter(id => id !== 'health' && id !== 'shield') :
      UPGRADE_IDS.filter(id => id === 'health' || id === 'shield');
    const rowTop = tabY + 34;
    const rows = this.shopTab === 'OFFENSE' ? ids.length : ids.length + 1;
    const rowHeight = Math.min(70, Math.floor((height - rowTop - 4 * (rows - 1) - 8) / rows));
    UPGRADE_IDS.forEach(id => {
      const row = this.shopRows.get(id)!;
      const index = ids.indexOf(id);
      const rowVisible = visible && index >= 0;
      if (index >= 0) row.button.setPosition(shopX, rowTop + index * (rowHeight + 4)).setSize(shopWidth, rowHeight);
      row.button.setVisible(rowVisible);
      row.label.setPosition(row.button.x + 10, row.button.y + 3).setFontSize(rowHeight < 54 ? 12 : 14).setVisible(rowVisible);
      if (rowVisible) row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    });
    const warpVisible = visible && this.shopTab === 'DEFENSE';
    this.warpBuyButton.setPosition(shopX, rowTop + ids.length * (rowHeight + 4))
      .setSize(shopWidth, rowHeight).setVisible(warpVisible);
    this.warpBuyLabel.setPosition(shopX + 10, this.warpBuyButton.y + 3)
      .setFontSize(rowHeight < 54 ? 12 : 14).setVisible(warpVisible);
    if (warpVisible) this.warpBuyButton.setInteractive({ useHandCursor: true });
    else this.warpBuyButton.disableInteractive();
    if (visible) this.shopBackground.setInteractive();
    else this.shopBackground.disableInteractive();
    if (!side && !bossFight) this.toggleButton.setInteractive({ useHandCursor: true });
    else this.toggleButton.disableInteractive();
    this.updateWarpButton();
    this.layoutBoss();
    this.layoutTerminal();
  }

  private layoutTerminal() {
    const side = this.sideShop;
    const width = side ? this.scale.width - 312 : this.scale.width;
    const height = side ? this.scale.height : this.scale.height - 72;
    const visible = (this.stage.status === 'COMPLETED' || this.stage.status === 'FAILED') && !this.modalShop;
    const cycleComplete = this.stage.status === 'COMPLETED' && this.stage.cycle.stageInCycle === 12;
    const result = cycleComplete ? `${kingdomName(this.stage.cycle.cycleNumber).toUpperCase()} COMPLETE` :
      this.stage.status === 'COMPLETED' ? 'STAGE COMPLETED' :
        this.stage.failureReason === 'HEALTH_DEPLETED' ? 'OUT OF HEALTH' : 'TIME UP';
    const summary = `${formatAmount(this.stage.progress)} / ${formatAmount(this.stage.target)} SP · Tough ${this.stage.toughDestroyed}/${this.stage.toughRequired}\nEarned ${formatAmount(this.stage.currencyEarned)} Cookies`;
    this.terminalBackground.setSize(width, height).setVisible(visible);
    this.terminalText.setPosition(width / 2, height / 2 - 35)
      .setFontSize(this.scale.height < 420 ? 14 : 19).setLineSpacing(this.scale.height < 420 ? 3 : 8)
      .setText(`${result}\nStage ${this.stage.stageNumber}${this.lastBossName ? ` · ${this.lastBossName}` : ''}\n${summary}${this.lastBossBonus ? `\nBoss bonus: ${formatAmount(this.lastBossBonus)}` : ''}${cycleComplete ? `\nClick Power limit: ${this.upgrades.powerLimit}` : ''}`)
      .setVisible(visible);
    this.terminalButton.setPosition(width / 2, height / 2 + 66).setSize(Math.min(190, width - 36), 48).setVisible(visible);
    this.terminalButtonText.setPosition(width / 2, height / 2 + 66)
      .setText(this.stage.status === 'COMPLETED' ? 'CONTINUE' : 'RETRY').setVisible(visible);
    if (visible) this.terminalButton.setInteractive({ useHandCursor: true });
    else this.terminalButton.disableInteractive();
  }

  private onResize() {
    if (this.sideShop) this.shopOpen = false;
    this.layout();
    this.updateHud();
    for (const id of this.model.resize({ width: this.scale.width, height: this.scale.height }, this.playArea)) this.removeCookie(id);
    for (const cookie of this.model.active.values()) {
      this.sprites.get(cookie.id)?.setPosition(cookie.x, cookie.y);
      this.cracks.get(cookie.id)?.setPosition(cookie.x, cookie.y);
    }
    this.spawnTimer.paused = this.modalShop || this.stage.status !== 'RUNNING';
    this.syncCookieVisibility();
    if (!this.modalShop && this.stage.status === 'RUNNING' && !this.model.active.size) this.addCookie();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: GameScene,
  render: { antialias: true },
});
