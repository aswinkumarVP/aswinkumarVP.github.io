import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth < 760;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const step = (a, b, t) => smooth(clamp((t - a) / (b - a), 0, 1));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ================================================================== */
/* Renderer                                                            */
/* ================================================================== */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, isMobile() ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* Two colour themes; the scene blends between them (see applyTheme). */
const THEMES = {
  ivory: {
    bgInner: 0x1c1813, bgOuter: 0x0b0b0c,
    white: 0xece2cc, black: 0x1a1a1c, trim: 0xb8955a, trimMetal: 0.55,
    light: 0xe6d4ae, dark: 0x4a2d1a, frame: 0x1a0f08,
    rim: 0xd4af6a, aura: 0xffd9a0, felt: 0x1d3a2b,
    // tints over the scanned marble textures (when the model is loaded)
    whiteMarble: 0xfff6e8, blackMarble: 0xffffff,
  },
  crimson: { // red marble vs black marble, on a stone-and-wine board under a red–black sky
    bgInner: 0x4a0a10, bgOuter: 0x070203,
    white: 0xb3121f, black: 0x1a1a1c, trim: 0xa9a9b0, trimMetal: 0.7,
    light: 0x7d7072, dark: 0x3a1218, frame: 0x0c0506,
    rim: 0xff3344, aura: 0xff7a70, felt: 0x140608,
    // White pieces turn red: the bright white-marble texture tinted red reads as
    // red marble with its veins intact. Black pieces keep their black marble.
    whiteMarble: 0xd0202c, blackMarble: 0xffffff,
  },
};

const scene = new THREE.Scene();
// Background: a radial gradient painted to a canvas, repainted on theme change.
const bgCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
const bgTexture = new THREE.CanvasTexture(bgCanvas);
bgTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTexture;
scene.fog = new THREE.Fog(THEMES.ivory.bgOuter, 18, 40);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);

/* ================================================================== */
/* Lighting: low, soft and matte; a gentle spotlight for the focus     */
/* ================================================================== */
const HEMI = 0.32, KEY = 1.35;
const hemi = new THREE.HemisphereLight(0xfff4e0, 0x0a0a0a, HEMI);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff1dc, KEY);
key.position.set(6, 11, 7);
key.castShadow = true;
key.shadow.mapSize.setScalar(isMobile() ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);

const rim = new THREE.DirectionalLight(0xd4af6a, 0.5);
rim.position.set(-7, 5, -8);
scene.add(rim);

const spot = new THREE.SpotLight(0xfff0d6, 0, 0, 0.3, 0.8, 2);
spot.castShadow = !isMobile();
spot.shadow.mapSize.setScalar(1024);
spot.shadow.bias = -0.0002;
scene.add(spot, spot.target);

/* ================================================================== */
/* Materials                                                           */
/* ================================================================== */
// Piece bodies: polished stone, a lacquer-like clear coat over a satin base
// so they catch soft reflections. Colours are filled in by the theme.
const POLISH = { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 };
const MAT = {
  w: new THREE.MeshPhysicalMaterial(POLISH),
  b: new THREE.MeshPhysicalMaterial(POLISH),
  gold: new THREE.MeshStandardMaterial({ color: 0xb8955a, metalness: 0.55, roughness: 0.55, envMapIntensity: 0.5 }),
  felt: new THREE.MeshStandardMaterial({ roughness: 1 }),
};

/* ================================================================== */
/* Board: lacquered maple & walnut, gold inlay                         */
/* ================================================================== */
const sqGeo = new RoundedBoxGeometry(0.97, 0.16, 0.97, 2, 0.025);
const squares = []; // { mat, dark, jitter } so themes can recolour them
for (let f = 0; f < 8; f++) {
  for (let r = 0; r < 8; r++) {
    const dark = (f + r) % 2 === 0;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, envMapIntensity: 0.4 });
    squares.push({ mat, dark, jitter: (Math.random() - 0.5) * 0.03 });
    const sq = new THREE.Mesh(sqGeo, mat);
    sq.position.set(f - 3.5, -0.08, 3.5 - r);
    sq.receiveShadow = true;
    scene.add(sq);
  }
}
const frame = new THREE.Mesh(
  new RoundedBoxGeometry(9.1, 0.34, 9.1, 3, 0.08),
  new THREE.MeshStandardMaterial({ roughness: 0.6, envMapIntensity: 0.4 })
);
frame.position.y = -0.19;
frame.receiveShadow = true;
scene.add(frame);
for (const [w, d, x, z] of [[8.3, 0.035, 0, 4.12], [8.3, 0.035, 0, -4.12], [0.035, 8.3, 4.12, 0], [0.035, 8.3, -4.12, 0]]) {
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), MAT.gold);
  inlay.position.set(x, -0.012, z);
  scene.add(inlay);
}
// Floor only catches the board's shadow and fades out radially into the
// background gradient, so there's no visible horizon.
const floorAlpha = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, alphaMap: floorAlpha, depthWrite: false })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.36;
floor.receiveShadow = true;
scene.add(floor);

/* ================================================================== */
/* Staunton pieces                                                     */
/* Profiles are lists of "runs"; each run is spline-smoothed and runs  */
/* meet at crisp edges, like a turned and carved piece.                */
/* ================================================================== */
const arc = (cy, r, a0, a1, n = 10) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [Math.max(0, r * Math.cos(a)), cy + r * Math.sin(a)];
  });

