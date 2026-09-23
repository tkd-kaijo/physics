"use strict";

const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const ui = {
  hud: $("hud"), lap: $("lap"), time: $("time"), effects: $("effects"),
  countdown: $("countdown"), toast: $("toast"), speedLines: $("speedLines"),
  startPanel: $("startPanel"), finishPanel: $("finishPanel"), finalTime: $("finalTime"),
  lapTimes: $("lapTimes"), touch: $("touchControls"), start: $("startButton"),
  restart: $("restartButton"), calibrate: $("calibrate"), left: $("leftButton"), right: $("rightButton")
};

const TAU = Math.PI * 2;
const ROAD_WIDTH = 250;
const WALL_OFFSET = ROAD_WIDTH / 2 + 80;
const NORMAL_SPEED = 310;
const BOOST_SPEED = NORMAL_SPEED * 1.5;
const GRASS_SPEED = 120;
const GRASS_BOOST_SPEED = 170;
const TRACK_LENGTH = 4450;
const TOTAL_LAPS = 3;
const SHIELD_MS = 5000;
const BOOST_MS = 4000;
const VIEW_DISTANCE = .145;
const ROAD_SLICES = 100;

let W = innerWidth, H = innerHeight, dpr = 1;
let state = "menu";
let raceStart = 0, lapStart = 0, elapsed = 0, lastFrame = performance.now();
let lapTimes = [];
let rawTilt = 0;
let tiltCenter = 0;
let tiltAvailable = false;

let calibrationSamples = [];
let isCalibratingTilt = false;
let tiltCalibrated = false;

// ↓ 消えてしまっていたゲーム本体用の変数
let keys = { left: false, right: false };
let touch = { left: false, right: false };
let audioContext = null;
let items = [];
let kuromis = [];
let particles = [];
let cameraShake = 0;
let grassNotice = false;
let currentSteer = 0;

const imageSources = {
  purin: "assets/01-pompompurin.png",
  cinnamon: "assets/02-cinnamon.png",
  kuromi: "assets/04-kuromi.png",
  mymelody: "assets/07-mymelody.png"
};
const images = {};
for (const [key, src] of Object.entries(imageSources)) {
  const img = new Image(); img.src = src; images[key] = img;
}
document.querySelectorAll(".guide-icon img").forEach(img => {
  const loaded = () => img.classList.add("loaded");
  img.addEventListener("load", loaded);
  if (img.complete && img.naturalWidth) loaded();
});

function trackPoint(t) {
  const a = ((t % 1) + 1) % 1 * TAU;
  const rx = 720 + 70 * Math.cos(3 * a) + 28 * Math.sin(5 * a);
  const ry = 415 + 52 * Math.sin(3 * a) - 22 * Math.cos(4 * a);
  return { x: Math.cos(a) * rx + 42 * Math.sin(2 * a), y: Math.sin(a) * ry + 22 * Math.cos(3 * a) };
}

function trackFrame(t) {
  const e = .0004, p = trackPoint(t), a = trackPoint(t + e), b = trackPoint(t - e);
  const angle = Math.atan2(a.y - b.y, a.x - b.x);
  return { ...p, angle, nx: -Math.sin(angle), ny: Math.cos(angle) };
}

const player = {
  progress: 0, offset: 0, speed: 0, lap: 1,
  shieldUntil: 0, boostUntil: 0, stunUntil: 0, invulnerableUntil: 0, spin: 0, lastHit: 0
};

function resize() {
  W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize, { passive: true });
resize();

function circularGap(a, b) { const d = Math.abs(a - b); return Math.min(d, 1 - d); }
function signedGap(a, b) { return ((a - b + 1.5) % 1) - .5; }

function randomSpot(existing, minGap) {
  let spot;
  for (let tries = 0; tries < 80; tries++) {
    spot = { t: .07 + Math.random() * .89, offset: (Math.random() * 2 - 1) * ROAD_WIDTH * .31 };
    if (existing.every(o => circularGap(o.t, spot.t) > minGap)) return spot;
  }
  return spot;
}

