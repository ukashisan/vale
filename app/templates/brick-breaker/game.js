// Brick Breaker: drag anywhere to move the paddle, tap to launch.
// Clear all bricks to advance; each level is faster. 3 lives.

const W = 360, H = 640;
const COLORS = [0xff6b8b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa];

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 80, 14, 7);
    g.generateTexture('paddle', 80, 14).clear();
    g.fillStyle(0xffffff).fillCircle(7, 7, 7);
    g.generateTexture('ball', 14, 14).clear();
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 40, 16, 3);
    g.generateTexture('brick', 40, 16);
    g.destroy();

    this.physics.world.setBoundsCollision(true, true, true, false);
    this.paddle = this.physics.add.image(W / 2, H - 70, 'paddle').setImmovable(true);
    this.paddle.body.allowGravity = false;
    this.ball = this.physics.add.image(W / 2, H - 90, 'ball').setCollideWorldBounds(true).setBounce(1);
    this.bricks = this.physics.add.staticGroup();

    this.physics.add.collider(this.ball, this.paddle, this.hitPaddle, null, this);
    this.physics.add.collider(this.ball, this.bricks, (ball, brick) => {
      brick.destroy();
      this.score += 10;
      this.updateHud();
      if (this.bricks.countActive() === 0) this.nextLevel();
    });

    this.best = (Vale.saveData && Vale.saveData.best) || 0;
    this.hud = this.add.text(12, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#e8e4d8' });
    this.msg = this.add.text(W / 2, H / 2 + 60, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e8e4d8', align: 'center'
    }).setOrigin(0.5);

    this.input.on('pointerdown', p => {
      this.dragFrom = { x: p.x, paddle: this.paddle.x };
      if (this.over) this.newGame();
      else if (!this.launched) this.launch();
    });
    this.input.on('pointermove', p => {
      if (!p.isDown || !this.dragFrom) return;
      this.paddle.x = Phaser.Math.Clamp(this.dragFrom.paddle + (p.x - this.dragFrom.x) * 1.3, 40, W - 40);
    });
    this.keys = this.input.keyboard.createCursorKeys();

    this.newGame();
  }

  newGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.over = false;
    this.buildBricks();
    this.resetBall();
  }

  buildBricks() {
    this.bricks.clear(true, true);
    const rows = Math.min(3 + this.level, 8);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 7; c++) {
        this.bricks.create(36 + c * 48, 80 + r * 22, 'brick').setTint(COLORS[r % COLORS.length]);
      }
    }
  }

  resetBall() {
    this.launched = false;
    this.ball.setVelocity(0, 0);
    this.msg.setText(this.over ? this.msg.text : 'Tap to launch');
    this.updateHud();
  }

  launch() {
    this.launched = true;
    this.msg.setText('');
    const speed = 300 + this.level * 40;
    this.ball.setVelocity(Phaser.Math.Between(-120, 120), -speed);
  }

  hitPaddle(ball, paddle) {
    // Where the ball hits the paddle sets its angle.
    const offset = (ball.x - paddle.x) / (paddle.width / 2);
    const speed = ball.body.velocity.length();
    const angle = Phaser.Math.DegToRad(-90 + offset * 60);
    ball.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  nextLevel() {
    this.level += 1;
    this.buildBricks();
    this.resetBall();
  }

  loseLife() {
    this.lives -= 1;
    if (this.lives > 0) return this.resetBall();
    this.over = true;
    if (this.score > this.best) {
      this.best = this.score;
      Vale.save({ best: this.best });
    }
    this.msg.setText('GAME OVER\n\nScore ' + this.score + '\nTap to play again');
    this.resetBall();
  }

  updateHud() {
    this.hud.setText('SCORE ' + this.score + '  BEST ' + this.best + '  LV ' + this.level + '  ♥' + this.lives);
  }

  update() {
    if (this.keys.left.isDown) this.paddle.x = Math.max(40, this.paddle.x - 7);
    if (this.keys.right.isDown) this.paddle.x = Math.min(W - 40, this.paddle.x + 7);
    if (!this.launched) {
      this.ball.setPosition(this.paddle.x, this.paddle.y - 18);
      if (this.keys.space.isDown && !this.over) this.launch();
    } else if (this.ball.y > H + 20) {
      this.loseLife();
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#0b1020',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Play
});