const BASE = [
  [[0, 0], [0.4, 0]],
  [[0.4, 0], [0.425, 0.02], [0.425, 0.065], [0.4, 0.085]],
  [[0.4, 0.085], [0.37, 0.1], [0.365, 0.125], [0.385, 0.15], [0.37, 0.18], [0.335, 0.2]],
  [[0.335, 0.2], [0.28, 0.22], [0.225, 0.255], [0.19, 0.3]],
];

const PIECES = {
  pawn: {
    h: 0.95, collar: [0.6, 0.215],
    runs: [
      [[0.19, 0.3], [0.155, 0.4], [0.125, 0.5], [0.11, 0.56]],
      [[0.11, 0.56], [0.19, 0.575], [0.215, 0.6], [0.2, 0.625], [0.1, 0.645]],
      [[0.1, 0.645], ...arc(0.79, 0.16, -1.15, Math.PI / 2)],
    ],
  },
  rook: {
    h: 1.2, collar: [0.83, 0.296],
    runs: [
      [[0.19, 0.3], [0.205, 0.42], [0.215, 0.6], [0.235, 0.72], [0.26, 0.78]],
      [[0.26, 0.78], [0.29, 0.8], [0.295, 0.83], [0.27, 0.86]],
      [[0.27, 0.86], [0.275, 0.95], [0.29, 1.02], [0.31, 1.06]],
      [[0.31, 1.06], [0.31, 1.08]],
      [[0.31, 1.08], [0.23, 1.08]],
      [[0.23, 1.08], [0.23, 1.02]],
      [[0.23, 1.02], [0, 1.02]],
    ],
  },
  bishop: {
    h: 1.45, collar: [0.85, 0.222],
    runs: [
      [[0.19, 0.3], [0.155, 0.45], [0.125, 0.65], [0.112, 0.8]],
      [[0.112, 0.8], [0.2, 0.82], [0.222, 0.85], [0.205, 0.88], [0.11, 0.9]],
      [[0.11, 0.9], [0.15, 0.915], [0.155, 0.93], [0.11, 0.945]],
      [[0.11, 0.945], [0.16, 1.0], [0.2, 1.1], [0.195, 1.2], [0.15, 1.29], [0.07, 1.36], [0, 1.38]],
    ],
  },
  queen: {
    h: 1.58, collar: [1.0, 0.236], collar2: [1.078, 0.17],
    runs: [
      [[0.19, 0.3], [0.16, 0.48], [0.13, 0.75], [0.115, 0.95]],
      [[0.115, 0.95], [0.215, 0.975], [0.235, 1.0], [0.22, 1.03], [0.12, 1.05]],
      [[0.12, 1.05], [0.165, 1.07], [0.17, 1.085], [0.12, 1.1]],
      [[0.12, 1.1], [0.16, 1.18], [0.22, 1.3], [0.265, 1.39]],
      [[0.265, 1.39], [0.25, 1.41], [0.2, 1.405], [0.14, 1.43], [0.08, 1.48], [0, 1.5]],
    ],
  },
  king: {
    h: 1.92, collar: [1.1, 0.246], collar2: [1.178, 0.18],
    runs: [
      [[0.19, 0.3], [0.165, 0.5], [0.135, 0.85], [0.122, 1.05]],
      [[0.122, 1.05], [0.225, 1.075], [0.245, 1.1], [0.23, 1.13], [0.13, 1.15]],
      [[0.13, 1.15], [0.175, 1.17], [0.18, 1.185], [0.13, 1.2]],
      [[0.13, 1.2], [0.18, 1.3], [0.235, 1.42], [0.255, 1.48]],
      [[0.255, 1.48], [0.235, 1.5], [0.17, 1.52], [0.09, 1.55], [0, 1.56]],
    ],
  },
  knight: {
    h: 1.29, collar: [0.36, 0.245],
    runs: [
      [[0.19, 0.3], [0.215, 0.33], [0.245, 0.36], [0.24, 0.39], [0.2, 0.41]],
      [[0.2, 0.41], [0, 0.41]],
    ],
  },
};

function profile(runs) {
  const out = [];
  for (const run of runs) {
    const v = run.map(([x, y]) => new THREE.Vector2(x, y));
    const pts = v.length > 2 ? new THREE.SplineCurve(v).getPoints(v.length * 5) : v;
    if (out.length) pts.shift();
    out.push(...pts);
  }
  for (const p of out) p.x = Math.max(0, p.x);
  return out;
}

// Extra parts (built once, shared by every piece of that type).
const ballGeo = new THREE.SphereGeometry(1, 32, 20);
const ringGeo = (r, tube = 0.012) => new THREE.TorusGeometry(r, tube, 12, 96).rotateX(Math.PI / 2);

const merlonGeo = (() => {
  const span = ((Math.PI * 2) / 6) * 0.55;
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.31, -span / 2, span / 2, false);
  s.absarc(0, 0, 0.23, span / 2, -span / 2, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 12 });
  return g.rotateX(-Math.PI / 2);
})();

// Cross pattée: arms flare outward toward their ends, like a crown jewel.
const crossGeo = (() => {
  const pts = [[-0.045, 0], [0.045, 0], [0.024, 0.11], [0.13, 0.085], [0.13, 0.185], [0.024, 0.16], [0.05, 0.28],
    [-0.05, 0.28], [-0.024, 0.16], [-0.13, 0.185], [-0.13, 0.085], [-0.024, 0.11]];
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: 0.04, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 5 });
  return g.translate(0, 0, -0.02);
})();

