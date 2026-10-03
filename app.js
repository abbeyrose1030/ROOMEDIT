import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MAIN_W = 9.25;
const SIDE_W = 3.25;
const TOTAL_W = MAIN_W + SIDE_W;
const ROOM_D = 7.5;
const WALL_H = 2.62;
const WALL_T = 0.16;
const GRID = 0.25;

const stage = document.getElementById("stage");
const canvas = document.getElementById("view");
const listEl = document.getElementById("piece-list");
const dock = document.getElementById("dock");
const hint = document.getElementById("hint");
const selName = document.getElementById("sel-name");
const selAngle = document.getElementById("sel-angle");
const undoBtn = document.getElementById("undo");
const snapBtn = document.getElementById("snap");
const photosBtn = document.getElementById("photos");
const refPanel = document.getElementById("refpanel");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3ddd4);

const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 90);
camera.position.set(9.4, 12.6, 17.4);

const controls = new OrbitControls(camera, canvas);
controls.target.set(5.65, 0.4, 3.55);
controls.enableDamping = !reduceMotion;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.08;
controls.minDistance = 4;
controls.maxDistance = 26;
controls.zoomToCursor = true;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;
scene.environmentIntensity = 0.42;
pmrem.dispose();

const mats = new Map();
function std(color, roughness = 0.7, metalness = 0) {
  const key = `${color}:${roughness}:${metalness}`;
  let mat = mats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    mats.set(key, mat);
  }
  return mat;
}

function rbox(w, h, d, radius = 0.04, segments = 3) {
  const maxR = Math.min(w, h, d) / 2 - 0.001;
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.max(0.001, maxR)));
}

function addMesh(group, geometry, material, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

function finish(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData.noShadow) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  return group;
}

function proxy(group, w, h, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  mesh.position.y = h / 2;
  mesh.userData.noShadow = true;
  group.add(mesh);
}

function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const tones = ["#d1985c", "#c4844a", "#e0a86a", "#b8743a", "#cd8d50", "#a86c34"];
  const plank = 64;
  for (let y = 0, i = 0; y < 512; y += plank, i++) {
    const n = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(0, y, 512, plank - 2);
    ctx.fillStyle = "rgba(90, 42, 12, 0.05)";
    ctx.fillRect(0, y, 512, plank - 2);
    ctx.strokeStyle = "rgba(80, 40, 12, 0.13)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      const yy = y + 8 + g * 10 + n * 4;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(140, yy + 3, 320, yy - 3, 512, yy + 1);
      ctx.stroke();
    }
    if (i % 2 === 0) {
      const joint = 80 + n * 340;
      ctx.strokeStyle = "rgba(70, 36, 10, 0.18)";
      ctx.beginPath();
      ctx.moveTo(joint, y + 1);
      ctx.lineTo(joint + 2, y + plank - 3);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.repeat.set(TOTAL_W / 1.55, ROOM_D / 1.15);
  return tex;
}

function rugTexture(base, border) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 16;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 200, 200);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function artTexture(colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 168;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, 128, 168);
  colors.slice(1).forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect((i * 29) % 88, (i * 37) % 110, 36 + (i % 3) * 16, 24 + (i % 4) * 14);
  });
  ctx.fillStyle = colors[colors.length - 1];
  ctx.beginPath();
  ctx.arc(78, 58, 18, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function tapestryTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 140;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  ["#2a6d8c", "#3c8f86", "#d24b45", "#e3b23c", "#1e5674"].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * 28, 0, 28, 200);
  });
  ctx.fillStyle = "#163e52";
  ctx.beginPath();
  ctx.ellipse(46, 78, 32, 46, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ef8a45";
  ctx.beginPath();
  ctx.ellipse(96, 124, 24, 32, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2d78a";
  ctx.fillRect(18, 150, 34, 18);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function screenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  const grd = ctx.createLinearGradient(0, 0, 256, 160);
  grd.addColorStop(0, "#243044");
  grd.addColorStop(1, "#141b28");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#31493f";
  ctx.fillRect(18, 20, 148, 96);
  ctx.fillStyle = "#9fd8cb";
  ctx.fillRect(28, 78, 72, 8);
  ctx.fillStyle = "#e7c15a";
  ctx.fillRect(28, 92, 42, 8);
  ctx.fillStyle = "#1a1f2b";
  ctx.fillRect(178, 20, 60, 120);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floorMap = woodTexture();
const blueRugMap = rugTexture("#4e82a3", "#3a627c");
const grayRugMap = rugTexture("#8a847c", "#5c574f");
const screenMap = screenTexture();
const screenMat = new THREE.MeshStandardMaterial({
  map: screenMap,
  roughness: 0.32,
  metalness: 0.08,
  emissive: 0x101820,
  emissiveIntensity: 0.45,
});

const yellow = std(0xf0c31d, 0.84);
const yellowDeep = std(0xd9aa12, 0.86);
const black = std(0x1c1c1c, 0.55, 0.08);
const white = std(0xf5f2ec, 0.86);
const deskWood = std(0x4a3018, 0.62, 0.04);
const standWood = std(0x8a7260, 0.7, 0.04);
const steel = new THREE.MeshPhysicalMaterial({
  color: 0xc5ccd1,
  metalness: 0.86,
  roughness: 0.24,
  clearcoat: 0.35,
  clearcoatRoughness: 0.35,
});
const fridgeBlack = std(0x242424, 0.46, 0.2);
const plantGreen = std(0x3e7a45, 0.75);
const plantDark = std(0x2d5a34, 0.8);

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0xcbbfaa, 0.72));
  scene.add(new THREE.AmbientLight(0xfff8f0, 0.28));

  const key = new THREE.DirectionalLight(0xfff4e8, 3.15);
  key.position.set(-3.5, 14.5, 11.5);
  key.target.position.set(6, 0, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 42;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.035;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xdfe7f2, 0.85);
  fill.position.set(12, 8, 6);
  scene.add(fill);
}

