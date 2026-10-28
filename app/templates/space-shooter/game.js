// Space Shooter: drag anywhere to steer, the ship fires automatically.
// Host API: Vale.asset(name) -> URL, Vale.saveData / Vale.save(obj).

const W = 360, H = 640;

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  preload() {
    this.load.image('ship', Vale.asset('ship.svg'));
    this.load.image('enemy', Vale.asset('enemy.svg'));
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xfff3a0).fillRect(0, 0, 4, 12);
    g.generateTexture('bullet', 4, 12);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 2, 2);
    g.generateTexture('star', 2, 2);
    g.destroy();

    this.stars = [];
    for (let i = 0; i < 60; i++) {
      const s = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'star');
      s.speed = Phaser.Math.FloatBetween(0.5, 2.5);
      s.setAlpha(s.speed / 2.5);
      this.stars.push(s);
    }

    this.ship = this.physics.add.image(W / 2, H - 90, 'ship').setCollideWorldBounds(true);
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    this.score = 0;
    this.best = (Vale.saveData && Vale.saveData.best) || 0;
    this.alive = false;
    this.scoreText = this.add.text(12, 12, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e8e4d8' });
    this.msg = this.add.text(W / 2, H / 2, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#e8e4d8', align: 'center'
    }).setOrigin(0.5);
    this.showTitle('SPACE SHOOTER\n\nDrag to steer\nTap to start');

    // Relative drag: the ship follows finger movement, not the finger position,
    // so the thumb never covers the ship.
    this.input.on('pointerdown', p => {
      if (!this.alive) { this.startRun(); }
      this.drag = { x: p.x, y: p.y, sx: this.ship.x, sy: this.ship.y };
    });
    this.input.on('pointermove', p => {
      if (!this.drag || !p.isDown) return;
      this.ship.x = Phaser.Math.Clamp(this.drag.sx + (p.x - this.drag.x) * 1.4, 20, W - 20);
      this.ship.y = Phaser.Math.Clamp(this.drag.sy + (p.y - this.drag.y) * 1.4, 40, H - 30);
    });
    this.input.on('pointerup', () => { this.drag = null; });

    this.keys = this.input.keyboard.createCursorKeys();

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      b.destroy(); e.destroy();
      this.score += 10;
      this.updateHud();
    });
    this.physics.add.overlap(this.ship, this.enemies, () => this.gameOver());

    this.updateHud();
  }

  showTitle(text) { this.msg.setText(text).setVisible(true); }

  startRun() {
    this.enemies.clear(true, true);
    this.bullets.clear(true, true);
    this.ship.setPosition(W / 2, H - 90).setVisible(true);
    this.score = 0;
    this.alive = true;
    this.msg.setVisible(false);
    this.updateHud();
    this.fireTimer = this.time.addEvent({ delay: 180, loop: true, callback: () => this.fire() });
    this.spawnTimer = this.time.addEvent({ delay: 700, loop: true, callback: () => this.spawn() });
  }

  fire() {
    const b = this.bullets.create(this.ship.x, this.ship.y - 24, 'bullet');
    b.setVelocityY(-520);
  }

  spawn() {
    const e = this.enemies.create(Phaser.Math.Between(24, W - 24), -20, 'enemy');
    e.setVelocity(Phaser.Math.Between(-40, 40), 120 + Math.min(this.score, 600) / 3);
  }

  gameOver() {
    if (!this.alive) return;
    this.alive = false;
    this.fireTimer.remove();
    this.spawnTimer.remove();
    this.ship.setVisible(false);
    this.cameras.main.shake(200, 0.01);
    if (this.score > this.best) {
      this.best = this.score;
      Vale.save({ best: this.best });
    }
    this.updateHud();
    this.showTitle('GAME OVER\n\nScore ' + this.score + '\n\nTap to retry');
  }

  updateHud() { this.scoreText.setText('SCORE ' + this.score + '   BEST ' + this.best); }

  update() {
    for (const s of this.stars) {
      s.y += s.speed;
      if (s.y > H) { s.y = 0; s.x = Phaser.Math.Between(0, W); }
    }
    if (this.alive) {
      const v = 5;
      if (this.keys.left.isDown) this.ship.x -= v;
      if (this.keys.right.isDown) this.ship.x += v;
      if (this.keys.up.isDown) this.ship.y -= v;
      if (this.keys.down.isDown) this.ship.y += v;
    }
    this.bullets.getChildren().forEach(b => { if (b.y < -20) b.destroy(); });
    this.enemies.getChildren().forEach(e => { if (e.y > H + 30) e.destroy(); });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#070a10',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Play
});