// n copies of a part arranged in a circle (radius r, height y), each tilted
// outward by `tilt` radians, merged into one geometry.
const circleOf = (n, r, y, geo, tilt = 0) => mergeGeometries(Array.from({ length: n }, (_, i) => {
  const a = (i * Math.PI * 2) / n;
  const m = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), tilt);
  m.setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
  return geo.clone().applyMatrix4(m);
}));
const smallBall = new THREE.SphereGeometry(1, 20, 14);
// Queen's coronet: ten points leaning outward, each tipped with a gold pearl.
const QUEEN_TILT = 0.32;
const queenPointsGeo = circleOf(10, 0.238, 1.43, new THREE.ConeGeometry(0.032, 0.1, 18), QUEEN_TILT);
const queenPearlsGeo = circleOf(10, 0.238 + Math.sin(QUEEN_TILT) * 0.055, 1.43 + Math.cos(QUEEN_TILT) * 0.055,
  smallBall.clone().scale(0.022, 0.022, 0.022));
// King's coronet: a ring of gold beads around the crown's rim.
const kingBeadsGeo = circleOf(12, 0.238, 1.49, smallBall.clone().scale(0.024, 0.024, 0.024));
// Green baize under every piece (seen when a piece is lifted).
const feltGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.012, 64).translate(0, -0.006, 0);

// Knight head: a side profile (facing +x) extruded thick with a deep rounded
// bevel, then sculpted: the muzzle and brow are pinched narrower than the
// neck, and vertices are welded so it shades as one smooth carved surface.
const knightHeadGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.23, 0.39);
  s.lineTo(0.2, 0.39);
  s.bezierCurveTo(0.27, 0.47, 0.22, 0.57, 0.16, 0.63);    // chest
  s.bezierCurveTo(0.12, 0.67, 0.1, 0.72, 0.13, 0.76);     // throat
  s.bezierCurveTo(0.2, 0.79, 0.28, 0.76, 0.34, 0.78);     // under the jaw
  s.bezierCurveTo(0.4, 0.8, 0.44, 0.85, 0.43, 0.9);       // chin & lips
  s.bezierCurveTo(0.42, 0.96, 0.39, 1.0, 0.34, 1.01);     // muzzle
  s.bezierCurveTo(0.27, 1.03, 0.19, 1.09, 0.13, 1.15);    // nose bridge to brow
  s.bezierCurveTo(0.09, 1.19, 0.03, 1.21, -0.03, 1.2);    // poll
  s.bezierCurveTo(-0.14, 1.17, -0.22, 1.08, -0.27, 0.95); // crest
  s.bezierCurveTo(-0.31, 0.82, -0.31, 0.62, -0.23, 0.39); // back of the neck
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 10, curveSegments: 48,
  });
  g.translate(0, 0, -0.08);

  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const k = (1 - 0.38 * smooth(clamp((x - 0.12) / 0.3, 0, 1)))   // slimmer muzzle
            * (1 - 0.3 * smooth(clamp((y - 1.0) / 0.22, 0, 1)))    // narrower brow
            * (1 + 0.08 * smooth(clamp((0.62 - y) / 0.2, 0, 1)));  // fuller chest
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  return welded;
})();
// Raised mane running down the back of the neck, in the body's own material.
const maneCurve = new THREE.CatmullRomCurve3([
  [-0.03, 1.22], [-0.15, 1.19], [-0.25, 1.09], [-0.3, 0.96], [-0.33, 0.8], [-0.32, 0.62], [-0.27, 0.47],
].map(([x, y]) => new THREE.Vector3(x, y, 0)));
const maneGeo = new THREE.TubeGeometry(maneCurve, 80, 0.045, 14);
const earGeo = new THREE.ConeGeometry(0.036, 0.14, 18);
const nosebandGeo = new THREE.TorusGeometry(0.122, 0.011, 10, 64).rotateY(Math.PI / 2).rotateZ(-0.22);

const bodyGeo = Object.fromEntries(Object.entries(PIECES).map(([t, d]) => [t, new THREE.LatheGeometry(profile([...BASE, ...d.runs]), 96)]));
const baseRingGeo = ringGeo(0.386, 0.014);
const collarGeo = Object.fromEntries(Object.entries(PIECES).map(([t, d]) => [t, ringGeo(d.collar[1])]));

function buildTemplate(type, color) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, s = 1, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const body = MAT[color], gold = MAT.gold;
  add(bodyGeo[type], body);
  add(feltGeo, MAT.felt);
  add(baseRingGeo, gold, 0, 0.15, 0);
  add(collarGeo[type], gold, 0, PIECES[type].collar[0], 0);
  const c2 = PIECES[type].collar2;
  if (c2) add(ringGeo(c2[1], 0.009), gold, 0, c2[0], 0); // second, finer collar

  if (type === 'rook') {
    for (let i = 0; i < 6; i++) add(merlonGeo, body, 0, 1.08, 0, 1, [0, (i * Math.PI) / 3, 0]);
    add(ringGeo(0.312, 0.01), gold, 0, 1.07, 0);
  }
  if (type === 'bishop') {
    add(ringGeo(0.19, 0.014), gold, 0, 1.18, 0, 1, [0.5, 0, 0]); // the mitre's slit, in gold
    add(ballGeo, gold, 0, 1.42, 0, 0.055);
  }
  if (type === 'queen') {
    add(queenPointsGeo, body);
    add(queenPearlsGeo, gold);
    add(ringGeo(0.262, 0.01), gold, 0, 1.395, 0);
    add(ballGeo, gold, 0, 1.53, 0, 0.045);
  }
  if (type === 'king') {
    add(kingBeadsGeo, gold);
    add(ballGeo, gold, 0, 1.6, 0, 0.058);   // orb
    add(crossGeo, gold, 0, 1.645, 0);
  }
  if (type === 'knight') {
    add(knightHeadGeo, body);
    add(maneGeo, body);
    add(ballGeo, body, ...maneCurve.points[0].toArray(), 0.045);   // round off the mane's ends
    add(ballGeo, body, ...maneCurve.points.at(-1).toArray(), 0.045);
    add(earGeo, body, 0.04, 1.25, 0.06, 1, [0, 0, 0.35]);
    add(earGeo, body, 0.04, 1.25, -0.06, 1, [0, 0, 0.35]);
    add(ballGeo, gold, 0.2, 1.04, 0.142, 0.022);                    // eyes
    add(ballGeo, gold, 0.2, 1.04, -0.142, 0.022);
    add(nosebandGeo, gold, 0.3, 0.9, 0);
  }
  return g;
}
const templates = {};
for (const t of Object.keys(PIECES)) for (const c of ['w', 'b']) templates[t + c] = buildTemplate(t, c);