function buildRoom() {
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorMap,
    roughness: 0.88,
    metalness: 0.02,
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(TOTAL_W, ROOM_D), floorMat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(TOTAL_W / 2, 0.002, ROOM_D / 2);
  top.receiveShadow = true;
  scene.add(top);

  const base = addMesh(
    scene,
    new THREE.BoxGeometry(TOTAL_W, 0.28, ROOM_D),
    std(0xc48a4e, 0.8),
    TOTAL_W / 2,
    -0.141,
    ROOM_D / 2
  );
  base.castShadow = true;

  const plinth = addMesh(
    scene,
    new THREE.BoxGeometry(TOTAL_W + 0.5, 0.08, ROOM_D + 0.5),
    std(0xd4cdc2, 0.94),
    TOTAL_W / 2,
    -0.32,
    ROOM_D / 2,
    false
  );
  plinth.receiveShadow = true;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0xe3ddd4, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.37;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = std(0xf6f3ee, 0.92);
  addMesh(scene, new THREE.BoxGeometry(WALL_T, WALL_H, ROOM_D + WALL_T), wallMat, -WALL_T / 2, WALL_H / 2, ROOM_D / 2);
  addMesh(
    scene,
    new THREE.BoxGeometry(TOTAL_W + WALL_T * 2, WALL_H, WALL_T),
    wallMat,
    TOTAL_W / 2,
    WALL_H / 2,
    -WALL_T / 2
  );
  addMesh(
    scene,
    new THREE.BoxGeometry(WALL_T, WALL_H, ROOM_D + WALL_T),
    wallMat,
    TOTAL_W + WALL_T / 2,
    WALL_H / 2,
    ROOM_D / 2
  );

  const half = addMesh(
    scene,
    new THREE.BoxGeometry(0.12, 1.16, 3.7),
    wallMat,
    MAIN_W,
    0.58,
    4.85
  );
  half.name = "halfwall";

  const board = std(0xe7e1d8, 0.9);
  addMesh(scene, new THREE.BoxGeometry(0.02, 0.08, ROOM_D), board, 0.01, 0.04, ROOM_D / 2, false);
  addMesh(scene, new THREE.BoxGeometry(TOTAL_W, 0.08, 0.02), board, TOTAL_W / 2, 0.04, 0.01, false);

  buildWindow(1.4, 1.82, 0.045, 1.7, 1.05, 0);
  buildWindow(TOTAL_W - 0.045, 1.7, 2.15, 0.85, 1.15, -Math.PI / 2);
  buildWindow(TOTAL_W - 0.045, 1.55, 5.35, 0.7, 0.9, -Math.PI / 2);

  const glassLight = new THREE.PointLight(0xd9ecff, 4, 5.5, 2);
  glassLight.position.set(1.4, 1.7, 0.55);
  scene.add(glassLight);

  buildDressing();
}

function buildWindow(x, y, z, w, h, rotY) {
  const g = new THREE.Group();
  const frame = std(0xfbf9f6, 0.7);
  addMesh(g, new THREE.BoxGeometry(w + 0.08, 0.06, 0.05), frame, 0, h / 2, 0, false);
  addMesh(g, new THREE.BoxGeometry(w + 0.08, 0.06, 0.05), frame, 0, -h / 2, 0, false);
  addMesh(g, new THREE.BoxGeometry(0.06, h, 0.05), frame, -w / 2, 0, 0, false);
  addMesh(g, new THREE.BoxGeometry(0.06, h, 0.05), frame, w / 2, 0, 0, false);
  const glass = addMesh(
    g,
    new THREE.PlaneGeometry(w - 0.02, h - 0.02),
    new THREE.MeshBasicMaterial({ color: 0xc5d7e6 }),
    0,
    0,
    0.01,
    false
  );
  glass.userData.noShadow = true;
  const slats = Math.max(5, Math.round(h / 0.12));
  for (let i = 0; i < slats; i++) {
    const yy = -h / 2 + 0.08 + i * ((h - 0.12) / slats);
    addMesh(g, new THREE.BoxGeometry(w - 0.08, 0.018, 0.012), std(0xf7f7f4, 0.6), 0, yy, 0.03, false);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
}

function addFrame(x, y, z, w, h, rotY, colors) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(w, h, 0.025), std(0xf7f4ef, 0.72), 0, 0, 0);
  const pic = addMesh(
    g,
    new THREE.PlaneGeometry(w - 0.05, h - 0.05),
    new THREE.MeshStandardMaterial({ map: artTexture(colors), roughness: 0.86 }),
    0,
    0,
    0.02,
    false
  );
  pic.userData.noShadow = true;
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
}