function spawnLapObjects() {
  items = [];
  const types = ["mymelody", "cinnamon", "purin"];
  for (let i = 0; i < 3; i++) {
    const p = randomSpot(items, .16);
    items.push({ ...p, type: types[(i + Math.floor(Math.random() * 3)) % 3], active: true, bob: Math.random() * TAU });
  }
  kuromis = [];
  for (let i = 0; i < 4; i++) {
    const p = randomSpot(kuromis.concat(items), .1);
    kuromis.push({ ...p, baseOffset: p.offset, direction: Math.random() < .5 ? -1 : 1,
      pace: .002 + Math.random() * .0018, phase: Math.random() * TAU,
      alive: true, flying: false, hitTime: 0, flyDir: 1 });
  }
}

function resetGame() {
  Object.assign(player, { progress: 0, offset: 0, speed: 0, lap: 1, shieldUntil: 0, boostUntil: 0, stunUntil: 0, invulnerableUntil: 0, spin: 0, lastHit: 0 });
  lapTimes = []; particles = []; elapsed = 0; cameraShake = 0; grassNotice = false;
  ui.lap.innerHTML = `1<span>/${TOTAL_LAPS}</span>`;
  ui.time.textContent = "0:00.000"; ui.effects.innerHTML = "";
  spawnLapObjects();
}

function formatTime(ms) {
  const total = Math.max(0, ms), minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000), milli = Math.floor(total % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

function beep(freq = 500, duration = .08, type = "sine", volume = .06) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch (_) { /* Sound is optional. */ }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function showCount(value, delay = 760) {
  ui.countdown.textContent = value; ui.countdown.classList.remove("pop"); void ui.countdown.offsetWidth; ui.countdown.classList.add("pop");
  beep(value === "スタート!" ? 880 : 430 + (3 - Number(value)) * 90, value === "スタート!" ? .22 : .1, "square", .045);
  await wait(delay);
}

async function requestMotion() {
  try {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      return await DeviceMotionEvent.requestPermission() === "granted";
    }

    return "DeviceMotionEvent" in window;
  } catch (_) {
    return false;
  }
}

async function startRace() {
  if (state === "countdown") return;
  state = "countdown";

  const motionGranted = await requestMotion();

  resetGame();

  if (motionGranted) {
  tiltCalibrated = false;
  calibrationSamples = [];
  isCalibratingTilt = true;
}

  ui.startPanel.classList.add("hidden");
  ui.finishPanel.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  ui.touch.classList.remove("hidden");

  if (!motionGranted) {
    toast("傾き操作なし：画面ボタンで走れます");
  }

  await showCount("3");
  await showCount("2");
  await showCount("1");

  const now = performance.now();
  raceStart = now;
  lapStart = now;
  lastFrame = now;
  state = "racing";

  await showCount("スタート!", 620);
  ui.countdown.textContent = "";
}

function finishRace(now) {
  state = "finished"; elapsed = now - raceStart; ui.finalTime.textContent = formatTime(elapsed);
  ui.lapTimes.innerHTML = lapTimes.map((time, i) => `<li>LAP ${i + 1}<b>${formatTime(time)}</b></li>`).join("");
  ui.finishPanel.classList.remove("hidden"); ui.touch.classList.add("hidden");
  beep(659, .12, "square", .05); setTimeout(() => beep(784, .13, "square", .05), 130); setTimeout(() => beep(988, .35, "square", .05), 280);
}

function toast(text) {
  ui.toast.textContent = text; ui.toast.classList.remove("show"); void ui.toast.offsetWidth; ui.toast.classList.add("show");
}

ui.start.addEventListener("click", startRace);
ui.restart.addEventListener("click", startRace);

ui.calibrate.addEventListener("click", () => {
  tiltCalibrated = false;
  calibrationSamples = [];
  isCalibratingTilt = true;

  toast("そのまま中央で持ってください");

  setTimeout(() => {
    if (tiltCalibrated) {
      toast("ハンドルを中央に合わせました");
      beep(660);
    }
  }, 800);
});

function orientationAngle() {
  const angle = screen.orientation?.angle;
  return typeof angle === "number"
    ? angle
    : (typeof window.orientation === "number" ? window.orientation : 0);
}

