import Phaser from 'phaser';
import { COOKIE_SOURCE_RADIUS, COOKIE_TYPES, SpawnManager, type Cookie, type PlayArea } from './game';
import { Economy, formatAmount } from './economy';
import { applyBossHit, applyCookieHit, applyDamage, applyBombHit, applyExpiry } from './gameplay';
import { HealthManager, type DamageResult } from './health';
import { BOSSES, BossManager } from './boss';
import { BossAttackController } from './boss-attacks';
import { StageManager } from './stage';
import { UPGRADES, UPGRADE_IDS, UpgradeManager, type UpgradeId } from './upgrades';
import { hardHpForStage, kingdomName } from './cycle';
import { TimeWarp, timeWarpCost } from './time-warp';
import { ABILITIES, ABILITY_IDS, AbilityManager, abilityCost, autoTarget, freeAbilityForBossStage, type AbilityId } from './abilities';
import { calculateGameLayout, HUD_TOUGH_ROW } from './ui-layout';
import './style.css';

type ShopRow = { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image; badge: Phaser.GameObjects.Rectangle; badgeText: Phaser.GameObjects.Text };

class GameScene extends Phaser.Scene {
  private model = new SpawnManager();
  private economy = new Economy();
  private upgrades = new UpgradeManager();
  private stage = new StageManager();
  private health = new HealthManager();
  private warp = new TimeWarp();
  private abilities = new AbilityManager();
  private boss: BossManager | null = null;
  private bossAttack: BossAttackController | null = null;
  private background!: Phaser.GameObjects.Image;
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
  private lastFreeAbility: AbilityId | null = null;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private cracks = new Map<number, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Text[] = [];
  private gameplayNow = 0;
  private focused = true;
  private resumeFrame = false;
  private onBlur = () => { this.focused = false; this.spawnTimer.paused = true; };
  private onFocus = () => {
    this.focused = true;
    this.resumeFrame = true;
    this.spawnTimer.paused = !this.focused || document.hidden || this.modalShop || this.stage.status !== 'RUNNING';
  };
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private shownSeconds = -1;
  private progressWidth = 0;
  private shopRows = new Map<UpgradeId, ShopRow>();
  private shopOpen = false;
  private shopTab: 'OFFENSE' | 'DEFENSE' | 'SPECIAL' = 'OFFENSE';
  private abilityPanelOpen = false;
  private abilityButtons = new Map<AbilityId, { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
  private abilityBuyRows = new Map<AbilityId, ShopRow>();
  private abilityToggle!: Phaser.GameObjects.Rectangle;
  private abilityToggleText!: Phaser.GameObjects.Text;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private titleText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private warpButton!: Phaser.GameObjects.Rectangle;
  private warpButtonText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private bombText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private toughText!: Phaser.GameObjects.Text;
  private progressBack!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private shopBackground!: Phaser.GameObjects.Rectangle;
  private shopTitle!: Phaser.GameObjects.Text;
  private shopWallet!: Phaser.GameObjects.Text;
  private shopTabs!: { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[];
  private warpBuyButton!: Phaser.GameObjects.Rectangle;
  private warpBuyLabel!: Phaser.GameObjects.Text;
  private warpBuyIcon!: Phaser.GameObjects.Image;
  private warpBuyBadge!: Phaser.GameObjects.Rectangle;
  private warpBuyBadgeText!: Phaser.GameObjects.Text;
  private toggleButton!: Phaser.GameObjects.Rectangle;
  private toggleText!: Phaser.GameObjects.Text;
  private terminalBackground!: Phaser.GameObjects.Rectangle;
  private terminalText!: Phaser.GameObjects.Text;
  private terminalButton!: Phaser.GameObjects.Rectangle;
  private terminalButtonText!: Phaser.GameObjects.Text;
  private hudPanel!: Phaser.GameObjects.Rectangle;
  private dockPanel!: Phaser.GameObjects.Rectangle;
  private chromeArt!: Phaser.GameObjects.Graphics;
  private shopArt!: Phaser.GameObjects.Graphics;
  private icons = new Map<string, Phaser.GameObjects.Image>();
  private shopPage = 0;
  private shopPager!: Phaser.GameObjects.Text;
  private shopPrev!: Phaser.GameObjects.Rectangle;
  private shopNext!: Phaser.GameObjects.Rectangle;
  private shopPrevText!: Phaser.GameObjects.Text;
  private shopNextText!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  preload() {
    this.load.svg('kingdom-background', '/kingdom-background.svg', { width: 1280, height: 720 });
    this.load.svg('boss-arena', '/boss-arena.svg', { width: 1280, height: 720 });
    for (const type of Object.values(COOKIE_TYPES)) this.load.svg(type.texture, type.asset, { width: 96, height: 96 });
    this.load.svg('hard-cracks', '/hard-cracks.svg', { width: 96, height: 96 });
    for (const boss of Object.values(BOSSES)) this.load.svg(boss.texture, `/${boss.texture}.svg`, { width: 128, height: 128 });
    this.load.svg('boss-cookieng-golden', '/boss-cookieng-golden.svg', { width: 128, height: 128 });
    for (const variant of ['boss-barbarian-exposed', 'boss-knight-exposed', 'boss-berserker-rage'])
      this.load.svg(variant, `/${variant}.svg`, { width: 128, height: 128 });
    for (const name of ['health', 'shield', 'currency', 'stage-points', 'tough', 'timer', 'bomb',
      'time-warp', 'cookie-rain', 'auto-clicker', 'parry', 'shop'])
      this.load.svg(`icon-${name}`, `/icons/${name}.svg`, { width: 48, height: 48 });
  }

  create() {
    this.cameras.main.setBackgroundColor('#fff2d4');
    this.background = this.add.image(0, 0, 'kingdom-background').setDepth(-10);
    this.hudPanel = this.add.rectangle(0, 0, 1, 1, 0xfff6df).setOrigin(0).setStrokeStyle(3, 0x845236).setDepth(1);
    this.dockPanel = this.add.rectangle(0, 0, 1, 1, 0x6b3e29).setOrigin(0).setStrokeStyle(3, 0x845236).setDepth(1);
    this.chromeArt = this.add.graphics().setDepth(1);
    for (const name of ['health', 'shield', 'currency', 'stage-points', 'tough', 'timer', 'bomb',
      'time-warp', 'cookie-rain', 'auto-clicker', 'parry', 'shop'])
      this.icons.set(name, this.add.image(0, 0, `icon-${name}`).setDepth(3).setVisible(false));
    const heading = { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#35251e' };
    this.titleText = this.add.text(20, 6, 'Cookie Chaos', { ...heading, fontFamily: 'Georgia, Cambria, serif', fontSize: '26px' }).setDepth(2);
    this.balanceText = this.add.text(20, 37, '', { ...heading, fontSize: '20px' }).setDepth(2);
    this.healthText = this.add.text(0, 40, '', { ...heading, fontSize: '14px' }).setOrigin(1, 0).setDepth(2);
    this.shieldText = this.add.text(0, 40, '', { ...heading, fontSize: '14px' }).setDepth(2);
    this.warpButton = this.add.rectangle(0, 20, 86, 28, 0x627cad).setDepth(3).setInteractive({ useHandCursor: true });
    this.warpButtonText = this.add.text(0, 20, '', { fontFamily: 'system-ui, sans-serif',
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(4);
    this.warpButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.modalShop || (this.stage.status !== 'RUNNING' && this.stage.status !== 'BOSS_FIGHT')) return;
      if (this.warp.activate()) { this.updateWarpButton(); this.floatText({ x: this.warpButton.x, y: this.warpButton.y - 32 }, 'WARP ON', '#5a4d9c'); }
    });
    this.stageText = this.add.text(20, 65, '', { ...heading, fontSize: '17px' }).setDepth(2);
    this.timerText = this.add.text(0, 65, '', { ...heading, fontSize: '17px' }).setOrigin(1, 0).setDepth(2);
    this.progressText = this.add.text(20, 86, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#713b20' }).setDepth(2);
    this.toughText = this.add.text(20, 122, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#35251e' }).setDepth(2);
    this.progressBack = this.add.rectangle(20, 107, 1, 10, 0xd6b88a).setOrigin(0).setDepth(2);
    this.progressFill = this.add.rectangle(20, 107, 1, 10, 0xc97831).setOrigin(0).setDepth(3);
    this.statsText = this.add.text(350, 16, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#713b20' }).setDepth(2);
    this.bombText = this.add.text(0, 0, 'BOMB!', { fontFamily: 'system-ui, sans-serif',
      fontSize: '13px', fontStyle: 'bold', color: '#392f3c' }).setDepth(2).setVisible(false);
    this.bossPanel = this.add.rectangle(0, 0, 1, 72, 0xffe5b6).setOrigin(0).setDepth(1);
    this.bossStatusText = this.add.text(20, 0, '', { ...heading, fontSize: '16px' }).setDepth(2);
    this.bossProtectionText = this.add.text(20, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#713b20' }).setDepth(2);
    this.bossProtectionBack = this.add.rectangle(20, 0, 1, 8, 0xd6b88a).setOrigin(0).setDepth(2);
    this.bossProtectionFill = this.add.rectangle(20, 0, 1, 8, 0x6685a1).setOrigin(0).setDepth(3);
    this.parryTarget = this.add.circle(0, 0, 33, 0x236451).setStrokeStyle(4, 0xfff6df).setDepth(7).setVisible(false);
    this.parryLabel = this.add.text(0, 0, 'PARRY', { fontFamily: 'system-ui, sans-serif',
      fontSize: '13px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(8).setVisible(false);
    this.parryTarget.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.stage.status !== 'BOSS_FIGHT' || !this.bossAttack?.attemptParry()) return;
      this.floatText(this.parryTarget, 'PARRY!', '#426da0');
      this.renderAttack();
    });
    this.shopBackground = this.add.rectangle(0, 0, 1, 1, 0xffe5b6).setOrigin(0).setDepth(4).setInteractive();
    this.shopArt = this.add.graphics().setDepth(4);
    this.shopTitle = this.add.text(0, 0, 'Kingdom Market', { ...heading, fontFamily: 'Georgia, Cambria, serif', fontSize: '22px' }).setDepth(5);
    this.shopWallet = this.add.text(0, 0, '', { ...heading, fontSize: '14px' }).setDepth(5);
    this.shopTabs = (['OFFENSE', 'DEFENSE', 'SPECIAL'] as const).map(tab => {
      const button = this.add.rectangle(0, 0, 1, 26, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, tab, { fontFamily: 'system-ui, sans-serif',
        fontSize: '13px', fontStyle: 'bold', color: '#57301d' }).setOrigin(0.5, 0).setDepth(6);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => { this.shopTab = tab; this.shopPage = 0; this.layout(); });
      return { button, label };
    });
    for (const id of UPGRADE_IDS) {
      const button = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#57301d', lineSpacing: 0 }).setDepth(6);
      const iconName = id === 'health' ? 'health' : id === 'shield' ? 'shield' : id === 'speed' ? 'timer' :
        id === 'power' ? 'tough' : id === 'luck' ? 'stage-points' : id === 'lifetime' ? 'timer' : 'currency';
      const icon = this.add.image(0, 0, `icon-${iconName}`).setDepth(6);
      const badge = this.add.rectangle(0, 0, 86, 44, 0x236451).setDepth(6);
      const badgeText = this.add.text(0, 0, '', { ...heading, fontSize: '12px', color: '#fff6df', align: 'center' })
        .setOrigin(0.5).setDepth(7);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => this.buy(id));
      this.shopRows.set(id, { button, label, icon, badge, badgeText });
    }
    this.warpBuyButton = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
    this.warpBuyLabel = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif',
      fontSize: '14px', color: '#57301d' }).setDepth(6);
    this.warpBuyIcon = this.add.image(0, 0, 'icon-time-warp').setDepth(6);
    this.warpBuyBadge = this.add.rectangle(0, 0, 86, 44, 0x236451).setDepth(6);
    this.warpBuyBadgeText = this.add.text(0, 0, '', { ...heading, fontSize: '12px', color: '#fff6df', align: 'center' })
      .setOrigin(0.5).setDepth(7);
    this.warpBuyButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.stage.status === 'BOSS_FIGHT' || !this.warp.buy(this.economy, this.stage.stageNumber)) return;
      this.updateHud();
      this.warpBuyButton.setStrokeStyle(3, 0xffffff);
      this.time.delayedCall(250, () => this.warpBuyButton.setStrokeStyle(0));
    });
    for (const id of ABILITY_IDS) {
      const button = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#57301d' }).setDepth(6);
      const icon = this.add.image(0, 0, `icon-${id === 'RAIN' ? 'cookie-rain' : 'auto-clicker'}`).setDepth(6);
      const badge = this.add.rectangle(0, 0, 86, 44, 0x236451).setDepth(6);
      const badgeText = this.add.text(0, 0, '', { ...heading, fontSize: '12px', color: '#fff6df', align: 'center' })
        .setOrigin(0.5).setDepth(7);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (this.stage.status === 'BOSS_FIGHT' || !this.abilities.buy(id, this.economy, this.stage.stageNumber)) return;
        this.updateHud();
        button.setStrokeStyle(3, 0xffffff);
        this.time.delayedCall(250, () => button.setStrokeStyle(0));
      });
      this.abilityBuyRows.set(id, { button, label, icon, badge, badgeText });
      const action = this.add.rectangle(0, 0, 1, 1, 0x3d877c).setDepth(4).setInteractive({ useHandCursor: true });
      const actionLabel = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5).setDepth(5);
      action.on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (this.modalShop || !this.abilities.activate(id, this.stage.status === 'RUNNING')) return;
        this.floatText({ x: action.x, y: action.y - 32 }, id === 'RAIN' ? 'RAIN ON' : 'AUTO ON', '#176d7a');
        this.updateHud();
      });
      this.abilityButtons.set(id, { button: action, label: actionLabel });
    }
    this.abilityToggle = this.add.rectangle(0, 0, 1, 1, 0x3d877c).setDepth(11).setInteractive({ useHandCursor: true });
    this.abilityToggleText = this.add.text(0, 0, 'Abilities', { fontFamily: 'system-ui, sans-serif',
      fontSize: '14px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(12);
    this.abilityToggle.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.abilityPanelOpen = !this.abilityPanelOpen;
      this.layout();
    });
    this.shopPrev = this.add.rectangle(0, 0, 44, 44, 0x6b3e29).setDepth(6).setInteractive({ useHandCursor: true });
    this.shopNext = this.add.rectangle(0, 0, 44, 44, 0x6b3e29).setDepth(6).setInteractive({ useHandCursor: true });
    this.shopPager = this.add.text(0, 0, '', { ...heading, fontSize: '14px' }).setOrigin(0.5).setDepth(6);
    this.shopPrevText = this.add.text(0, 0, '‹', { ...heading, fontSize: '26px', color: '#fff6df' }).setOrigin(0.5).setDepth(7);
    this.shopNextText = this.add.text(0, 0, '›', { ...heading, fontSize: '26px', color: '#fff6df' }).setOrigin(0.5).setDepth(7);
    this.shopPrev.on(Phaser.Input.Events.POINTER_DOWN, () => { this.shopPage = Math.max(0, this.shopPage - 1); this.layout(); });
    this.shopNext.on(Phaser.Input.Events.POINTER_DOWN, () => { this.shopPage++; this.layout(); });
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
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('focus', this.onFocus);
      this.spawnTimer.remove(false);
      this.clearCookies();
      this.clearEffects();
      this.clearBoss();
      this.abilities.endStage();
    });
  }

  update(_time: number, delta: number) {
    if (!this.focused || document.hidden || this.modalShop || (this.stage.status !== 'RUNNING' && this.stage.status !== 'BOSS_FIGHT')) return;
    if (this.resumeFrame) { this.resumeFrame = false; return; }
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
        this.model.move(threatDelta, this.playArea);
        for (const cookie of this.model.active.values()) {
          this.sprites.get(cookie.id)?.setPosition(cookie.x, cookie.y);
          this.cracks.get(cookie.id)?.setPosition(cookie.x, cookie.y);
        }
        for (const cookie of this.model.expire(this.warp.threatNow)) {
          this.removeCookie(cookie.id);
          if (cookie.type === 'BOMB') this.floatText(cookie, 'SAFE', '#3d877c');
          const result = applyExpiry(cookie, this.health, this.stage, this.gameplayNow);
          if (result) this.showDamage(result, 1, cookie.x, cookie.y);
          if (this.health.isDead) return;
        }
        const pulses = this.abilities.tick(step, this.upgrades.spawnMs);
        for (let i = 0; i < pulses.rain && this.stage.status === 'RUNNING'; i++) this.addCookie(false, true);
        for (let i = 0; i < pulses.auto && this.stage.status === 'RUNNING'; i++) {
          const target = autoTarget(this.model.active.values(), this.warp.threatNow);
          if (target) this.hitCookie(target.id);
        }
        this.updateAbilityButtons();
      }
      remaining -= step;
    } while (remaining > 0);
  }

  private get sideShop() { return calculateGameLayout(this.scale.width, this.scale.height, this.stage.status === 'BOSS_FIGHT').sideShop; }
  private get modalShop() { return !this.sideShop && this.shopOpen; }

  private get playArea(): PlayArea {
    return calculateGameLayout(this.scale.width, this.scale.height, this.stage.status === 'BOSS_FIGHT').playArea;
  }

  private addCookie(first = false, bonus = false) {
    if (!this.focused || document.hidden || this.modalShop || this.stage.status !== 'RUNNING') return;
    const cookie = this.model.spawn({ width: this.scale.width, height: this.scale.height }, this.warp.threatNow,
      this.upgrades.radius, this.playArea, { goldenChanceBp: this.upgrades.goldenChanceBp,
        stageNumber: this.stage.stageNumber, hardHp: hardHpForStage(this.stage.stageNumber),
        toughNeeded: this.stage.toughDestroyed < this.stage.toughRequired,
        lifetimeBonusMs: this.upgrades.lifetimeBonusMs,
        forcedType: first ? 'NORMAL' : undefined, excludeBomb: bonus });
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
    sprite.on(Phaser.Input.Events.POINTER_DOWN, () => this.hitCookie(cookie.id));
    this.sprites.set(cookie.id, sprite);
    this.updateBombNotice();
    this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS, alpha: 1,
      duration: this.reducedMotion ? 0 : 180 });
  }

  private hitCookie(id: number) {
    const cookie = this.model.active.get(id);
    const sprite = this.sprites.get(id);
    if (!cookie || !sprite || this.modalShop) return;
      if (cookie.type === 'BOMB') {
        const result = applyBombHit(this.model, this.health, this.stage, id, this.gameplayNow, this.modalShop);
        if (!result) return;
        this.removeCookie(id);
        this.floatText(cookie, 'BOOM!', '#bd3527');
        this.showDamage(result, 1, cookie.x, cookie.y);
        return;
      }
      const hit = applyCookieHit(this.model, this.economy, this.stage, id, this.upgrades.damage, this.upgrades.reward);
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
    this.updateBombNotice();
  }

  private clearCookies() {
    for (const id of this.sprites.keys()) this.removeCookie(id);
    this.model.active.clear();
    this.updateBombNotice();
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
    this.icons.get('parry')?.setVisible(false);
    this.boss = null;
  }

  private enterBossFight() {
    this.abilities.endStage();
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
      this.bossGuard = this.add.ellipse(0, 0, 36, 50, 0xdde6e6, 0.28).setStrokeStyle(2, 0x4f6170).setDepth(3);
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
      if (hit.phase === 'VULNERABLE') this.bossSprite.setTexture('boss-barbarian-exposed');
      if (hit.phase === 'BODY' && this.boss.config.id === 'knight') this.bossSprite.setTexture('boss-knight-exposed');
      if (hit.phase === 'RAGE') this.bossSprite.setTexture('boss-berserker-rage');
      if (this.scale.height >= 480) this.floatText({ x: position.x, y: position.y - 36 },
        hit.phase === 'VULNERABLE' ? 'ARMOR BROKEN · 2×' : hit.phase === 'GOLDEN' ? 'GOLDEN FORM' :
          hit.phase === 'RAGE' ? 'RAGE!' : hit.phase === 'BODY' && this.boss.config.id === 'barbarian' ?
            'DOUBLE DAMAGE ENDED' : hit.phase === 'BODY' ? 'SHIELD BROKEN' : 'BODY EXPOSED', '#a94b28');
    }
    this.updateHud();
    this.renderAttack();
    if (hit.defeated) {
      const free = freeAbilityForBossStage(this.stage.stageNumber);
      if (free && this.abilities.grant(free, `boss:${this.stage.stageNumber}`)) this.lastFreeAbility = free;
      this.lastBossName = this.boss.config.name;
      this.lastBossBonus = hit.reward!;
      if (!this.reducedMotion) this.cameras.main.flash(220, 255, 213, 108);
      this.finishStage();
    }
  }

  private layoutBoss() {
    if (!this.boss || !this.bossSprite) return;
    const area = this.playArea;
    const playWidth = area.right - area.left;
    const radius = Math.min(96, (playWidth - 128) / 2, (area.bottom - area.top - 12) / 2);
    const x = playWidth < 420 ? area.left + playWidth * 0.62 : area.left + playWidth / 2;
    const y = (area.top + area.bottom) / 2;
    this.bossSprite.setPosition(x, y).setScale(radius / 60);
    if (this.bossGuard) {
      this.bossGuard.setPosition(this.boss.config.id === 'knight' ? x + radius * 0.48 : x,
        this.boss.config.id === 'knight' ? y + radius * 0.25 : y).setScale(radius / 60);
    }
    const parryX = Math.max(36, x - radius - 42);
    this.parryTarget.setPosition(parryX, y);
    this.parryLabel.setPosition(parryX, y + 15);
    this.icons.get('parry')!.setPosition(parryX, y - 9).setDisplaySize(24, 24).setDepth(8);
  }

  private renderAttack() {
    const attack = this.bossAttack;
    const visible = this.stage.status === 'BOSS_FIGHT' &&
      (attack?.state === 'WARNING' || attack?.state === 'PARRY_WINDOW');
    this.parryTarget.setVisible(visible);
    this.parryLabel.setVisible(visible).setText(attack?.state === 'PARRY_WINDOW' ? 'PARRY' : 'WAIT');
    this.icons.get('parry')!.setVisible(visible);
    if (attack?.canParry && visible) this.parryTarget.setFillStyle(0x3d877c).setInteractive();
    else this.parryTarget.setFillStyle(0x9a5540).disableInteractive();
    if (visible) this.bossStatusText.setText(`${attack.name} ${attack.strike}/${attack.strikesTotal} · ${attack.state === 'PARRY_WINDOW' ? 'PARRY NOW' : 'WARNING'}`);
  }

  private startSpawnTimer() {
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({ delay: this.upgrades.spawnMs, loop: true, callback: () => this.addCookie() });
    this.spawnTimer.paused = !this.focused || document.hidden || this.modalShop || this.stage.status !== 'RUNNING';
  }

  private finishStage() {
    this.warp.endStage();
    this.abilities.endStage();
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
    this.lastFreeAbility = null;
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
    this.time.delayedCall(250, () => this.updateHud());
  }

  private updateHud() {
    this.balanceText.setText(`${formatAmount(this.economy.balance)} Cookies`);
    this.healthText.setText(`${this.health.hp}/${this.health.maxHp} HP`);
    this.shieldText.setText(`${this.health.shields} Shield`);
    this.updateWarpButton();
    const bossFight = this.stage.status === 'BOSS_FIGHT' && this.boss !== null;
    const layout = calculateGameLayout(this.scale.width, this.scale.height, bossFight);
    this.stageText.setText(`${kingdomName(this.stage.cycle.cycleNumber)} · Stage ${this.stage.stageNumber}`)
      .setFontSize(layout.fieldRight < 400 ? 13 : 16);
    const missingTough = this.stage.toughRequired - this.stage.toughDestroyed;
    this.progressText.setFontSize(layout.compact ? 13 : 15).setText(bossFight ?
      `${this.boss!.config.name} · Body ${this.boss!.hp}/${this.boss!.config.bodyHp} HP` :
      `${formatAmount(this.stage.progress)} / ${formatAmount(this.stage.target)} SP`);
    this.toughText.setText(bossFight ? '' : this.stage.toughRequired ?
      missingTough > 0 && this.stage.progress === this.stage.target ?
        layout.compact ? `Break ${missingTough} Tough` :
          `Break ${missingTough} more Tough Cookie${missingTough === 1 ? '' : 's'}` :
        `Tough ${this.stage.toughDestroyed}/${this.stage.toughRequired}` :
      this.stage.isBossCheckpoint ? 'Boss ahead' : '');
    this.icons.get('tough')?.setVisible(!!this.toughText.text && !layout.compact && !bossFight)
      .setPosition(21, HUD_TOUGH_ROW.iconY).setDisplaySize(HUD_TOUGH_ROW.iconSize, HUD_TOUGH_ROW.iconSize);
    this.progressFill.setSize(this.progressWidth * (bossFight ? this.boss!.hp / this.boss!.config.bodyHp : this.stage.progressPercent / 100), 10)
      .setFillStyle(bossFight ? 0xa93438 : 0x276b93);
    this.bossStatusText.setText(bossFight ? this.boss!.phase === 'VULNERABLE' ? 'ARMOR BROKEN · 2× DAMAGE' :
      this.boss!.phase === 'RAGE' ? `RAGE · COMBO ${this.boss!.comboCount}/3` :
        this.boss!.phase === 'GOLDEN' ? 'GOLDEN FORM · BODY EXPOSED' :
          this.boss!.protectionHp > 0 ? `${this.boss!.config.protection?.toUpperCase()} ACTIVE` : 'BODY EXPOSED' : '');
    this.bossProtectionText.setText(bossFight && this.boss!.protectionHp > 0 ?
      `${this.boss!.config.protection} ${this.boss!.protectionHp}/${this.boss!.config.protectionHp}` : '');
    this.bossProtectionBack.setVisible(bossFight && this.boss!.protectionHp > 0);
    this.bossProtectionFill.setVisible(bossFight && this.boss!.protectionHp > 0)
      .setSize(bossFight ? (layout.fieldRight - 32) * this.boss!.protectionHp / (this.boss!.config.protectionHp || 1) : 0, 8);
    this.updateTimer();
    this.shopTitle.setText('Kingdom Market');
    this.shopWallet.setText(`◈ ${formatAmount(this.economy.balance)} Cookies available`);
    this.statsText.setText(`Earned ${formatAmount(this.economy.lifetimeEarned)}  ·  Destroyed ${this.economy.cookiesDestroyed}  ·  Hits ${this.economy.validHits}`);
    for (const id of UPGRADE_IDS) {
      const upgrade = UPGRADES[id];
      const cost = this.upgrades.cost(id);
      const effect = id === 'value' ? `${formatAmount(this.upgrades.reward)} Cookies / Normal` :
        id === 'size' ? `Radius ${this.upgrades.radius}px` :
        id === 'speed' ? `${this.upgrades.spawnMs} ms / spawn` :
        id === 'power' ? `${this.upgrades.damage} damage / click` :
          id === 'luck' ? `Golden chance ${this.upgrades.goldenChanceBp / 100}%` :
            id === 'health' ? `${this.upgrades.maxHp} maximum HP` :
              id === 'lifetime' ? this.upgrades.lifetimeBonusMs ?
                `+${(this.upgrades.lifetimeBonusMs / 1000).toFixed(1)}s duration` : '+0.5s per level' :
                `${this.upgrades.stageShields} shields / stage`;
      const status = !upgrade.available ? 'LOCKED' : cost === null && id === 'power' ?
        `WAIT\nSTAGE ${12n * (BigInt(Math.floor(this.stage.maxCompletedStage / 12)) + 1n)}` : cost === null ? 'MAX' :
        this.economy.balance >= cost ? 'BUY' : 'NEED MORE';
      const row = this.shopRows.get(id)!;
      row.label.setText(this.scale.height < 420 ?
        `${upgrade.name} · Lv ${this.upgrades.level(id)}\n${effect}` :
        `${upgrade.name} · Lv ${this.upgrades.level(id)}${id === 'power' ? `/${this.upgrades.powerLimit}` : ''}\n${effect}`);
      const ready = cost !== null && this.economy.balance >= cost;
      row.button.setFillStyle(ready ? 0xfff6df : 0xf5e4bf).setStrokeStyle(2, ready ? 0x236451 : 0xa79c8b);
      row.badge.setFillStyle(ready ? 0x236451 : 0xa79c8b);
      row.badgeText.setText(`${status}${cost === null ? '' : `\n${formatAmount(cost)} ◈`}`);
      if (ready && row.button.visible) row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    }
    const warpCost = timeWarpCost(this.stage.stageNumber);
    this.warpBuyLabel.setText(`Time Warp · ${this.warp.charges}/3\n6s slower threats`);
    const warpReady = this.warp.charges < 3 && this.economy.balance >= warpCost;
    this.warpBuyButton.setFillStyle(warpReady ? 0xfff6df : 0xf5e4bf)
      .setStrokeStyle(2, warpReady ? 0x236451 : 0xa79c8b);
    this.warpBuyBadge.setFillStyle(warpReady ? 0x236451 : 0xa79c8b);
    this.warpBuyBadgeText.setText(`${this.warp.charges >= 3 ? 'MAX' : warpReady ? 'BUY' : 'NEED MORE'}\n${formatAmount(warpCost)} ◈`);
    if (warpReady && this.warpBuyButton.visible) this.warpBuyButton.setInteractive({ useHandCursor: true });
    else this.warpBuyButton.disableInteractive();
    for (const id of ABILITY_IDS) {
      const cost = abilityCost(id, this.stage.stageNumber);
      const charges = this.abilities.charges(id);
      const row = this.abilityBuyRows.get(id)!;
      row.label.setText(`${ABILITIES[id].name} · ${charges}/3\n${ABILITIES[id].durationMs / 1000}s ${id === 'RAIN' ? 'extra spawns' : 'safe hits'}`);
      const ready = charges < 3 && this.economy.balance >= cost;
      row.button.setFillStyle(ready ? 0xfff6df : 0xf5e4bf).setStrokeStyle(2, ready ? 0x236451 : 0xa79c8b);
      row.badge.setFillStyle(ready ? 0x236451 : 0xa79c8b);
      row.badgeText.setText(`${charges >= 3 ? 'MAX' : ready ? 'BUY' : 'NEED MORE'}\n${formatAmount(cost)} ◈`);
      if (ready && row.button.visible) row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    }
    this.updateAbilityButtons();
    this.updateBombNotice();
  }

  private updateBombNotice() {
    if (!this.icons.size || !this.bombText) return;
    const frame = calculateGameLayout(this.scale.width, this.scale.height, this.stage.status === 'BOSS_FIGHT');
    const visible = this.stage.status === 'RUNNING' && [...this.model.active.values()].some(cookie => cookie.type === 'BOMB');
    this.icons.get('bomb')!.setPosition(frame.compact ? frame.fieldRight / 2 : frame.fieldRight - 91,
      frame.compact ? 15 : 78).setDisplaySize(21, 21).setVisible(visible);
    this.bombText.setPosition(frame.fieldRight - 74, 70).setVisible(visible && !frame.compact);
  }

  private updateAbilityButtons() {
    const visible = this.stage.status === 'RUNNING' && !this.modalShop;
    for (const id of ABILITY_IDS) {
      const row = this.abilityButtons.get(id);
      if (!row) continue;
      const remaining = this.abilities.remainingMs(id);
      const cooldown = this.abilities.cooldownMs(id);
      row.label.setText(remaining ? `${id === 'RAIN' ? 'RAIN' : 'AUTO'} ${Math.ceil(remaining / 1000)}s` :
        cooldown ? `${id === 'RAIN' ? 'RAIN' : 'AUTO'} CD ${Math.ceil(cooldown / 1000)}s` :
          `${id === 'RAIN' ? 'RAIN' : 'AUTO'} ×${this.abilities.charges(id)}`);
      row.button.setVisible(visible).setFillStyle(remaining ? 0x5a4d9c : this.abilities.charges(id) ?
        id === 'RAIN' ? 0x176d7a : 0x7653a0 : 0xa79c8b);
      row.label.setVisible(visible);
      if (visible && !remaining && !cooldown && this.abilities.charges(id)) row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    }
  }

  private updateWarpButton() {
    const activeStage = this.stage.status === 'RUNNING' || this.stage.status === 'BOSS_FIGHT';
    const visible = activeStage && !this.modalShop;
    this.warpButton.setVisible(visible).setFillStyle(this.warp.active ? 0x236451 :
      this.warp.charges ? 0x5a4d9c : 0xa79c8b);
    this.warpButtonText.setVisible(visible).setText(this.warp.active ?
      `WARP ${Math.ceil(this.warp.remainingMs / 1000)}s` : `WARP ×${this.warp.charges}`);
    if (visible && !this.warp.active && this.warp.charges > 0) this.warpButton.setInteractive();
    else this.warpButton.disableInteractive();
  }

  private updateTimer() {
    const seconds = Math.ceil(this.stage.remainingMs / 1000);
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    this.timerText.setText(`${seconds <= 10 ? '! ' : ''}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
      .setColor(seconds <= 10 ? '#a93438' : '#35251e');
  }

  private toggleShop() {
    if (this.stage.status === 'BOSS_FIGHT') return;
    this.shopOpen = !this.shopOpen;
    this.layout();
    this.spawnTimer.paused = !this.focused || document.hidden || this.modalShop || this.stage.status !== 'RUNNING';
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
    const bossFight = this.stage.status === 'BOSS_FIGHT';
    const frame = calculateGameLayout(width, height, bossFight);
    const { sideShop, compact, hudHeight, dockHeight, fieldRight, playArea } = frame;
    const visible = (sideShop || this.shopOpen) && !bossFight;
    this.background.setTexture(bossFight ? 'boss-arena' : 'kingdom-background')
      .setPosition(width / 2, height / 2).setScale(Math.max(width / 1280, height / 720));
    this.hudPanel.setVisible(false);
    this.dockPanel.setVisible(false);
    this.chromeArt.clear().fillStyle(0xfff6df).fillRoundedRect(4, 4, fieldRight - 8, hudHeight - 8, 13)
      .lineStyle(3, 0x845236).strokeRoundedRect(4, 4, fieldRight - 8, hudHeight - 8, 13)
      .fillStyle(0x6b3e29).fillRoundedRect(4, height - dockHeight + 4, fieldRight - 8, dockHeight - 8, 12)
      .lineStyle(3, 0x845236).strokeRoundedRect(4, height - dockHeight + 4, fieldRight - 8, dockHeight - 8, 12);
    this.titleText.setPosition(12, compact ? 5 : 8).setFontSize(compact ? 17 : fieldRight < 480 ? 21 : 26);
    this.stageText.setPosition(fieldRight - 12, compact ? 8 : 12).setOrigin(1, 0)
      .setFontSize(compact ? 12 : fieldRight < 480 ? 13 : 16);
    this.healthText.setPosition(35, compact ? 31 : 41).setOrigin(0, 0)
      .setFontSize(compact ? 13 : 15);
    this.shieldText.setPosition(compact ? 137 : 145, compact ? 31 : 41)
      .setFontSize(compact ? 13 : 15);
    this.timerText.setPosition(fieldRight - 12, compact ? 31 : 41).setFontSize(compact ? 13 : 17);
    this.balanceText.setPosition(35, 70).setFontSize(15).setVisible(!compact);
    this.progressText.setPosition(compact ? 12 : 34, compact ? 55 : 94).setFontSize(compact ? 13 : 15);
    this.progressWidth = fieldRight - 24;
    this.progressBack.setPosition(12, compact ? 78 : 114).setSize(this.progressWidth, 9)
      .setFillStyle(0xd6b88a);
    this.progressFill.setPosition(12, compact ? 78 : 114).setSize(this.progressWidth *
      (bossFight && this.boss ? this.boss.hp / this.boss.config.bodyHp : this.stage.progressPercent / 100), 9)
      .setFillStyle(bossFight ? 0xa93438 : 0x276b93);
    this.toughText.setPosition(compact ? fieldRight - 12 : 34, compact ? 55 : HUD_TOUGH_ROW.textY)
      .setOrigin(compact ? 1 : 0, 0).setFontSize(compact ? 12 : 13);
    this.statsText.setVisible(false);
    const icon = (name: string, x: number, y: number, size: number, show = true) => {
      this.icons.get(name)!.setPosition(x, y).setDisplaySize(size, size).setVisible(show);
    };
    icon('health', 22, compact ? 40 : 50, 23);
    icon('timer', fieldRight - (compact ? 87 : 105), compact ? 40 : 50, 23);
    icon('shield', compact ? 124 : 131, compact ? 40 : 50, 23);
    icon('currency', 22, 78, 22, !compact);
    icon('stage-points', 22, 102, 20, !compact);
    icon('tough', 21, HUD_TOUGH_ROW.iconY, HUD_TOUGH_ROW.iconSize, !!this.toughText.text && !compact && !bossFight);
    this.updateBombNotice();

    this.bossPanel.setPosition(0, playArea.bottom).setSize(fieldRight, frame.bossPanelHeight)
      .setFillStyle(0xfff6df).setStrokeStyle(2, 0x845236).setVisible(bossFight);
    this.bossStatusText.setPosition(12, playArea.bottom + 3).setFontSize(compact ? 12 : 14).setVisible(bossFight);
    this.bossProtectionText.setPosition(12, playArea.bottom + 20).setFontSize(12)
      .setVisible(bossFight && !!this.boss?.protectionHp);
    this.bossProtectionBack.setPosition(12, playArea.bottom + 39).setSize(fieldRight - 24, 6)
      .setVisible(bossFight && !!this.boss?.protectionHp);
    this.bossProtectionFill.setPosition(12, playArea.bottom + 39)
      .setSize(this.boss ? (fieldRight - 24) * this.boss.protectionHp / (this.boss.config.protectionHp || 1) : 0, 6)
      .setVisible(bossFight && !!this.boss?.protectionHp);

    const dockY = height - dockHeight / 2;
    const cellWidth = Math.min(150, (fieldRight - 20) / 4 - 4);
    const centers = [1, 3, 5, 7].map(n => 10 + (fieldRight - 20) * n / 8);
    this.toggleButton.setVisible(!bossFight && !sideShop).setPosition(
      this.shopOpen ? width - 35 : centers[0], this.shopOpen ? 32 : dockY)
      .setSize(this.shopOpen ? 44 : cellWidth, this.shopOpen ? 44 : dockHeight - 12)
      .setFillStyle(0x6b3e29).setStrokeStyle(2, 0xfff6df);
    this.toggleText.setVisible(!bossFight && !sideShop).setPosition(this.toggleButton.x,
      this.shopOpen ? this.toggleButton.y : dockY + (compact ? 12 : 16))
      .setFontSize(compact ? 12 : 14).setText(this.shopOpen ? '×' : 'SHOP');
    icon('shop', centers[0], dockY - 12, 22, !sideShop && !bossFight && !this.shopOpen);
    this.icons.get('shop')!.setDepth(12);
    if (!sideShop && !bossFight) this.toggleButton.setInteractive({ useHandCursor: true });
    else this.toggleButton.disableInteractive();
    this.abilityToggle.setVisible(false).disableInteractive();
    this.abilityToggleText.setVisible(false);
    ABILITY_IDS.forEach((id, index) => {
      const row = this.abilityButtons.get(id)!;
      row.button.setPosition(centers[index + 1], dockY).setSize(cellWidth, dockHeight - 12)
        .setStrokeStyle(2, 0xfff6df);
      row.label.setPosition(row.button.x, dockY + (compact ? 12 : 16)).setFontSize(12);
      icon(id === 'RAIN' ? 'cookie-rain' : 'auto-clicker', row.button.x, dockY - 12, 23,
        this.stage.status === 'RUNNING' && !this.modalShop);
      this.icons.get(id === 'RAIN' ? 'cookie-rain' : 'auto-clicker')!.setDepth(12);
    });
    this.warpButton.setPosition(centers[3], dockY).setSize(cellWidth, dockHeight - 12)
      .setStrokeStyle(2, 0xfff6df);
    this.warpButtonText.setPosition(centers[3], dockY + (compact ? 12 : 16)).setFontSize(12);
    icon('time-warp', centers[3], dockY - 12, 23, !this.modalShop &&
      (this.stage.status === 'RUNNING' || bossFight));
    this.icons.get('time-warp')!.setDepth(12);

    const shopX = sideShop ? frame.shop.x + 10 : 10;
    const shopWidth = sideShop ? frame.shop.width - 20 : width - 20;
    const tabY = compact ? 66 : sideShop ? 78 : 106;
    const rowTop = tabY + 50;
    this.shopBackground.setPosition(frame.shop.x, frame.shop.y).setSize(frame.shop.width, frame.shop.height)
      .setFillStyle(0xfff6df, 0).setStrokeStyle(0).setVisible(visible);
    this.shopArt.clear();
    if (visible) {
      if (!sideShop) this.shopArt.fillStyle(0x35251e, 0.92).fillRect(0, 0, width, height);
      this.shopArt.fillStyle(0xfff6df).fillRoundedRect(frame.shop.x + 4, 4, frame.shop.width - 8, height - 8, 15)
        .lineStyle(3, 0x845236).strokeRoundedRect(frame.shop.x + 4, 4, frame.shop.width - 8, height - 8, 15);
    }
    this.shopTitle.setPosition(shopX + 8, compact ? 12 : sideShop ? 20 : 32)
      .setFontSize(compact ? 20 : 24).setVisible(visible);
    this.shopWallet.setPosition(shopX + 8, compact ? 42 : sideShop ? 53 : 76)
      .setFontSize(compact ? 12 : 14).setVisible(visible);
    this.shopTabs.forEach((tab, index) => {
      const selected = this.shopTab === (index === 0 ? 'OFFENSE' : index === 1 ? 'DEFENSE' : 'SPECIAL');
      tab.button.setPosition(shopX + index * shopWidth / 3, tabY).setSize(shopWidth / 3 - 3, 44)
        .setFillStyle(selected ? 0x6b3e29 : 0xf5e4bf).setStrokeStyle(2, 0x845236).setVisible(visible);
      tab.label.setPosition(tab.button.x + tab.button.width / 2, tabY + 14)
        .setFontSize(12).setColor(selected ? '#fff6df' : '#35251e').setVisible(visible);
      if (visible) tab.button.setInteractive({ useHandCursor: true });
      else tab.button.disableInteractive();
    });
    const ids: UpgradeId[] = this.shopTab === 'OFFENSE' ? UPGRADE_IDS.filter(id => id !== 'health' && id !== 'shield') :
      this.shopTab === 'DEFENSE' ? UPGRADE_IDS.filter(id => id === 'health' || id === 'shield') : [];
    const total = this.shopTab === 'OFFENSE' ? ids.length : this.shopTab === 'DEFENSE' ? ids.length + 1 : ABILITY_IDS.length;
    const pageSize = compact ? 3 : total;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    this.shopPage = Math.min(this.shopPage, maxPage);
    const rowHeight = compact ? 46 : Math.min(82, Math.floor((height - rowTop - 24 - (total - 1) * 8) / Math.max(total, 1)));
    const rowY = (index: number) => rowTop + (index - this.shopPage * pageSize) * (rowHeight + 8);
    const inPage = (index: number) => index >= this.shopPage * pageSize && index < (this.shopPage + 1) * pageSize;
    UPGRADE_IDS.forEach(id => {
      const row = this.shopRows.get(id)!;
      const index = ids.indexOf(id);
      const show = visible && index >= 0 && inPage(index);
      if (index >= 0) row.button.setPosition(shopX, rowY(index)).setSize(shopWidth, rowHeight);
      row.button.setVisible(show);
      row.label.setPosition(shopX + 46, row.button.y + (compact ? 5 : 13))
        .setFontSize(compact ? 12 : 14).setVisible(show);
      row.icon.setPosition(shopX + 23, row.button.y + rowHeight / 2).setDisplaySize(28, 28).setVisible(show);
      row.badge.setPosition(shopX + shopWidth - 47, row.button.y + rowHeight / 2)
        .setSize(86, compact ? 38 : 50).setVisible(show);
      row.badgeText.setPosition(row.badge.x, row.badge.y).setFontSize(12).setVisible(show);
      if (show && this.upgrades.cost(id) !== null && this.economy.balance >= this.upgrades.cost(id)!)
        row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    });
    const warpIndex = ids.length;
    const warpVisible = visible && this.shopTab === 'DEFENSE' && inPage(warpIndex);
    this.warpBuyButton.setPosition(shopX, rowY(warpIndex)).setSize(shopWidth, rowHeight).setVisible(warpVisible);
    this.warpBuyLabel.setPosition(shopX + 46, this.warpBuyButton.y + (compact ? 5 : 13))
      .setFontSize(compact ? 12 : 14).setVisible(warpVisible);
    this.warpBuyIcon.setPosition(shopX + 23, this.warpBuyButton.y + rowHeight / 2)
      .setDisplaySize(28, 28).setVisible(warpVisible);
    this.warpBuyBadge.setPosition(shopX + shopWidth - 47, this.warpBuyButton.y + rowHeight / 2)
      .setSize(86, compact ? 38 : 50).setVisible(warpVisible);
    this.warpBuyBadgeText.setPosition(this.warpBuyBadge.x, this.warpBuyBadge.y)
      .setFontSize(12).setVisible(warpVisible);
    if (warpVisible && this.warp.charges < 3 && this.economy.balance >= timeWarpCost(this.stage.stageNumber))
      this.warpBuyButton.setInteractive({ useHandCursor: true });
    else this.warpBuyButton.disableInteractive();
    ABILITY_IDS.forEach((id, index) => {
      const row = this.abilityBuyRows.get(id)!;
      const show = visible && this.shopTab === 'SPECIAL' && inPage(index);
      row.button.setPosition(shopX, rowY(index)).setSize(shopWidth, rowHeight).setVisible(show);
      row.label.setPosition(shopX + 46, row.button.y + (compact ? 5 : 13))
        .setFontSize(compact ? 12 : 14).setVisible(show);
      row.icon.setPosition(shopX + 23, row.button.y + rowHeight / 2).setDisplaySize(28, 28).setVisible(show);
      row.badge.setPosition(shopX + shopWidth - 47, row.button.y + rowHeight / 2)
        .setSize(86, compact ? 38 : 50).setVisible(show);
      row.badgeText.setPosition(row.badge.x, row.badge.y).setFontSize(12).setVisible(show);
      if (show && this.abilities.charges(id) < 3 && this.economy.balance >= abilityCost(id, this.stage.stageNumber))
        row.button.setInteractive({ useHandCursor: true });
      else row.button.disableInteractive();
    });
    const pagerVisible = visible && compact && maxPage > 0;
    const pagerY = height - 27;
    this.shopPrev.setPosition(width / 2 - 70, pagerY).setVisible(pagerVisible);
    this.shopNext.setPosition(width / 2 + 70, pagerY).setVisible(pagerVisible);
    this.shopPrevText.setPosition(this.shopPrev.x, pagerY - 2).setVisible(pagerVisible);
    this.shopNextText.setPosition(this.shopNext.x, pagerY - 2).setVisible(pagerVisible);
    this.shopPager.setPosition(width / 2, pagerY).setText(`${this.shopPage + 1}/${maxPage + 1}`)
      .setVisible(pagerVisible);
    if (pagerVisible && this.shopPage > 0) this.shopPrev.setInteractive({ useHandCursor: true });
    else this.shopPrev.disableInteractive();
    if (pagerVisible && this.shopPage < maxPage) this.shopNext.setInteractive({ useHandCursor: true });
    else this.shopNext.disableInteractive();
    this.shopPrev.setFillStyle(this.shopPage > 0 ? 0x6b3e29 : 0xa79c8b);
    this.shopNext.setFillStyle(this.shopPage < maxPage ? 0x6b3e29 : 0xa79c8b);
    // Pager labels are independent of the card hitboxes.
    this.shopPrev.setStrokeStyle(2, 0xfff6df);
    this.shopNext.setStrokeStyle(2, 0xfff6df);
    if (visible) this.shopBackground.setInteractive();
    else this.shopBackground.disableInteractive();
    this.updateWarpButton();
    this.updateAbilityButtons();
    this.layoutBoss();
    this.layoutTerminal();
  }

  private layoutTerminal() {
    const frame = calculateGameLayout(this.scale.width, this.scale.height, false);
    const width = frame.fieldRight;
    const height = this.scale.height - frame.dockHeight;
    const visible = (this.stage.status === 'COMPLETED' || this.stage.status === 'FAILED') && !this.modalShop;
    const cycleComplete = this.stage.status === 'COMPLETED' && this.stage.cycle.stageInCycle === 12;
    const result = cycleComplete ? `${kingdomName(this.stage.cycle.cycleNumber).toUpperCase()} COMPLETE` :
      this.stage.status === 'COMPLETED' ? 'STAGE COMPLETED' :
        this.stage.failureReason === 'HEALTH_DEPLETED' ? 'OUT OF HEALTH' : 'TIME UP';
    const summary = `${formatAmount(this.stage.progress)} / ${formatAmount(this.stage.target)} SP · Tough ${this.stage.toughDestroyed}/${this.stage.toughRequired}\n+${formatAmount(this.stage.currencyEarned)} Cookies earned`;
    this.terminalBackground.setPosition(0, 0).setSize(width, height).setFillStyle(0x35251e, 0.94)
      .setVisible(visible);
    this.terminalText.setPosition(width / 2, frame.compact ? 93 : height / 2 - 30)
      .setFontSize(frame.compact ? 13 : 18).setLineSpacing(frame.compact ? 2 : 8)
      .setText(`${result}\nStage ${this.stage.stageNumber}${this.lastBossName ? ` · ${this.lastBossName}` : ''}\n${summary}${this.lastBossBonus ? `\nBoss bonus: ${formatAmount(this.lastBossBonus)}` : ''}${this.lastFreeAbility ? `\nFree ${ABILITIES[this.lastFreeAbility].name} charge` : ''}${cycleComplete ? `\nClick Power limit: ${this.upgrades.powerLimit}` : ''}`)
      .setVisible(visible);
    this.terminalButton.setPosition(width / 2, height - (frame.compact ? 30 : 64))
      .setSize(Math.min(190, width - 36), 48).setFillStyle(0x236451).setStrokeStyle(2, 0xfff6df)
      .setVisible(visible);
    this.terminalButtonText.setPosition(this.terminalButton.x, this.terminalButton.y).setColor('#fff6df')
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
    this.spawnTimer.paused = !this.focused || document.hidden || this.modalShop || this.stage.status !== 'RUNNING';
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