function buildDressing() {
  addFrame(0.03, 1.85, 5.9, 0.28, 0.34, Math.PI / 2, ["#d7c4a8", "#8e4d45", "#24485f", "#e6d3a1"]);
  addFrame(0.03, 1.72, 5.45, 0.22, 0.26, Math.PI / 2, ["#ece7df", "#355f7a", "#c9864a"]);
  addFrame(0.03, 1.45, 6.25, 0.24, 0.3, Math.PI / 2, ["#f3efe6", "#6d8a4e", "#2c2c2c"]);
  addFrame(0.03, 2.05, 4.55, 0.34, 0.26, Math.PI / 2, ["#1f3d55", "#d8e4ea", "#c45c4a"]);
  addFrame(0.03, 1.55, 3.55, 0.26, 0.32, Math.PI / 2, ["#e7d7c3", "#35506a", "#f0c21a"]);
  addFrame(4.7, 1.7, 0.03, 0.7, 1.15, 0, ["#245c78", "#3d8b7a", "#d64545", "#e2b33a"]);

  const tapestry = addMesh(
    scene,
    new THREE.PlaneGeometry(0.95, 1.35),
    new THREE.MeshStandardMaterial({ map: tapestryTexture(), roughness: 0.9 }),
    5.55,
    1.55,
    0.03,
    false
  );
  tapestry.userData.noShadow = true;

  const shelfMat = std(0xb7b8bc, 0.45, 0.35);
  for (const shelf of [
    { y: 1.55, z: 6.15, len: 1.15 },
    { y: 2.05, z: 4.9, len: 1.35 },
  ]) {
    addMesh(scene, new THREE.BoxGeometry(0.16, 0.025, shelf.len), shelfMat, 0.08, shelf.y, shelf.z);
    let cursor = shelf.z - shelf.len / 2 + 0.08;
    for (let i = 0; i < 7; i++) {
      const bw = 0.035 + (i % 3) * 0.01;
      const bh = 0.16 + (i % 4) * 0.02;
      const colors = [0xc45c4a, 0x355f7a, 0xe6d7b8, 0x2f2f2f, 0xd7b15e, 0x6d8a4e];
      addMesh(scene, new THREE.BoxGeometry(0.12, bh, bw), std(colors[i % colors.length], 0.8), 0.08, shelf.y + bh / 2 + 0.02, cursor, false);
      cursor += bw + 0.02;
    }
  }

  const pot = addMesh(scene, new THREE.CylinderGeometry(0.07, 0.06, 0.08, 12), std(0xefeae2, 0.7), 0.1, 1.64, 5.55);
  pot.scale.set(1, 1, 1);
  const leaf = addMesh(scene, new THREE.SphereGeometry(0.1, 12, 10), plantGreen, 0.1, 1.78, 5.55, false);
  leaf.scale.set(1, 0.7, 1);

  const hang = new THREE.Group();
  addMesh(hang, new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), std(0xc8b8a2, 0.7), 0, 2.15, 0, false);
  addMesh(hang, new THREE.CylinderGeometry(0.09, 0.07, 0.1, 12), std(0xefeae2, 0.7), 0, 1.75, 0);
  const hp = addMesh(hang, new THREE.SphereGeometry(0.16, 12, 10), plantDark, 0, 1.92, 0, false);
  hp.scale.set(1.1, 0.6, 1.1);
  hang.position.set(6.7, 0, 0.28);
  scene.add(hang);

  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const z = 3.15 + i * 0.24;
    const sag = Math.sin((i / 14) * Math.PI) * 0.06;
    pts.push(new THREE.Vector3(MAIN_W, 1.2 - sag, z));
  }
  const wire = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x3a342c })
  );
  scene.add(wire);
  pts.forEach((p, i) => {
    const bulb = addMesh(
      scene,
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd089 : 0xfff3cf }),
      p.x,
      p.y,
      p.z,
      false
    );
    bulb.userData.noShadow = true;
  });

  const chand = new THREE.Group();
  addMesh(chand, new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8), std(0xb9a27a, 0.4, 0.6), 0, 2.35, 0, false);
  addMesh(chand, new THREE.TorusGeometry(0.28, 0.015, 8, 24), std(0xd4b36a, 0.35, 0.7), 0, 2.08, 0, false).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bulb = addMesh(
      chand,
      new THREE.SphereGeometry(0.045, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe1a8 }),
      Math.cos(a) * 0.28,
      2.02,
      Math.sin(a) * 0.28,
      false
    );
    bulb.userData.noShadow = true;
  }
  chand.position.set(MAIN_W + 1.7, 0, 3.3);
  scene.add(chand);
  const warm = new THREE.PointLight(0xffc58a, 10, 7, 2);
  warm.position.set(MAIN_W + 1.7, 2.0, 3.3);
  scene.add(warm);
}

function makeSofa() {
  const g = new THREE.Group();
  const w = 2.35;
  addMesh(g, rbox(w - 0.08, 0.22, 0.78, 0.04), yellowDeep, 0, 0.13, 0);
  addMesh(g, rbox(w - 0.12, 0.42, 0.14, 0.04), yellowDeep, 0, 0.48, -0.34);
  for (const x of [-0.74, 0, 0.74]) {
    addMesh(g, rbox(0.7, 0.16, 0.62, 0.05, 4), yellow, x, 0.32, 0.06);
    addMesh(g, rbox(0.7, 0.4, 0.16, 0.05, 4), yellow, x, 0.64, -0.3);
  }
  for (const x of [-1.12, 1.12]) {
    addMesh(g, rbox(0.16, 0.36, 0.8, 0.05), yellowDeep, x, 0.34, 0);
  }
  return finish(g);
}

function makeTV() {
  const g = new THREE.Group();
  addMesh(g, rbox(1.5, 0.08, 0.46, 0.02), standWood, 0, 0.28, 0);
  addMesh(g, new THREE.BoxGeometry(1.42, 0.36, 0.4), standWood, 0, 0.2, 0);
  addMesh(g, new THREE.BoxGeometry(0.02, 0.28, 0.36), std(0x6e5a4a, 0.7), -0.46, 0.2, 0.01, false);
  addMesh(g, new THREE.BoxGeometry(0.02, 0.28, 0.36), std(0x6e5a4a, 0.7), 0.46, 0.2, 0.01, false);
  const bookColors = [0xc45c4a, 0x355f7a, 0xe6d7b8, 0x2f2f2f, 0xd7b15e, 0x6d8a4e, 0x8d4a62];
  let cursor = -0.62;
  for (let i = 0; i < 14; i++) {
    const bw = 0.03 + (i % 3) * 0.008;
    addMesh(g, new THREE.BoxGeometry(bw, 0.22, 0.18), std(bookColors[i % bookColors.length], 0.8), cursor, 0.16, 0.08, false);
    cursor += bw + 0.006;
  }
  addMesh(g, rbox(1.28, 0.76, 0.05, 0.02), black, 0, 0.86, 0);
  const screen = addMesh(g, new THREE.PlaneGeometry(1.16, 0.64), screenMat, 0, 0.86, 0.028, false);
  screen.userData.noShadow = true;
  const led = addMesh(
    g,
    new THREE.PlaneGeometry(1.2, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x3d8cff, side: THREE.DoubleSide }),
    0,
    0.86,
    -0.05,
    false
  );
  led.rotation.y = Math.PI;
  led.userData.noShadow = true;
  const glow = new THREE.PointLight(0x4aa3ff, 6, 3.8, 2);
  glow.position.set(0, 0.7, -0.2);
  g.add(glow);
  return finish(g);
}