addEventListener("devicemotion", event => {
  const g = event.accelerationIncludingGravity;
  if (!g) return;

  const x = g.x ?? 0;
  const y = g.y ?? 0;

  const angle =
    typeof screen.orientation?.angle === "number"
      ? screen.orientation.angle
      : (typeof window.orientation === "number" ? window.orientation : 0);

  let screenX;
  let screenY;

  // 端末座標 → 実際の画面座標
  if (angle === 90) {
    screenX = -y;
    screenY = x;
  } else if (angle === 270 || angle === -90) {
    screenX = y;
    screenY = -x;
  } else if (angle === 180) {
    screenX = -x;
    screenY = -y;
  } else {
    screenX = x;
    screenY = y;
  }

  /*
   * 画面を正面から見たときの回転角
   *
   * 時計回り     → 正
   * 反時計回り   → 負
   *
   * 前後方向へ倒しても、角度はほぼ変化しない
   */
  rawTilt = Math.atan2(screenX, -screenY) * 180 / Math.PI;

  tiltAvailable = true;

  if (isCalibratingTilt) {
    calibrationSamples.push(rawTilt);

    if (calibrationSamples.length >= 20) {
      let sinSum = 0;
      let cosSum = 0;

      for (const a of calibrationSamples) {
        const rad = a * Math.PI / 180;
        sinSum += Math.sin(rad);
        cosSum += Math.cos(rad);
      }

      tiltCenter = Math.atan2(sinSum, cosSum) * 180 / Math.PI;

      isCalibratingTilt = false;
      tiltCalibrated = true;
      calibrationSamples = [];
    }
  }
}, { passive: true });

addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "a"].includes(key)) keys.left = true;
  if (["arrowright", "d"].includes(key)) keys.right = true;
  if (["arrowleft", "arrowright", "a", "d"].includes(key)) event.preventDefault();
});
addEventListener("keyup", event => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "a"].includes(key)) keys.left = false;
  if (["arrowright", "d"].includes(key)) keys.right = false;
});

function bindTouchButton(button, side) {
  const set = value => { touch[side] = value; button.classList.toggle("active", value); };
  button.addEventListener("pointerdown", event => { event.preventDefault(); button.setPointerCapture(event.pointerId); set(true); });
  button.addEventListener("pointerup", () => set(false)); button.addEventListener("pointercancel", () => set(false));
  button.addEventListener("lostpointercapture", () => set(false));
}
bindTouchButton(ui.left, "left"); bindTouchButton(ui.right, "right");
function steeringInput() {
  if (keys.left || touch.left) return -1;
  if (keys.right || touch.right) return 1;

  if (!tiltAvailable || !tiltCalibrated) {
    return 0;
  }

  let diff = rawTilt - tiltCenter;

  // ±180°境界をまたいだ場合
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  // 小さな手ブレを無視
  const DEAD_ZONE = 2.5;

  if (Math.abs(diff) < DEAD_ZONE) {
    return 0;
  }

  // 約25°回せば最大ステア
  const MAX_STEER_ANGLE = 25;

  // デッドゾーン分を差し引く
  const sign = Math.sign(diff);
  const adjusted =
    sign * (Math.abs(diff) - DEAD_ZONE);

  const steer = adjusted / (MAX_STEER_ANGLE - DEAD_ZONE);

  return Math.max(-1, Math.min(1, steer));
}

function addScreenBurst(x, y, color, count = 18, power = 170) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, speed = power * (.35 + Math.random() * .8);
    particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, life: .45 + Math.random() * .55, size: 5 + Math.random() * 8, color });
  }
}

function activateItem(item, now) {
  item.active = false;
  if (item.type === "mymelody" || item.type === "purin") player.shieldUntil = Math.max(now, player.shieldUntil) + SHIELD_MS;
  if (item.type === "cinnamon" || item.type === "purin") player.boostUntil = Math.max(now, player.boostUntil) + BOOST_MS;
  const label = item.type === "mymelody" ? "バリア発動！" : item.type === "cinnamon" ? "1.5× ブースト！" : "バリア＋ブースト！";
  const color = item.type === "mymelody" ? "#ff77a4" : item.type === "cinnamon" ? "#65d9ff" : "#ffd95b";
  addScreenBurst(W / 2, H * .65, color, 26, 230); toast(label); beep(item.type === "purin" ? 920 : 760, .16, "triangle", .07);
}

