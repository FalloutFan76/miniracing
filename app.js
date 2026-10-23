
"use strict";

// 1. CONFIGURACIÓN
// Pondremos aquí la URL real del servidor cuando lo publiquemos.
const SERVER_URL = "https://TU-SERVIDOR.onrender.com";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const statusText = document.getElementById("connectionStatus");
const statusDot = document.getElementById("statusDot");
const message = document.getElementById("gameMessage");
const joinButton = document.getElementById("joinButton");
const nameInput = document.getElementById("playerName");
const overlay = document.getElementById("gameOverlay");
const playerCount = document.getElementById("playerCount");
const lapDisplay = document.getElementById("lapDisplay");
const positionDisplay = document.getElementById("positionDisplay");
const leaderboard = document.getElementById("leaderboardList");

document.getElementById("year").textContent = new Date().getFullYear();

// 2. ESTADO DEL JUEGO
const W = canvas.width;
const H = canvas.height;

let socket = null;
let connected = false;
let joined = false;
let myId = null;
let players = [];
let raceMessage = "";
let lastSent = 0;

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

const COLORS = [
  "#ff4e45", "#40d9ff", "#ffe05a", "#c68aff",
  "#63f58a", "#ff9f43", "#f4f5f7", "#ff72b6"
];

// 3. CIRCUITO TOP-DOWN
// La pista es un óvalo con bordes pixelados.
const track = {
  cx: 480,
  cy: 320,
  outerRx: 365,
  outerRy: 270,
  innerRx: 205,
  innerRy: 120
};

function ellipsePath(rx, ry) {
  ctx.beginPath();
  ctx.ellipse(track.cx, track.cy, rx, ry, 0, 0, Math.PI * 2);
}

function drawTrack() {
  // Césped
  ctx.fillStyle = "#287a3d";
  ctx.fillRect(0, 0, W, H);

  // Patrón pixelado en el césped
  for (let y = 10; y < H; y += 28) {
    for (let x = 10; x < W; x += 28) {
      if ((Math.floor(x / 28) + Math.floor(y / 28)) % 2 === 0) {
        ctx.fillStyle = "#308747";
        ctx.fillRect(x, y, 12, 12);
      }
    }
  }

  // Exterior de la pista
  ctx.fillStyle = "#f2eee0";
  ellipsePath(track.outerRx + 12, track.outerRy + 12);
  ctx.fill();

  // Bordillo rojo
  ctx.fillStyle = "#e94843";
  ellipsePath(track.outerRx + 5, track.outerRy + 5);
  ctx.fill();

  // Asfalto
  ctx.fillStyle = "#454d58";
  ellipsePath(track.outerRx - 8, track.outerRy - 8);
  ctx.fill();

  // Interior del circuito
  ctx.fillStyle = "#f2eee0";
  ellipsePath(track.innerRx + 9, track.innerRy + 9);
  ctx.fill();

  ctx.fillStyle = "#e94843";
  ellipsePath(track.innerRx + 3, track.innerRy + 3);
  ctx.fill();

  ctx.fillStyle = "#287a3d";
  ellipsePath(track.innerRx - 7, track.innerRy - 7);
  ctx.fill();

  // Línea discontinua de la trayectoria
  ctx.strokeStyle = "#f8e9a4";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 17]);
  ellipsePath(
    (track.outerRx + track.innerRx) / 2,
    (track.outerRy + track.innerRy) / 2
  );
  ctx.stroke();
  ctx.setLineDash([]);

  // Línea de salida
  drawFinishLine(480 + track.outerRx * 0.01, 0);
}

function drawFinishLine() {
  const x = track.cx;
  const y = track.cy - track.outerRy + 18;
  const size = 10;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 7; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#fff" : "#111820";
      ctx.fillRect(x - 35 + col * size, y + row * size, size, size);
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText("START", x, y + 58);
}

// 4. COCHES PIXEL ART
function drawCar(player, isMe) {
  const x = player.x;
  const y = player.y;
  const angle = player.angle || 0;
  const color = player.color || COLORS[0];

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Sombra
  ctx.fillStyle = "#14201c";
  ctx.fillRect(-12 + 3, -20 + 4, 24, 40);

  // Ruedas
  ctx.fillStyle = "#11151b";
  ctx.fillRect(-15, -15, 5, 11);
  ctx.fillRect(10, -15, 5, 11);
  ctx.fillRect(-15, 6, 5, 11);
  ctx.fillRect(10, 6, 5, 11);

  // Carrocería
  ctx.fillStyle = "#111820";
  ctx.fillRect(-12, -21, 24, 42);
  ctx.fillStyle = color;
  ctx.fillRect(-10, -19, 20, 38);
  ctx.fillRect(-7, -23, 14, 5);
  ctx.fillRect(-7, 18, 14, 4);

  // Parabrisas
  ctx.fillStyle = "#a8efff";
  ctx.fillRect(-7, -12, 14, 9);
  ctx.fillRect(-6, -11, 5, 7);
  ctx.fillRect(2, -11, 4, 7);

  // Ventana trasera
  ctx.fillStyle = "#243b4b";
  ctx.fillRect(-6, 7, 12, 6);

  // Luces
  ctx.fillStyle = "#fff2b0";
  ctx.fillRect(-9, -19, 5, 3);
  ctx.fillRect(4, -19, 5, 3);
  ctx.fillStyle = "#ff334f";
  ctx.fillRect(-9, 16, 5, 3);
  ctx.fillRect(4, 16, 5, 3);

  // Franja central
  ctx.fillStyle = isMe ? "#ffffff" : "#202c36";
  ctx.fillRect(-2, -1, 4, 7);

  ctx.restore();

  // Nombre del piloto
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#101820";
  ctx.fillText(player.name || "Piloto", x + 1, y - 27 + 1);
  ctx.fillStyle = isMe ? "#fff16a" : "#ffffff";
  ctx.fillText(player.name || "Piloto", x, y - 27);
}

