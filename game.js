/**
 * 像素厨房农场 V2（可运行框架）
 * - 全屏canvas + 像素缩放
 * - 大地图（厨房+农田）
 * - 相机跟随
 * - 迷你地图
 * - 顾客生成/排队/点单/离开（简化AI）
 * - 多菜品：沙拉、炒菜、汤
 * - 种植：锄地->播种->浇水->生长->收获
 * - 设备动画：进度条/闪烁
 *
 * 之后可接入：spritesheet、帧动画、音效、路径寻路、更多房间等
 */

const gameCanvas = document.getElementById("game");
const g = gameCanvas.getContext("2d");
const mmCanvas = document.getElementById("minimap");
const mm = mmCanvas.getContext("2d");

const UI = {
  orderText: document.getElementById("orderText"),
  handText: document.getElementById("handText"),
  invText: document.getElementById("invText"),
  goldText: document.getElementById("goldText"),
  repText: document.getElementById("repText"),
  timeText: document.getElementById("timeText"),
};

// ---------- rendering scale (pixel-perfect) ----------
const BASE_W = 640;
const BASE_H = 360;

// offscreen buffer to draw pixel art at fixed resolution then scale up
const buffer = document.createElement("canvas");
buffer.width = BASE_W;
buffer.height = BASE_H;
const ctx = buffer.getContext("2d");

function resize() {
  gameCanvas.width = window.innerWidth * devicePixelRatio;
  gameCanvas.height = window.innerHeight * devicePixelRatio;
  g.setTransform(1,0,0,1,0,0);
  g.scale(devicePixelRatio, devicePixelRatio);
}
window.addEventListener("resize", resize);
resize();

// draw buffer scaled to screen, preserving aspect (integer scale if possible)
function present() {
  const sw = window.innerWidth, sh = window.innerHeight;
  const scale = Math.max(1, Math.floor(Math.min(sw / BASE_W, sh / BASE_H)));
  const dw = BASE_W * scale;
  const dh = BASE_H * scale;
  const ox = Math.floor((sw - dw) / 2);
  const oy = Math.floor((sh - dh) / 2);

  g.imageSmoothingEnabled = false;
  g.clearRect(0,0,sw,sh);
  g.drawImage(buffer, 0, 0, BASE_W, BASE_H, ox, oy, dw, dh);
}

// ---------- input ----------
const keys = new Set();
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);

  if (k === "f") toggleFullscreen();

  // prevent page scroll
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","shift","e","q"].includes(k)) {
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let eLock=false, qLock=false, spLock=false;
const pressed = (key, lockObj) => {
  const down = keys.has(key);
  if (down && !lockObj.v) { lockObj.v = true; return true; }
  if (!down) lockObj.v = false;
  return false;
};
const EL = {v:false}, QL={v:false}, SL={v:false};

async function toggleFullscreen(){
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
}

// ---------- helpers ----------
const now = () => performance.now();
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function rectsOverlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function lerp(a,b,t){ return a+(b-a)*t; }

// ---------- world ----------
const TILE = 16; // smaller tile => more detail while staying pixel art
const WORLD_W = 90;   // tiles
const WORLD_H = 60;

const Tile = {
  Grass: 0,
  Dirt: 1,
  Tilled: 2,
  Floor: 3,
  Counter: 4,
  Water: 5,
};

const world = new Uint8Array(WORLD_W * WORLD_H);
function idx(x,y){ return y*WORLD_W + x; }
function inBounds(x,y){ return x>=0&&y>=0&&x<WORLD_W&&y<WORLD_H; }

function setTile(x,y,t){ if(inBounds(x,y)) world[idx(x,y)] = t; }
function getTile(x,y){ return inBounds(x,y) ? world[idx(x,y)] : Tile.Counter; }