function hitKuromi(k, now) {
  if (now < player.shieldUntil) {
    if (k.flying) return;
    k.flying = true; k.hitTime = now; k.flyDir = k.offset >= player.offset ? 1 : -1;
    addScreenBurst(W / 2, H * .58, "#ffd85d", 30, 260); cameraShake = 15; toast("クロミをはじき飛ばした！"); beep(990, .12, "square", .07);
  } else {
    if (now < player.invulnerableUntil || now - player.lastHit < 650) return;
    player.lastHit = now;
    player.stunUntil = now + 1750; player.speed *= .08; player.spin = 0;
    player.invulnerableUntil = player.stunUntil + 1000;
    addScreenBurst(W / 2, H * .72, "#fff06c", 24, 200); cameraShake = 19; toast("スピン！"); beep(180, .28, "sawtooth", .08);
  }
}

function updateKuromis(dt, now) {
  for (const k of kuromis) {
    if (!k.alive) continue;
    if (k.flying) { if (now - k.hitTime > 900) k.alive = false; continue; }
    k.t = (k.t + k.direction * k.pace * dt + 1) % 1;
    k.phase += dt * 1.35; k.offset = k.baseOffset + Math.sin(k.phase) * 28;
  }
}

function updateParticles(dt) {
  for (const p of particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.965, dt * 60); p.vy *= Math.pow(.965, dt * 60); }
  particles = particles.filter(p => p.age < p.life);
}

function completeLap(now) {
  lapTimes.push(now - lapStart);
  if (player.lap >= TOTAL_LAPS) { finishRace(now); return; }
  player.lap++; lapStart = now; ui.lap.innerHTML = `${player.lap}<span>/${TOTAL_LAPS}</span>`;
  toast(`LAP ${player.lap} / ${TOTAL_LAPS}`); beep(740, .13, "square", .06); spawnLapObjects();
}

function updatePlayer(dt, now) {
  if (state !== "racing") return;
  const stunned = now < player.stunUntil;
  const onGrass = Math.abs(player.offset) > ROAD_WIDTH / 2;
  let target = onGrass ? (now < player.boostUntil ? GRASS_BOOST_SPEED : GRASS_SPEED) : (now < player.boostUntil ? BOOST_SPEED : NORMAL_SPEED);

  if (onGrass && !grassNotice) { grassNotice = true; toast("草地：スピードダウン"); }
  if (!onGrass) grassNotice = false;

  currentSteer = steeringInput();
  if (stunned) {
    player.speed *= Math.pow(.86, dt * 60); player.spin += dt * TAU * 2.3;
  } else {
    const accel = player.speed < target ? 2.25 : 5.2;
    player.speed += (target - player.speed) * Math.min(1, dt * accel);
    const response = 185 * Math.max(.35, Math.min(1.15, player.speed / NORMAL_SPEED));
    player.offset += currentSteer * response * dt;
  }

  const wallLimit = WALL_OFFSET - 26;
  if (Math.abs(player.offset) > wallLimit) {
    player.offset = Math.sign(player.offset) * wallLimit; player.speed *= .38; cameraShake = Math.max(cameraShake, 11); beep(120, .08, "square", .035);
  }

  const oldProgress = player.progress;
  player.progress = (player.progress + player.speed * dt / TRACK_LENGTH) % 1;
  if (player.progress < oldProgress) completeLap(now);

  for (const item of items) {
    if (item.active && Math.abs(signedGap(item.t, player.progress)) < .0065 && Math.abs(item.offset - player.offset) < 44) activateItem(item, now);
  }
  for (const k of kuromis) {
    if (k.alive && !k.flying && Math.abs(signedGap(k.t, player.progress)) < .0067 && Math.abs(k.offset - player.offset) < 49) hitKuromi(k, now);
  }

  if (onGrass && player.speed > 45 && Math.random() < dt * 26) {
    particles.push({ x: W / 2 + (Math.random() - .5) * 95, y: H - 80, vx: (Math.random() - .5) * 55, vy: -45 - Math.random() * 70, age: 0, life: .5 + Math.random() * .35, size: 10 + Math.random() * 13, color: "#c8a45a" });
  }
}

