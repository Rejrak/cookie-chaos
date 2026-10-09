import Phaser from 'phaser';
import { COOKIE_SOURCE_RADIUS, COOKIE_TYPES, RULES, SpawnManager, advanceGameTime, cookieReward, type Cookie, type PlayArea } from './game';
import { Economy, formatAmount } from './economy';
import { UPGRADES, UPGRADE_IDS, UpgradeManager, type UpgradeId } from './upgrades';
import './style.css';

class GameScene extends Phaser.Scene {
  private model = new SpawnManager();
  private economy = new Economy();
  private upgrades = new UpgradeManager();
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private cracks = new Map<number, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Text[] = [];
  private gameplayNow = 0;
  private shopRows = new Map<UpgradeId, { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
  private shopOpen = false;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private titleText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private shopBackground!: Phaser.GameObjects.Rectangle;
  private shopTitle!: Phaser.GameObjects.Text;
  private toggleButton!: Phaser.GameObjects.Rectangle;
  private toggleText!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  preload() {
    for (const type of Object.values(COOKIE_TYPES)) this.load.svg(type.texture, type.asset, { width: 96, height: 96 });
    this.load.svg('hard-cracks', '/hard-cracks.svg', { width: 96, height: 96 });
  }

  create() {
    this.cameras.main.setBackgroundColor('#fff2d4');
    const heading = { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', color: '#713b20' };
    this.titleText = this.add.text(20, 15, 'Cookie Chaos', { ...heading, fontSize: '26px' }).setDepth(2);
    this.balanceText = this.add.text(20, 55, '', { ...heading, fontSize: '21px' }).setDepth(2);
    this.statsText = this.add.text(20, 79, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#713b20' }).setDepth(2);
    this.shopBackground = this.add.rectangle(0, 0, 1, 1, 0xffe5b6).setOrigin(0).setDepth(4).setInteractive();
    this.shopTitle = this.add.text(0, 0, 'UPGRADES', { ...heading, fontSize: '20px' }).setDepth(5);
    for (const id of UPGRADE_IDS) {
      const button = this.add.rectangle(0, 0, 1, 1, 0xe4d4b9).setOrigin(0).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#57301d', lineSpacing: 0 }).setDepth(6);
      button.on(Phaser.Input.Events.POINTER_DOWN, () => this.buy(id));
      this.shopRows.set(id, { button, label });
    }
    this.toggleButton = this.add.rectangle(0, 0, 180, 52, 0xb76b36).setDepth(6).setInteractive({ useHandCursor: true });
    this.toggleText = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(7);
    this.toggleButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.toggleShop());
    this.updateHud();
    this.layout();
    this.addCookie(true);
    this.startSpawnTimer();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
  }

  update(_time: number, delta: number) {
    this.gameplayNow = advanceGameTime(this.gameplayNow, delta, this.modalShop);
    if (this.modalShop) return;
    for (const id of this.model.expire(this.gameplayNow)) this.removeCookie(id);
  }

  private get sideShop() { return this.scale.width >= 560 && this.scale.height >= 320; }
  private get modalShop() { return !this.sideShop && this.shopOpen; }

  private get playArea(): PlayArea {
    return { left: 0, top: RULES.hudHeight, right: this.sideShop ? this.scale.width - 312 : this.scale.width,
      bottom: this.sideShop ? this.scale.height : this.scale.height - 72 };
  }

  private addCookie(first = false) {
    if (this.modalShop) return;
    const cookie = this.model.spawn({ width: this.scale.width, height: this.scale.height }, this.gameplayNow,
      this.upgrades.radius, this.playArea, { goldenChanceBp: this.upgrades.goldenChanceBp, forcedType: first ? 'NORMAL' : undefined });
    if (cookie) this.drawCookie(cookie);
  }

  private drawCookie(cookie: Cookie) {
    const sprite = this.add.image(cookie.x, cookie.y, COOKIE_TYPES[cookie.type].texture).setAlpha(0).setScale(cookie.radius / (COOKIE_SOURCE_RADIUS * 2));
    if (cookie.type === 'HARD') {
      const cracks = this.add.image(cookie.x, cookie.y, 'hard-cracks').setScale(cookie.radius / COOKIE_SOURCE_RADIUS).setDepth(1);
      this.cracks.set(cookie.id, cracks);
      this.updateCracks(cookie);
    }
    sprite.setInteractive(new Phaser.Geom.Circle(48, 48, COOKIE_SOURCE_RADIUS), Phaser.Geom.Circle.Contains);
    sprite.on(Phaser.Input.Events.POINTER_DOWN, () => {
      const hit = this.model.hit(cookie.id, this.upgrades.damage);
      if (!hit) return;
      const reward = hit.destroyed ? cookieReward(cookie, this.upgrades.reward) : null;
      this.economy.recordHit(reward);
      this.updateHud();
      if (!hit.destroyed) {
        this.updateCracks(cookie);
        this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS * 0.9, yoyo: true, duration: 70 });
        this.floatText(cookie, `${hit.hp}/${cookie.maxHp} HP`, '#713b20');
        return;
      }
      sprite.disableInteractive();
      this.sprites.delete(cookie.id);
      this.cracks.get(cookie.id)?.destroy();
      this.cracks.delete(cookie.id);
      this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS * 1.15, alpha: 0, duration: 170, onComplete: () => sprite.destroy() });
      this.floatText(cookie, `+${formatAmount(reward!)}`, cookie.type === 'GOLDEN' ? '#bd780a' : '#713b20');
      if (cookie.type === 'GOLDEN') {
        const halo = this.add.circle(cookie.x, cookie.y, cookie.radius + 5).setStrokeStyle(3, 0xffd45f).setDepth(1);
        this.tweens.add({ targets: halo, scale: 1.35, alpha: 0, duration: 260, onComplete: () => halo.destroy() });
      }
    });
    this.sprites.set(cookie.id, sprite);
    this.tweens.add({ targets: sprite, scale: cookie.radius / COOKIE_SOURCE_RADIUS, alpha: 1, duration: 180 });
  }

  private floatText(cookie: Cookie, value: string, color: string) {
    if (this.effects.length >= 10) this.effects.shift()?.destroy();
    const effect = this.add.text(cookie.x, cookie.y - 24, value, {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', fontStyle: 'bold', color,
    }).setOrigin(0.5).setDepth(3);
    this.effects.push(effect);
    this.tweens.add({ targets: effect, y: effect.y - 38, alpha: 0, duration: 600,
      onComplete: () => { effect.destroy(); this.effects = this.effects.filter(item => item !== effect); } });
  }

  private updateCracks(cookie: Cookie) {
    this.cracks.get(cookie.id)?.setAlpha(cookie.hp === 1 ? 1 : 0.5)
      .setVisible(!this.modalShop && cookie.hp < cookie.maxHp);
  }

  private removeCookie(id: number) {
    this.sprites.get(id)?.destroy();
    this.sprites.delete(id);
    this.cracks.get(id)?.destroy();
    this.cracks.delete(id);
  }

  private startSpawnTimer() {
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.addEvent({ delay: this.upgrades.spawnMs, loop: true, callback: () => this.addCookie() });
    this.spawnTimer.paused = this.modalShop;
  }

  private buy(id: UpgradeId) {
    if (!this.upgrades.buy(id, this.economy)) return;
    if (id === 'speed') this.startSpawnTimer();
    this.updateHud();
    const row = this.shopRows.get(id)!;
    row.button.setStrokeStyle(3, 0xffffff);
    this.time.delayedCall(250, () => row.button.setStrokeStyle(0));
  }

  private updateHud() {
    this.balanceText.setText(`Cookies: ${formatAmount(this.economy.balance)}`);
    this.shopTitle.setText(this.modalShop && this.scale.height < 420 ? `Shop · ${formatAmount(this.economy.balance)}` : 'UPGRADES');
    this.statsText.setText(`Earned ${formatAmount(this.economy.lifetimeEarned)}  ·  Destroyed ${this.economy.cookiesDestroyed}  ·  Hits ${this.economy.validHits}`);
    for (const id of UPGRADE_IDS) {
      const upgrade = UPGRADES[id];
      const cost = this.upgrades.cost(id);
      const effect = id === 'value' ? `+${formatAmount(this.upgrades.reward)} / cookie` :
        id === 'size' ? `Radius ${this.upgrades.radius}px` :
        id === 'speed' ? `Every ${this.upgrades.spawnMs}ms` :
        id === 'power' ? `Damage ${this.upgrades.damage} / click` : `Golden chance ${this.upgrades.goldenChanceBp / 100}%`;
      const status = !upgrade.available ? 'Price —  ·  Locked: M3' : cost === null ? 'Price —  ·  MAX' :
        `Price ${formatAmount(cost)}  ·  ${this.economy.balance >= cost ? 'BUY' : 'Need more'}`;
      const row = this.shopRows.get(id)!;
      row.label.setText(`${upgrade.name}  ·  Lv ${this.upgrades.level(id)}\n${effect}\n${status}`);
      row.button.setFillStyle(cost !== null && this.economy.balance >= cost ? 0xe9ad63 : 0xe4d4b9);
    }
  }

  private toggleShop() {
    this.shopOpen = !this.shopOpen;
    this.layout();
    this.spawnTimer.paused = this.modalShop;
    this.syncCookieVisibility();
    if (!this.modalShop && !this.model.active.size) this.addCookie();
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
    const compact = !side && height < 420;
    const visible = side || this.shopOpen;
    this.balanceText.setPosition(width >= 760 ? (side ? width - 332 : width - 20) : 20, width >= 760 ? 20 : 51)
      .setOrigin(width >= 760 ? 1 : 0, 0);
    this.shopBackground.setPosition(side ? width - 312 : compact ? 0 : 8, side || compact ? 0 : RULES.hudHeight)
      .setSize(side ? 312 : compact ? width : width - 16, side || compact ? height : height - RULES.hudHeight).setVisible(visible);
    this.shopTitle.setPosition(side ? width - 296 : compact ? 16 : 20, side ? 20 : compact ? 12 : 110)
      .setText(compact && this.shopOpen ? `Shop · ${formatAmount(this.economy.balance)}` : 'UPGRADES').setVisible(visible);
    this.toggleButton.setVisible(!side).setPosition(this.shopOpen ? width - (compact ? 58 : 78) : width / 2, this.shopOpen ? (compact ? 24 : 119) : height - 36)
      .setSize(this.shopOpen ? (compact ? 100 : 116) : 180, this.shopOpen ? 36 : 52);
    this.toggleText.setVisible(!side).setPosition(this.toggleButton.x, this.toggleButton.y)
      .setText(this.shopOpen ? 'Close' : 'Shop / Upgrades');
    const rowTop = side ? 65 : compact ? 50 : 138;
    const rowHeight = Math.min(70, Math.floor((height - rowTop - 4 * UPGRADE_IDS.length) / UPGRADE_IDS.length));
    UPGRADE_IDS.forEach((id, index) => {
      const row = this.shopRows.get(id)!;
      row.button.setPosition(side ? width - 300 : compact ? 8 : 16, rowTop + index * (rowHeight + 4))
        .setSize(side ? 288 : compact ? width - 16 : width - 32, rowHeight).setVisible(visible);
      row.label.setPosition(row.button.x + 10, row.button.y + 3).setFontSize(rowHeight < 54 ? 12 : 14).setVisible(visible);
    });
  }

  private onResize() {
    if (this.sideShop) this.shopOpen = false;
    this.layout();
    for (const id of this.model.resize({ width: this.scale.width, height: this.scale.height }, this.playArea)) this.removeCookie(id);
    for (const cookie of this.model.active.values()) {
      this.sprites.get(cookie.id)?.setPosition(cookie.x, cookie.y);
      this.cracks.get(cookie.id)?.setPosition(cookie.x, cookie.y);
    }
    this.spawnTimer.paused = this.modalShop;
    this.syncCookieVisibility();
    if (!this.modalShop && !this.model.active.size) this.addCookie();
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