const sqPos = (sq) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (+sq[1] - 1));

// Soft contact shadow under each piece: grounds it on the board.
const blobTex = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const blobGeo = new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2);

const bySq = {};
const allPieces = [];
const reveal = { v: 0 }; // 0 → 1 as the pieces drop in (see loadChessSet)
function place(type, color, sq) {
  const g = templates[type + color].clone();
  const baseRot = type === 'knight' ? (color === 'w' ? Math.PI / 2 : -Math.PI / 2) : 0; // knights face the opponent
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5 }));
  const p = { g, type, color, home: sqPos(sq), baseRot, h: PIECES[type].h, blob };
  scene.add(g, blob);
  bySq[sq] = p;
  allPieces.push(p);
}
const BACK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
'abcdefgh'.split('').forEach((f, i) => {
  place(BACK[i], 'w', f + '1');
  place('pawn', 'w', f + '2');
  place('pawn', 'b', f + '7');
  place(BACK[i], 'b', f + '8');
});
const whitePawns = 'abcdefgh'.split('').map((f) => bySq[f + '2']);

/* ================================================================== */
/* Scholar's Mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#               */
/* ================================================================== */
const PLIES = [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']];
const CAPTURE_ZONE = new THREE.Vector3(5.4, -0.36, -2.6);
const PLY_DATA = (() => {
  const occ = { ...bySq };
  return PLIES.map(([a, b]) => {
    const p = occ[a];
    const cap = occ[b] ?? null;
    delete occ[a];
    occ[b] = p;
    return { p, cap, from: sqPos(a), to: sqPos(b) };
  });
})();

/* ================================================================== */
/* Aura around the focus piece + floor halos                            */
/* ================================================================== */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,220,160,1)');
  grd.addColorStop(0.3, 'rgba(255,200,120,0.5)');
  grd.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function floorGlow(size, map, color = 0xffffff) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  scene.add(m);
  return m;
}
const haloTex = glowTexture();
const focusHalo = floorGlow(1.8, haloTex);
const checkHalo = floorGlow(2.0, haloTex, 0xff5a40);
checkHalo.position.copy(sqPos('e8')).setY(0.014);

// A soft camera-facing glow sitting at the piece's centre: the piece itself
// hides the middle, so only a halo around its silhouette shows.
const aura = new THREE.Sprite(new THREE.SpriteMaterial({
  map: haloTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
}));
scene.add(aura);
const AURA_GOLD = new THREE.Color(0xffd9a0), AURA_CHECK = new THREE.Color(0xff6a50);

/* ================================================================== */
/* Camera shots, one per <section data-scene>                          */
/*   shift  – where the scene sits horizontally on desktop (+ = right) */
/*   hold   – fraction of the scroll the camera rests on this shot      */
/* ================================================================== */
const SHOTS = {
  // Close-up on White's king and queen, the board fading out behind.
  hero:     { cam: [2.4, 2.0, 7.4],  target: [0, 1.55, 2.4],   shift: 0,     side: 'center', mShift: -0.06 },
  about:    { cam: [3.4, 1.8, 7.6],  target: [0.5, 1.3, 3.5],  shift: 0.24,  side: 'left',  focus: 'e1', lift: 0.5 },
  queen:    { cam: [-3.7, 2.1, 7.0], target: [-0.5, 1.6, 3.5], shift: -0.24, side: 'right', focus: 'd1', lift: 0.85 },
  knight:   { cam: [5.5, 2.0, 6.8],  target: [2.5, 1.4, 3.5],  shift: 0.24,  side: 'left',  focus: 'g1', lift: 0.85 },
  rook:     { cam: [6.9, 2.4, 1.2],  target: [3.5, 1.3, 3.5],  shift: -0.24, side: 'right', focus: 'h1', lift: 0.85 },
  pawns:    { cam: [-6.4, 1.2, 5.0], target: [1.2, 0.5, 2.3],  shift: 0.22,  side: 'left',  wave: true },
  // White's side of the board, dimmed behind the project cards.
  projects: { cam: [0, 9.5, 9.0],    target: [0, 0, 0.8],      shift: 0,     side: 'center', dim: 1, mShift: 0, hold: 0.3 },
  moves:    { cam: [8.6, 7.4, 7.6],  target: [0.4, 0, -0.6],   shift: -0.2,  side: 'right', hold: 0.3 },
  contact:  { cam: [4.4, 2.3, -0.6], target: [1.0, 0.7, -3.0], shift: 0.24,  side: 'left' },
};

const sections = [...document.querySelectorAll('[data-scene]')];
const shots = sections.map((s) => SHOTS[s.dataset.scene]);
const idx = Object.fromEntries(sections.map((s, i) => [s.dataset.scene, i]));