function makeBookshelf() {
  const g = new THREE.Group();
  const W = 0.74;
  const H = 1.02;
  const D = 0.32;
  const t = 0.034;
  addMesh(g, new THREE.BoxGeometry(W, H, 0.02), white, 0, H / 2, -D / 2 + 0.01);
  addMesh(g, new THREE.BoxGeometry(t, H, D), white, -W / 2 + t / 2, H / 2, 0);
  addMesh(g, new THREE.BoxGeometry(t, H, D), white, W / 2 - t / 2, H / 2, 0);
  addMesh(g, new THREE.BoxGeometry(W, t, D), white, 0, t / 2, 0);
  addMesh(g, new THREE.BoxGeometry(W, t, D), white, 0, H - t / 2, 0);
  for (const y of [H / 3, (H * 2) / 3]) {
    addMesh(g, new THREE.BoxGeometry(W - t * 2, t, D), white, 0, y, 0);
  }
  addMesh(g, new THREE.BoxGeometry(t, H - t * 2, D - 0.02), white, 0, H / 2, 0.01);
  const colors = [0xc45c4a, 0x355f7a, 0xe6d7b8, 0x2f2f2f, 0xd7b15e, 0x6d8a4e, 0x8d4a62, 0xdec27a];
  const cubbies = [
    [-0.18, 0.18],
    [0.18, 0.18],
    [-0.18, 0.52],
    [0.18, 0.52],
    [-0.18, 0.84],
  ];
  cubbies.forEach(([x, y], index) => {
    let cursor = x - 0.12;
    const count = 4 + (index % 2);
    for (let i = 0; i < count; i++) {
      const bw = 0.028;
      const bh = 0.2 - (i % 3) * 0.012;
      addMesh(g, new THREE.BoxGeometry(bw, bh, 0.2), std(colors[(i + index) % colors.length], 0.8), cursor, y + bh / 2, 0.02, false);
      cursor += bw + 0.004;
    }
  });
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.05, 0.07, 10), std(0xefeae2, 0.7), 0.18, H + 0.035, 0);
  const sprout = addMesh(g, new THREE.SphereGeometry(0.09, 10, 8), plantGreen, 0.18, H + 0.12, 0, false);
  sprout.scale.set(1, 0.75, 1);
  return finish(g);
}

function makeDesk() {
  const g = new THREE.Group();
  const topY = 0.74;
  for (const [x, z] of [
    [-0.7, -0.28],
    [0.7, -0.28],
    [-0.7, 0.28],
    [0.7, 0.28],
  ]) {
    addMesh(g, new THREE.BoxGeometry(0.05, 0.7, 0.05), black, x, 0.35, z);
  }
  addMesh(g, rbox(1.6, 0.05, 0.72, 0.015), deskWood, 0, topY, 0);
  addMesh(g, new THREE.BoxGeometry(0.48, 0.015, 0.16), std(0x2a2a2a, 0.6), 0.05, topY + 0.03, 0.16, false);
  const monitor = (x) => {
    addMesh(g, new THREE.BoxGeometry(0.06, 0.1, 0.06), black, x, topY + 0.08, -0.18);
    addMesh(g, rbox(0.52, 0.32, 0.03, 0.01), black, x, topY + 0.3, -0.18);
    const screen = addMesh(g, new THREE.PlaneGeometry(0.46, 0.26), screenMat, x, topY + 0.3, -0.15, false);
    screen.userData.noShadow = true;
  };
  monitor(-0.32);
  monitor(0.28);
  for (const x of [-0.72, 0.68]) {
    addMesh(g, rbox(0.16, 0.26, 0.16, 0.02), black, x, topY + 0.16, -0.16);
    const cone = addMesh(
      g,
      new THREE.CylinderGeometry(0.055, 0.055, 0.01, 16),
      std(0xdedede, 0.45),
      x,
      topY + 0.16,
      -0.075,
      false
    );
    cone.rotation.x = Math.PI / 2;
  }
  return finish(g);
}

function makeChair() {
  const g = new THREE.Group();
  const leather = std(0x1a1a1a, 0.58, 0.12);
  addMesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.28, 12), black, 0, 0.28, 0);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Group();
    addMesh(spoke, new THREE.BoxGeometry(0.035, 0.025, 0.28), black, 0, 0.08, 0.12);
    const wheel = addMesh(spoke, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), std(0x333333, 0.5), 0, 0.04, 0.26);
    wheel.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 5) * Math.PI * 2;
    g.add(spoke);
  }
  addMesh(g, rbox(0.5, 0.1, 0.5, 0.04, 4), leather, 0, 0.5, 0.02);
  const back = addMesh(g, rbox(0.48, 0.62, 0.08, 0.04, 4), leather, 0, 0.9, -0.2);
  back.rotation.x = 0.12;
  addMesh(g, rbox(0.28, 0.12, 0.08, 0.03), leather, 0, 1.22, -0.22);
  for (const x of [-0.28, 0.28]) {
    addMesh(g, new THREE.BoxGeometry(0.04, 0.16, 0.04), black, x, 0.58, 0.02);
    addMesh(g, rbox(0.06, 0.04, 0.28, 0.015), black, x, 0.66, 0.02);
  }
  proxy(g, 0.7, 1.3, 0.7);
  return finish(g);
}

