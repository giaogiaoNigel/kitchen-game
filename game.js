{\rtf1\ansi\ansicpg1252\cocoartf2709
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // \uc0\u20687 \u32032 \u21416 \u25151 \u65288 \u32593 \u39029 \u21407 \u22411 \u65289 \
// \uc0\u32431  Canvas\u65292 \u26080 \u22806 \u37096 \u36164 \u28304 \u65307 \u29992 \'93\u20687 \u32032 \u22359 \'94\u27169 \u25311 \u26143 \u38706 \u35895 \u37027 \u31181 \u24863 \u35273 \u12290 \
// \uc0\u20320 \u21487 \u20197 \u21518 \u32493 \u26367 \u25442 \u20026 \u30495 \u27491 \u30340 \u20687 \u32032 \u32032 \u26448 \u19982 \u21160 \u30011 \u24103 \u12290 \
\
const canvas = document.getElementById("c");\
const ctx = canvas.getContext("2d");\
\
const UI = \{\
  orderText: document.getElementById("orderText"),\
  handText: document.getElementById("handText"),\
  scoreText: document.getElementById("scoreText"),\
  timeText: document.getElementById("timeText"),\
\};\
\
const W = canvas.width, H = canvas.height;\
\
// \uc0\u26684 \u23376 \u19982 \u19990 \u30028 \
const TILE = 32;\
const MAP_W = 20;\
const MAP_H = 11;\
\
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\
\
function rectsOverlap(a, b)\{\
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;\
\}\
\
function now()\{ return performance.now(); \}\
\
// --- \uc0\u22320 \u22270 \u23450 \u20041 \u65306 0=\u22320 \u26495 \u65292 1=\u22681 \
const map = [];\
for (let y=0;y<MAP_H;y++)\{\
  const row = [];\
  for (let x=0;x<MAP_W;x++)\{\
    const wall = (x===0||y===0||x===MAP_W-1||y===MAP_H-1) ? 1 : 0;\
    row.push(wall);\
  \}\
  map.push(row);\
\}\
// \uc0\u20869 \u37096 \u22681 /\u21488 \u38754 \u65288 \u38543 \u20415 \u25670 \u28857 \u35753 \u23427 \u20687 \u21416 \u25151 \u65289 \
for (let x=2;x<=17;x++)\{\
  map[2][x]=1;\
\}\
map[2][9]=0; // \uc0\u30041 \u20010 \u32570 \u21475 \
for (let x=2;x<=6;x++) map[8][x]=1;\
\
// \uc0\u20132 \u20114 \u29289 \u20214 \u65288 \u25918 \u22312 \u22681 /\u21488 \u38754 \u38468 \u36817 \u65289 \
const stations = [\
  \{ id:"bin",    name:"\uc0\u22403 \u22334 \u26742 ", type:"bin",    tx:2,  ty:3 \},\
  \{ id:"board",  name:"\uc0\u30759 \u26495 ",   type:"board",  tx:7,  ty:2 \},\
  \{ id:"stove",  name:"\uc0\u28809 \u28790 ",   type:"stove",  tx:12, ty:2 \},\
  \{ id:"serve",  name:"\uc0\u20986 \u39184 \u21488 ", type:"serve",  tx:17, ty:3 \},\
  \{ id:"crate",  name:"\uc0\u39135 \u26448 \u31665 ", type:"crate",  tx:3,  ty:8 \},\
];\
\
function tileToWorld(tx, ty)\{\
  return \{ x: tx*TILE, y: ty*TILE \};\
\}\
\
function isWallAt(tx, ty)\{\
  if (tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return true;\
  return map[ty][tx]===1;\
\}\
\
function collideWithWalls(next)\{\
  // AABB vs tile walls\
  const minTx = Math.floor(next.x / TILE);\
  const minTy = Math.floor(next.y / TILE);\
  const maxTx = Math.floor((next.x + next.w - 1) / TILE);\
  const maxTy = Math.floor((next.y + next.h - 1) / TILE);\
\
  for (let ty=minTy; ty<=maxTy; ty++)\{\
    for (let tx=minTx; tx<=maxTx; tx++)\{\
      if (isWallAt(tx,ty))\{\
        const wx = tx*TILE, wy = ty*TILE;\
        const wallRect = \{x:wx, y:wy, w:TILE, h:TILE\};\
        if (rectsOverlap(next, wallRect)) return true;\
      \}\
    \}\
  \}\
  return false;\
\}\
\
// \uc0\u29609 \u23478 \
const player = \{\
  x: 9*TILE, y: 6*TILE,\
  w: 18, h: 18,\
  speed: 110, // px/s\
  dir: \{x:0, y:1\},\
  hand: null, // \{type:'veg'|'chopped'|'dish', name\}\
\};\
\
// \uc0\u35746 \u21333 /\u33756 \u35889 \
const recipes = [\
  // \uc0\u27801 \u25289 \u65306 \u20999 \u22909 \u30340 \u34092 \u33756  -> \u27801 \u25289 \
  \{ orderName:"\uc0\u27801 \u25289 ", need:"chopped", result:"dish_salad", score: 20, cookTime: 0.6 \},\
  // \uc0\u28818 \u33756 \u65306 \u20999 \u22909 \u30340 \u34092 \u33756  -> \u28818 \u33756 \u65288 \u38656 \u35201 \u28809 \u28790 \u65289 \
  \{ orderName:"\uc0\u28818 \u33756 ", need:"chopped", result:"dish_stirfry", score: 30, cookTime: 1.2 \},\
];\
\
let currentOrder = null;\
let score = 0;\
let timeLeft = 120; // \uc0\u31186 \
let lastTick = now();\
\
// \uc0\u35774 \u22791 \u29366 \u24577 \
const stationState = \{\
  board: \{ busy:false, t:0, total:0 \},\
  stove: \{ busy:false, t:0, total:0 \},\
\};\
\
function newOrder()\{\
  currentOrder = recipes[Math.floor(Math.random()*recipes.length)];\
  UI.orderText.textContent = `$\{currentOrder.orderName\}\uc0\u65288 \u38656 \u35201 \u65306 \u20999 \u22909 \u30340 \u33756 \u65289 `;\
\}\
newOrder();\
\
function setHand(item)\{\
  player.hand = item;\
  UI.handText.textContent = item ? item.name : "\uc0\u31354 ";\
\}\
\
function addScore(v)\{\
  score += v;\
  UI.scoreText.textContent = score;\
\}\
\
const keys = new Set();\
addEventListener("keydown", (e)=>\{\
  const k = e.key.toLowerCase();\
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d","e","q","shift"].includes(k)) \{\
    e.preventDefault();\
  \}\
  keys.add(k);\
\});\
addEventListener("keyup", (e)=>\{\
  keys.delete(e.key.toLowerCase());\
\});\
\
function getNearestStation()\{\
  // \uc0\u21462 \u29609 \u23478 \u38754 \u21521 \u26041 \u21521 \u21069 \u26041 \u30340 \u19968 \u20010 \'93\u20132 \u20114 \u21306 \u22495 \'94\
  const fx = player.x + player.w/2 + player.dir.x*20;\
  const fy = player.y + player.h/2 + player.dir.y*20;\
  const probe = \{ x: fx-10, y: fy-10, w: 20, h: 20 \};\
\
  let best = null, bestD = 1e9;\
  for (const s of stations)\{\
    const p = tileToWorld(s.tx, s.ty);\
    const r = \{ x:p.x, y:p.y, w:TILE, h:TILE \};\
    if (rectsOverlap(probe, r))\{\
      const cx = p.x+TILE/2, cy = p.y+TILE/2;\
      const dx = cx-(player.x+player.w/2), dy = cy-(player.y+player.h/2);\
      const d = dx*dx+dy*dy;\
      if (d<bestD)\{ bestD=d; best=s; \}\
    \}\
  \}\
  return best;\
\}\
\
let eLock = false;\
function pressedE()\{\
  const down = keys.has("e");\
  if (down && !eLock)\{ eLock=true; return true; \}\
  if (!down) eLock=false;\
  return false;\
\}\
\
let qLock = false;\
function pressedQ()\{\
  const down = keys.has("q");\
  if (down && !qLock)\{ qLock=true; return true; \}\
  if (!down) qLock=false;\
  return false;\
\}\
\
function interact(st)\{\
  if (!st) return;\
\
  if (st.type==="crate")\{\
    // \uc0\u25343 \u21407 \u26448 \u26009 \u65306 \u34092 \u33756 \
    if (!player.hand)\{\
      setHand(\{ type:"veg", name:"\uc0\u34092 \u33756 " \});\
    \}\
    return;\
  \}\
\
  if (st.type==="bin")\{\
    // \uc0\u20002 \u24323 \
    if (player.hand) setHand(null);\
    return;\
  \}\
\
  if (st.type==="board")\{\
    // \uc0\u20999 \u33756 \u65306 veg -> chopped\
    if (stationState.board.busy) return;\
\
    if (player.hand?.type==="veg")\{\
      stationState.board.busy = true;\
      stationState.board.t = 0;\
      stationState.board.total = 0.8;\
      setHand(null);\
    \}\
    return;\
  \}\
\
  if (st.type==="stove")\{\
    // \uc0\u28809 \u28790 \u65306 chopped -> dish_stirfry\
    if (stationState.stove.busy) return;\
\
    if (player.hand?.type==="chopped")\{\
      stationState.stove.busy = true;\
      stationState.stove.t = 0;\
      stationState.stove.total = 1.2;\
      setHand(null);\
    \}\
    return;\
  \}\
\
  if (st.type==="serve")\{\
    // \uc0\u20986 \u39184 \u65306 \u25552 \u20132  dish\
    if (player.hand?.type==="dish")\{\
      if (player.hand.kind === currentOrder.result)\{\
        addScore(currentOrder.score);\
        setHand(null);\
        newOrder();\
      \} else \{\
        // \uc0\u20132 \u38169 \u33756 \u25187 \u19968 \u28857 \u20998 \u65288 \u21487 \u36873 \u65289 \
        addScore(-5);\
        setHand(null);\
      \}\
    \}\
    return;\
  \}\
\}\
\
function update(dt)\{\
  // \uc0\u20498 \u35745 \u26102 \
  timeLeft -= dt;\
  if (timeLeft < 0) timeLeft = 0;\
  UI.timeText.textContent = Math.ceil(timeLeft);\
\
  // \uc0\u20914 \u21050 \u65306 \u26356 \u24555 \u20294 \u28040 \u32791 \u26102 \u38388 \u65288 \u35753 \u23427 \u26377 \u28857 \'93\u24537 \u20081 \u24863 \'94\u65289 \
  const sprint = keys.has("shift") && timeLeft>0;\
  const spd = player.speed * (sprint ? 1.6 : 1.0);\
  if (sprint) timeLeft = Math.max(0, timeLeft - dt*0.25);\
\
  // \uc0\u31227 \u21160 \u36755 \u20837 \
  let mx=0,my=0;\
  if (keys.has("w")||keys.has("arrowup")) my -= 1;\
  if (keys.has("s")||keys.has("arrowdown")) my += 1;\
  if (keys.has("a")||keys.has("arrowleft")) mx -= 1;\
  if (keys.has("d")||keys.has("arrowright")) mx += 1;\
\
  if (mx!==0||my!==0)\{\
    // \uc0\u24402 \u19968 \u21270 \
    const l = Math.hypot(mx,my);\
    mx/=l; my/=l;\
    player.dir.x = mx; player.dir.y = my;\
  \}\
\
  // \uc0\u23581 \u35797 \u31227 \u21160 \u65288 \u20998 \u21035 \u36724 \u21521 \u22788 \u29702 \u65289 \
  const nx = \{ x: player.x + mx*spd*dt, y: player.y, w: player.w, h: player.h \};\
  if (!collideWithWalls(nx)) player.x = nx.x;\
\
  const ny = \{ x: player.x, y: player.y + my*spd*dt, w: player.w, h: player.h \};\
  if (!collideWithWalls(ny)) player.y = ny.y;\
\
  // Q \uc0\u20002 \u24323 \
  if (pressedQ())\{\
    if (player.hand) setHand(null);\
  \}\
\
  // E \uc0\u20132 \u20114 \
  if (pressedE())\{\
    interact(getNearestStation());\
  \}\
\
  // \uc0\u35774 \u22791 \u36827 \u24230 \
  if (stationState.board.busy)\{\
    stationState.board.t += dt;\
    if (stationState.board.t >= stationState.board.total)\{\
      stationState.board.busy = false;\
      // \uc0\u20999 \u22909 \u33756 \u25918 \u21040 \u29609 \u23478 \u25163 \u37324 \u65288 \u22914 \u26524 \u25163 \u37324 \u31354 \u65307 \u21542 \u21017 \'93\u25481 \u22320 \u19978 \'94\u36825 \u37324 \u31616 \u21270 \u20026 \u30452 \u25509 \u35206 \u30422 /\u25918 \u24323 \u65289 \
      if (!player.hand) setHand(\{ type:"chopped", name:"\uc0\u20999 \u22909 \u30340 \u33756 " \});\
    \}\
  \}\
\
  if (stationState.stove.busy)\{\
    stationState.stove.t += dt;\
    if (stationState.stove.t >= stationState.stove.total)\{\
      stationState.stove.busy = false;\
      if (!player.hand) \{\
        setHand(\{ type:"dish", kind:"dish_stirfry", name:"\uc0\u28818 \u33756 " \});\
      \}\
    \}\
  \}\
\
  // \uc0\u27801 \u25289 \u65306 \u22312 \u30759 \u26495 \u30452 \u25509 \'93\u35013 \u30424 \'94\u65288 \u20570 \u20010 \u31616 \u21270 \u65306 \u20999 \u23436 \u33509 \u24403 \u21069 \u35746 \u21333 \u26159 \u27801 \u25289 \u21017 \u30452 \u25509 \u21464 \u27801 \u25289 \u65289 \
  // \uc0\u35753 \u29609 \u23478 \u26377 \u20004 \u31181 \u35746 \u21333 \u20307 \u39564 \
  // \uc0\u24403 \u29609 \u23478 \u25163 \u37324 \u26159  chopped\u65292 \u19988 \u31449 \u22312 \u30759 \u26495 \u26049 \u25353 E\u65306 \u21464 \u27801 \u25289 \
  const near = getNearestStation();\
  if (near?.type==="board" && pressedE())\{\
    if (player.hand?.type==="chopped")\{\
      setHand(\{ type:"dish", kind:"dish_salad", name:"\uc0\u27801 \u25289 " \});\
    \}\
  \}\
\}\
\
function draw()\{\
  ctx.clearRect(0,0,W,H);\
\
  // \uc0\u22320 \u26495 \
  for (let y=0;y<MAP_H;y++)\{\
    for (let x=0;x<MAP_W;x++)\{\
      const t = map[y][x];\
      const px=x*TILE, py=y*TILE;\
\
      if (t===0)\{\
        // \uc0\u26408 \u22320 \u26495 \u26684 \
        ctx.fillStyle = ( (x+y)%2===0 ? "#2a2a2f" : "#2f3037");\
        ctx.fillRect(px,py,TILE,TILE);\
        ctx.fillStyle = "rgba(0,0,0,0.10)";\
        ctx.fillRect(px,py,TILE,1);\
        ctx.fillRect(px,py,1,TILE);\
      \} else \{\
        // \uc0\u21488 \u38754 /\u22681 \
        ctx.fillStyle = "#4a4f5a";\
        ctx.fillRect(px,py,TILE,TILE);\
        ctx.fillStyle = "#5b6270";\
        ctx.fillRect(px+2,py+2,TILE-4,TILE-4);\
      \}\
    \}\
  \}\
\
  // \uc0\u35774 \u22791 \u32472 \u21046 \
  for (const s of stations)\{\
    const p = tileToWorld(s.tx, s.ty);\
    let base = "#6b778a";\
    if (s.type==="crate") base="#6a8a5a";\
    if (s.type==="bin") base="#5f5f5f";\
    if (s.type==="board") base="#8a6a4f";\
    if (s.type==="stove") base="#7a4b4b";\
    if (s.type==="serve") base="#4f7a7a";\
\
    ctx.fillStyle = base;\
    ctx.fillRect(p.x+3,p.y+3,TILE-6,TILE-6);\
\
    // \uc0\u23567 \u22270 \u26631 \u28857 \u32512 \u65288 \u20687 \u32032 \u24863 \u65289 \
    ctx.fillStyle = "rgba(255,255,255,0.15)";\
    ctx.fillRect(p.x+6,p.y+6,6,6);\
\
    // \uc0\u36827 \u24230 \u26465 \
    if (s.type==="board" && stationState.board.busy)\{\
      const r = stationState.board.t / stationState.board.total;\
      ctx.fillStyle="#0b0c0f";\
      ctx.fillRect(p.x+4, p.y+TILE-8, TILE-8, 4);\
      ctx.fillStyle="#e6d06c";\
      ctx.fillRect(p.x+4, p.y+TILE-8, (TILE-8)*r, 4);\
    \}\
    if (s.type==="stove" && stationState.stove.busy)\{\
      const r = stationState.stove.t / stationState.stove.total;\
      ctx.fillStyle="#0b0c0f";\
      ctx.fillRect(p.x+4, p.y+TILE-8, TILE-8, 4);\
      ctx.fillStyle="#ff8a3d";\
      ctx.fillRect(p.x+4, p.y+TILE-8, (TILE-8)*r, 4);\
    \}\
  \}\
\
  // \uc0\u20132 \u20114 \u25552 \u31034 \u39640 \u20142 \
  const st = getNearestStation();\
  if (st)\{\
    const p = tileToWorld(st.tx, st.ty);\
    ctx.strokeStyle = "rgba(255,255,255,0.55)";\
    ctx.lineWidth = 2;\
    ctx.strokeRect(p.x+2,p.y+2,TILE-4,TILE-4);\
\
    // \uc0\u21517 \u31216 \
    ctx.font = "12px monospace";\
    ctx.fillStyle = "rgba(255,255,255,0.85)";\
    ctx.fillText(`E: $\{st.name\}`, p.x-6, p.y-6);\
  \}\
\
  // \uc0\u29609 \u23478 \u65288 \u20687 \u32032 \u23567 \u20154 \u65289 \
  ctx.fillStyle = "#d6b48a"; // \uc0\u33080 \
  ctx.fillRect(player.x+6, player.y+2, 6, 6);\
  ctx.fillStyle = "#3e78c5"; // \uc0\u34915 \u26381 \
  ctx.fillRect(player.x+4, player.y+8, 10, 10);\
  ctx.fillStyle = "#2b2b2b"; // \uc0\u22836 \u21457 \
  ctx.fillRect(player.x+5, player.y+1, 8, 2);\
\
  // \uc0\u25163 \u19978 \u25343 \u30340 \u19996 \u35199 \u65288 \u23567 \u26041 \u22359 \u34920 \u31034 \u65289 \
  if (player.hand)\{\
    let c = "#7fd36b";\
    if (player.hand.type==="chopped") c = "#c9f09a";\
    if (player.hand.type==="dish") c = "#f1f1f1";\
    ctx.fillStyle = c;\
    ctx.fillRect(player.x+14, player.y+10, 6, 6);\
  \}\
\
  // \uc0\u26102 \u38388 \u21040 \u65306 \u35206 \u30422 \u25552 \u31034 \
  if (timeLeft<=0)\{\
    ctx.fillStyle="rgba(0,0,0,0.55)";\
    ctx.fillRect(0,0,W,H);\
    ctx.fillStyle="#ffffff";\
    ctx.font="24px monospace";\
    ctx.fillText(`\uc0\u26102 \u38388 \u21040 \u65281 \u20998 \u25968 \u65306 $\{score\}`, W/2-120, H/2-10);\
    ctx.font="14px monospace";\
    ctx.fillText(`\uc0\u21047 \u26032 \u39029 \u38754 \u37325 \u26032 \u24320 \u22987 `, W/2-80, H/2+18);\
  \}\
\}\
\
function loop()\{\
  const t = now();\
  const dt = Math.min(0.033, (t - lastTick)/1000);\
  lastTick = t;\
\
  if (timeLeft>0) update(dt);\
  draw();\
  requestAnimationFrame(loop);\
\}\
loop();}