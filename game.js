const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const UI = {
  orderText: document.getElementById("orderText"),
  handText: document.getElementById("handText"),
  scoreText: document.getElementById("scoreText"),
  timeText: document.getElementById("timeText"),
}; 

const W = canvas.width, H = canvas.height;

const TILE = 32;
const MAP_W = 20;
const MAP_H = 11;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// --- Map: 0 floor, 1 wall/counter
const map = [];
for (let y = 0; y < MAP_H; y++) {
  const row = [];
  for (let x = 0; x < MAP_W; x++) {
    const wall = (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) ? 1 : 0;
    row.push(wall);
  }
  map.push(row);
}
for (let x = 2; x <= 17; x++) map[2][x] = 1;
map[2][9] = 0;
for (let x = 2; x <= 6; x++) map[8][x] = 1;

const stations = [
  { id: "bin",   name: "垃圾桶", type: "bin",   tx: 2,  ty: 3 },
  { id: "board", name: "砧板",   type: "board", tx: 7,  ty: 2 },
  { id: "stove", name: "炉灶",   type: "stove", tx: 12, ty: 2 },
  { id: "serve", name: "出餐台", type: "serve", tx: 17, ty: 3 },
  { id: "crate", name: "食材箱", type: "crate", tx: 3,  ty: 8 },
];

function tileToWorld(tx, ty) {
  return { x: tx * TILE, y: ty * TILE };
}

function isWallAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return map[ty][tx] === 1;
}

function collideWithWalls(next) {
  const minTx = Math.floor(next.x / TILE);
  const minTy = Math.floor(next.y / TILE);
  const maxTx = Math.floor((next.x + next.w - 1) / TILE);
  const maxTy = Math.floor((next.y + next.h - 1) / TILE);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isWallAt(tx, ty)) {
        const wx = tx * TILE, wy = ty * TILE;
        const wallRect = { x: wx, y: wy, w: TILE, h: TILE };
        if (rectsOverlap(next, wallRect)) return true;
      }
    }
  }
  return false;
}

const player = {
  x: 9 * TILE,
  y: 6 * TILE,
  w: 18,
  h: 18,
  speed: 110,
  dir: { x: 0, y: 1 },
  hand: null, // {type:'veg'|'chopped'|'dish', kind?, name}
};

const recipes = [
  { orderName: "沙拉", need: "dish_salad",   score: 20 },
  { orderName: "炒菜", need: "dish_stirfry", score: 30 },
];

let currentOrder = null;
let score = 0;
let timeLeft = 120;
let lastTick = now();

const stationState = {
  board: { busy: false, t: 0, total: 0 },
  stove: { busy: false, t: 0, total: 0 },
};

function newOrder() {
  currentOrder = recipes[Math.floor(Math.random() * recipes.length)];
  UI.orderText.textContent = `${currentOrder.orderName}`;
}
newOrder();

function setHand(item) {
  player.hand = item;
  UI.handText.textContent = item ? item.name : "空";
}

function addScore(v) {
  score += v;
  UI.scoreText.textContent = score;
}

const keys = new Set();
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "q", "shift"].includes(k)) {
    e.preventDefault();
  }
  keys.add(k);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let eLock = false;
function pressedE() {
  const down = keys.has("e");
  if (down && !eLock) { eLock = true; return true; }
  if (!down) eLock = false;
  return false;
}

let qLock = false;
function pressedQ() {
  const down = keys.has("q");
  if (down && !qLock) { qLock = true; return true; }
  if (!down) qLock = false;
  return false;
}

function getNearestStation() {
  const fx = player.x + player.w / 2 + player.dir.x * 20;
  const fy = player.y + player.h / 2 + player.dir.y * 20;
  const probe = { x: fx - 10, y: fy - 10, w: 20, h: 20 };

  let best = null, bestD = 1e9;
  for (const s of stations) {
    const p = tileToWorld(s.tx, s.ty);
    const r = { x: p.x, y: p.y, w: TILE, h: TILE };
    if (rectsOverlap(probe, r)) {
      const cx = p.x + TILE / 2, cy = p.y + TILE / 2;
      const dx = cx - (player.x + player.w / 2);
      const dy = cy - (player.y + player.h / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s; }
    }
  }
  return best;
}

function interact(st) {
  if (!st) return;

  if (st.type === "crate") {
    if (!player.hand) setHand({ type: "veg", name: "蔬菜" });
    return;
  }

  if (st.type === "bin") {
    if (player.hand) setHand(null);
    return;
  }

  if (st.type === "board") {
    // If holding veg -> start chopping
    if (!stationState.board.busy && player.hand?.type === "veg") {
      stationState.board.busy = true;
      stationState.board.t = 0;
      stationState.board.total = 0.8;
      setHand(null);
      return;
    }
    // If holding chopped -> plate as salad
    if (!stationState.board.busy && player.hand?.type === "chopped") {
      setHand({ type: "dish", kind: "dish_salad", name: "沙拉" });
      return;
    }
    return;
  }

  if (st.type === "stove") {
    if (!stationState.stove.busy && player.hand?.type === "chopped") {
      stationState.stove.busy = true;
      stationState.stove.t = 0;
      stationState.stove.total = 1.2;
      setHand(null);
      return;
    }
    return;
  }

  if (st.type === "serve") {
    if (player.hand?.type === "dish") {
      if (player.hand.kind === currentOrder.need) {
        addScore(currentOrder.score);
      } else {
        addScore(-5);
      }
      setHand(null);
      newOrder();
    }
    return;
  }
}

