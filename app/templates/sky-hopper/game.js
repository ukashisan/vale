// Sky Hopper: tap to flap through the gaps between pillars.

const W = 360, H = 640;
const GAP = 170, PILLAR_SPEED = 160, FLAP = -330;

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffd43b).fillCircle(16, 16, 16).fillStyle(0xffffff).fillCircle(22, 11, 6)
      .fillStyle(0x222222).fillCircle(24, 11, 3).fillStyle(0xff922b).fillTriangle(28, 16, 38, 20, 28, 23);
    g.generateTexture('bird', 38, 32).clear();
    // Shaded left to right so it can be stretched to any height.
    g.fillStyle(0x51cf66).fillRect(0, 0, 60, 16).fillStyle(0x8ce99a).fillRect(8, 0, 8, 16)
      .fillStyle(0x2b8a3e).fillRect(50, 0, 10, 16);
    g.generateTexture('pillar', 60, 16).clear();
    g.fillStyle(0xffffff, 0.8).fillCircle(20, 20, 20).fillCircle(45, 22, 16).fillCircle(65, 24, 12);
    g.generateTexture('cloud', 80, 40);
    g.destroy();

    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push(this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(40, H - 200), 'cloud')
        .setAlpha(0.6).setScale(Phaser.Math.FloatBetween(0.6, 1.2)));
    }

    this.bird = this.physics.add.image(100, H / 2, 'bird').setCircle(14, 2, 2);
    this.bird.body.allowGravity = false;
    this.pillars = this.physics.add.group({ allowGravity: false, immovable: true });
    this.physics.add.overlap(this.bird, this.pillars, () => this.crash());

    this.best = (Vale.saveData && Vale.saveData.best) || 0;
    this.score = 0;
    this.state = 'ready';
    this.hud = this.add.text(W / 2, 40, '', { fontFamily: 'monospace', fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(5);
    this.msg = this.add.text(W / 2, H / 2 + 80, 'SKY HOPPER\n\nTap to flap', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setDepth(5);
    this.updateHud();

    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard.on('keydown-SPACE', () => this.flap());
  }

  flap() {
    if (this.state === 'over') {
      if (this.time.now > this.overAt + 500) this.scene.restart();
      return;
    }
    if (this.state === 'ready') {
      this.state = 'play';
      this.msg.setText('');
      this.bird.body.allowGravity = true;
      this.bird.body.setGravityY(900);
      this.spawner = this.time.addEvent({ delay: 1500, loop: true, callback: () => this.spawnPillars() });
      this.spawnPillars();
    }
    this.bird.setVelocityY(FLAP);
  }

  spawnPillars() {
    const gapY = Phaser.Math.Between(140, H - 140);
    const x = W + 40;
    const top = this.pillars.create(x, (gapY - GAP / 2) / 2, 'pillar');
    top.setDisplaySize(60, gapY - GAP / 2);
    const bottomH = H - (gapY + GAP / 2);
    const bottom = this.pillars.create(x, H - bottomH / 2, 'pillar');
    bottom.setDisplaySize(60, bottomH);
    for (const p of [top, bottom]) {
      p.setVelocityX(-PILLAR_SPEED);
    }
    top.scored = false;
  }

  crash() {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.overAt = this.time.now;
    this.spawner.remove();
    this.pillars.setVelocityX(0);
    this.bird.setTint(0xff6b6b);
    this.cameras.main.shake(200, 0.01);
    if (this.score > this.best) {
      this.best = this.score;
      Vale.save({ best: this.best });
    }
    this.updateHud();
    this.msg.setText('GAME OVER\n\nScore ' + this.score + '\nBest ' + this.best + '\n\nTap to retry');
  }

  updateHud() { this.hud.setText(String(this.score)); }

  update() {
    for (const c of this.clouds) {
      c.x -= 0.3 * c.scale;
      if (c.x < -60) c.x = W + 60;
    }
    if (this.state !== 'play') return;
    this.bird.setAngle(Phaser.Math.Clamp(this.bird.body.velocity.y / 8, -25, 70));
    if (this.bird.y < 0 || this.bird.y > H) this.crash();
    this.pillars.getChildren().forEach(p => {
      if (p.scored === false && p.x + 30 < this.bird.x) {
        p.scored = true;
        this.score += 1;
        this.updateHud();
      }
      if (p.x < -60) p.destroy();
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#74c0fc',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Play
});