function makeFridge() {
  const g = new THREE.Group();
  addMesh(g, rbox(0.56, 0.34, 0.58, 0.03), fridgeBlack, 0, 0.72, 0);
  addMesh(g, rbox(0.56, 0.5, 0.58, 0.03), steel, 0, 0.28, 0);
  addMesh(g, new THREE.BoxGeometry(0.28, 0.02, 0.03), std(0xd5d5d5, 0.3, 0.6), 0, 0.78, 0.3, false);
  addMesh(g, new THREE.BoxGeometry(0.28, 0.02, 0.03), std(0xbfc6cb, 0.3, 0.6), 0, 0.48, 0.3, false);
  return finish(g);
}

function makeRug(map, w, d) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = addMesh(g, new THREE.BoxGeometry(w, 0.02, d), mat, 0, 0.012, 0, false);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return finish(g);
}

function makeLamp() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), std(0xe4ddd2, 0.75), 0, 0.02, 0);
  const shade = addMesh(g, new THREE.CylinderGeometry(0.13, 0.15, 1.32, 24), std(0xf7f4ee, 0.78), 0, 0.7, 0);
  shade.castShadow = true;
  const cap = addMesh(
    g,
    new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff4e0 }),
    0,
    1.42,
    0,
    false
  );
  cap.userData.noShadow = true;
  const bulb = new THREE.PointLight(0xffe2b8, 3.5, 4.2, 2);
  bulb.position.y = 1.15;
  g.add(bulb);
  proxy(g, 0.4, 1.5, 0.4);
  return finish(g);
}

function makeGuitar(color, x, lean) {
  const gu = new THREE.Group();
  const body = addMesh(gu, new THREE.SphereGeometry(0.16, 18, 14), std(color, 0.52, 0.05), 0, 0.3, 0);
  body.scale.set(0.78, 1.15, 0.28);
  addMesh(gu, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), std(0x1a1a1a, 0.5), 0, 0.3, 0.05, false).rotation.x = Math.PI / 2;
  addMesh(gu, new THREE.BoxGeometry(0.04, 0.55, 0.025), std(0x2c241c, 0.6), 0, 0.74, 0);
  addMesh(gu, new THREE.BoxGeometry(0.08, 0.1, 0.02), std(0x2c241c, 0.6), 0, 1.04, 0);
  gu.position.set(x, 0, 0);
  gu.rotation.z = lean;
  gu.rotation.x = -0.08;
  return gu;
}

function makeGuitars() {
  const g = new THREE.Group();
  g.add(makeGuitar(0xc48a4a, -0.16, 0.14));
  g.add(makeGuitar(0x6d3d2e, 0.16, -0.12));
  proxy(g, 0.55, 1.15, 0.4);
  return finish(g);
}

function makeTurntable() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.04, 0.42, 0.04), black, -0.16, 0.21, -0.16);
  addMesh(g, new THREE.BoxGeometry(0.04, 0.42, 0.04), black, 0.16, 0.21, -0.16);
  addMesh(g, new THREE.BoxGeometry(0.04, 0.42, 0.04), black, -0.16, 0.21, 0.16);
  addMesh(g, new THREE.BoxGeometry(0.04, 0.42, 0.04), black, 0.16, 0.21, 0.16);
  addMesh(g, rbox(0.46, 0.035, 0.4, 0.01), standWood, 0, 0.44, 0);
  addMesh(g, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 24), black, 0, 0.47, 0);
  const label = addMesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), std(0xd64545, 0.5), 0, 0.485, 0, false);
  label.userData.noShadow = true;
  addMesh(g, new THREE.BoxGeometry(0.012, 0.012, 0.16), std(0x888, 0.4, 0.5), 0.08, 0.49, 0.02, false);
  return finish(g);
}

function makeMic() {
  const g = new THREE.Group();
  const metal = std(0x2a2a2a, 0.4, 0.45);
  for (let i = 0; i < 3; i++) {
    const leg = addMesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), metal, 0, 0.16, 0.16);
    leg.rotation.x = 0.55;
    leg.rotation.y = (i / 3) * Math.PI * 2;
  }
  addMesh(g, new THREE.CylinderGeometry(0.012, 0.012, 1.15, 8), metal, 0, 0.7, 0);
  addMesh(g, new THREE.CylinderGeometry(0.03, 0.035, 0.14, 12), black, 0, 1.28, 0.04);
  proxy(g, 0.46, 1.4, 0.46);
  return finish(g);
}

function makeBin() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.15, 0.12, 0.3, 18), black, 0, 0.16, 0);
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), std(0x111, 0.8), 0, 0.3, 0, false);
  proxy(g, 0.36, 0.36, 0.36);
  return finish(g);
}

function makePlant() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.1, 0.16, 14), std(0xefeae2, 0.72), 0, 0.1, 0);
  addMesh(g, new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14), std(0xe4ddd2, 0.7), 0, 0.19, 0, false);
  for (const [x, z, s, c] of [
    [0, 0, 1, plantGreen],
    [0.1, 0.06, 0.8, plantDark],
    [-0.09, 0.04, 0.7, plantGreen],
    [0.02, -0.1, 0.75, plantDark],
  ]) {
    const leaf = addMesh(g, new THREE.SphereGeometry(0.16, 12, 10), c, x, 0.38, z, false);
    leaf.scale.set(s, 0.55 * s, 0.8 * s);
  }
  return finish(g);
}