function generateWorld(){
  // base: grass
  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++) setTile(x,y,Tile.Grass);
  }

  // kitchen room (floor + counters)
  const kx=6, ky=6, kw=34, kh=22;
  for(let y=ky;y<ky+kh;y++){
    for(let x=kx;x<kx+kw;x++) setTile(x,y,Tile.Floor);
  }
  // walls/counters border
  for(let x=kx;x<kx+kw;x++){ setTile(x,ky,Tile.Counter); setTile(x,ky+kh-1,Tile.Counter); }
  for(let y=ky;y<ky+kh;y++){ setTile(kx,y,Tile.Counter); setTile(kx+kw-1,y,Tile.Counter); }

  // openings
  setTile(kx+Math.floor(kw/2), ky+kh-1, Tile.Floor); // door

  // inner counters line
  for(let x=kx+4;x<kx+kw-4;x++) setTile(x,ky+5,Tile.Counter);
  setTile(kx+Math.floor(kw/2), ky+5, Tile.Floor);

  // farm field (dirt)
  const fx=48, fy=10, fw=32, fh=20;
  for(let y=fy;y<fy+fh;y++){
    for(let x=fx;x<fx+fw;x++) setTile(x,y,Tile.Dirt);
  }

  // small pond
  for(let y=42;y<50;y++){
    for(let x=56;x<68;x++){
      const dx=x-62, dy=y-46;
      if (dx*dx+dy*dy < 30) setTile(x,y,Tile.Water);
    }
  }
}
generateWorld();

// ---------- stations & entities ----------
function tileToWorld(tx,ty){ return {x: tx*TILE, y: ty*TILE}; }

const stations = [
  { type:"crate", name:"食材箱", tx: 10, ty: 10 },
  { type:"board", name:"砧板",   tx: 16, ty: 11 },
  { type:"stove", name:"炉灶",   tx: 23, ty: 11 },
  { type:"pot",   name:"汤锅",   tx: 26, ty: 11 },
  { type:"serve", name:"出餐台", tx: 35, ty: 12 },
  { type:"bin",   name:"垃圾桶", tx: 8,  ty: 12 },

  { type:"seed",  name:"种子箱", tx: 52, ty: 30 },
  { type:"shop",  name:"小卖部", tx: 54, ty: 30 },
];

const stationState = {
  board: {busy:false, t:0, total:0},
  stove: {busy:false, t:0, total:0},
  pot:   {busy:false, t:0, total:0},
};

// crops
// crop tiles data: tilled + seedType + growth + watered flag
const crops = new Map(); // key "x,y" -> {seed:"turnip", g:0..1, watered:boolean, stage:int}
const CropDefs = {
  turnip: { name:"萝卜", growMinutes: 6, stages: 4, sell: 6 },
  tomato: { name:"番茄", growMinutes: 9, stages: 5, sell: 9 },
};
function keyXY(x,y){ return `${x},${y}`; }

// customers
const customers = [];
let customerSpawnT = 0;

// ---------- player / inventory ----------
const player = {
  x: 18*TILE, y: 20*TILE,
  w: 10, h: 10,
  dir: {x:0,y:1},
  speed: 92,
  hand: null,
  hotbarIndex: 0,
  hotbar: ["hoe","water","seed_turnip","seed_tomato","none"], // 1-5
  inv: { veg: 0, chopped: 0, turnip: 0, tomato: 0 },
};

let gold = 0;
let rep = 0;