let tops = [];
let heights = [];
function measure() {
  tops = sections.map((s) => s.getBoundingClientRect().top + scrollY);
  heights = sections.map((s) => s.offsetHeight);
}
// u = i when the centre of section i sits at the centre of the viewport.
function scrollToU() {
  const mid = scrollY + innerHeight / 2;
  let i = 0;
  while (i < tops.length - 1 && mid >= tops[i + 1]) i++;
  return i + (mid - tops[i]) / heights[i] - 0.5;
}

/* ================================================================== */
/* Camera                                                              */
/* ================================================================== */
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vTmp = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
const intro = { v: reduceMotion ? 1 : 0 };
const scrim = {
  l: document.querySelector('.scrim--l'), r: document.querySelector('.scrim--r'),
  c: document.querySelector('.scrim--c'), b: document.querySelector('.scrim--b'),
};

let heroAngle = 0;

function applyCamera(u, time, dt) {
  const n = shots.length;
  const uc = clamp(u, 0, n - 1);
  const i = Math.min(Math.floor(uc), n - 2);
  const A = shots[i], B = shots[i + 1];
  const t = step(A.hold ?? 0.12, 1 - (B.hold ?? 0.12), uc - i);

  vA.fromArray(A.cam); vB.fromArray(B.cam);
  const dist = vA.distanceTo(vB);
  camPos.lerpVectors(vA, vB, t);
  camPos.y += Math.sin(Math.PI * t) * dist * 0.18; // arc over the pieces, never through them
  camTarget.lerpVectors(vA.fromArray(A.target), vB.fromArray(B.target), t);

  // Hero: the whole shot turns a full 360° around the board's centre (~40 s a lap).
  // It only advances while resting on the hero, so scrolling away never sees the
  // angle jump; it then unwinds the short way round (angle kept within ±180°).
  const heroW = clamp(1 - u, 0, 1);
  if (u <= 0) heroAngle = (heroAngle + dt * 0.16) % (Math.PI * 2);
  if (heroW > 0) {
    const ang = (heroAngle > Math.PI ? heroAngle - Math.PI * 2 : heroAngle) * heroW;
    camPos.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
    camTarget.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
  }

  camPos.sub(camTarget);
  const k = 1 - intro.v;
  camPos.multiplyScalar((camera.aspect < 1 ? 1.45 : 1) * (1 + k * 0.9));
  camPos.add(camTarget);
  camPos.y += k * 3;

  pointer.sx += (pointer.x - pointer.sx) * 0.05;
  pointer.sy += (pointer.y - pointer.sy) * 0.05;
  camPos.x += pointer.sx * 0.3;
  camPos.y += pointer.sy * 0.18;

  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  const w = innerWidth, h = innerHeight;
  if (isMobile()) {
    const ms = (s) => s.mShift ?? 0.2;
    camera.setViewOffset(w, h, 0, lerp(ms(A), ms(B), t) * h, w, h);
  } else {
    camera.setViewOffset(w, h, -lerp(A.shift, B.shift, t) * w, 0, w, h);
  }
  camera.updateMatrixWorld();

  const sideW = (s, side) => (s.side === side ? 1 : 0);
  scrim.l.style.opacity = lerp(sideW(A, 'left'), sideW(B, 'left'), t);
  scrim.r.style.opacity = lerp(sideW(A, 'right'), sideW(B, 'right'), t);
  scrim.c.style.opacity = lerp(A.dim ?? 0, B.dim ?? 0, t);
  scrim.b.style.opacity = 1 - lerp(sideW(A, 'center'), sideW(B, 'center'), t);
}

/* ================================================================== */
/* Pieces + focus (which piece gets the spotlight and aura)            */
/* ================================================================== */
const moveItems = [...document.querySelectorAll('.moves li')];
const focus = { w: 0, point: new THREE.Vector3(), piece: null, check: false };