function makeRedChair() {
  const g = new THREE.Group();
  const red = std(0xc53636, 0.64);
  const leg = std(0x2a211c, 0.62);
  for (const [x, z] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ]) {
    const tall = z < 0;
    const h = tall ? 0.96 : 0.46;
    addMesh(g, new THREE.BoxGeometry(0.04, h, 0.04), tall ? red : leg, x, h / 2, z);
  }
  addMesh(g, rbox(0.46, 0.06, 0.44, 0.02), red, 0, 0.48, 0.01);
  addMesh(g, rbox(0.46, 0.42, 0.05, 0.02), red, 0, 0.74, -0.18);
  return finish(g);
}

const CATALOG = [
  { id: "sofa", name: "Yellow sofa", swatch: "#f0c31d", build: makeSofa, x: 5.85, z: 4.55, r: -Math.PI / 2, w: 2.35, d: 0.95 },
  { id: "tv", name: "TV console", swatch: "#222", build: makeTV, x: 0.5, z: 4.15, r: Math.PI / 2, w: 1.5, d: 0.5 },
  { id: "books", name: "Bookshelf", swatch: "#f4f2ee", build: makeBookshelf, x: 0.28, z: 6.15, r: Math.PI / 2, w: 0.74, d: 0.34 },
  { id: "desk", name: "Studio desk", swatch: "#4a3018", build: makeDesk, x: 1.7, z: 0.48, r: 0, w: 1.6, d: 0.75 },
  { id: "chair", name: "Gaming chair", swatch: "#1a1a1a", build: makeChair, x: 1.7, z: 1.55, r: Math.PI, w: 0.7, d: 0.7 },
  { id: "fridge", name: "Mini fridge", swatch: "#c5ccd1", build: makeFridge, x: 8.15, z: 4.7, r: -Math.PI / 2, w: 0.58, d: 0.6 },
  { id: "rug-blue", name: "Blue rug", swatch: "#4e82a3", build: () => makeRug(blueRugMap, 2.5, 1.9), x: 1.85, z: 1.25, r: 0, w: 2.5, d: 1.9 },
  { id: "rug-gray", name: "Gray rug", swatch: "#8a847c", build: () => makeRug(grayRugMap, 1.7, 1.15), x: 3.35, z: 4.45, r: 0, w: 1.7, d: 1.15 },
  { id: "lamp", name: "Floor lamp", swatch: "#f7f4ee", build: makeLamp, x: 3.55, z: 0.7, r: 0, w: 0.36, d: 0.36 },
  { id: "guitars", name: "Guitars", swatch: "#c48a4a", build: makeGuitars, x: 4.55, z: 0.42, r: 0.15, w: 0.55, d: 0.4 },
  { id: "turntable", name: "Turntable", swatch: "#8a7260", build: makeTurntable, x: 8.05, z: 6.25, r: 0.2, w: 0.48, d: 0.42 },
  { id: "mic", name: "Mic stand", swatch: "#2a2a2a", build: makeMic, x: 8.85, z: 6.45, r: 0, w: 0.46, d: 0.46 },
  { id: "bin", name: "Trash bin", swatch: "#1c1c1c", build: makeBin, x: 0.38, z: 2.7, r: 0, w: 0.34, d: 0.34 },
  { id: "plant", name: "Potted plant", swatch: "#3e7a45", build: makePlant, x: 7.15, z: 6.35, r: 0.4, w: 0.4, d: 0.4 },
  { id: "red", name: "Red chair", swatch: "#c53636", build: makeRedChair, x: 11.15, z: 5.15, r: -Math.PI / 2, w: 0.5, d: 0.5 },
];

const pieces = [];
const hitMeshes = [];

function spawnPieces() {
  for (const def of CATALOG) {
    const group = def.build();
    group.position.set(def.x, 0, def.z);
    group.rotation.y = def.r;
    group.userData = {
      id: def.id,
      name: def.name,
      w: def.w,
      d: def.d,
      home: { x: def.x, z: def.z, r: def.r },
    };
    scene.add(group);
    pieces.push(group);
    group.traverse((obj) => {
      if (obj.isMesh) hitMeshes.push(obj);
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "piece";
    btn.dataset.id = def.id;
    btn.setAttribute("role", "option");
    btn.innerHTML = `<span class="swatch" style="background:${def.swatch}"></span><span></span>`;
    btn.lastElementChild.textContent = def.name;
    btn.addEventListener("click", () => {
      const piece = pieces.find((item) => item.userData.id === def.id);
      select(piece);
    });
    listEl.appendChild(btn);
  }
}

const ringMat = new THREE.MeshBasicMaterial({
  color: 0xf0c31d,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthTest: true,
});
const hitRingMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const gizmo = new THREE.Group();
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 12, 64), ringMat);
ring.rotation.x = Math.PI / 2;
const hitRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 32), hitRingMat);
hitRing.rotation.x = Math.PI / 2;
const tickGroup = new THREE.Group();
const tick = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), ringMat);
tick.rotation.x = -Math.PI / 2;
tickGroup.add(tick);
gizmo.add(ring, hitRing, tickGroup);
gizmo.visible = false;
scene.add(gizmo);

let selected = null;
let snapOn = false;
const undoStack = [];
let beforePose = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let gesture = null;
let miss = false;
let moved = false;
let downX = 0;
let downY = 0;
let dragDX = 0;
let dragDZ = 0;
let rotStart = 0;
let angStart = 0;
const heldKeys = new Set();

const camAnim = { t: 1, fromP: new THREE.Vector3(), toP: new THREE.Vector3(), fromT: new THREE.Vector3(), toT: new THREE.Vector3() };

