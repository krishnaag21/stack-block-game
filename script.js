// ============================================
//  STACK BLOCK GAME — Full-Featured Script
// ============================================

// ---------- DOM Elements ----------
const canvas       = document.getElementById('gameCanvas');
const ctx          = canvas.getContext('2d');
const scoreEl      = document.getElementById('score');
const highScoreEl  = document.getElementById('highScore');
const comboEl      = document.getElementById('comboDisplay');
const menu         = document.getElementById('menu');
const menuTitle    = document.getElementById('menuTitle');
const menuSubtitle = document.getElementById('menuSubtitle');
const menuScoreEl  = document.getElementById('menuScore');
const actionBtn    = document.getElementById('actionBtn');

// ============================================
//  CONFIG — Tweak everything from one place
// ============================================
const CONFIG = {
    // Block
    blockHeight:      40,
    initialWidth:     0.45,      // fraction of canvas width
    // Speed
    initialSpeed:     3,
    speedIncrement:   0.15,
    maxSpeed:         12,
    // Perfect placement
    perfectThreshold: 5,         // pixels — less than this = "PERFECT"
    // Scoring
    baseScore:        1,
    perfectBonus:     2,         // points for perfect drop
    // Camera
    cameraLerp:       0.08,
    cameraTarget:     0.6,       // keep stack at 60 % from top
    // Screen shake
    shakeDecay:       0.85,
    placeShake:       4,
    gameOverShake:    14,
    // Particles
    particlesNormal:  10,
    particlesPerfect: 24,
};

// ============================================
//  SOUND MANAGER  (Web Audio API, no files)
// ============================================
class SoundManager {
    constructor() {
        this.ctx = null;          // AudioContext — created on first gesture
        this.enabled = true;
    }

    /** Call once on a user gesture (click / tap) */
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) { this.enabled = false; }
    }

    /* --- internal helper --- */
    _tone(freq, dur, type = 'sine', vol = 0.3) {
        if (!this.enabled || !this.ctx) return;
        const t   = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g   = this.ctx.createGain();
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.type            = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
    }

    /* --- public sounds --- */
    place() {
        this._tone(220, 0.12, 'square', 0.12);
        this._tone(440, 0.08, 'sine',   0.10);
    }
    perfect() {
        this._tone(523, 0.12, 'sine', 0.22);                       // C5
        setTimeout(() => this._tone(659, 0.12, 'sine', 0.20), 70); // E5
        setTimeout(() => this._tone(784, 0.18, 'sine', 0.18), 140);// G5
    }
    combo(n) {
        const f = 523 + n * 40;
        this._tone(f,        0.10, 'sine', 0.18);
        setTimeout(() => this._tone(f * 1.25, 0.10, 'sine', 0.16),  60);
        setTimeout(() => this._tone(f * 1.5,  0.14, 'sine', 0.14), 120);
    }
    gameOver() {
        this._tone(400, 0.18, 'sawtooth', 0.18);
        setTimeout(() => this._tone(300, 0.18, 'sawtooth', 0.16), 140);
        setTimeout(() => this._tone(200, 0.35, 'sawtooth', 0.12), 280);
    }
}
const sound = new SoundManager();

// ============================================
//  PARTICLE  (small circles that fly & fade)
// ============================================
class Particle {
    constructor(x, y, color) {
        this.x     = x;
        this.y     = y;
        this.vx    = (Math.random() - 0.5) * 7;
        this.vy    = -Math.random() * 5 - 1;
        this.grav  = 0.18;
        this.alpha = 1;
        this.size  = Math.random() * 3.5 + 1.5;
        this.color = color;
        this.decay = Math.random() * 0.015 + 0.015;
    }
    update() {
        this.vx *= 0.98;
        this.vy += this.grav;
        this.x  += this.vx;
        this.y  += this.vy;
        this.alpha -= this.decay;
    }
    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle   = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y - cameraY, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    get alive() { return this.alpha > 0; }
}

