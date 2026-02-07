// ============================================
//  STACK BLOCK GAME — Final Updated Logic
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

// Difficulty UI
const diffSlider   = document.getElementById('diffRange');
const diffLabels   = [
    document.getElementById('label-easy'), 
    document.getElementById('label-medium'), 
    document.getElementById('label-hard')
];

// ============================================
//  CONFIG & SETTINGS
// ============================================
const CONFIG = {
    blockHeight:      40,
    maxSpeed:         15,
    perfectThreshold: 5,   // pixels
    baseScore:        1,
    perfectBonus:     2,
    cameraLerp:       0.08,
    cameraTarget:     0.6, 
    shakeDecay:       0.85,
    placeShake:       4,
    gameOverShake:    14,
    speedIncrement:   0.15 
};

const DIFFICULTY_SETTINGS = {
    easy:   { width: 0.60, speed: 2.5 },
    medium: { width: 0.45, speed: 3.5 },
    hard:   { width: 0.30, speed: 5.0 }
};

const THEMES = [
    ['#1a1a2e', '#16213e', '#0f3460'], // 0: Deep Space
    ['#2d1b2e', '#b4505f', '#ff8e72'], // 1: Sunset City
    ['#0f2027', '#203a43', '#2c5364'], // 2: Cyan Cyberpunk
    ['#141E30', '#243B55', '#4B0082'], // 3: Royal Purple
    ['#000000', '#434343', '#1a1a1a'], // 4: Noir
];

// ============================================
//  GAME STATE
// ============================================
let blocks = [], debris = [], particles = [], floatingTexts = [];
let currentBlock = null;
let score = 0;
let highScore = parseInt(localStorage.getItem('stackHighScore')) || 0;
let gameRunning = false;
let animFrameId = null;

// Camera & Effects
let cameraY = 0, targetCameraY = 0;
let shakeAmount = 0;
let comboCount = 0;

// Progression
let currentSpeed = 0;
let hue = 0;
let currentDifficulty = 'medium';
let powerUpActive = false;

// Golden Block Logic (Random interval 5-10)
let blocksSinceLastPowerUp = 0;
let nextPowerUpTarget = 0;

highScoreEl.textContent = `BEST: ${highScore}`;

// ============================================
//  SOUND MANAGER
// ============================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) { this.enabled = false; }
    }
    _tone(freq, dur, type = 'sine', vol = 0.3) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
    }
    place()   { this._tone(220, 0.12, 'square', 0.1); this._tone(440, 0.08, 'sine', 0.1); }
    perfect() { 
        this._tone(523, 0.12, 'sine', 0.2); 
        setTimeout(() => this._tone(659, 0.12, 'sine', 0.2), 70);
        setTimeout(() => this._tone(784, 0.18, 'sine', 0.18), 140);
    }
    combo(n)  {
        const f = 523 + n * 40;
        this._tone(f, 0.1, 'sine', 0.15);
        setTimeout(() => this._tone(f * 1.25, 0.1, 'sine', 0.12), 60);
    }
    gameOver(){ 
        this._tone(400, 0.18, 'sawtooth', 0.18);
        setTimeout(() => this._tone(300, 0.18, 'sawtooth', 0.16), 140);
        setTimeout(() => this._tone(200, 0.35, 'sawtooth', 0.12), 280);
    }
}
const sound = new SoundManager();

// ============================================
//  CLASSES
// ============================================
class Block {
    constructor(x, y, width, color) {
        this.x = x; this.y = y;
        this.width = width; this.height = CONFIG.blockHeight;
        this.color = color;
        this.vx = 0; this.dir = 1;
        this.isPowerUp = false;
    }
    update() {
        this.x += this.vx * this.dir;
        if (this.x + this.width > canvas.width && this.dir > 0) this.dir = -1;
        else if (this.x < 0 && this.dir < 0) this.dir = 1;
    }
    draw() {
        const dy = this.y - cameraY;

        // --- GOLDEN BLOCK VISUALS ---
        if (this.isPowerUp) {
            // Metallic Gradient
            const grad = ctx.createLinearGradient(this.x, dy, this.x, dy + this.height);
            grad.addColorStop(0, '#fff8db');   // Light Gold
            grad.addColorStop(0.3, '#ffd700'); // Pure Gold
            grad.addColorStop(1, '#b8860b');   // Dark Gold Shadow
            ctx.fillStyle = grad;

            // Glow Effect
            ctx.save();
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 20;
            ctx.fillRect(this.x, dy, this.width, this.height);
            ctx.restore();

            // Border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, dy, this.width, this.height);

            // Glass Sheen (Top Half)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(this.x, dy, this.width, this.height / 2);

            // Random Sparkle
            if (Math.random() < 0.1) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(this.x + Math.random() * this.width, dy + Math.random() * this.height, 3, 3);
            }
        } 
        // --- NORMAL BLOCK VISUALS ---
        else {
            ctx.fillStyle = 'rgba(0,0,0,0.13)';
            ctx.fillRect(this.x + 3, dy + 3, this.width, this.height);
            
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, dy, this.width, this.height);
            
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(this.x, dy, this.width, 3);
            ctx.fillRect(this.x, dy, 3, this.height);
        }
    }
}

