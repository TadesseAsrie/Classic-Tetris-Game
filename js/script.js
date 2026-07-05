// --- CONSTANTS & CONFIGURATION ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // pixels

// Authentic Tetromino Matrices
const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const COLORS = {
  I: "#06b6d4",
  O: "#eab308",
  T: "#a855f7",
  S: "#22c55e",
  Z: "#ef4444",
  J: "#3b82f6",
  L: "#f97316",
};

// --- SYNTHETIC WEB AUDIO ENGINE ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  init() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  play(type) {
    try {
      this.init();
      if (this.muted || !this.ctx) return;
      let osc = this.ctx.createOscillator();
      let gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === "move") {
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.ctx.currentTime + 0.05,
        );
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
      } else if (type === "rotate") {
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          450,
          this.ctx.currentTime + 0.08,
        );
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.ctx.currentTime + 0.08,
        );
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
      } else if (type === "clear") {
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.setValueAtTime(900, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.ctx.currentTime + 0.25,
        );
        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
      } else if (type === "gameover") {
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.ctx.currentTime + 0.5,
        );
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
      }
    } catch (e) {
      /* Protection against autoplay constraints */
    }
  }
}
const sfx = new SoundEngine();

// --- PIECE ENTITY CLASS ---
class Piece {
  constructor(type) {
    this.type = type;
    this.matrix = JSON.parse(JSON.stringify(SHAPES[type]));
    this.color = COLORS[type];
    this.x = Math.floor((COLS - this.matrix[0].length) / 2);
    this.y = type === "I" ? -1 : 0;
  }

  rotate() {
    const n = this.matrix.length;
    let nextMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        nextMatrix[c][n - 1 - r] = this.matrix[r][c];
      }
    }
    return nextMatrix;
  }
}

// --- CORE GAME CONTROLLER ---
class Tetris {
  constructor() {
    this.boardCanvas = document.getElementById("gameBoard");
    this.boardCtx = this.boardCanvas.getContext("2d");
    this.nextCanvas = document.getElementById("nextCanvas");
    this.nextCtx = this.nextCanvas.getContext("2d");
    this.holdCanvas = document.getElementById("holdCanvas");
    this.holdCtx = this.holdCanvas.getContext("2d");

    this.resetEngineState();
    this.loadHighScore();
  }