const PRESETS = {
  doll: { pos: [9.4, 12.6, 17.4], target: [5.65, 0.4, 3.55] },
  top: { pos: [5.7, 19.5, 4.05], target: [5.7, 0, 3.5] },
};

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function poseOf() {
  return pieces.map((piece) => ({
    id: piece.userData.id,
    x: piece.position.x,
    z: piece.position.z,
    r: piece.rotation.y,
  }));
}

function applyPose(pose) {
  for (const item of pose) {
    const piece = pieces.find((entry) => entry.userData.id === item.id);
    if (!piece) continue;
    piece.position.set(item.x, 0, item.z);
    piece.rotation.y = item.r;
  }
  layoutGizmo();
  updateReadout();
}

function beginGesture() {
  beforePose = poseOf();
}

function endGesture() {
  if (!beforePose) return;
  const now = JSON.stringify(poseOf());
  if (JSON.stringify(beforePose) !== now) {
    undoStack.push(beforePose);
    if (undoStack.length > 40) undoStack.shift();
  }
  beforePose = null;
  undoBtn.disabled = undoStack.length === 0;
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  applyPose(prev);
  undoBtn.disabled = undoStack.length === 0;
}

function extents(piece) {
  const c = Math.abs(Math.cos(piece.rotation.y));
  const s = Math.abs(Math.sin(piece.rotation.y));
  const { w, d } = piece.userData;
  return {
    hx: (w * c + d * s) / 2,
    hz: (w * s + d * c) / 2,
  };
}

function clampPiece(piece) {
  const { hx, hz } = extents(piece);
  const m = 0.08;
  piece.position.x = THREE.MathUtils.clamp(piece.position.x, m + hx, TOTAL_W - m - hx);
  piece.position.z = THREE.MathUtils.clamp(piece.position.z, m + hz, ROOM_D - m - hz);
  piece.position.y = 0;
}

function resolveWall(piece) {
  const { hx, hz } = extents(piece);
  const wall = { x0: MAIN_W - 0.1, x1: MAIN_W + 0.1, z0: 3.0, z1: 6.7 };
  const overlapX = Math.min(piece.position.x + hx, wall.x1) - Math.max(piece.position.x - hx, wall.x0);
  const overlapZ = Math.min(piece.position.z + hz, wall.z1) - Math.max(piece.position.z - hz, wall.z0);
  if (overlapX > 0 && overlapZ > 0) {
    if (overlapX < overlapZ) {
      piece.position.x += piece.position.x < MAIN_W ? -overlapX : overlapX;
    } else {
      piece.position.z += piece.position.z < (wall.z0 + wall.z1) / 2 ? -overlapZ : overlapZ;
    }
  }
}

function layoutGizmo() {
  if (!selected) {
    gizmo.visible = false;
    return;
  }
  gizmo.visible = true;
  gizmo.position.set(selected.position.x, 0, selected.position.z);
  const { w, d } = selected.userData;
  const radius = 0.5 * Math.hypot(w, d) + 0.36;
  const key = radius.toFixed(3);
  if (gizmo.userData.key !== key) {
    ring.geometry.dispose();
    hitRing.geometry.dispose();
    ring.geometry = new THREE.TorusGeometry(radius, 0.058, 12, 64);
    hitRing.geometry = new THREE.TorusGeometry(radius, 0.16, 8, 28);
    ring.rotation.x = Math.PI / 2;
    hitRing.rotation.x = Math.PI / 2;
    tick.position.set(0, 0.12, radius + 0.02);
    gizmo.userData.key = key;
  }
  tickGroup.rotation.y = selected.rotation.y;
}

function normDeg(rad) {
  let deg = Math.round(THREE.MathUtils.radToDeg(rad) % 360);
  if (deg < 0) deg += 360;
  return deg;
}

function updateReadout() {
  if (!selected) return;
  selAngle.textContent = `${normDeg(selected.rotation.y)}°`;
}