class Debris {
    constructor(x, y, width, color, side) {
        this.x = x; this.y = y;
        this.width = Math.abs(width); this.height = CONFIG.blockHeight;
        this.color = color;
        this.vy = 0; this.vx = side * (1 + Math.random());
        this.grav = 0.55; this.alpha = 1;
        this.rot = 0; this.rotSpd = (Math.random() - 0.5) * 0.1;
    }
    update() {
        this.vy += this.grav; this.y += this.vy; this.x += this.vx;
        this.alpha -= 0.02; this.rot += this.rotSpd;
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

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = -Math.random() * 5 - 1;
        this.grav = 0.2; this.alpha = 1;
        this.color = color;
        this.decay = Math.random() * 0.02 + 0.02;
    }
    update() {
        this.vx *= 0.95; this.vy += this.grav;
        this.x += this.vx; this.y += this.vy;
        this.alpha -= this.decay;
    }
    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y - cameraY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    get alive() { return this.alpha > 0; }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.alpha = 1; this.vy = -1.5; this.scale = 0.5;
    }
    update() {
        this.y += this.vy; this.alpha -= 0.015;
        this.scale += (1 - this.scale) * 0.2;
    }
    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${24 * this.scale}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y - cameraY);
        ctx.restore();
    }
    get alive() { return this.alpha > 0; }
}

// ============================================
//  CORE FUNCTIONS
// ============================================
function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resize);
resize();

function changeEnvironment(index) {
    const theme = THEMES[index % THEMES.length];
    canvas.style.setProperty('--bg-top', theme[0]);
    canvas.style.setProperty('--bg-mid', theme[1]);
    canvas.style.setProperty('--bg-bot', theme[2]);
}

function spawnNextBlock() {
    hue = (hue + 22) % 360;
    const prev = blocks[blocks.length - 1];
    const newY = prev.y - CONFIG.blockHeight;

    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -prev.width : canvas.width;

    // --- GOLDEN BLOCK LOGIC (Every 5-10 blocks) ---
    blocksSinceLastPowerUp++;
    
    if (blocksSinceLastPowerUp >= nextPowerUpTarget) {
        powerUpActive = true;
        blocksSinceLastPowerUp = 0;
        // Set NEW random target for next time (5 to 10)
        nextPowerUpTarget = Math.floor(Math.random() * 6) + 5;
    } else {
        powerUpActive = false;
    }

    let color = powerUpActive ? '#FFD700' : `hsl(${hue}, 68%, 55%)`;

    currentBlock = new Block(startX, newY, prev.width, color);
    currentBlock.vx = Math.min(currentSpeed, CONFIG.maxSpeed);
    currentBlock.dir = fromLeft ? 1 : -1;
    if(powerUpActive) currentBlock.isPowerUp = true;
}

function initGame() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    sound.init();

    blocks = []; debris = []; particles = []; floatingTexts = [];
    currentBlock = null;
    score = 0; comboCount = 0;
    cameraY = 0; targetCameraY = 0; shakeAmount = 0;
    hue = 200;

    // Reset PowerUp Logic
    blocksSinceLastPowerUp = 0;
    nextPowerUpTarget = Math.floor(Math.random() * 6) + 5;

    // Apply Difficulty
    const diff = DIFFICULTY_SETTINGS[currentDifficulty];
    currentSpeed = diff.speed;
    changeEnvironment(0);

    scoreEl.textContent = '0';
    document.getElementById('comboDisplay').classList.remove('visible');
    menu.classList.remove('active');
    gameRunning = true;

    // Base Block
    const w = canvas.width * diff.width;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - CONFIG.blockHeight * 3;
    blocks.push(new Block(x, y, w, `hsl(${hue}, 68%, 55%)`));

    spawnNextBlock();
    animate();
}