function update(dt) {
  timeLeft -= dt;
  if (timeLeft < 0) timeLeft = 0;
  UI.timeText.textContent = Math.ceil(timeLeft);

  const sprint = keys.has("shift") && timeLeft > 0;
  const spd = player.speed * (sprint ? 1.6 : 1.0);
  if (sprint) timeLeft = Math.max(0, timeLeft - dt * 0.25);

  let mx = 0, my = 0;
  if (keys.has("w") || keys.has("arrowup")) my -= 1;
  if (keys.has("s") || keys.has("arrowdown")) my += 1;
  if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
  if (keys.has("d") || keys.has("arrowright")) mx += 1;

  if (mx !== 0 || my !== 0) {
    const l = Math.hypot(mx, my);
    mx /= l; my /= l;
    player.dir.x = mx; player.dir.y = my;
  }

  const nx = { x: player.x + mx * spd * dt, y: player.y, w: player.w, h: player.h };
  if (!collideWithWalls(nx)) player.x = nx.x;

  const ny = { x: player.x, y: player.y + my * spd * dt, w: player.w, h: player.h };
  if (!collideWithWalls(ny)) player.y = ny.y;

  if (pressedQ()) {
    if (player.hand) setHand(null);
  }

  // IMPORTANT: consume E only once per frame
  const doE = pressedE();
  if (doE) interact(getNearestStation());

  // station progress
  if (stationState.board.busy) {
    stationState.board.t += dt;
    if (stationState.board.t >= stationState.board.total) {
      stationState.board.busy = false;
      if (!player.hand) setHand({ type: "chopped", name: "切好的菜" });
    }
  }

  if (stationState.stove.busy) {
    stationState.stove.t += dt;
    if (stationState.stove.t >= stationState.stove.total) {
      stationState.stove.busy = false;
      if (!player.hand) setHand({ type: "dish", kind: "dish_stirfry", name: "炒菜" });
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const px = x * TILE, py = y * TILE;
      if (map[y][x] === 0) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? "#2a2a2f" : "#2f3037";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);
      } else {
        ctx.fillStyle = "#4a4f5a";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "#5b6270";
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      }
    }
  }

  for (const s of stations) {
    const p = tileToWorld(s.tx, s.ty);
    let base = "#6b778a";
    if (s.type === "crate") base = "#6a8a5a";
    if (s.type === "bin") base = "#5f5f5f";
    if (s.type === "board") base = "#8a6a4f";
    if (s.type === "stove") base = "#7a4b4b";
    if (s.type === "serve") base = "#4f7a7a";

    ctx.fillStyle = base;
    ctx.fillRect(p.x + 3, p.y + 3, TILE - 6, TILE - 6);

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(p.x + 6, p.y + 6, 6, 6);

    if (s.type === "board" && stationState.board.busy) {
      const r = stationState.board.t / stationState.board.total;
      ctx.fillStyle = "#0b0c0f";
      ctx.fillRect(p.x + 4, p.y + TILE - 8, TILE - 8, 4);
      ctx.fillStyle = "#e6d06c";
      ctx.fillRect(p.x + 4, p.y + TILE - 8, (TILE - 8) * r, 4);
    }
    if (s.type === "stove" && stationState.stove.busy) {
      const r = stationState.stove.t / stationState.stove.total;
      ctx.fillStyle = "#0b0c0f";
      ctx.fillRect(p.x + 4, p.y + TILE - 8, TILE - 8, 4);
      ctx.fillStyle = "#ff8a3d";
      ctx.fillRect(p.x + 4, p.y + TILE - 8, (TILE - 8) * r, 4);
    }
  }

  const st = getNearestStation();
  if (st) {
    const p = tileToWorld(st.tx, st.ty);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 2, p.y + 2, TILE - 4, TILE - 4);
    ctx.font = "12px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`E: ${st.name}`, p.x - 6, p.y - 6);
  }

  // player
  ctx.fillStyle = "#d6b48a";
  ctx.fillRect(player.x + 6, player.y + 2, 6, 6);
  ctx.fillStyle = "#3e78c5";
  ctx.fillRect(player.x + 4, player.y + 8, 10, 10);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(player.x + 5, player.y + 1, 8, 2);

  if (player.hand) {
    let c = "#7fd36b";
    if (player.hand.type === "chopped") c = "#c9f09a";
    if (player.hand.type === "dish") c = "#f1f1f1";
    ctx.fillStyle = c;
    ctx.fillRect(player.x + 14, player.y + 10, 6, 6);
  }

  if (timeLeft <= 0) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px monospace";
    ctx.fillText(`时间到！分数：${score}`, W / 2 - 120, H / 2 - 10);
    ctx.font = "14px monospace";
    ctx.fillText(`刷新页面重新开始`, W / 2 - 80, H / 2 + 18);
  }
}

function loop() {
  const t = now();
  const dt = Math.min(0.033, (t - lastTick) / 1000);
  lastTick = t;

  if (timeLeft > 0) update(dt);
  draw();
  requestAnimationFrame(loop);
}
loop();
