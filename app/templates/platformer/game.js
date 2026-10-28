// Platformer: run, jump, collect coins, reach the flag.
// Touch: ◀ ▶ buttons bottom-left, JUMP bottom-right. Keyboard: arrows + space.

const W = 360, H = 640, T = 30;
const VIEW_H = 16 * T;          // playfield height; controls sit below it
const SPEED = 170, JUMP = 440;
let unlocked = Math.min((Vale.saveData && Vale.saveData.unlocked) || 0, LEVELS.length - 1);

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  init(data) { this.levelIndex = data.level !== undefined ? data.level : unlocked; }

  create() {
    makeTextures(this);
    const map = LEVELS[this.levelIndex];
    const cols = Math.max(...map.map(r => r.length));
    const worldW = cols * T;

    this.cameras.main.setBackgroundColor('#13233a');
    this.physics.world.setBounds(0, 0, worldW, VIEW_H + 200);
    this.cameras.main.setBounds(0, 0, worldW, H);

    this.solids = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    let start = { x: 60, y: 300 };
    map.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const x = c * T + T / 2, y = r * T + T / 2, ch = row[c];
        if (ch === '#') this.solids.create(x, y, r > 0 && map[r - 1][c] === '#' ? 'dirt' : 'ground');
        else if (ch === '-') this.solids.create(x, y, 'platform');
        else if (ch === 'o') this.coins.create(x, y, 'coin');
        else if (ch === '^') this.spikes.create(x, y + 7, 'spike').refreshBody().setSize(T - 8, 14);
        else if (ch === 'P') start = { x, y };
        else if (ch === 'F') {
          // Stand the flag on the first solid tile below it.
          let gr = r + 1;
          while (gr < map.length && !'#-'.includes(map[gr][c] || ' ')) gr++;
          this.flag = this.physics.add.staticImage(x, gr * T - 30, 'flag');
        }
      }
    });

    this.player = this.physics.add.image(start.x, start.y, 'hero');
    this.player.body.setGravityY(1000);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.overlap(this.player, this.coins, (p, coin) => {
      coin.destroy();
      this.score += 1;
      this.updateHud();
    });
    this.physics.add.overlap(this.player, this.spikes, () => this.die());
    this.physics.add.overlap(this.player, this.flag, () => this.win());
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.score = 0;
    this.done = false;
    this.hud = this.add.text(10, 10, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(10);
    this.updateHud();

    this.makeControls();
    this.keys = this.input.keyboard.createCursorKeys();
    this.jumpHeld = false;
  }

  makeControls() {
    this.add.rectangle(W / 2, VIEW_H + (H - VIEW_H) / 2, W, H - VIEW_H, 0x0b1220).setScrollFactor(0).setDepth(9);
    const y = VIEW_H + (H - VIEW_H) / 2;
    const btn = (x, label, w) => {
      const r = this.add.rectangle(x, y, w, 100, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.3)
        .setScrollFactor(0).setDepth(10);
      this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '28px', color: '#e8e4d8' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(11);
      return r;
    };
    this.btnL = btn(50, '◀', 84);
    this.btnR = btn(142, '▶', 84);
    this.btnJ = btn(292, 'JUMP', 120);
  }

  // Reads every active touch so move + jump work at the same time.
  readTouch() {
    const t = { left: false, right: false, jump: false };
    for (const p of this.input.manager.pointers) {
      if (!p.isDown || p.y < VIEW_H) continue;
      if (p.x < 96) t.left = true;
      else if (p.x < 190) t.right = true;
      else if (p.x > 220) t.jump = true;
    }
    this.btnL.setFillStyle(0xffffff, t.left ? 0.25 : 0.08);
    this.btnR.setFillStyle(0xffffff, t.right ? 0.25 : 0.08);
    this.btnJ.setFillStyle(0xffffff, t.jump ? 0.25 : 0.08);
    return t;
  }

  update() {
    if (this.done) return;
    const t = this.readTouch();
    const left = t.left || this.keys.left.isDown;
    const right = t.right || this.keys.right.isDown;
    const jump = t.jump || this.keys.up.isDown || this.keys.space.isDown;
    const body = this.player.body;

    body.setVelocityX(left === right ? 0 : (left ? -SPEED : SPEED));
    if (left !== right) this.player.setFlipX(left);
    if (jump && !this.jumpHeld && body.blocked.down) body.setVelocityY(-JUMP);
    // Releasing jump early gives a shorter hop.
    if (!jump && body.velocity.y < -150) body.setVelocityY(-150);
    this.jumpHeld = jump;

    if (this.player.y > VIEW_H + 40) this.die();
  }

  updateHud() {
    this.hud.setText('LEVEL ' + (this.levelIndex + 1) + '/' + LEVELS.length + '   COINS ' + this.score);
  }

  message(text) {
    this.add.text(W / 2, VIEW_H / 2, text, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', align: 'center',
      backgroundColor: '#000000aa', padding: { x: 16, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
  }

  die() {
    if (this.done) return;
    this.done = true;
    this.player.setTint(0xff4466);
    this.physics.pause();
    this.cameras.main.shake(200, 0.01);
    this.message('OUCH!');
    this.time.delayedCall(900, () => this.scene.restart({ level: this.levelIndex }));
  }

  win() {
    if (this.done) return;
    this.done = true;
    this.physics.pause();
    const next = this.levelIndex + 1;
    if (next < LEVELS.length && next > unlocked) {
      unlocked = next;
      Vale.save({ unlocked });
    }
    if (next < LEVELS.length) {
      this.message('LEVEL CLEAR!');
      this.time.delayedCall(1200, () => this.scene.restart({ level: next }));
    } else {
      this.message('YOU WIN!\n\nTap to play again');
      this.input.once('pointerdown', () => this.scene.restart({ level: 0 }));
    }
  }
}

function makeTextures(scene) {
  if (scene.textures.exists('hero')) return;
  const g = scene.add.graphics();
  g.fillStyle(0x6b4f2a).fillRect(0, 0, T, T).fillStyle(0x4caf50).fillRect(0, 0, T, 6);
  g.generateTexture('ground', T, T).clear();
  g.fillStyle(0x6b4f2a).fillRect(0, 0, T, T).fillStyle(0x5d4325).fillRect(6, 8, 4, 4).fillRect(20, 18, 4, 4);
  g.generateTexture('dirt', T, T).clear();
  g.fillStyle(0x8d6e63).fillRect(0, 0, T, 10).fillStyle(0xbcaaa4).fillRect(0, 0, T, 3);
  g.generateTexture('platform', T, 10).clear();
  g.fillStyle(0xffd54f).fillCircle(8, 8, 8).fillStyle(0xfff59d).fillCircle(6, 6, 3);
  g.generateTexture('coin', 16, 16).clear();
  g.fillStyle(0xcfd8dc);
  for (let i = 0; i < 3; i++) g.fillTriangle(i * 10, 16, i * 10 + 5, 0, i * 10 + 10, 16);
  g.generateTexture('spike', T, 16).clear();
  g.fillStyle(0xffffff).fillRect(0, 0, 4, 60).fillStyle(0xff5252).fillTriangle(4, 0, 30, 10, 4, 20);
  g.generateTexture('flag', 30, 60).clear();
  g.fillStyle(0x42a5f5).fillRoundedRect(0, 0, 22, 28, 5).fillStyle(0xffffff).fillRect(12, 7, 6, 6)
    .fillStyle(0x0d47a1).fillRect(15, 9, 3, 3);
  g.generateTexture('hero', 22, 28);
  g.destroy();
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#070a10',
  physics: { default: 'arcade' },
  input: { activePointers: 4 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Play
});