function updateHud(now) {
  if (state === "racing") { elapsed = now - raceStart; ui.time.textContent = formatTime(elapsed); }
  const effects = [];
  if (now < player.shieldUntil) effects.push({ icon: "🛡", label: "バリア", remain: (player.shieldUntil - now) / SHIELD_MS, color: "#ff679b" });
  if (now < player.boostUntil) effects.push({ icon: "⚡", label: "1.5× BOOST", remain: (player.boostUntil - now) / BOOST_MS, color: "#38c9f2" });
  if (Math.abs(player.offset) > ROAD_WIDTH / 2) effects.push({ icon: "🌿", label: "草地・減速", remain: 1, color: "#7cc653" });
  if (now < player.stunUntil) effects.push({ icon: "💫", label: "スピン", remain: (player.stunUntil - now) / 1750, color: "#ffd84f" });
  else if (now < player.invulnerableUntil) effects.push({ icon: "✨", label: "無敵", remain: (player.invulnerableUntil - now) / 1000, color: "#fff06c" });
  ui.effects.innerHTML = effects.map(e => `<div class="effect-pill" style="--remain:${Math.max(0, e.remain)};--effect-color:${e.color}"><span>${e.icon}</span>${e.label}</div>`).join("");
  ui.speedLines.classList.toggle("active", now < player.boostUntil && state === "racing");
}

function projection(t, offset = 0) {
  const delta = ((t - player.progress + 1) % 1);
  if (delta < 0 || delta > VIEW_DISTANCE) return null;
  const depth = delta / VIEW_DISTANCE, near = 1 - depth;
  const y = H * .28 + Math.pow(near, 1.48) * (H * .81);
  const half = 7 + Math.pow(near, 1.22) * (W * .52);
  const camera = trackFrame(player.progress), point = trackFrame(t);
  const camX = camera.x + camera.nx * player.offset, camY = camera.y + camera.ny * player.offset;
  const objectX = point.x + point.nx * offset, objectY = point.y + point.ny * offset;
  const lateral = (objectX - camX) * camera.nx + (objectY - camY) * camera.ny;
  return { x: W / 2 + lateral * half / (ROAD_WIDTH / 2), y, half, near, depth };
}

function polygon(points, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
}

function drawSky() {
  const horizon = H * .3;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#68c9ff"); sky.addColorStop(.72, "#c9f0ff"); sky.addColorStop(1, "#f9fdff");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  for (const [x, y, s] of [[.15,.12,.8],[.56,.08,1],[.84,.16,.65]]) {
    ctx.beginPath(); ctx.arc(W*x,H*y,32*s,0,TAU);ctx.arc(W*x+34*s,H*y+5*s,25*s,0,TAU);ctx.arc(W*x-34*s,H*y+9*s,22*s,0,TAU);ctx.fill();
  }
  ctx.fillStyle = "#4b9b50"; ctx.beginPath(); ctx.moveTo(0,horizon);
  for (let x=0;x<=W;x+=50) ctx.lineTo(x,horizon-18-Math.sin(x*.013)*20-Math.sin(x*.031)*8);
  ctx.lineTo(W,horizon+35);ctx.lineTo(0,horizon+35);ctx.closePath();ctx.fill();
  ctx.fillStyle = "#69bd50"; ctx.fillRect(0, horizon-1, W, H-horizon+1);
}

function drawRoad() {
  for (let i = ROAD_SLICES - 1; i >= 0; i--) {
    const nearT = (player.progress + VIEW_DISTANCE * i / ROAD_SLICES) % 1;
    const farT = (player.progress + VIEW_DISTANCE * (i + 1) / ROAD_SLICES) % 1;
    const a = projection(nearT), b = projection(farT); if (!a || !b) continue;
    const band = Math.floor((player.progress + VIEW_DISTANCE*i/ROAD_SLICES)*900);
    const outerA=a.half*1.42, outerB=b.half*1.42, curbA=a.half*1.09, curbB=b.half*1.09;
    polygon([{x:a.x-outerA,y:a.y},{x:a.x+outerA,y:a.y},{x:b.x+outerB,y:b.y},{x:b.x-outerB,y:b.y}], band%2?"#73c457":"#6cba50");
    polygon([{x:a.x-curbA,y:a.y},{x:a.x+curbA,y:a.y},{x:b.x+curbB,y:b.y},{x:b.x-curbB,y:b.y}], band%2?"#f6f3e8":"#e94e58");
    polygon([{x:a.x-a.half,y:a.y},{x:a.x+a.half,y:a.y},{x:b.x+b.half,y:b.y},{x:b.x-b.half,y:b.y}], band%2?"#5b626a":"#565e65");
    if (band % 12 < 6) {
      const laneA=Math.max(1,a.half*.018),laneB=Math.max(.6,b.half*.018);
      polygon([{x:a.x-laneA,y:a.y},{x:a.x+laneA,y:a.y},{x:b.x+laneB,y:b.y},{x:b.x-laneB,y:b.y}],"rgba(255,255,255,.72)");
    }
  }
}