// ---------- time system ----------
let day = 1;
let minutes = 6*60; // start 06:00
function advanceTime(dt){
  // 1 real second = 1 in-game minute (tweakable)
  minutes += dt * 60;
  if (minutes >= 24*60) { minutes -= 24*60; day++; }
  const hh = Math.floor(minutes/60);
  const mm = Math.floor(minutes%60);
  UI.timeText.textContent = `Day ${day} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

// ---------- recipes / orders ----------
const Recipes = {
  salad:   { name:"沙拉",    need: { chopped: 1 }, makeAt: "board", time: 0.4, score: 12, price: 12 },
  stirfry: { name:"炒菜",    need: { chopped: 1 }, makeAt: "stove", time: 1.0, score: 18, price: 18 },
  soup:    { name:"蔬菜汤",  need: { chopped: 1 }, makeAt: "pot",   time: 1.3, score: 22, price: 22 },
};
const OrderList = ["salad","stirfry","soup"];
let currentOrder = null;
function newOrder(){
  const id = OrderList[Math.floor(Math.random()*OrderList.length)];
  currentOrder = { id, ...Recipes[id] };
  UI.orderText.textContent = `${currentOrder.name}（${Object.keys(currentOrder.need).map(k=>`${k}x${currentOrder.need[k]}`).join(", ")}）`;
}
newOrder();

function setHand(item){
  player.hand = item;
  UI.handText.textContent = item ? item.name : "空";
}
function updateInvUI(){
  UI.invText.textContent =
    `veg:${player.inv.veg} chopped:${player.inv.chopped} 萝卜:${player.inv.turnip} 番茄:${player.inv.tomato}`;
}
updateInvUI();
function addGold(v){ gold+=v; UI.goldText.textContent = gold; }
function addRep(v){ rep+=v; UI.repText.textContent = rep; }

// ---------- collision ----------
function isBlockedTile(tx,ty){
  const t = getTile(tx,ty);
  return (t === Tile.Counter || t === Tile.Water);
}
function collide(next){
  const minTx = Math.floor(next.x / TILE);
  const minTy = Math.floor(next.y / TILE);
  const maxTx = Math.floor((next.x + next.w - 1)/TILE);
  const maxTy = Math.floor((next.y + next.h - 1)/TILE);
  for(let ty=minTy; ty<=maxTy; ty++){
    for(let tx=minTx; tx<=maxTx; tx++){
      if (isBlockedTile(tx,ty)) return true;
    }
  }
  return false;
}

function getNearestStation(){
  const fx = player.x + player.w/2 + player.dir.x*14;
  const fy = player.y + player.h/2 + player.dir.y*14;
  const probe = { x: fx-8, y: fy-8, w: 16, h: 16 };

  let best=null, bestD=1e9;
  for(const s of stations){
    const p = tileToWorld(s.tx, s.ty);
    const r = {x:p.x, y:p.y, w:TILE, h:TILE};
    if (rectsOverlap(probe,r)){
      const dx = (p.x+TILE/2)-(player.x+player.w/2);
      const dy = (p.y+TILE/2)-(player.y+player.h/2);
      const d = dx*dx+dy*dy;
      if(d<bestD){ bestD=d; best=s; }
    }
  }
  return best;
}

// ---------- farming actions ----------
function facingTile(){
  const cx = player.x + player.w/2 + player.dir.x * 14;
  const cy = player.y + player.h/2 + player.dir.y * 14;
  return { tx: Math.floor(cx/TILE), ty: Math.floor(cy/TILE) };
}

function till(tx,ty){
  if(!inBounds(tx,ty)) return;
  if(getTile(tx,ty) === Tile.Dirt){
    setTile(tx,ty,Tile.Tilled);
  }
}
function water(tx,ty){
  const k = keyXY(tx,ty);
  const c = crops.get(k);
  if (c) c.watered = true;
}
function plant(tx,ty,seed){
  if(getTile(tx,ty)!==Tile.Tilled) return;
  const k = keyXY(tx,ty);
  if(crops.has(k)) return;
  crops.set(k, { seed, g:0, watered:false, stage:0 });
}
function harvest(tx,ty){
  const k = keyXY(tx,ty);
  const c = crops.get(k);
  if(!c) return false;
  const def = CropDefs[c.seed];
  if (c.stage >= def.stages-1){
    crops.delete(k);
    // leave tilled soil
    if (c.seed === "turnip") player.inv.turnip++;
    if (c.seed === "tomato") player.inv.tomato++;
    updateInvUI();
    return true;
  }
  return false;
}

function updateCrops(dt){
  // growth in "minutes"; watered speeds up slightly and allows growth
  for (const [k,c] of crops){
    const def = CropDefs[c.seed];
    if (!c.watered) continue;
    c.g += (dt*60) / def.growMinutes; // dt seconds => dt*60 minutes in-game
    const stage = clamp(Math.floor(c.g * def.stages), 0, def.stages-1);
    c.stage = stage;
    if (Math.random() < dt*0.2) c.watered = false; // dries slowly
  }
}

// ---------- customer / AI ----------
function spawnCustomer(){
  // spawn near entrance
  customers.push({
    x: 22*TILE, y: 29*TILE,
    w:10, h:10,
    state:"walkToCounter",
    patience: 40, // seconds
    orderId: OrderList[Math.floor(Math.random()*OrderList.length)],
    t:0,
  });
}

function updateCustomers(dt){
  customerSpawnT -= dt;
  if (customerSpawnT <= 0){
    customerSpawnT = 10 + Math.random()*10;
    if (customers.length < 4) spawnCustomer();
  }

  for (const c of customers){
    c.t += dt;
    c.patience -= dt;

    // simple target points
    const target = (c.state==="walkToCounter")
      ? tileToWorld(34, 14) // near serve
      : tileToWorld(22, 29); // exit

    const dx = target.x - c.x, dy = target.y - c.y;
    const dist = Math.hypot(dx,dy);

    if (dist > 2){
      const vx = dx/dist, vy = dy/dist;
      c.x += vx * 40 * dt;
      c.y += vy * 40 * dt;
    }else{
      if (c.state==="walkToCounter") c.state="waiting";
      else c.state="gone";
    }

    if (c.state==="waiting" && c.patience <= 0){
      c.state="leave";
      addRep(-1);
    }
    if (c.state==="waiting"){
      // show their order if they are current focus? (draw only)
    }
    if (c.state==="leave") {
      // start leaving
      c.state="walkOut";
    }
  }

  // remove gone
  for (let i=customers.length-1;i>=0;i--){
    if (customers[i].state==="gone") customers.splice(i,1);
  }
}

// ---------- cooking / interactions ----------
function takeFromCrate(){
  player.inv.veg++;
  updateInvUI();
}
function maybeConsumeInv(req){
  for (const k in req){
    if ((player.inv[k]||0) < req[k]) return false;
  }
  for (const k in req){
    player.inv[k] -= req[k];
  }
  updateInvUI();
  return true;
}

function startStation(type, total){
  const s = stationState[type];
  s.busy=true; s.t=0; s.total=total;
}

function interactStation(st){
  if (!st) return;

  if (st.type==="crate"){ takeFromCrate(); return; }
  if (st.type==="bin"){ setHand(null); return; }

  if (st.type==="seed"){
    // give seeds into hotbar concept: here just info
    // (简化：种子无限，用快捷栏选择)
    return;
  }

  if (st.type==="shop"){
    // sell harvested crops instantly (simplified)
    if (player.inv.turnip>0){
      addGold(player.inv.turnip * CropDefs.turnip.sell);
      player.inv.turnip = 0;
    }
    if (player.inv.tomato>0){
      addGold(player.inv.tomato * CropDefs.tomato.sell);
      player.inv.tomato = 0;
    }
    updateInvUI();
    return;
  }

  if (st.type==="serve"){
    if (player.hand?.type==="dish"){
      if (player.hand.kind === currentOrder.id){
        addGold(currentOrder.price);
        addRep(1);
        setHand(null);
        newOrder();
      } else {
        addRep(-1);
        setHand(null);
      }
    }
    return;
  }

  // board: veg -> chopped OR chopped -> salad
  if (st.type==="board"){
    if (stationState.board.busy) return;

    if (player.inv.veg > 0){
      player.inv.veg--;
      updateInvUI();
      startStation("board", 0.7);
      stationState.board.output = "chopped";
      return;
    }

    // if holding chopped in inventory, can craft salad directly
    if (player.inv.chopped > 0){
      // craft salad as a dish in hand
      player.inv.chopped--;
      updateInvUI();
      setHand({type:"dish", kind:"salad", name:Recipes.salad.name});
      return;
    }
  }

  if (st.type==="stove"){
    if (stationState.stove.busy) return;
    if (player.inv.chopped > 0){
      player.inv.chopped--;
      updateInvUI();
      startStation("stove", Recipes.stirfry.time);
      stationState.stove.output = "stirfry";
    }
    return;
  }

  if (st.type==="pot"){
    if (stationState.pot.busy) return;
    if (player.inv.chopped > 0){
      player.inv.chopped--;
      updateInvUI();
      startStation("pot", Recipes.soup.time);
      stationState.pot.output = "soup";
    }
    return;
  }
}

function updateStations(dt){
  for (const k of ["board","stove","pot"]){
    const s = stationState[k];
    if (!s.busy) continue;
    s.t += dt;
    if (s.t >= s.total){
      s.busy=false;
      // outputs
      if (k==="board" && s.output==="chopped"){
        player.inv.chopped++;
        updateInvUI();
      } else if (k==="stove"){
        if (!player.hand) setHand({type:"dish", kind:"stirfry", name:Recipes.stirfry.name});
      } else if (k==="pot"){
        if (!player.hand) setHand({type:"dish", kind:"soup", name:Recipes.soup.name});
      }
      s.output = null;
    }
  }
}

// ---------- tools ----------
function activeTool(){
  const t = player.hotbar[player.hotbarIndex];
  return t;
}
function useTool(){
  const {tx,ty} = facingTile();
  const tool = activeTool();

  if (tool==="hoe"){
    till(tx,ty);
    return;
  }
  if (tool==="water"){
    water(tx,ty);
    return;
  }
  if (tool==="seed_turnip"){
    plant(tx,ty,"turnip");
    return;
  }
  if (tool==="seed_tomato"){
    plant(tx,ty,"tomato");
    return;
  }
  // harvest by hand if mature
  harvest(tx,ty);
}

// ---------- camera ----------
const camera = { x:0, y:0 };
function updateCamera(){
  // center on player
  const cx = player.x + player.w/2;
  const cy = player.y + player.h/2;
  camera.x = clamp(cx - BASE_W/2, 0, WORLD_W*TILE - BASE_W);
  camera.y = clamp(cy - BASE_H/2, 0, WORLD_H*TILE - BASE_H);
}

// ---------- update loop ----------
let last = now();

function update(dt){
  advanceTime(dt);
  updateCrops(dt);
  updateCustomers(dt);
  updateStations(dt);

  // movement
  let mx=0,my=0;
  if (keys.has("w")||keys.has("arrowup")) my-=1;
  if (keys.has("s")||keys.has("arrowdown")) my+=1;
  if (keys.has("a")||keys.has("arrowleft")) mx-=1;
  if (keys.has("d")||keys.has("arrowright")) mx+=1;

  const sprint = keys.has("shift");
  const spd = player.speed * (sprint?1.45:1);

  if (mx!==0||my!==0){
    const l=Math.hypot(mx,my);
    mx/=l; my/=l;
    player.dir.x = mx; player.dir.y = my;
  }

  const nx = {x: player.x + mx*spd*dt, y: player.y, w: player.w, h: player.h};
  if (!collide(nx)) player.x = nx.x;
  const ny = {x: player.x, y: player.y + my*spd*dt, w: player.w, h: player.h};
  if (!collide(ny)) player.y = ny.y;

  // hotbar 1-5
  for (let i=1;i<=5;i++){
    if (keys.has(String(i))) player.hotbarIndex = i-1;
  }

  // interactions (consume once per press)
  if (pressed("e", EL)) interactStation(getNearestStation());
  if (pressed("q", QL)) setHand(null);
  if (pressed(" ", SL)) useTool();

  updateCamera();
}

function drawTile(x,y,t){
  const px = x*TILE - camera.x;
  const py = y*TILE - camera.y;

  // cull
  if (px<-TILE||py<-TILE||px>BASE_W||py>BASE_H) return;

  if (t===Tile.Grass){
    ctx.fillStyle = ((x+y)&1) ? "#2b4b2f" : "#2f5435";
    ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle="rgba(0,0,0,0.08)";
    ctx.fillRect(px,py,TILE,1);
  } else if (t===Tile.Dirt){
    ctx.fillStyle = ((x+y)&1) ? "#5b3d2a" : "#62412c";
    ctx.fillRect(px,py,TILE,TILE);
  } else if (t===Tile.Tilled){
    ctx.fillStyle = "#4a2f21";
    ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    for(let i=3;i<TILE;i+=4) ctx.fillRect(px+2, py+i, TILE-4, 1);
  } else if (t===Tile.Floor){
    ctx.fillStyle = ((x+y)&1) ? "#2a2a2f" : "#2f3037";
    ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle="rgba(255,255,255,0.04)";
    ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
  } else if (t===Tile.Counter){
    ctx.fillStyle="#4b5564";
    ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle="#657189";
    ctx.fillRect(px+2,py+2,TILE-4,TILE-4);
  } else if (t===Tile.Water){
    ctx.fillStyle = ((x+y)&1) ? "#183a63" : "#1b4270";
    ctx.fillRect(px,py,TILE,TILE);
    const r = (Math.sin((performance.now()/250)+(x*0.7+y*0.3))*0.5+0.5);
    ctx.fillStyle = `rgba(180,220,255,${0.12+0.10*r})`;
    ctx.fillRect(px+2,py+2,TILE-4,2);
  }
}

function drawStations(){
  for(const s of stations){
    const p = tileToWorld(s.tx,s.ty);
    const px = p.x - camera.x, py = p.y - camera.y;
    if (px<-TILE||py<-TILE||px>BASE_W||py>BASE_H) continue;

    let base="#6b778a";
    if (s.type==="crate") base="#6a8a5a";
    if (s.type==="bin") base="#6a6a6a";
    if (s.type==="board") base="#8a6a4f";
    if (s.type==="stove") base="#7a4b4b";
    if (s.type==="pot") base="#5a5a7a";
    if (s.type==="serve") base="#4f7a7a";
    if (s.type==="seed") base="#8a865a";
    if (s.type==="shop") base="#7a6b3d";

    ctx.fillStyle=base;
    ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
    ctx.fillStyle="rgba(255,255,255,0.15)";
    ctx.fillRect(px+3,py+3,5,5);

    // station animation indicator
    const st = stationState[s.type];
    if (st?.busy){
      const r = clamp(st.t/st.total,0,1);
      ctx.fillStyle="#0b0c10";
      ctx.fillRect(px+1, py+TILE-4, TILE-2, 3);
      ctx.fillStyle = (s.type==="stove") ? "#ff8a3d" : (s.type==="pot" ? "#7fd3ff" : "#e6d06c");
      ctx.fillRect(px+1, py+TILE-4, (TILE-2)*r, 3);
      // flicker
      if (Math.floor(performance.now()/120)%2===0){
        ctx.fillStyle="rgba(255,255,255,0.12)";
        ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
      }
    }
  }
}

function drawCrops(){
  for (const [k,c] of crops){
    const [tx,ty] = k.split(",").map(Number);
    const p = tileToWorld(tx,ty);
    const px=p.x - camera.x, py=p.y - camera.y;
    if (px<-TILE||py<-TILE||px>BASE_W||py>BASE_H) continue;

    const def = CropDefs[c.seed];
    // stalk color changes by stage
    const stage = c.stage;
    const h = 3 + stage*2;
    ctx.fillStyle = c.seed==="turnip" ? "#4bbd6a" : "#3fbf7a";
    ctx.fillRect(px+7, py+10-h, 2, h);

    // fruit at mature
    if (stage >= def.stages-1){
      ctx.fillStyle = c.seed==="turnip" ? "#dfe7ef" : "#d64a3a";
      ctx.fillRect(px+6, py+10, 4, 4);
    }

    // watered indicator
    if (c.watered){
      ctx.fillStyle="rgba(120,190,255,0.25)";
      ctx.fillRect(px+1,py+1,TILE-2,TILE-2);
    }
  }
}

function drawPlayer(){
  const px = Math.floor(player.x - camera.x);
  const py = Math.floor(player.y - camera.y);

  // tiny 2-frame walk animation
  const moving = (keys.has("w")||keys.has("a")||keys.has("s")||keys.has("d")||
                  keys.has("arrowup")||keys.has("arrowleft")||keys.has("arrowdown")||keys.has("arrowright"));
  const frame = moving ? (Math.floor(performance.now()/180)%2) : 0;

  // shadow
  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.fillRect(px+2,py+8,8,3);

  // body
  ctx.fillStyle="#3e78c5";
  ctx.fillRect(px+2,py+4,8,6);

  // head
  ctx.fillStyle="#d6b48a";
  ctx.fillRect(px+3,py+1,6,4);

  // hair
  ctx.fillStyle="#2b2b2b";
  ctx.fillRect(px+3,py+1,6,2);

  // legs animation
  ctx.fillStyle="#2a2a2a";
  if (frame===0){
    ctx.fillRect(px+3,py+10,2,2);
    ctx.fillRect(px+7,py+10,2,2);
  }else{
    ctx.fillRect(px+2,py+10,2,2);
    ctx.fillRect(px+8,py+10,2,2);
  }

  // held item
  if (player.hand){
    ctx.fillStyle="#f1f1f1";
    ctx.fillRect(px+10,py+6,4,4);
  }
}

function drawCustomers(){
  for(const c of customers){
    const px = Math.floor(c.x - camera.x);
    const py = Math.floor(c.y - camera.y);
    // body
    ctx.fillStyle="#c57b3e";
    ctx.fillRect(px+2,py+4,8,6);
    // head
    ctx.fillStyle="#d9b38c";
    ctx.fillRect(px+3,py+1,6,4);

    // patience bar
    if (c.state==="waiting"){
      ctx.fillStyle="#0b0c10";
      ctx.fillRect(px,py-4,12,3);
      ctx.fillStyle= c.patience>15 ? "#6bd67f" : (c.patience>6 ? "#e6d06c" : "#ff6b6b");
      ctx.fillRect(px,py-4, 12*clamp(c.patience/40,0,1), 3);

      // order bubble (tiny)
      const name = Recipes[c.orderId].name;
      ctx.fillStyle="rgba(0,0,0,0.5)";
      ctx.fillRect(px+12,py-10, name.length*6+6, 12);
      ctx.fillStyle="#fff";
      ctx.font="10px monospace";
      ctx.fillText(name, px+15, py-1);
    }
  }
}

function drawInteractionHint(){
  const st = getNearestStation();
  if (!st) return;
  const p = tileToWorld(st.tx,st.ty);
  const px = p.x - camera.x, py = p.y - camera.y;

  ctx.strokeStyle="rgba(255,255,255,0.6)";
  ctx.lineWidth=1;
  ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);

  ctx.font="10px monospace";
  ctx.fillStyle="rgba(255,255,255,0.9)";
  ctx.fillText(`E:${st.name}`, px-2, py-4);
}

function drawHotbar(){
  const x=8, y=BASE_H-26;
  for(let i=0;i<5;i++){
    ctx.fillStyle = (i===player.hotbarIndex) ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.25)";
    ctx.fillRect(x+i*26, y, 24, 18);
    ctx.strokeStyle="rgba(255,255,255,0.22)";
    ctx.strokeRect(x+i*26+0.5, y+0.5, 23, 17);

    ctx.font="10px monospace";
    ctx.fillStyle="#fff";
    const t = player.hotbar[i];
    const label = t.replace("seed_","S:");
    ctx.fillText(label.slice(0,5), x+i*26+3, y+12);

    ctx.fillStyle="rgba(255,255,255,0.55)";
    ctx.fillText(String(i+1), x+i*26+18, y+12);
  }
}

function drawWorld(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  const minX = Math.floor(camera.x / TILE) - 1;
  const minY = Math.floor(camera.y / TILE) - 1;
  const maxX = Math.floor((camera.x + BASE_W) / TILE) + 1;
  const maxY = Math.floor((camera.y + BASE_H) / TILE) + 1;

  for(let y=minY;y<=maxY;y++){
    for(let x=minX;x<=maxX;x++){
      drawTile(x,y,getTile(x,y));
    }
  }

  drawCrops();
  drawStations();
  drawCustomers();
  drawPlayer();
  drawInteractionHint();
  drawHotbar();
}

function drawMinimap(){
  mm.imageSmoothingEnabled = false;
  mm.clearRect(0,0,mmCanvas.width, mmCanvas.height);

  // very rough minimap: sample tiles
  const sx = WORLD_W / mmCanvas.width;
  const sy = WORLD_H / mmCanvas.height;

  for(let y=0;y<mmCanvas.height;y++){
    for(let x=0;x<mmCanvas.width;x++){
      const tx = Math.floor(x*sx);
      const ty = Math.floor(y*sy);
      const t = getTile(tx,ty);
      let c="#24402a";
      if (t===Tile.Dirt) c="#5b3d2a";
      if (t===Tile.Tilled) c="#3f271c";
      if (t===Tile.Floor) c="#2b2b33";
      if (t===Tile.Counter) c="#6a778a";
      if (t===Tile.Water) c="#214a7a";
      mm.fillStyle=c;
      mm.fillRect(x,y,1,1);
    }
  }

  // player dot
  const px = Math.floor((player.x/TILE)/WORLD_W * mmCanvas.width);
  const py = Math.floor((player.y/TILE)/WORLD_H * mmCanvas.height);
  mm.fillStyle="#ffffff";
  mm.fillRect(px,py,2,2);
}

function loop(){
  const t = now();
  const dt = Math.min(0.033, (t-last)/1000);
  last = t;

  update(dt);
  drawWorld();
  drawMinimap();
  present();

  requestAnimationFrame(loop);
}

UI.goldText.textContent = gold;
UI.repText.textContent = rep;
loop();