function placeBlock() {
    if (!gameRunning || !currentBlock) return;

    const prev = blocks[blocks.length - 1];
    const curr = currentBlock;
    const dist = curr.x - prev.x;
    const overhang = Math.abs(dist);
    const overlap = curr.width - overhang;

    if (overlap <= 0) { gameOver(); return; }

    const cx = curr.x + curr.width / 2;

    // --- SUCCESS ---
    if (overhang < CONFIG.perfectThreshold) {
        // Perfect
        curr.x = prev.x;
        curr.width = prev.width;
        comboCount++;
        score += (CONFIG.perfectBonus + (comboCount >= 2 ? comboCount : 0));
        
        sound.perfect();
        spawnText(cx, curr.y - 10, 'PERFECT!', '#fff');
        
        for(let i=0; i<20; i++) particles.push(new Particle(curr.x + Math.random()*curr.width, curr.y, '#fff'));

        // Growth Mechanic (Every 3 Perfects)
        if (comboCount > 0 && comboCount % 3 === 0) {
            curr.width += 15; 
            curr.x -= 7.5;
            spawnText(cx, curr.y - 40, 'GROWTH!', '#00ff00');
            sound.combo(5);
        }

    } else {
        // Imperfect
        comboCount = 0;
        if (dist > 0) { 
            curr.width = overlap; 
            debris.push(new Debris(curr.x + overlap, curr.y, overhang, curr.color, 1));
        } else { 
            const debrisX = curr.x;
            curr.x = prev.x; 
            curr.width = overlap;
            debris.push(new Debris(debrisX, curr.y, overhang, curr.color, -1));
        }
        score += CONFIG.baseScore;
        shakeAmount = CONFIG.placeShake;
        sound.place();
        for(let i=0; i<10; i++) particles.push(new Particle(curr.x + Math.random()*curr.width, curr.y, curr.color));
    }

    // --- POWER-UP EFFECT ---
    if (curr.isPowerUp) {
        currentSpeed *= 0.8; 
        spawnText(cx, curr.y - 60, 'SLOW DOWN!', '#FFD700');
        curr.color = '#FFD700'; // Keep it gold
    }

    // --- PROGRESSION (Every 10) ---
    if (score > 0 && score % 10 === 0) {
        changeEnvironment(score / 10);
        currentSpeed = Math.min(currentSpeed * 1.3, CONFIG.maxSpeed);
        spawnText(canvas.width/2, cameraY + 100, 'SPEED UP!', '#fff');
    } else {
        currentSpeed += CONFIG.speedIncrement;
    }

    // Update UI
    curr.vx = 0;
    blocks.push(curr);
    scoreEl.textContent = score;
    
    if (comboCount >= 2) {
        comboEl.textContent = `COMBO x${comboCount}`;
        comboEl.classList.add('visible');
    } else {
        comboEl.classList.remove('visible');
    }

    // Camera
    targetCameraY = Math.min(0, curr.y - canvas.height * CONFIG.cameraTarget);

    spawnNextBlock();
}

function gameOver() {
    gameRunning = false;
    if (currentBlock) {
        debris.push(new Debris(currentBlock.x, currentBlock.y, currentBlock.width, currentBlock.color, currentBlock.dir));
        currentBlock = null;
    }
    shakeAmount = CONFIG.gameOverShake;
    sound.gameOver();

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('stackHighScore', highScore);
        highScoreEl.textContent = `BEST: ${highScore}`;
    }

    setTimeout(() => {
        menuTitle.textContent = 'Game Over';
        menuSubtitle.textContent = '';
        menuScoreEl.textContent = `Score: ${score}  •  Best: ${highScore}`;
        actionBtn.textContent = 'TRY AGAIN';
        menu.classList.add('active');
    }, 500);
}

function spawnText(x, y, text, color) {
    floatingTexts.push(new FloatingText(x, y, text, color));
}

// ============================================
//  ANIMATION LOOP
// ============================================
function animate() {
    const hasEffects = debris.length || particles.length || floatingTexts.length;
    if (!gameRunning && !hasEffects) { animFrameId = null; return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (Math.abs(targetCameraY - cameraY) > 0.5) cameraY += (targetCameraY - cameraY) * CONFIG.cameraLerp;

    ctx.save();
    if (shakeAmount > 0.5) {
        ctx.translate((Math.random()-0.5)*shakeAmount*2, (Math.random()-0.5)*shakeAmount*2);
        shakeAmount *= CONFIG.shakeDecay;
    }

    blocks.forEach(b => {
        if (b.y - cameraY < canvas.height + 100 && b.y - cameraY > -100) b.draw();
    });

    if (gameRunning && currentBlock) { currentBlock.update(); currentBlock.draw(); }

    [debris, particles, floatingTexts].forEach(arr => {
        for (let i = arr.length - 1; i >= 0; i--) {
            arr[i].update();
            arr[i].draw();
            if (!arr[i].alive) arr.splice(i, 1);
        }
    });

    ctx.restore();
    animFrameId = requestAnimationFrame(animate);
}

// ============================================
//  INPUTS & DIFFICULTY SLIDER
// ============================================
function handleInput(e) {
    if (e.target.closest && (e.target.closest('a') || e.target.closest('.difficulty-container'))) return;
    if (e.type === 'touchstart') e.preventDefault();
    
    if (menu.classList.contains('active')) {
        if(e.target.id === 'actionBtn' || !e.target.closest('.difficulty-container')) initGame();
    } else {
        placeBlock();
    }
}

// --- Slider Logic ---
const diffMap = ['easy', 'medium', 'hard'];

function updateDifficultyUI(val) {
    // Reset classes
    diffLabels.forEach(l => l.className = '');
    // Add specific class for CSS color targeting
    if (val === 0) diffLabels[0].classList.add('active', 'active-easy');
    if (val === 1) diffLabels[1].classList.add('active', 'active-medium');
    if (val === 2) diffLabels[2].classList.add('active', 'active-hard');
}

diffSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    currentDifficulty = diffMap[val];
    updateDifficultyUI(val);
});

diffLabels.forEach((l, i) => l.addEventListener('click', () => {
    diffSlider.value = i;
    diffSlider.dispatchEvent(new Event('input'));
}));

// Initialize visuals on load
updateDifficultyUI(1); // Default to Medium

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) handleInput(e); }
});
window.addEventListener('touchstart', handleInput, { passive: false });
window.addEventListener('mousedown', handleInput);