function drawStartLine() {
  const p = projection(0); if (!p || p.near < .04) return;
  const h = Math.max(3, p.near * 17), cells = 10, cell = p.half * 2 / cells;
  for (let row=0;row<2;row++) for (let col=0;col<cells;col++) {
    ctx.fillStyle=(row+col)%2?"#fff":"#20242a";ctx.fillRect(p.x-p.half+col*cell,p.y-row*h,cell+1,h+1);
  }
}

function drawWalls() {
  const spacing=.009;
  for(let d=VIEW_DISTANCE;d>.008;d-=spacing){
    const t=(player.progress+d)%1,p=projection(t);if(!p)continue;
    const size=Math.max(3,p.near*34),sideX=p.half*1.38;
    for(const side of[-1,1]){
      const x=p.x+sideX*side;ctx.fillStyle="rgba(0,0,0,.2)";ctx.fillRect(x-size*.52,p.y-size*.2,size*1.05,size*.72);
      ctx.fillStyle=(Math.floor((player.progress+d)/spacing)+(side>0?1:0))%2?"#fff9ec":"#ef4d5a";ctx.fillRect(x-size*.5,p.y-size*.55,size,size*.65);
      ctx.fillStyle="rgba(255,255,255,.32)";ctx.fillRect(x-size*.42,p.y-size*.49,size*.84,size*.14);
    }
  }
}

function drawImageContain(img, size) {
  if (!img?.complete || !img.naturalWidth) return false;
  const ratio=img.naturalWidth/img.naturalHeight;let w=size,h=size;if(ratio>1)h/=ratio;else w*=ratio;
  ctx.drawImage(img,-w/2,-h/2,w,h);return true;
}

function drawFallback(label,color,size) {
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,size/2,0,TAU);ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(2,size*.07);ctx.stroke();
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`900 ${Math.max(10,size*.3)}px system-ui`;ctx.fillText(label,0,1);
}

function drawWorldObjects(now) {
  const objects=[];
  for(const item of items) if(item.active){const p=projection(item.t,item.offset);if(p)objects.push({kind:"item",ref:item,p});}
  for(const k of kuromis) if(k.alive){const p=projection(k.t,k.offset);if(p)objects.push({kind:"kuromi",ref:k,p});}
  objects.sort((a,b)=>a.p.near-b.p.near);
  for(const object of objects){
    const {p,ref}=object;let size=Math.max(10,Math.pow(p.near,1.1)*122);
    ctx.save();ctx.translate(p.x,p.y-size*.42);
    if(object.kind==="item"){
      const bob=Math.sin(now*.004+ref.bob)*size*.06;ctx.translate(0,bob);
      const color=ref.type==="mymelody"?"#ff73a1":ref.type==="cinnamon"?"#5bd0f5":"#f5c454";
      ctx.globalAlpha=.24;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,size*.55,0,TAU);ctx.fill();ctx.globalAlpha=1;
      if(!drawImageContain(images[ref.type],size))drawFallback(ref.type==="mymelody"?"MY":ref.type==="cinnamon"?"CN":"PP",color,size*.8);
    }else{
      if(ref.flying){const f=Math.min(1,(now-ref.hitTime)/900);ctx.translate(ref.flyDir*f*W*.35,-f*H*.48);ctx.rotate(f*TAU*2.3);size*=1-f*.45;}
      ctx.fillStyle="rgba(0,0,0,.24)";ctx.beginPath();ctx.ellipse(0,size*.4,size*.36,size*.1,0,0,TAU);ctx.fill();
      if(!drawImageContain(images.kuromi,size))drawFallback("KU","#6b3c80",size*.8);
    }
    ctx.restore();
  }
}