function applyPieces(u, time) {
  allPieces.forEach((p, i) => {
    p.g.position.copy(p.home);
    p.g.rotation.set(0, p.baseRot, 0);
    // Entrance: pieces drop onto their squares rank by rank once the set is ready.
    const e = smooth(clamp(reveal.v * 2 - (i % 4) * 0.12 - Math.floor(i / 4) * 0.06, 0, 1));
    p.g.visible = e > 0;
    p.g.position.y += (1 - e) * 1.6;
  });
  focus.w = 0;
  focus.piece = null;
  focus.check = false;

  // --- Scholar's Mate, scrubbed by scroll ---
  const movesProgress = clamp((u - idx.moves + 0.32) / 0.6, 0, 1) * PLY_DATA.length;
  let curPly = -1;
  PLY_DATA.forEach(({ p, cap, from, to }, k) => {
    const f = clamp(movesProgress - k, 0, 1);
    if (f <= 0) return;
    curPly = k;
    p.g.position.lerpVectors(from, to, easeInOut(f));
    p.g.position.y = Math.sin(Math.PI * f) * (p.type === 'knight' ? 0.8 : 0.35);
    if (cap) {
      const c = step(0.6, 1, f);
      cap.g.position.lerpVectors(to, CAPTURE_ZONE, c);
      cap.g.position.y += Math.sin(Math.PI * c) * 1.2;
      cap.g.rotation.z = c * (Math.PI / 2);
    }
  });

  // --- Featured pieces rise, turn and take the spotlight ---
  shots.forEach((s, k) => {
    const w = clamp(1 - Math.abs(u - k), 0, 1);
    if (!w) return;
    const e = smooth(w);
    if (s.focus) {
      const p = bySq[s.focus];
      p.g.position.y += e * s.lift;
      p.g.rotation.y += (u - k) * Math.PI * w + Math.sin(time * 0.8) * 0.15 * e;
      if (e > focus.w) Object.assign(focus, { w: e, piece: p });
    }
    if (s.wave) {
      whitePawns.forEach((p, i) => { p.g.position.y += e * 0.3 * (0.5 + 0.5 * Math.sin(time * 2.2 - i * 0.7)); });
    }
  });

  // --- Moves: follow whichever piece is moving ---
  const wm = smooth(clamp(1 - Math.abs(u - idx.moves) / 0.6, 0, 1));
  if (curPly >= 0 && wm > focus.w) {
    Object.assign(focus, { w: wm, piece: PLY_DATA[curPly].p });
  }

  // --- Checkmate: f7 is taken, the king glows red and topples ---
  const dc = u - idx.contact;
  const wc = step(-0.6, -0.15, dc);
  checkHalo.material.opacity = wc * (0.75 + 0.25 * Math.sin(time * 3));
  const fall = step(-0.4, 0, dc);
  const bk = bySq.e8;
  if (fall > 0) {
    const th = fall * 1.35;
    bk.g.rotation.x = th; // falls toward e7, which e5 vacated
    bk.g.position.z = bk.home.z + 0.36 - 0.36 * Math.cos(th);
    bk.g.position.y = 0.36 * Math.sin(th);
  }
  if (wc > focus.w) Object.assign(focus, { w: wc, piece: bk, check: true });

  // Contact shadows follow their pieces, softening and spreading as they rise.
  for (const { g, blob } of allPieces) {
    const { x, y, z } = g.position;
    const onBoard = Math.abs(x) < 4.2 && Math.abs(z) < 4.2;
    blob.visible = onBoard && g.visible;
    blob.position.set(x, 0.004, z);
    blob.scale.setScalar(1 + Math.max(0, y) * 0.5);
    blob.material.opacity = 0.5 * clamp(1 - y / 1.3, 0, 1);
  }

  if (focus.piece) focus.point.copy(focus.piece.g.position).y += focus.piece.h * 0.5;
  return { movesProgress, curPly };
}

function applyLights(time) {
  const e = focus.piece ? focus.w : 0;
  key.intensity = KEY * (1 - 0.35 * e);
  hemi.intensity = HEMI * (1 - 0.35 * e);
  spot.intensity = 28 * e;
  if (focus.piece) {
    const p = focus.piece;
    spot.target.position.copy(focus.point);
    spot.position.copy(focus.point).add(vTmp.set(1.4, 5.2, 2.6));
    focusHalo.position.set(p.g.position.x, 0.012, p.g.position.z);
    aura.position.copy(focus.point);
    aura.scale.setScalar(p.h * 1.7 * (1 + 0.04 * Math.sin(time * 1.6))); // slow breathing
    aura.material.color.copy(focus.check ? AURA_CHECK : AURA_GOLD);
  }
  aura.material.opacity = e * 0.3;
  focusHalo.material.opacity = e * 0.45;
}

/* ================================================================== */
/* DOM-linked UI                                                       */
/* ================================================================== */
const railPiece = document.querySelector('.rail__piece');
const railEl = document.querySelector('.rail');

function updateUI({ curPly }) {
  document.documentElement.classList.toggle('past-hero', scrollY > innerHeight * 0.6); // nav shows the full name
  const max = document.documentElement.scrollHeight - innerHeight;
  const prog = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
  railPiece.style.transform = `translateY(${prog * railEl.offsetHeight - 12}px)`;
  const promoted = prog > 0.97;
  railPiece.textContent = promoted ? '♕' : '♙';
  railPiece.classList.toggle('is-promoted', promoted);

  // The mating move has no entry of its own, so the latest role stays lit through it.
  const current = curPly >= 0 ? Math.min(Math.floor(curPly / 2), moveItems.length - 1) : -1;
  moveItems.forEach((li, i) => {
    li.classList.toggle('is-played', i < current);
    li.classList.toggle('is-current', i === current);
  });
}

// Split the name into letters so they can rise one by one and lift on hover.
document.querySelectorAll('.name__word').forEach((word) => {
  word.innerHTML = [...word.textContent].map((ch) => `<span class="char">${ch}</span>`).join('');
});

/* ================================================================== */
/* Theme: Ivory ⇄ Crimson                                              */
/* themeMix.v is 0 for Ivory, 1 for Crimson; everything lerps on it.   */
/* ================================================================== */
const root = document.documentElement;
const toggle = document.querySelector('.theme-toggle--theme');
const themeMix = { v: root.dataset.theme === 'crimson' ? 1 : 0 };
const cA = new THREE.Color(), cB = new THREE.Color();
const mix = (k, out) => out.lerpColors(cA.setHex(THEMES.ivory[k]), cB.setHex(THEMES.crimson[k]), themeMix.v);

const marbleMaps = { W: null, B: null }; // filled when the scanned set loads

// With the scanned set loaded, the theme colour tints its marble texture.
function applyPieceMaterials() {
  for (const [k, mat, key] of [['W', MAT.w, 'white'], ['B', MAT.b, 'black']]) {
    if (mat.map !== marbleMaps[k]) { mat.map = marbleMaps[k]; mat.needsUpdate = true; }
    mix(marbleMaps[k] ? `${key}Marble` : key, mat.color);
  }
}