function drawPlayers() {
  // Dibujamos primero los rivales y al final nuestro coche
  for (const player of players) {
    if (player.id !== myId) drawCar(player, false);
  }

  const me = players.find(p => p.id === myId);
  if (me) drawCar(me, true);
}

// 5. CLASIFICACIÓN EN DIRECTO
function updateLeaderboard(list) {
  const sorted = [...list].sort((a, b) => {
    const lapDifference = (b.lap || 0) - (a.lap || 0);
    if (lapDifference !== 0) return lapDifference;
    return (b.progress || 0) - (a.progress || 0);
  });

  leaderboard.replaceChildren();

  if (!sorted.length) {
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent = "Esperando pilotos...";
    leaderboard.appendChild(li);
    return;
  }

  sorted.slice(0, 12).forEach((player, index) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "driver-name";
    name.textContent = `${index + 1}. ${player.name || "Piloto"}`;

    const score = document.createElement("span");
    score.className = "driver-score";
    score.textContent = `Vuelta ${player.lap || 0}`;

    li.append(name, score);
    leaderboard.appendChild(li);
  });

  const myPosition = sorted.findIndex(p => p.id === myId);
  positionDisplay.textContent = myPosition >= 0 ? `${myPosition + 1}º` : "—";

  const me = sorted.find(p => p.id === myId);
  if (me) lapDisplay.textContent = `${me.lap || 0}/3`;
}

// 6. CONEXIÓN MULTIJUGADOR
function setConnection(isConnected, text) {
  connected = isConnected;
  statusText.textContent = text;
  statusDot.classList.toggle("connected", isConnected);
  statusDot.classList.toggle("disconnected", !isConnected);
  joinButton.disabled = !isConnected;
}

function connectToServer() {
  if (!window.io) {
    setConnection(false, "Socket.IO no cargó");
    message.textContent = "Comprueba tu conexión a internet y recarga la página.";
    return;
  }

  if (SERVER_URL.includes("TU-SERVIDOR")) {
    setConnection(false, "Servidor pendiente");
    message.textContent =
      "La pista está lista. Falta publicar el servidor multijugador y poner su URL aquí.";
    draw();
    return;
  }

  socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    timeout: 10000
  });

  socket.on("connect", () => {
    setConnection(true, "Servidor conectado");
    message.textContent = "Conectado. ¡Escribe tu nombre y pulsa JUGAR!";
  });

  socket.on("disconnect", () => {
    setConnection(false, "Reconectando...");
    joined = false;
    overlay.classList.remove("hidden");
    message.textContent = "Se perdió la conexión con la carrera.";
  });

  socket.on("connect_error", () => {
    setConnection(false, "Sin conexión");
    message.textContent = "No se pudo conectar. El servidor podría estar iniciándose.";
  });

  // El servidor nos asigna nuestro identificador y estado inicial
  socket.on("welcome", data => {
    myId = data.id;
  });

  // El servidor envía el estado compartido de la carrera
  socket.on("state", data => {
    if (!data || !Array.isArray(data.players)) return;

    players = data.players;
    playerCount.textContent = players.length;
    updateLeaderboard(players);
    draw();
  });

  socket.on("raceMessage", text => {
    raceMessage = String(text).slice(0, 100);
    message.textContent = raceMessage;
  });
}

joinButton.addEventListener("click", () => {
  if (!connected || !socket) {
    message.textContent = "Todavía no hay conexión con el servidor.";
    return;
  }

  const name = nameInput.value.trim().slice(0, 16) || "Piloto";

  socket.emit("joinRace", { name });
  joined = true;
  overlay.classList.add("hidden");
  message.textContent = "¡Estás en la pista! Usa WASD o las flechas.";
  nameInput.value = name;
  nameInput.blur();
});

// 7. CONTROLES
function setKey(key, pressed) {
  keys[key] = pressed;
}

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const map = {
    arrowup: "up", w: "up",
    arrowdown: "down", s: "down",
    arrowleft: "left", a: "left",
    arrowright: "right", d: "right"
  };

  if (map[key]) {
    event.preventDefault();
    setKey(map[key], true);
  }
});

window.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();
  const map = {
    arrowup: "up", w: "up",
    arrowdown: "down", s: "down",
    arrowleft: "left", a: "left",
    arrowright: "right", d: "right"
  };

  if (map[key]) setKey(map[key], false);
});

window.addEventListener("blur", () => {
  Object.keys(keys).forEach(key => keys[key] = false);
});

function bindHoldButton(id, key) {
  const button = document.getElementById(id);

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setKey(key, true);
  });

  const release = () => setKey(key, false);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

bindHoldButton("leftButton", "left");
bindHoldButton("rightButton", "right");
bindHoldButton("accelerateButton", "up");
bindHoldButton("brakeButton", "down");

// Enviamos los controles al servidor, que será quien valide y mueva a cada piloto.
setInterval(() => {
  if (!connected || !joined || !socket) return;

  const now = performance.now();
  if (now - lastSent < 40) return;
  lastSent = now;

  socket.emit("input", {
    up: keys.up,
    down: keys.down,
    left: keys.left,
    right: keys.right
  });
}, 40);

// 8. DIBUJO Y ANIMACIÓN
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawTrack();
  drawPlayers();
}

function idleAnimation() {
  draw();
  requestAnimationFrame(idleAnimation);
}

draw();
idleAnimation();
connectToServer();
