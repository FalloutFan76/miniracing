"use strict";

const SERVER_URL = "https://mini-racing-server-fa83.onrender.com";
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const $ = (id) => document.getElementById(id);
const socket = io(SERVER_URL, { transports: ["websocket", "polling"], reconnection: true });

const W = 960, H = 640;
const CX = 480, CY = 320;
const OUT_RX = 365, OUT_RY = 270;
const IN_RX = 205, IN_RY = 120;
const ROAD_RX = 285, ROAD_RY = 195;

let myId = null;
let joined = false;
let players = [];
let myPlayer = null;
let startedAt = 0;
let raceStart = 0;
let finished = false;
let lastStateTime = performance.now();
let toastTimer = null;
let lastBoostSent = false;
let lastFrame = performance.now();
let particles = [];
let cameraShake = 0;
let input = { up:false, down:false, left:false, right:false, boost:false };
const keys = new Set();

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2400);
}

socket.on("connect", () => {
  $("connectionDot").className = "dot online";
  $("connectionText").textContent = "Servidor conectado";
  if (joined) sendJoin();
});
socket.on("disconnect", () => {
  $("connectionDot").className = "dot offline";
  $("connectionText").textContent = "Reconectando...";
  showToast("Conexión perdida. Intentando volver...");
});
socket.on("connect_error", () => {
  $("connectionDot").className = "dot offline";
  $("connectionText").textContent = "Sin conexión";
});
socket.on("welcome", data => { myId = data.id; });
socket.on("raceMessage", message => showToast(String(message)));
socket.on("raceStarted", data => {
  raceStart = data.startAt || Date.now();
  finished = false;
  $("raceStatus").textContent = "EN CARRERA";
  showToast("¡A correr! ⚡");
});
socket.on("raceFinished", data => {
  if (data.id === myId) {
    finished = true;
    $("overlayTitle").textContent = data.position === 1 ? "¡VICTORIA!" : "¡CARRERA TERMINADA!";
    $("overlayText").textContent = `Has terminado en la posición ${data.position}.`;
    $("joinButton").textContent = "VOLVER A CORRER";
    $("overlay").classList.remove("hidden");
  }
});
socket.on("state", data => {
  if (!data || !Array.isArray(data.players)) return;
  players = data.players;
  myPlayer = players.find(p => p.id === myId) || null;
  lastStateTime = performance.now();
  updateLeaderboard();
  updateHUD();
});

function sendJoin() {
  if (!socket.connected) {
    showToast("El servidor está arrancando. Espera unos segundos...");
    return;
  }
  const name = $("playerName").value.trim().slice(0,16) || "Piloto";
  socket.emit("joinRace", { name });
}

function joinGame() {
  if (joined && !finished) return;
  joined = true;
  finished = false;
  $("joinButton").disabled = true;
  $("joinButton").textContent = "CONECTANDO...";
  sendJoin();
  if (socket.connected) {
    $("overlay").classList.add("hidden");
    $("joinButton").disabled = false;
    $("joinButton").textContent = "ENTRAR EN CARRERA";
    startedAt = performance.now();
  } else {
    $("overlayTitle").textContent = "Conectando...";
    $("overlayText").textContent = "El servidor gratuito puede tardar unos segundos en arrancar.";
    setTimeout(() => {
      if (socket.connected && joined) {
        $("overlay").classList.add("hidden");
        $("joinButton").disabled = false;
      }
    }, 1800);
  }
}
$("joinButton").addEventListener("click", joinGame);
$("rejoinButton").addEventListener("click", () => {
  joined = false;
  finished = false;
  $("overlayTitle").textContent = "¡A la parrilla!";
  $("overlayText").textContent = "Entra en la carrera y compite contra tus amigos.";
  $("joinButton").textContent = "ENTRAR EN CARRERA";
  $("overlay").classList.remove("hidden");
});
$("playerName").addEventListener("keydown", e => { if (e.key === "Enter") joinGame(); });

function updateKeys() {
  input.up = keys.has("w") || keys.has("arrowup");
  input.down = keys.has("s") || keys.has("arrowdown");
  input.left = keys.has("a") || keys.has("arrowleft");
  input.right = keys.has("d") || keys.has("arrowright");
  input.boost = keys.has(" ");
}
window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key)) e.preventDefault();
  keys.add(key);
  updateKeys();
});
window.addEventListener("keyup", e => { keys.delete(e.key.toLowerCase()); updateKeys(); });
window.addEventListener("blur", () => { keys.clear(); updateKeys(); });