function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawKart(now) {
  const stunned=now<player.stunUntil;
  const recoveryInvincible=now>=player.stunUntil&&now<player.invulnerableUntil;
  const bounce=Math.sin(now*.018)*2*(player.speed/NORMAL_SPEED);
  ctx.save();ctx.translate(W/2,H-86+bounce);ctx.rotate(stunned?player.spin:currentSteer*.08);
  if(recoveryInvincible){
    const glow=82+Math.sin(now*.025)*7;ctx.fillStyle="rgba(255,244,104,.16)";ctx.strokeStyle="rgba(255,250,190,.9)";ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,-13,glow,0,TAU);ctx.fill();ctx.stroke();
    ctx.globalAlpha=Math.sin(now*.035)>.1?1:.38;
  }
  if(now<player.shieldUntil){const r=76+Math.sin(now*.012)*5;ctx.fillStyle="rgba(255,118,171,.16)";ctx.strokeStyle="rgba(255,225,242,.88)";ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,-13,r,0,TAU);ctx.fill();ctx.stroke();}
  const scale=Math.max(.82,Math.min(1.16,W/1050));ctx.scale(scale,scale);
  ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(0,42,69,18,0,0,TAU);ctx.fill();
  ctx.fillStyle="#202735";roundedRect(-68,-7,25,51,9);ctx.fill();roundedRect(43,-7,25,51,9);ctx.fill();
  ctx.fillStyle="#ef3d68";roundedRect(-58,-55,116,94,29);ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=6;ctx.stroke();
  ctx.fillStyle="#a8edff";roundedRect(-43,-43,86,43,15);ctx.fill();
  ctx.fillStyle="#ffef73";ctx.beginPath();ctx.arc(0,17,19,0,TAU);ctx.fill();ctx.fillStyle="#fff";ctx.font="1000 29px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("★",0,-19);
  if(now<player.boostUntil){ctx.fillStyle="#73edff";for(const x of[-27,27]){ctx.beginPath();ctx.moveTo(x,38);ctx.lineTo(x-12,79+Math.random()*11);ctx.lineTo(x+12,79+Math.random()*11);ctx.closePath();ctx.fill();}}
  ctx.restore();
}

function drawParticles() {
  for(const p of particles){const alpha=1-p.age/p.life;ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*alpha,0,TAU);ctx.fill();}ctx.globalAlpha=1;
}

function drawSpeedometer() {
  const ratio=Math.min(1,player.speed/BOOST_SPEED),x=W/2,y=H-22,w=Math.min(260,W*.25);
  ctx.fillStyle="rgba(11,27,39,.62)";roundedRect(x-w/2,y-12,w,12,7);ctx.fill();
  const grad=ctx.createLinearGradient(x-w/2,0,x+w/2,0);grad.addColorStop(0,"#82df6a");grad.addColorStop(.67,"#ffe05b");grad.addColorStop(1,"#ff557c");
  ctx.fillStyle=grad;roundedRect(x-w/2,y-12,w*ratio,12,7);ctx.fill();
}

function draw(now) {
  ctx.setTransform(dpr,0,0,dpr,0,0);drawSky();
  ctx.save();const sx=cameraShake?(Math.random()-.5)*cameraShake:0,sy=cameraShake?(Math.random()-.5)*cameraShake:0;ctx.translate(sx,sy);
  drawRoad();drawStartLine();drawWalls();drawWorldObjects(now);drawKart(now);ctx.restore();drawParticles();drawSpeedometer();
}

function frame(now) {
  const dt=Math.min(.035,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  updateKuromis(dt,now);updateParticles(dt);updatePlayer(dt,now);updateHud(now);cameraShake*=Math.pow(.84,dt*60);draw(now);requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  lastFrame = performance.now();
});

// 開発中はService Workerを無効化
// if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
//   addEventListener("load", () =>
//     navigator.serviceWorker.register("sw.js").catch(() => {})
//   );
// }

// この2つは必須
spawnLapObjects();
requestAnimationFrame(frame);