// ============================================
//  FLOATING TEXT  ("+2", "PERFECT!", etc.)
// ============================================
class FloatingText {
    constructor(x, y, text, color = '#fff', size = 24) {
        this.x     = x;
        this.y     = y;
        this.text  = text;
        this.color = color;
        this.size  = size;
        this.alpha = 1;
        this.vy    = -1.4;
        this.decay = 0.016;
        this.scale = 0.5;            // start small, ease up
    }
    update() {
        this.y     += this.vy;
        this.alpha -= this.decay;
        this.scale += (1 - this.scale) * 0.15;   // ease toward 1
    }
    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha  = Math.max(0, this.alpha);
        ctx.fillStyle    = this.color;
        ctx.font         = `bold ${Math.round(this.size * this.scale)}px 'Segoe UI', sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur   = 5;
        ctx.shadowOffsetY = 2;
        ctx.fillText(this.text, this.x, this.y - cameraY);
        ctx.restore();
    }
    get alive() { return this.alpha > 0; }
}

// ============================================
//  BLOCK
// ============================================
class Block {
    constructor(x, y, width, color) {
        this.x      = x;
        this.y      = y;
        this.width  = width;
        this.height = CONFIG.blockHeight;
        this.color  = color;
        this.vx     = 0;
        this.dir    = 1;           // 1 = right, -1 = left
    }
    update() {
        this.x += this.vx * this.dir;
        // Bounce only when heading outward (so off-screen spawns slide in)
        if (this.x + this.width > canvas.width && this.dir > 0)  this.dir = -1;
        else if (this.x < 0 && this.dir < 0)                     this.dir =  1;
    }
    draw() {
        const dy = this.y - cameraY;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fillRect(this.x + 3, dy + 3, this.width, this.height);
        // Body
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, dy, this.width, this.height);
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(this.x, dy, this.width, 3);
        // Left highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(this.x, dy, 3, this.height);
        // Bottom edge
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(this.x, dy + this.height - 2, this.width, 2);
    }
}

// ============================================
//  DEBRIS  (trimmed piece that falls off)
// ============================================
class Debris {
    constructor(x, y, width, color, side) {
        this.x       = x;
        this.y       = y;
        this.width   = Math.abs(width);
        this.height  = CONFIG.blockHeight;
        this.color   = color;
        this.vy      = 0;
        this.vx      = side * (1 + Math.random());   // drift toward cut side
        this.grav    = 0.55;
        this.alpha   = 1;
        this.rot     = 0;
        this.rotSpd  = (Math.random() - 0.5) * 0.08;
    }
    update() {
        this.vy += this.grav;
        this.y  += this.vy;
        this.x  += this.vx;
        this.alpha -= 0.018;
        this.rot   += this.rotSpd;
    }
    draw() {
        if (this.alpha <= 0) return;
        const dy = this.y - cameraY;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.translate(this.x + this.width / 2, dy + this.height / 2);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
    get alive() { return this.alpha > 0; }
}

// ============================================
//  GAME STATE
// ============================================
let blocks        = [];
let debris        = [];
let particles     = [];
let floatingTexts = [];
let currentBlock  = null;

let score         = 0;
let highScore     = parseInt(localStorage.getItem('stackHighScore')) || 0;
let gameRunning   = false;
let animFrameId   = null;

// Camera
let cameraY       = 0;
let targetCameraY = 0;

// Shake
let shakeAmount   = 0;

// Combo
let comboCount    = 0;

// Progression
let currentSpeed  = CONFIG.initialSpeed;
let hue           = 0;

highScoreEl.textContent = `BEST: ${highScore}`;

// ============================================
//  RESIZE
// ============================================
function resize() {
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resize);
resize();

// ============================================
//  HELPERS
// ============================================
function blockColor(h) { return `hsl(${h}, 68%, 55%)`; }
function lightColor(h) { return `hsl(${h}, 80%, 75%)`; }

function spawnParticles(x, y, w, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(
            x + Math.random() * w,
            y + Math.random() * CONFIG.blockHeight,
            color
        ));
    }
}

function spawnText(x, y, text, color = '#fff', size = 24) {
    floatingTexts.push(new FloatingText(x, y, text, color, size));
}

function showCombo(n) {
    if (n >= 2) {
        comboEl.textContent = `COMBO × ${n}`;
        comboEl.classList.add('visible');
    } else {
        comboEl.classList.remove('visible');
    }
}

// ============================================
//  INIT GAME
// ============================================
function initGame() {
    // Cancel any running loop
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }

    // Initialise sound on first user gesture
    sound.init();

    // Reset state
    blocks        = [];
    debris        = [];
    particles     = [];
    floatingTexts = [];
    currentBlock  = null;
    score         = 0;
    comboCount    = 0;
    cameraY       = 0;
    targetCameraY = 0;
    shakeAmount   = 0;
    hue           = 200;                          // start with nice blue
    currentSpeed  = CONFIG.initialSpeed;

    scoreEl.textContent = '0';
    showCombo(0);
    menu.classList.remove('active');
    gameRunning = true;

    // Foundation block (stationary, centred)
    const w = canvas.width * CONFIG.initialWidth;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - CONFIG.blockHeight * 3;
    const b = new Block(x, y, w, blockColor(hue));
    b.vx = 0;
    blocks.push(b);

    spawnNextBlock();
    animate();
}

// ============================================
//  SPAWN NEXT MOVING BLOCK
// ============================================
function spawnNextBlock() {
    hue = (hue + 22) % 360;
    const prev = blocks[blocks.length - 1];
    const newY = prev.y - CONFIG.blockHeight;

    const fromLeft = Math.random() > 0.5;
    const startX   = fromLeft ? -prev.width : canvas.width;

    currentBlock     = new Block(startX, newY, prev.width, blockColor(hue));
    currentBlock.vx  = Math.min(currentSpeed, CONFIG.maxSpeed);
    currentBlock.dir = fromLeft ? 1 : -1;
}

// ============================================
//  PLACE BLOCK  (core game mechanic)
// ============================================
function placeBlock() {
    if (!gameRunning || !currentBlock) return;

    const prev = blocks[blocks.length - 1];
    const curr = currentBlock;

    const dist    = curr.x - prev.x;
    const overhang = Math.abs(dist);
    const overlap  = curr.width - overhang;

    // ---------- Missed completely ----------
    if (overlap <= 0) { gameOver(); return; }

    const cx = curr.x + curr.width / 2;          // centre-x for text

    // ---------- PERFECT placement ----------
    if (overhang < CONFIG.perfectThreshold) {
        curr.x     = prev.x;                     // snap
        curr.width = prev.width;                  // no width loss!
        comboCount++;

        let pts = CONFIG.perfectBonus;
        if (comboCount >= 2) pts += comboCount;   // combo bonus
        score += pts;

        // Floating text
        spawnText(cx, curr.y - 10, 'PERFECT!', lightColor(hue), 28);
        if (comboCount >= 2)
            spawnText(cx, curr.y - 40, `COMBO × ${comboCount}`, '#FFD700', 22);
        spawnText(cx + 50, curr.y - 10, `+${pts}`, '#fff', 18);

        // Extra particles
        spawnParticles(curr.x, curr.y, curr.width, lightColor(hue), CONFIG.particlesPerfect);

        // Sound
        comboCount >= 2 ? sound.combo(comboCount) : sound.perfect();

    // ---------- IMPERFECT placement ----------
    } else {
        comboCount = 0;

        if (dist > 0) {                           // overhang right
            curr.width = overlap;
            debris.push(new Debris(curr.x + overlap, curr.y, overhang, curr.color, 1));
        } else {                                   // overhang left
            const debrisX = curr.x;
            curr.x     = prev.x;
            curr.width = overlap;
            debris.push(new Debris(debrisX, curr.y, overhang, curr.color, -1));
        }

        score += CONFIG.baseScore;
        spawnText(cx, curr.y - 5, `+${CONFIG.baseScore}`, '#fff', 16);
        spawnParticles(curr.x, curr.y, curr.width, curr.color, CONFIG.particlesNormal);

        shakeAmount = CONFIG.placeShake;           // screen shake
        sound.place();
    }

    // ---------- Finalise ----------
    curr.vx = 0;
    blocks.push(curr);
    scoreEl.textContent = score;
    showCombo(comboCount);
    currentSpeed += CONFIG.speedIncrement;

    // Camera target — keep stack in view
    const stackTop     = curr.y;
    const screenTarget = canvas.height * CONFIG.cameraTarget;
    targetCameraY = Math.min(0, stackTop - screenTarget);

    spawnNextBlock();
}

// ============================================
//  GAME OVER
// ============================================
function gameOver() {
    gameRunning = false;
    comboCount  = 0;
    showCombo(0);

    // Turn missed block into falling debris
    if (currentBlock) {
        debris.push(new Debris(
            currentBlock.x, currentBlock.y,
            currentBlock.width, currentBlock.color,
            currentBlock.dir
        ));
        currentBlock = null;
    }

    shakeAmount = CONFIG.gameOverShake;
    sound.gameOver();

    // High score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('stackHighScore', highScore);
        highScoreEl.textContent = `BEST: ${highScore}`;
    }

    // Show menu after short delay so player sees the miss
    setTimeout(() => {
        menuTitle.textContent    = 'Game Over';
        menuSubtitle.textContent = '';
        menuScoreEl.textContent  = `Score: ${score}  •  Best: ${highScore}`;
        actionBtn.textContent    = 'TRY AGAIN';
        menu.classList.add('active');
    }, 500);
}

// ============================================
//  DRAW — guide lines for previous block edges
// ============================================
function drawGuide() {
    if (!gameRunning || !currentBlock || blocks.length === 0) return;
    const prev = blocks[blocks.length - 1];
    const dy   = currentBlock.y - cameraY;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(prev.x, dy);
    ctx.lineTo(prev.x, dy + CONFIG.blockHeight);
    ctx.moveTo(prev.x + prev.width, dy);
    ctx.lineTo(prev.x + prev.width, dy + CONFIG.blockHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ============================================
//  ANIMATION LOOP
// ============================================
function animate() {
    // Keep running briefly after game-over for debris / particles / texts
    const hasEffects = debris.length || particles.length || floatingTexts.length;
    if (!gameRunning && !hasEffects) { animFrameId = null; return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ---- Smooth camera ----
    if (Math.abs(targetCameraY - cameraY) > 0.5) {
        cameraY += (targetCameraY - cameraY) * CONFIG.cameraLerp;
    }

    // ---- Screen shake (translate entire frame) ----
    ctx.save();
    if (shakeAmount > 0.5) {
        ctx.translate(
            (Math.random() - 0.5) * shakeAmount * 2,
            (Math.random() - 0.5) * shakeAmount * 2
        );
        shakeAmount *= CONFIG.shakeDecay;
    } else {
        shakeAmount = 0;
    }

    // ---- Placed blocks (culled to visible area) ----
    for (let i = 0; i < blocks.length; i++) {
        const sy = blocks[i].y - cameraY;
        if (sy > -CONFIG.blockHeight && sy < canvas.height + CONFIG.blockHeight) {
            blocks[i].draw();
        }
    }

    // ---- Guide lines ----
    drawGuide();

    // ---- Current moving block ----
    if (gameRunning && currentBlock) {
        currentBlock.update();
        currentBlock.draw();
    }

    // ---- Debris ----
    for (let i = debris.length - 1; i >= 0; i--) {
        debris[i].update();
        debris[i].draw();
        if (!debris[i].alive || debris[i].y - cameraY > canvas.height + 100) {
            debris.splice(i, 1);
        }
    }

    // ---- Particles ----
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (!particles[i].alive) particles.splice(i, 1);
    }

    // ---- Floating texts ----
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update();
        floatingTexts[i].draw();
        if (!floatingTexts[i].alive) floatingTexts.splice(i, 1);
    }

    ctx.restore();   // undo shake translate

    animFrameId = requestAnimationFrame(animate);
}

// ============================================
//  INPUT HANDLING
// ============================================
let lastTouchTime = 0;

function handleInput(e) {
    // Prevent browser zoom/scroll on touch
    if (e.type === 'touchstart') {
        e.preventDefault();
        lastTouchTime = Date.now();
    }
    // Avoid double-fire (touch + mouse on mobile)
    if (e.type === 'mousedown' && Date.now() - lastTouchTime < 400) return;

    // Menu → start game
    if (menu.classList.contains('active')) {
        initGame();
        return;
    }

    placeBlock();
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) handleInput(e);
    }
});
window.addEventListener('touchstart', handleInput, { passive: false });
window.addEventListener('mousedown', handleInput);