function applyTheme() {
  const v = themeMix.v;
  const inner = mix('bgInner', new THREE.Color()), outer = mix('bgOuter', new THREE.Color());
  const g = bgCanvas.getContext('2d');
  const grd = g.createRadialGradient(256, 170, 0, 256, 220, 400);
  grd.addColorStop(0, `#${inner.getHexString(THREE.SRGBColorSpace)}`);
  grd.addColorStop(1, `#${outer.getHexString(THREE.SRGBColorSpace)}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  bgTexture.needsUpdate = true;

  scene.fog.color.copy(outer);
  floor.material.color.copy(outer);
  applyPieceMaterials();
  mix('felt', MAT.felt.color);
  mix('trim', MAT.gold.color);
  MAT.gold.metalness = lerp(THEMES.ivory.trimMetal, THEMES.crimson.trimMetal, v);
  mix('frame', frame.material.color);
  for (const s of squares) mix(s.dark ? 'dark' : 'light', s.mat.color).offsetHSL(0, 0, s.jitter);
  mix('rim', rim.color);
  mix('aura', AURA_GOLD);
  focusHalo.material.color.copy(AURA_GOLD);
}
applyTheme();

function setTheme(name) {
  const crimson = name === 'crimson';
  if (crimson) root.dataset.theme = 'crimson';
  else delete root.dataset.theme;
  toggle.setAttribute('aria-pressed', String(crimson));
  toggle.setAttribute('aria-label', `Switch to ${crimson ? 'Ivory' : 'Crimson'} theme`);
  toggle.querySelector('.theme-toggle__label').textContent = crimson ? 'Crimson' : 'Ivory';
  try { localStorage.setItem('ak-theme', crimson ? 'crimson' : 'ivory'); } catch (e) { /* storage unavailable */ }
}
setTheme(root.dataset.theme === 'crimson' ? 'crimson' : 'ivory');

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'crimson' ? 'ivory' : 'crimson';
  root.classList.add('theme-anim');
  setTheme(next);
  gsap.to(themeMix, {
    v: next === 'crimson' ? 1 : 0, duration: reduceMotion ? 0 : 0.9, ease: 'power2.inOut',
    onUpdate: applyTheme,
    onComplete: () => root.classList.remove('theme-anim'),
  });
});

/* ================================================================== */
/* Scanned chess set                                                    */
/* "Chess Set" by Riley Queen, Poly Haven (CC0): polyhaven.com/a/chess_set */
/* Swapped in over the built-in pieces; if it can't load (offline, or   */
/* opened from file://) the built-in pieces stay.                       */
/* ================================================================== */
const MODEL_SCALE = 1 / 0.05788; // the model's squares are 5.788 cm; ours are 1 unit

function useScannedSet(gltf) {
  const src = {}; // 'kingw' → the first white king node, etc.
  gltf.scene.traverse((o) => {
    const m = o.name.match(/^piece_([a-z]+)_(white|black)/);
    if (m && !src[m[1] + m[2][0]]) src[m[1] + m[2][0]] = o;
  });
  if (Object.keys(src).length < 12) throw new Error('chess set is missing pieces');

  // Borrow the marble colour + carved-detail normal maps the loader prepared.
  for (const [k, node] of [['W', src.kingw], ['B', src.kingb]]) {
    let mat = null;
    node.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
    const target = k === 'W' ? MAT.w : MAT.b;
    marbleMaps[k] = mat.map;
    target.normalMap = mat.normalMap;
    target.normalScale.copy(mat.normalScale);
    target.needsUpdate = true;
  }

  const box = new THREE.Box3();
  for (const p of allPieces) {
    const model = src[p.type + p.color].clone();
    model.position.set(0, 0, 0);
    model.rotation.set(0, Math.PI, 0); // the scan has White at −z; ours is at +z
    model.scale.setScalar(MODEL_SCALE);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = MAT[p.color];
      o.castShadow = o.receiveShadow = true;
    });
    model.updateMatrixWorld(true);
    box.setFromObject(model);

    const felt = new THREE.Mesh(feltGeo, MAT.felt);
    felt.scale.set((box.max.x - box.min.x) / 0.8 * 0.94, 1, (box.max.x - box.min.x) / 0.8 * 0.94);

    p.g.clear();
    p.g.add(model, felt);
    p.h = box.max.y;
    p.baseRot = 0; // the scan's knights already face the opponent
  }
  applyPieceMaterials();
}

function revealPieces() {
  if (reveal.v > 0) return;
  gsap.to(reveal, { v: 1, duration: reduceMotion ? 0 : 1.8, ease: 'power2.out' });
}
new GLTFLoader().load(
  'models/chess_set/chess_set.gltf',
  (gltf) => {
    try { useScannedSet(gltf); } catch (err) { console.warn('Chess set model unusable; keeping built-in pieces.', err); }
    revealPieces();
  },
  undefined,
  (err) => { console.warn('Chess set model failed to load; keeping built-in pieces.', err); revealPieces(); }
);
setTimeout(revealPieces, 6000); // never leave the board empty on a slow connection

/* ================================================================== */
/* Smooth scroll + text choreography                                   */
/* ================================================================== */
let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new window.Lenis({ lerp: 0.08, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

if (!reduceMotion) {
  // Intro: camera swoops in, headline rises out of its mask.
  gsap.to(intro, { v: 1, duration: 3.2, ease: 'expo.out', delay: 0.1 });
  // The name: monogram fades up behind, letters rise one by one out of the
  // line mask, then the crown flourish draws outward from the centre.
  gsap.timeline({ delay: 0.4 })
    .from('.hero__monogram', { autoAlpha: 0, scale: 0.85, duration: 2.4, ease: 'expo.out' }, 0)
    .from('.hero__prefix', { autoAlpha: 0, y: 12, duration: 0.8, ease: 'power3.out' }, 0.2)
    .from('.name .char', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.05, clearProps: 'transform' }, 0.25)
    .from('.name__flourish .rule', { scaleX: 0, duration: 1.1, ease: 'expo.inOut' }, 0.9)
    .from('.name__flourish .crown', { autoAlpha: 0, y: 10, scale: 0.4, duration: 0.8, ease: 'back.out(2.5)' }, 1.3)
    .from('.hero__tagline, .hero__lead, .hero__cta', { autoAlpha: 0, y: 20, duration: 1, ease: 'power3.out', stagger: 0.1 }, 1.2);
  gsap.to('.hero', { autoAlpha: 0, y: -120, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 35%', scrub: 0.6 } });
  gsap.to('.scroll-hint', { autoAlpha: 0, scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=200', scrub: true } });

  // Each text column turns in from its piece's side, the rule draws out,
  // lines rise from masks, details follow, then it all lifts away.
  document.querySelectorAll('.sticky .content').forEach((content) => {
    const section = content.closest('.scene');
    const side = section.dataset.side;
    const dir = side === 'right' ? -1 : side === 'left' ? 1 : 0;
    const isLast = section.classList.contains('scene--last');
    const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });

    if (dir) tl.fromTo(content, { rotateY: 16 * dir, xPercent: -8 * dir }, { rotateY: 0, xPercent: 0, ease: 'none', duration: 0.3 }, 0.02);
    const ghost = content.querySelector('.ghost');
    if (ghost) tl.fromTo(ghost, { yPercent: 25, autoAlpha: 0 }, { yPercent: -15, autoAlpha: 1, ease: 'none', duration: 0.9 }, 0.05);
    tl.fromTo(content.querySelectorAll('.kicker .rule'), { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: 0.2 }, 0.06);
    tl.fromTo(content.querySelectorAll('.kicker .idx, .kicker .label'),{ autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: 0.1, stagger: 0.02 }, 0.06);
    tl.fromTo(content.querySelectorAll('.title .line > span'), { yPercent: 115 }, { yPercent: 0, ease: 'none', duration: 0.16, stagger: 0.04 }, 0.1);
    tl.fromTo(content.querySelectorAll('.body, .form, .links'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, ease: 'none', duration: 0.14, stagger: 0.03 }, 0.17);
    tl.fromTo(content.querySelectorAll('.skills li, .stats > div, .moves li > *'), { autoAlpha: 0, x: -24 * dir }, { autoAlpha: 1, x: 0, ease: 'none', duration: 0.1, stagger: 0.014 }, 0.2);
    content.querySelectorAll('[data-count]').forEach((el) => {
      const n = { v: 0 };
      tl.to(n, { v: +el.dataset.count, ease: 'none', duration: 0.2, onUpdate: () => (el.textContent = Math.round(n.v) + (el.dataset.suffix ?? '')) }, 0.2);
    });
    // Project cards turn over one by one like squares being flipped, then
    // each white piece steps onto its card.
    const tiles = content.querySelectorAll('.tile');
    if (tiles.length) {
      tl.fromTo(tiles, { autoAlpha: 0, rotateX: -75, y: 50, transformOrigin: '50% 100%' },
        { autoAlpha: 1, rotateX: 0, y: 0, ease: 'none', duration: 0.1, stagger: 0.022 }, 0.15);
      tl.fromTo(content.querySelectorAll('.tile__piece'), { y: 30, autoAlpha: 0, scale: 0.6 },
        { y: 0, autoAlpha: 1, scale: 1, ease: 'none', duration: 0.08, stagger: 0.022 }, 0.21);
    }
    if (!isLast) tl.to(content, { autoAlpha: 0, y: -90, rotateY: -10 * dir, ease: 'none', duration: 0.24 }, 0.72);
    tl.set({}, {}, 1);
  });
}

// Cards alternate the board's maple and walnut, whatever the column count.
const tileEls = [...document.querySelectorAll('.tile')];
function paintTiles() {
  const cols = isMobile() ? 2 : 3;
  tileEls.forEach((t, i) => t.classList.toggle('is-light', (Math.floor(i / cols) + (i % cols)) % 2 === 0));
}
paintTiles();

/* Anchor links land with the section's text centred */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    const top = el.getBoundingClientRect().top + scrollY;
    const y = el.id === 'hero' ? 0 : top + Math.max(0, (el.offsetHeight - innerHeight) / 2);
    if (lenis) lenis.scrollTo(y, { duration: 2, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  // TODO: send to your backend / Formspree / email API.
  e.target.querySelector('button').textContent = 'Sent · 1–0';
});

addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / innerHeight) * 2 - 1);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  measure();
  paintTiles();
});
measure();
document.fonts?.ready.then(() => { measure(); ScrollTrigger.refresh(); });

/* ================================================================== */
/* Loop                                                                */
/* ================================================================== */
// Rendered from GSAP's ticker, registered after Lenis's, so every frame draws
// with the scroll position Lenis just set (a separate rAF loop could run
// first and lag a frame behind, which shows up as jitter).
const clock = new THREE.Clock();
let u = scrollToU();
gsap.ticker.add(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const target = scrollToU();
  u = lenis ? target : u + (target - u) * (1 - Math.exp(-dt * 8)); // Lenis already smooths
  applyCamera(u, time, dt);
  const state = applyPieces(u, time);
  applyLights(time);
  updateUI(state);
  renderer.render(scene, camera);
});
