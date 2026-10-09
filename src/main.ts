import Phaser from 'phaser';
import { RULES, SpawnManager, type Cookie } from './game';
import './style.css';

class GameScene extends Phaser.Scene {
  private model = new SpawnManager();
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Text[] = [];
  private balanceText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  preload() {
    this.load.svg('cookie', '/cookie.svg', { width: 96, height: 96 });
  }

  create() {
    this.cameras.main.setBackgroundColor('#fff2d4');
    this.titleText = this.add.text(20, 15, 'Cookie Chaos', {
      fontFamily: 'system-ui, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#713b20',
    }).setDepth(2);
    this.balanceText = this.add.text(20, 55, 'Cookies: 0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#713b20',
    }).setDepth(2);
    this.layoutHud();
    this.addCookie();
    this.time.addEvent({ delay: RULES.spawnMs, loop: true, callback: () => this.addCookie() });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
  }

  update() {
    for (const id of this.model.expire(this.time.now)) {
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
    }
  }

  private addCookie() {
    const cookie = this.model.spawn({ width: this.scale.width, height: this.scale.height }, this.time.now);
    if (cookie) this.drawCookie(cookie);
  }

  private drawCookie(cookie: Cookie) {
    const sprite = this.add.image(cookie.x, cookie.y, 'cookie').setAlpha(0).setScale(0.5);
    sprite.setInteractive(new Phaser.Geom.Circle(48, 48, 42), Phaser.Geom.Circle.Contains);
    sprite.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!this.model.hit(cookie.id)) return;
      sprite.disableInteractive();
      this.sprites.delete(cookie.id);
      this.balanceText.setText(`Cookies: ${this.model.balance}`);
      this.tweens.add({ targets: sprite, scale: 1, alpha: 0, duration: 170, onComplete: () => sprite.destroy() });
      if (this.effects.length >= 10) this.effects.shift()?.destroy();
      const effect = this.add.text(cookie.x, cookie.y - 24, '+1', {
        fontFamily: 'system-ui, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#713b20',
      }).setOrigin(0.5).setDepth(3);
      this.effects.push(effect);
      this.tweens.add({ targets: effect, y: effect.y - 38, alpha: 0, duration: 600,
        onComplete: () => { effect.destroy(); this.effects = this.effects.filter(item => item !== effect); } });
    });
    this.sprites.set(cookie.id, sprite);
    this.tweens.add({ targets: sprite, scale: 80 / 96, alpha: 1, duration: 180 });
  }

  private layoutHud() {
    const wide = this.scale.width >= 420;
    this.balanceText.setPosition(wide ? this.scale.width - 20 : 20, wide ? 20 : 55).setOrigin(wide ? 1 : 0, 0);
  }

  private onResize() {
    this.layoutHud();
    const oldIds = this.model.resize({ width: this.scale.width, height: this.scale.height }, this.time.now);
    for (const id of oldIds) { this.sprites.get(id)?.destroy(); this.sprites.delete(id); }
    for (const cookie of this.model.active.values()) this.drawCookie(cookie);
    if (!this.model.active.size) this.addCookie();
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