document.querySelectorAll("[data-control]").forEach(button => {
  const control = button.dataset.control;
  const down = e => {
    e.preventDefault();
    button.classList.add("active");
    input[control] = true;
    try { button.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const up = e => {
    e.preventDefault();
    button.classList.remove("active");
    input[control] = false;
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
  button.addEventListener("contextmenu", e => e.preventDefault());
});

setInterval(() => {
  if (socket.connected && joined && myPlayer && !finished) {
    socket.emit("input", input);
  }
}, 33);

function updateHUD() {
  $("playerCount").textContent = `${players.length} piloto${players.length === 1 ? "" : "s"} conectado${players.length === 1 ? "" : "s"}`;
  if (!myPlayer) return;
  const position = players.slice().sort(comparePlayers).findIndex(p => p.id === myId) + 1;
  $("positionDisplay").textContent = position > 0 ? `${position}º` : "—";
  $("lapDisplay").textContent = `${Math.min(3, myPlayer.lap + 1)} / 3`;
  $("speedDisplay").textContent = Math.round((myPlayer.speed || 0) * 34);
  if (myPlayer.finished) $("raceStatus").textContent = "META";
  else if (myPlayer.lap > 0) $("raceStatus").textContent = "EN CARRERA";
}

function comparePlayers(a, b) {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
  return (b.lap * 10000 + (b.progress || 0) * 10000) -
         (a.lap * 10000 + (a.progress || 0) * 10000);
}
function updateLeaderboard() {
  const list = $("leaderboard");
  list.innerHTML = "";
  players.slice().sort(comparePlayers).forEach((p, i) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(i + 1).padStart(2, "0");
    const swatch = document.createElement("span");
    swatch.className = "car-swatch";
    swatch.style.background = p.color || "#fff";
    const name = document.createElement("span");
    name.className = "racer-name";
    name.textContent = p.name + (p.id === myId ? " (TÚ)" : "");
    const score = document.createElement("span");
    score.className = "racer-score";
    score.textContent = p.finished ? "META" : `${Math.min(3,p.lap + 1)}/3`;
    li.append(rank, swatch, name, score);
    list.appendChild(li);
  });
  if (!players.length) {
    const li = document.createElement("li");
    li.className = "empty-leaderboard";
    li.textContent = "Esperando pilotos...";
    list.appendChild(li);
  }
}

function ellipsePath(rx, ry) {
  ctx.beginPath();
  ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2);
}
function drawGrass() {
  ctx.fillStyle = "#204b35";
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = "#28583b";
  for (let y=0; y<H; y+=32) {
    for (let x=0; x<W; x+=32) {
      if (((x/32|0)+(y/32|0))%2===0) ctx.fillRect(x,y,16,16);
    }
  }
  for (let i=0; i<85; i++) {
    const x=(i*137+23)%W, y=(i*83+17)%H;
    ctx.fillStyle=i%2?"#326444":"#183f2d";
    ctx.fillRect(x,y,4,4);
  }
}
function drawTrack() {
  drawGrass();
  // Sombra exterior
  ctx.fillStyle = "#111820";
  ellipsePath(OUT_RX+7,OUT_RY+7); ctx.fill();
  // Asfalto
  ctx.fillStyle = "#555d67";
  ellipsePath(OUT_RX,OUT_RY); ctx.fill();
  // Rayas de borde
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f4f1df";
  ellipsePath(OUT_RX-3,OUT_RY-3); ctx.stroke();
  ctx.strokeStyle = "#e74b51";
  ctx.setLineDash([18,18]);
  ellipsePath(OUT_RX-3,OUT_RY-3); ctx.stroke();
  ctx.setLineDash([]);
  // Interior de hierba
  ctx.fillStyle = "#204b35";
  ellipsePath(IN_RX,IN_RY); ctx.fill();
  ctx.strokeStyle = "#f4f1df";
  ctx.lineWidth = 6;
  ellipsePath(IN_RX,IN_RY); ctx.stroke();
  // Líneas discontinuas de la carretera
  ctx.strokeStyle = "#d0d1c2";
  ctx.lineWidth = 2;
  ctx.setLineDash([14,15]);
  ellipsePath(ROAD_RX,ROAD_RY); ctx.stroke();
  ctx.setLineDash([]);
  // Línea de salida en la parte superior
  const sx=CX, sy=CY-ROAD_RY;
  const tile=10;
  for (let row=0; row<4; row++) {
    for (let col=-3; col<=3; col++) {
      ctx.fillStyle=(row+col+20)%2===0?"#fff":"#151820";
      ctx.fillRect(sx+col*tile,sy-20+row*tile,tile,tile);
    }
  }
  // Decoración: conos alrededor del circuito
  for (let i=0;i<36;i++) {
    const a=(i/36)*Math.PI*2;
    const x=CX+Math.cos(a)*(OUT_RX+17);
    const y=CY+Math.sin(a)*(OUT_RY+17);
    ctx.fillStyle="#ffb341";
    ctx.fillRect(x-3,y-3,7,7);
    ctx.fillStyle="#fff1c4";
    ctx.fillRect(x-2,y-3,4,2);
  }
  // Centro del circuito
  ctx.fillStyle="#183d2c";
  ctx.font="bold 20px monospace";
  ctx.textAlign="center";
  ctx.fillText("PIXEL",CX,CY-8);
  ctx.fillText("CIRCUIT",CX,CY+18);
  ctx.fillStyle="#8dc9a0";
  ctx.font="10px monospace";
  ctx.fillText("ARCADE GRAND PRIX",CX,CY+39);
}
function drawCar(p) {
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.rotate(p.angle || 0);
  // Sombra
  ctx.fillStyle="#0007";
  ctx.fillRect(-10,-4,26,17);
  // Ruedas
  ctx.fillStyle="#15171b";
  ctx.fillRect(-9,-12,8,7);
  ctx.fillRect(6,-12,8,7);
  ctx.fillRect(-9,7,8,7);
  ctx.fillRect(6,7,8,7);
  // Carrocería
  ctx.fillStyle=p.color || "#ff4e45";
  ctx.fillRect(-11,-13,23,28);
  ctx.fillStyle="#ffffff";
  ctx.fillRect(-7,-11,15,3);
  // Parabrisas y techo
  ctx.fillStyle="#a5eaff";
  ctx.fillRect(-7,-5,15,8);
  ctx.fillStyle="#27384a";
  ctx.fillRect(-6,-4,13,6);
  // Alerón
  ctx.fillStyle="#202631";
  ctx.fillRect(-12,10,25,4);
  // Faros
  ctx.fillStyle="#fff6b5";
  ctx.fillRect(-9,-14,5,3);
  ctx.fillRect(5,-14,5,3);
  // Nombre del jugador
  ctx.restore();
  ctx.save();
  ctx.font="bold 10px monospace";
  ctx.textAlign="center";
  ctx.fillStyle="#000b";
  ctx.fillText(p.name || "Piloto",p.x+1,p.y-22+1);
  ctx.fillStyle=p.id===myId?"#ffffff":"#dce7ef";
  ctx.fillText(p.name || "Piloto",p.x,p.y-22);
  ctx.restore();
}
function addParticles() {
  if (!myPlayer || !(input.down || input.left || input.right) || (myPlayer.speed||0)<1.1) return;
  if (Math.random()>.65) {
    const a=myPlayer.angle||0;
    particles.push({
      x:myPlayer.x-Math.cos(a)*12+(Math.random()-.5)*8,
      y:myPlayer.y-Math.sin(a)*12+(Math.random()-.5)*8,
      life:1, size:2+Math.random()*3
    });
  }
}
function drawParticles(dt) {
  particles.forEach(p => {
    p.life-=dt*1.5;
    p.x+=Math.sin(p.x)*dt*8;
    p.y+=dt*7;
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle="#e4e4d4";
    ctx.fillRect(p.x,p.y,p.size,p.size);
  });
  ctx.globalAlpha=1;
  particles=particles.filter(p=>p.life>0);
}
function render(now) {
  const dt=Math.min(.05,(now-lastFrame)/1000);
  lastFrame=now;
  ctx.clearRect(0,0,W,H);
  drawTrack();
  addParticles();
  drawParticles(dt);
  players.forEach(drawCar);
  if (myPlayer && input.boost && (myPlayer.speed||0)>1) {
    ctx.save();
    ctx.globalAlpha=.8;
    ctx.fillStyle="#ffe36e";
    const a=myPlayer.angle||0;
    for(let i=0;i<4;i++){
      ctx.fillRect(myPlayer.x-Math.cos(a)*(15+i*5)-2,myPlayer.y-Math.sin(a)*(15+i*5)-2,4,4);
    }
    ctx.restore();
  }
  const elapsed = raceStart ? Math.max(0,(Date.now()-raceStart)/1000) : 0;
  const mins=String(Math.floor(elapsed/60)).padStart(2,"0");
  const secs=String(Math.floor(elapsed%60)).padStart(2,"0");
  const tenths=Math.floor(elapsed%1*10);
  $("timerDisplay").textContent=`${mins}:${secs}.${tenths}`;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