function select(group) {
  selected = group;
  for (const btn of listEl.querySelectorAll(".piece")) {
    const on = group && btn.dataset.id === group.userData.id;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    if (on) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  dock.hidden = !group;
  hint.hidden = !!group;
  if (!group) {
    gizmo.visible = false;
    return;
  }
  selName.textContent = group.userData.name;
  updateReadout();
  layoutGizmo();
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function floorPoint(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.direction.y >= -0.02) return null;
  return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : null;
}

function rootOf(object) {
  let node = object;
  while (node && !node.userData.id) node = node.parent;
  return node;
}

function pickAt(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const pieceHits = raycaster.intersectObjects(hitMeshes, false);
  const ringHits = gizmo.visible ? raycaster.intersectObject(hitRing, false) : [];
  const pieceHit = pieceHits[0];
  const ringHit = ringHits[0];
  if (ringHit && (!pieceHit || ringHit.distance < pieceHit.distance)) return { kind: "ring" };
  if (pieceHit) return { kind: "piece", object: pieceHit.object };
  return null;
}

function useSnap(event) {
  return snapOn !== event.shiftKey;
}

function placeSelected(x, z, event) {
  if (useSnap(event)) {
    x = Math.round(x / GRID) * GRID;
    z = Math.round(z / GRID) * GRID;
  }
  selected.position.set(x, 0, z);
  resolveWall(selected);
  clampPiece(selected);
  layoutGizmo();
}

function rotateSelected(angle, event) {
  if (event && useSnap(event)) {
    const step = Math.PI / 12;
    angle = Math.round(angle / step) * step;
  }
  selected.rotation.y = angle;
  resolveWall(selected);
  clampPiece(selected);
  layoutGizmo();
  updateReadout();
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  downX = event.clientX;
  downY = event.clientY;
  moved = false;
  const pick = pickAt(event);
  if (!pick) {
    miss = true;
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  beginGesture();
  if (pick.kind === "ring") {
    const point = floorPoint(event);
    if (!point || !selected) return;
    angStart = Math.atan2(point.x - selected.position.x, point.z - selected.position.z);
    rotStart = selected.rotation.y;
    gesture = "rot";
    document.body.classList.add("is-rot");
    return;
  }
  const root = rootOf(pick.object);
  select(root);
  const point = floorPoint(event);
  if (!point) return;
  dragDX = point.x - root.position.x;
  dragDZ = point.z - root.position.z;
  gesture = "drag";
  document.body.classList.add("is-drag");
}

function onPointerMove(event) {
  if (miss && Math.hypot(event.clientX - downX, event.clientY - downY) > 4) moved = true;
  if (!gesture) {
    if (event.target !== canvas) return;
    const pick = pickAt(event);
    canvas.style.cursor = pick?.kind === "ring" ? "crosshair" : pick?.kind === "piece" ? "grab" : "default";
    return;
  }
  if (Math.hypot(event.clientX - downX, event.clientY - downY) > 3) moved = true;
  const point = floorPoint(event);
  if (!point || !selected) return;
  if (gesture === "drag") placeSelected(point.x - dragDX, point.z - dragDZ, event);
  if (gesture === "rot") rotateSelected(rotStart + (Math.atan2(point.x - selected.position.x, point.z - selected.position.z) - angStart), event);
}

function onPointerUp(event) {
  if (miss && !moved && event.target === canvas) select(null);
  if (gesture) endGesture();
  gesture = null;
  miss = false;
  controls.enabled = true;
  document.body.classList.remove("is-drag", "is-rot");
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

function rotateBy(delta) {
  if (!selected) return;
  beginGesture();
  rotateSelected(selected.rotation.y + delta, null);
  endGesture();
}

function goCamera(name) {
  const preset = PRESETS[name];
  camAnim.fromP.copy(camera.position);
  camAnim.fromT.copy(controls.target);
  camAnim.toP.set(...preset.pos);
  camAnim.toT.set(...preset.target);
  camAnim.t = 0;
  document.getElementById("cam-doll").classList.toggle("on", name === "doll");
  document.getElementById("cam-top").classList.toggle("on", name === "top");
}

function nudge(dx, dz) {
  if (!selected) return;
  const step = snapOn ? GRID : 0.1;
  placeSelected(selected.position.x + dx * step, selected.position.z + dz * step, { shiftKey: false });
}

function onKeyDown(event) {
  if (event.target.closest("input, textarea")) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "z") {
    event.preventDefault();
    undo();
    return;
  }
  if (key === "escape") {
    select(null);
    return;
  }
  const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  const rotating = key === "q" || key === "e";
  const moving = arrows[key];
  if (!rotating && !moving) return;
  if (!selected) return;
  event.preventDefault();
  if (!heldKeys.has(event.code)) {
    if (heldKeys.size === 0) beginGesture();
    heldKeys.add(event.code);
  }
  if (moving) nudge(...arrows[key]);
  if (rotating) rotateSelected(selected.rotation.y + (key === "q" ? -1 : 1) * (Math.PI / 12), null);
}

function onKeyUp(event) {
  if (!heldKeys.has(event.code)) return;
  heldKeys.delete(event.code);
  if (heldKeys.size === 0) endGesture();
}

function resetLayout() {
  beginGesture();
  for (const piece of pieces) {
    const home = piece.userData.home;
    piece.position.set(home.x, 0, home.z);
    piece.rotation.y = home.r;
  }
  endGesture();
  layoutGizmo();
  updateReadout();
}

const grid = (() => {
  const step = GRID;
  const pts = [];
  for (let x = 0; x <= TOTAL_W + 1e-4; x += step) pts.push(x, 0, 0, x, 0, ROOM_D);
  for (let z = 0; z <= ROOM_D + 1e-4; z += step) pts.push(0, 0, z, TOTAL_W, 0, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xc9bfb0, transparent: true, opacity: 0.7 })
  );
  lines.position.y = 0.012;
  lines.visible = false;
  return lines;
})();
scene.add(grid);

function animate(now) {
  requestAnimationFrame(animate);
  if (camAnim.t < 1) {
    camAnim.t = Math.min(1, camAnim.t + (reduceMotion ? 1 : 0.04));
    const k = 1 - (1 - camAnim.t) ** 3;
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
  }
  controls.update();
  if (selected && !reduceMotion) {
    ringMat.opacity = 0.78 + Math.sin(now * 0.004) * 0.18;
  }
  renderer.render(scene, camera);
}

buildLights();
buildRoom();
spawnPieces();
resize();
new ResizeObserver(resize).observe(stage);

canvas.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
controls.addEventListener("start", () => {
  camAnim.t = 1;
});

document.getElementById("cam-doll").addEventListener("click", () => goCamera("doll"));
document.getElementById("cam-top").addEventListener("click", () => goCamera("top"));
snapBtn.addEventListener("click", () => {
  snapOn = !snapOn;
  snapBtn.setAttribute("aria-pressed", String(snapOn));
  grid.visible = snapOn;
});
undoBtn.addEventListener("click", undo);
document.getElementById("reset").addEventListener("click", resetLayout);
document.getElementById("rot-l").addEventListener("click", () => rotateBy(-Math.PI / 12));
document.getElementById("rot-r").addEventListener("click", () => rotateBy(Math.PI / 12));
photosBtn.addEventListener("click", () => {
  const open = refPanel.hidden;
  refPanel.hidden = !open;
  photosBtn.setAttribute("aria-pressed", String(open));
});

window.__booted = true;
requestAnimationFrame(animate);