  resetEngineState() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = 800;
    this.lastDropTime = 0;
    this.gameState = "READY";
    this.currentPiece = null;
    this.nextPiece = this.getRandomPiece();
    this.holdPiece = null;
    this.hasHeldThisTurn = false;
    this.animationFrameId = null;
  }

  getRandomPiece() {
    const types = ["I", "O", "T", "S", "Z", "J", "L"];
    const rand = types[Math.floor(Math.random() * types.length)];
    return new Piece(rand);
  }

  start() {
    sfx.init();
    if (this.gameState === "PLAYING") return;

    this.resetEngineState();
    this.updateUI();
    this.hideOverlays();

    document.getElementById("countdownOverlay").classList.remove("hidden");
    let count = 3;
    const timerEl = document.getElementById("countdownTimer");
    timerEl.textContent = count;

    const counter = setInterval(() => {
      count--;
      if (count > 0) {
        timerEl.textContent = count;
      } else if (count === 0) {
        timerEl.textContent = "GO!";
      } else {
        clearInterval(counter);
        document.getElementById("countdownOverlay").classList.add("hidden");
        this.gameState = "PLAYING";
        this.spawnPiece();
        this.lastDropTime = performance.now();
        this.loop();
      }
    }, 400);
  }

  spawnPiece() {
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.getRandomPiece();
    this.hasHeldThisTurn = false;

    if (
      this.checkCollision(
        this.currentPiece.x,
        this.currentPiece.y,
        this.currentPiece.matrix,
      )
    ) {
      this.gameOver();
    }
    this.drawPreviews();
  }

  hold() {
    if (this.gameState !== "PLAYING" || this.hasHeldThisTurn) return;
    sfx.play("rotate");

    const currentType = this.currentPiece.type;
    if (!this.holdPiece) {
      this.holdPiece = new Piece(currentType);
      this.spawnPiece();
    } else {
      const tmp = this.holdPiece.type;
      this.holdPiece = new Piece(currentType);
      this.currentPiece = new Piece(tmp);
    }
    this.hasHeldThisTurn = true;
    this.drawPreviews();
  }

  checkCollision(ax, ay, matrix) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          let targetX = ax + c;
          let targetY = ay + r;

          if (targetX < 0 || targetX >= COLS || targetY >= ROWS) {
            return true;
          }
          if (targetY >= 0 && this.grid[targetY][targetX]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  rotatePiece() {
    const rotatedMatrix = this.currentPiece.rotate();
    let originalX = this.currentPiece.x;

    let offset = 0;
    if (this.checkCollision(originalX, this.currentPiece.y, rotatedMatrix)) {
      offset = originalX > COLS / 2 ? -1 : 1;
      if (
        this.checkCollision(
          originalX + offset,
          this.currentPiece.y,
          rotatedMatrix,
        )
      ) {
        return;
      }
    }
    sfx.play("rotate");
    this.currentPiece.x += offset;
    this.currentPiece.matrix = rotatedMatrix;
  }

  moveLeft() {
    if (
      !this.checkCollision(
        this.currentPiece.x - 1,
        this.currentPiece.y,
        this.currentPiece.matrix,
      )
    ) {
      this.currentPiece.x--;
      sfx.play("move");
    }
  }

  moveRight() {
    if (
      !this.checkCollision(
        this.currentPiece.x + 1,
        this.currentPiece.y,
        this.currentPiece.matrix,
      )
    ) {
      this.currentPiece.x++;
      sfx.play("move");
    }
  }

  softDrop() {
    if (
      !this.checkCollision(
        this.currentPiece.x,
        this.currentPiece.y + 1,
        this.currentPiece.matrix,
      )
    ) {
      this.currentPiece.y++;
      this.score += 1;
      this.updateUI();
      return true;
    }
    return false;
  }

  hardDrop() {
    let drops = 0;
    while (
      !this.checkCollision(
        this.currentPiece.x,
        this.currentPiece.y + 1,
        this.currentPiece.matrix,
      )
    ) {
      this.currentPiece.y++;
      drops++;
    }
    this.score += drops * 2;
    sfx.play("move");
    this.lockPiece();
  }

  lockPiece() {
    const matrix = this.currentPiece.matrix;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          if (this.currentPiece.y + r < 0) {
            this.gameOver();
            return;
          }
          this.grid[this.currentPiece.y + r][this.currentPiece.x + c] =
            this.currentPiece.color;
        }
      }
    }
    this.clearLines();
    this.spawnPiece();
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.grid[r].every((cell) => cell !== 0)) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }

    if (cleared > 0) {
      sfx.play("clear");
      const rewardTable = [0, 100, 300, 500, 800];
      this.score += rewardTable[cleared] * this.level;
      this.lines += cleared;

      this.level = Math.floor(this.lines / 10) + 1;
      this.dropInterval = Math.max(100, 900 - this.level * 100);

      this.checkAndSaveHighScore();
      this.updateUI();
    }
  }

  getGhostPosition() {
    let ghostY = this.currentPiece.y;
    while (
      !this.checkCollision(
        this.currentPiece.x,
        ghostY + 1,
        this.currentPiece.matrix,
      )
    ) {
      ghostY++;
    }
    return ghostY;
  }

  pause() {
    if (this.gameState !== "PLAYING") return;
    this.gameState = "PAUSED";
    document.getElementById("pauseOverlay").classList.remove("hidden");
  }

  resume() {
    if (this.gameState !== "PAUSED") return;
    this.gameState = "PLAYING";
    document.getElementById("pauseOverlay").classList.add("hidden");
    this.lastDropTime = performance.now();
    this.loop();
  }

  gameOver() {
    this.gameState = "GAMEOVER";
    sfx.play("gameover");
    cancelAnimationFrame(this.animationFrameId);
    document.getElementById("finalScore").textContent = this.score;
    document.getElementById("gameOverOverlay").classList.remove("hidden");
    this.checkAndSaveHighScore();
  }

  loadHighScore() {
    this.highScore = parseInt(localStorage.getItem("tetris_highscore")) || 0;
    document.getElementById("highScoreVal").textContent = this.highScore;
  }

  checkAndSaveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("tetris_highscore", this.highScore);
      document.getElementById("highScoreVal").textContent = this.highScore;
    }
  }

  hideOverlays() {
    document.getElementById("readyOverlay").classList.add("hidden");
    document.getElementById("pauseOverlay").classList.add("hidden");
    document.getElementById("gameOverOverlay").classList.add("hidden");
  }

  updateUI() {
    document.getElementById("scoreVal").textContent = this.score;
    document.getElementById("levelVal").textContent = this.level;
    document.getElementById("linesVal").textContent = this.lines;
  }

  drawBlock(ctx, x, y, color, alpha = 1) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

    ctx.strokeStyle =
      alpha < 1 ? `rgba(255,255,255, ${alpha * 0.3})` : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x * BLOCK_SIZE + 1,
      y * BLOCK_SIZE + 1,
      BLOCK_SIZE - 2,
      BLOCK_SIZE - 2,
    );
    ctx.globalAlpha = 1.0;
  }

  render() {
    this.boardCtx.clearRect(
      0,
      0,
      this.boardCanvas.width,
      this.boardCanvas.height,
    );

    // Grid Lines
    this.boardCtx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--grid-line")
      .trim();
    this.boardCtx.lineWidth = 0.5;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.boardCtx.strokeRect(
          c * BLOCK_SIZE,
          r * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE,
        );
      }
    }

    // Static Stack cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c]) {
          this.drawBlock(this.boardCtx, c, r, this.grid[r][c]);
        }
      }
    }

    // Dynamic Elements
    if (this.gameState === "PLAYING" && this.currentPiece) {
      // Ghost Piece position rendering
      const ghostY = this.getGhostPosition();
      const alphaStr = getComputedStyle(document.documentElement)
        .getPropertyValue("--ghost-alpha")
        .trim();
      const ghostAlpha = parseFloat(alphaStr) || 0.2;

      for (let r = 0; r < this.currentPiece.matrix.length; r++) {
        for (let c = 0; c < this.currentPiece.matrix[r].length; c++) {
          if (this.currentPiece.matrix[r][c]) {
            this.drawBlock(
              this.boardCtx,
              this.currentPiece.x + c,
              ghostY + r,
              this.currentPiece.color,
              ghostAlpha,
            );
          }
        }
      }

      // Controlled Piece rendering
      for (let r = 0; r < this.currentPiece.matrix.length; r++) {
        for (let c = 0; c < this.currentPiece.matrix[r].length; c++) {
          if (this.currentPiece.matrix[r][c]) {
            if (this.currentPiece.y + r >= 0) {
              this.drawBlock(
                this.boardCtx,
                this.currentPiece.x + c,
                this.currentPiece.y + r,
                this.currentPiece.color,
              );
            }
          }
        }
      }
    }
  }

  drawPreviews() {
    this.nextCtx.clearRect(0, 0, 100, 100);
    this.renderMiniPreview(this.nextCtx, this.nextPiece);

    this.holdCtx.clearRect(0, 0, 100, 100);
    if (this.holdPiece) {
      this.renderMiniPreview(this.holdCtx, this.holdPiece);
    }
  }

  renderMiniPreview(ctx, piece) {
    const m = piece.matrix;
    const size = m.length;
    const blockDisplayWidth = 18;

    const offsetX = (100 - size * blockDisplayWidth) / 2;
    const offsetY = (100 - size * blockDisplayWidth) / 2;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c]) {
          ctx.fillStyle = piece.color;
          ctx.fillRect(
            offsetX + c * blockDisplayWidth,
            offsetY + r * blockDisplayWidth,
            blockDisplayWidth - 1,
            blockDisplayWidth - 1,
          );
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.strokeRect(
            offsetX + c * blockDisplayWidth,
            offsetY + r * blockDisplayWidth,
            blockDisplayWidth - 1,
            blockDisplayWidth - 1,
          );
        }
      }
    }
  }

  loop(timestamp = 0) {
    if (this.gameState !== "PLAYING") return;

    const elapsed = timestamp - this.lastDropTime;
    if (elapsed > this.dropInterval) {
      if (!this.softDrop()) {
        this.lockPiece();
      }
      this.lastDropTime = timestamp;
    }

    this.render();
    this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
  }
}

// --- DOM PROCESS MAPS ---
document.addEventListener("DOMContentLoaded", () => {
  const game = new Tetris();

  document
    .getElementById("startBtn")
    .addEventListener("click", () => game.start());
  document
    .getElementById("restartBtn")
    .addEventListener("click", () => game.start());

  const pBtn = document.getElementById("pauseBtn");
  const togglePauseAction = () => {
    if (game.gameState === "PLAYING") {
      game.pause();
      pBtn.textContent = "Resume";
    } else if (game.gameState === "PAUSED") {
      game.resume();
      pBtn.textContent = "Pause (P)";
    }
  };
  pBtn.addEventListener("click", togglePauseAction);
  document
    .getElementById("resumeBtn")
    .addEventListener("click", togglePauseAction);

  document.getElementById("resetScoreBtn").addEventListener("click", () => {
    if (confirm("Reset High Score records entirely?")) {
      localStorage.removeItem("tetris_highscore");
      game.loadHighScore();
    }
  });

  // Theme Switch Processing Engine
  const themeBtn = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("tetris_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeBtn.textContent = savedTheme === "dark" ? "☀ Light" : "🌙 Dark";

  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    themeBtn.textContent = next === "dark" ? "☀ Light" : "🌙 Dark";
    localStorage.setItem("tetris_theme", next);
    game.render();
    game.drawPreviews();
  });

  // Hardware Keyboard Inputs
  document.addEventListener("keydown", (e) => {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    ) {
      e.preventDefault();
    }

    if (game.gameState !== "PLAYING") {
      if (e.code === "Space" && game.gameState === "READY") game.start();
      if (e.code === "KeyP") togglePauseAction();
      return;
    }

    switch (e.code) {
      case "ArrowLeft":
        game.moveLeft();
        break;
      case "ArrowRight":
        game.moveRight();
        break;
      case "ArrowDown":
        game.softDrop();
        break;
      case "ArrowUp":
        game.rotatePiece();
        break;
      case "Space":
        game.hardDrop();
        break;
      case "ShiftLeft":
      case "ShiftRight":
        game.hold();
        break;
      case "KeyP":
        togglePauseAction();
        break;
    }
    game.render();
  });

  // Mobile UI Interaction Events
  const setupTouch = (id, action) => {
    document.getElementById(id).addEventListener("click", (e) => {
      e.preventDefault();
      if (game.gameState === "PLAYING") {
        action();
        game.render();
      }
    });
  };

  setupTouch("mLeft", () => game.moveLeft());
  setupTouch("mRight", () => game.moveRight());
  setupTouch("mRotate", () => game.rotatePiece());
  setupTouch("mDown", () => game.softDrop());
  setupTouch("mHard", () => game.hardDrop());
  setupTouch("mHold", () => game.hold());

  game.render();
});
