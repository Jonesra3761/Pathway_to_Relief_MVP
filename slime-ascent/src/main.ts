import * as THREE from 'three';

// The tower is played side-on: everything moves in the x/y plane and the
// camera always faces it from the front, so walls can never block the view.

type Rect = { x: number; y: number; w: number; h: number; mesh: THREE.Mesh; sweep?: { range: number; speed: number } };
type Mode = { name: string; speed: number; gravity: number; catch: number; color: number };

const TOWER_HALF = 7;
const LAYER_HEIGHT = 10;
const LAYERS = 5;
const RADIUS = 0.65;
// How much speed survives a bounce. Walls are springy so you can bank shots off them.
const WALL_BOUNCE = 0.85;
const LEDGE_BOUNCE = 0.7;
// Below this impact speed the slime stops bouncing and settles instead of jittering.
const SETTLE_SPEED = 1.2;
const DEPTH = 3;
const MODES: Mode[] = [
  { name: 'Light', speed: 15, gravity: 8, catch: 0.75, color: 0x5af0bc },
  { name: 'Medium', speed: 19, gravity: 10, catch: 0.9, color: 0x5dbfff },
  { name: 'Dense', speed: 23, gravity: 12, catch: 1.05, color: 0xb987ff },
];
const LAYER_COLORS = [0x2b4562, 0x33506b, 0x3d4f72, 0x4a4a74, 0x574770];

// Ledges are [centre x, centre y, width]; every ledge is 1 unit thick.
// Each layer's ceiling leaves a gap on a different side, so the route zig-zags upward.
const LEDGES: [number, number, number][] = [
  [0, -1, 14], // floor
  [-2.5, 10, 9], // layer 1 ceiling, gap on the right
  [0, 15, 4], // layer 2 block in the middle
  [2.5, 20, 9], // layer 2 ceiling, gap on the left
  [0, 25, 3], // layer 3 block over the centre
  [-4.75, 30, 4.5], // layer 3 ceiling, gap in the centre
  [4.75, 30, 4.5],
  [-2.5, 40, 9], // layer 4 ceiling, gap on the right
  [-1.5, 45, 3], // layer 5 overhang
  [0, 51, 14], // roof
];
// Layer 4 has a ledge that sweeps side to side.
const SWEEPER = { y: 35, w: 3, range: 3, speed: 0.9 };

const PINS: [number, number][] = [
  [0, 1.5], [-4.5, 4.5], [3, 7.5],
  [5, 12.5], [-4.5, 14], [-1, 17.5],
  [-5, 22.5], [4.5, 24], [-3, 27.5],
  [0, 32.5], [5.5, 37.8],
  [5, 42.5], [-4.5, 44], [-4.5, 47.6], [2, 49.4],
];
const SUMMIT = PINS.length - 1;

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14243a);
scene.fog = new THREE.Fog(0x14243a, 60, 160);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 250);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.querySelector('#app')!.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xa6dfff, 0x243049, 2.6));
const sun = new THREE.DirectionalLight(0xffd3a0, 2.6);
sun.position.set(6, 30, 20);
scene.add(sun);

const mat = (color: number, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, roughness });
function box(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

// Back wall, banded by layer, plus side walls. All sit behind or beside the play plane.
for (let i = 0; i < LAYERS; i++) box(0, i * LAYER_HEIGHT + 5, -DEPTH / 2 - 0.5, TOWER_HALF * 2 + 2, LAYER_HEIGHT, 1, LAYER_COLORS[i]);
for (const side of [-1, 1]) box(side * (TOWER_HALF + 0.5), 25, 0, 1, 54, DEPTH, 0x40536a);

const rects: Rect[] = LEDGES.map(([x, y, w]) => ({ x, y, w, h: 1, mesh: box(x, y, 0, w, 1, DEPTH, 0x6b7f99) }));
const sweeper: Rect = { x: 0, y: SWEEPER.y, w: SWEEPER.w, h: 1, mesh: box(0, SWEEPER.y, 0, SWEEPER.w, 1, DEPTH, 0xe0875a), sweep: SWEEPER };
rects.push(sweeper);

const pins = PINS.map(([x, y], i) => {
  const p = new THREE.Vector3(x, y, 0);
  const color = i === SUMMIT ? 0xffd166 : i === 0 ? 0x71e7ef : 0xc5a57b;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 16), mat(color, 0.35));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, -0.8);
  scene.add(m);
  return p;
});

// Layer labels painted on the back wall.
for (let i = 0; i < LAYERS; i++) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.font = 'bold 40px system-ui, sans-serif';
  g.fillText(`LAYER ${i + 1}`, 10, 46);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  label.position.set(-TOWER_HALF + 2.4, i * LAYER_HEIGHT + 8.6, -DEPTH / 2 + 0.01);
  scene.add(label);
}

const slimeMat = new THREE.MeshPhysicalMaterial({ color: MODES[0].color, transparent: true, opacity: 0.88, roughness: 0.12, clearcoat: 1 });
const slime = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 32, 24), slimeMat);
scene.add(slime);
for (const x of [-0.23, 0.23]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mat(0x12293d));
  eye.position.set(x, 0.1, 0.6);
  slime.add(eye);
}
const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 12), slimeMat);
scene.add(tether);
const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.18 }));
scene.add(path);

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
const modeButtons = MODES.map((m, i) => {
  const b = document.createElement('button');
  b.textContent = m.name;
  b.onclick = () => setMode(i);
  $('modes').append(b);
  return b;
});
$('restart').onclick = reset;

// ---------- state ----------
let mode = 0, attached = 0, air = false, aiming = false, finished = false;
let started = 0, elapsed = 0, misses = 0, streak = 0, topY = 0, restTime = 0, flight = 0, missFlash = 0;
let bounces = 0, bankFlash = 0, bankCount = 0, squash = 0;
const squashNormal = new THREE.Vector2();
let time = 0;
const pos = new THREE.Vector3(), vel = new THREE.Vector3();
const dragStart = new THREE.Vector2(), drag = new THREE.Vector2();
let best = loadBest();

function loadBest() { try { return Number(localStorage.getItem('slime-ascent-best')) || 0; } catch { return 0; } }
function saveBest(t: number) { try { localStorage.setItem('slime-ascent-best', String(t)); } catch { /* storage unavailable */ } }

function setMode(i: number) {
  if (air) return;
  mode = i;
  slimeMat.color.setHex(MODES[i].color);
  modeButtons.forEach((b, j) => b.classList.toggle('active', j === i));
}

function hangPoint(i: number) { return pins[i].clone().add(new THREE.Vector3(0, -1, 0)); }

function reset() {
  attached = 0; air = false; aiming = false; finished = false;
  started = 0; elapsed = 0; misses = 0; streak = 0; topY = 0; bounces = 0; bankFlash = 0; squash = 0;
  pos.copy(hangPoint(0)); vel.set(0, 0, 0);
  camera.position.set(0, pos.y + 3, camDistance());
}

// ---------- physics ----------
function updateSweeper(r: Rect, t: number) {
  if (!r.sweep) return;
  r.x = Math.sin(t * r.sweep.speed) * r.sweep.range;
  r.mesh.position.x = r.x;
}

type BounceHandler = (x: number, y: number, nx: number, ny: number, speed: number) => void;

// Reflect the velocity off a surface with normal (nx, ny); a slow touch settles instead.
function bounce(v: THREE.Vector3, nx: number, ny: number, restitution: number, onBounce?: BounceHandler, p?: THREE.Vector3) {
  const vn = v.x * nx + v.y * ny;
  if (vn >= 0) return;
  const e = -vn < SETTLE_SPEED ? 0 : restitution;
  v.x -= (1 + e) * vn * nx; v.y -= (1 + e) * vn * ny;
  if (e > 0 && onBounce && p) onBounce(p.x - nx * RADIUS, p.y - ny * RADIUS, nx, ny, -vn);
}

// Push a circle out of every ledge and wall it overlaps and bounce it. Returns true on contact.
function collide(p: THREE.Vector3, v: THREE.Vector3, onBounce?: BounceHandler) {
  let hit = false;
  for (const r of rects) {
    const cx = THREE.MathUtils.clamp(p.x, r.x - r.w / 2, r.x + r.w / 2);
    const cy = THREE.MathUtils.clamp(p.y, r.y - r.h / 2, r.y + r.h / 2);
    let nx = p.x - cx, ny = p.y - cy;
    let d = Math.hypot(nx, ny);
    if (d >= RADIUS) continue;
    if (d === 0) { nx = 0; ny = p.y >= r.y ? 1 : -1; d = 0; } else { nx /= d; ny /= d; }
    p.x += nx * (RADIUS - d); p.y += ny * (RADIUS - d);
    bounce(v, nx, ny, LEDGE_BOUNCE, onBounce, p);
    hit = true;
  }
  const wall = TOWER_HALF - RADIUS;
  if (Math.abs(p.x) > wall) {
    p.x = Math.sign(p.x) * wall;
    bounce(v, -Math.sign(p.x), 0, WALL_BOUNCE, onBounce, p);
    hit = true;
  }
  return hit;
}

function catchablePin(p: THREE.Vector3) {
  const reach = MODES[mode].catch + (streak >= 3 ? 0.3 : 0);
  for (let i = 0; i < pins.length; i++) if (i !== attached && p.distanceTo(pins[i]) < reach) return i;
  return -1;
}

const SUBSTEPS = 4;
function step(p: THREE.Vector3, v: THREE.Vector3, dt: number, onBounce?: BounceHandler) {
  v.y -= MODES[mode].gravity * dt;
  p.addScaledVector(v, dt);
  return collide(p, v, onBounce);
}

function launchVelocity() {
  // Slingshot: pull back, and the slime flies the opposite way.
  const power = Math.min(drag.length() / 130, 1.3) * MODES[mode].speed;
  return new THREE.Vector3(-drag.x, drag.y, 0).normalize().multiplyScalar(power);
}

// Long enough to show the first bank shot off a wall.
const PREVIEW_SECONDS = 1.3;
function previewPath() {
  const p = hangPoint(attached).addScaledVector(launchVelocity().normalize(), -0.4), v = launchVelocity();
  const pts = [p.clone()];
  const dt = 1 / 60 / SUBSTEPS;
  for (let i = 0; i < 60 * SUBSTEPS * PREVIEW_SECONDS; i++) {
    step(p, v, dt);
    if (i % SUBSTEPS === 0) pts.push(p.clone());
    if (catchablePin(p) >= 0) { pts.push(p.clone()); break; }
  }
  path.geometry.dispose();
  path.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  path.computeLineDistances();
}

// ---------- bounce feedback ----------
const rings = Array.from({ length: 6 }, () => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  scene.add(m);
  return { mesh: m, life: 0 };
});
let nextRing = 0;
function onBounce(x: number, y: number, nx: number, ny: number, speed: number) {
  bounces++;
  squash = Math.min(1, speed / 12);
  squashNormal.set(nx, ny);
  const r = rings[nextRing++ % rings.length];
  r.life = 1;
  r.mesh.position.set(x, y, 0.2);
  (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(MODES[mode].color);
}
function updateRings(dt: number) {
  for (const r of rings) {
    r.life = Math.max(0, r.life - dt * 2.5);
    r.mesh.visible = r.life > 0;
    r.mesh.scale.setScalar(1 + (1 - r.life) * 1.6);
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.life * 0.9;
  }
}

function miss() {
  air = false; misses++; streak = 0; missFlash = 1.6;
  pos.copy(hangPoint(attached)); vel.set(0, 0, 0);
}

// ---------- input: drag anywhere to aim ----------
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => {
  if (air || finished) return;
  canvas.setPointerCapture(e.pointerId);
  aiming = true;
  dragStart.set(e.clientX, e.clientY);
  drag.set(0, 0);
  $('tutorial').hidden = true;
});
canvas.addEventListener('pointermove', e => { if (aiming) drag.set(e.clientX - dragStart.x, e.clientY - dragStart.y); });
canvas.addEventListener('pointerup', () => {
  if (aiming && drag.length() > 15) {
    vel.copy(launchVelocity());
    air = true; flight = 0; restTime = 0; bounces = 0;
    if (!started) started = performance.now();
  }
  aiming = false;
});
canvas.addEventListener('pointercancel', () => { aiming = false; });

// ---------- camera ----------
// Pull the camera back far enough to show the whole tower width on any screen.
function camDistance() {
  const halfWidth = TOWER_HALF + 1.5;
  return THREE.MathUtils.clamp(halfWidth / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), 24, 64);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- loop ----------
let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now; time += dt;
  updateSweeper(sweeper, time);
  const anchor = pins[attached];

  if (air) {
    flight += dt;
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS && air; s++) {
      const contact = step(pos, vel, h, onBounce);
      restTime = contact && vel.length() < 1.5 ? restTime + h : 0;
      const found = catchablePin(pos);
      if (found >= 0) {
        attached = found; air = false; streak++;
        if (bounces > 0) { bankFlash = 1.6; bankCount = bounces; }
        if (found === SUMMIT) {
          finished = true; elapsed = (now - started) / 1000;
          if (!best || elapsed < best) { best = elapsed; saveBest(best); }
        }
      }
    }
    if (air && (flight > 5 || pos.y < anchor.y - 12 || restTime > 0.4)) miss();
  }
  if (!air) {
    pos.copy(pins[attached]).add(new THREE.Vector3(Math.sin(now * 0.002) * 0.08, -1, 0));
    if (aiming && drag.length() > 15) pos.addScaledVector(launchVelocity().normalize(), -0.4);
  }
  topY = Math.max(topY, pos.y);

  slime.position.copy(pos);
  // Squash flat against whatever it just hit, then spring back.
  squash = Math.max(0, squash - dt * 5);
  const sx = air ? 1.08 : 0.84, sy = air ? 0.93 : 1.25;
  const flatX = squash * 0.45 * Math.abs(squashNormal.x), flatY = squash * 0.45 * Math.abs(squashNormal.y);
  slime.scale.set(sx * (1 - flatX + flatY * 0.6), sy * (1 - flatY + flatX * 0.6), air ? 1.08 : 0.84);
  updateRings(dt);
  tether.visible = !air;
  if (!air) {
    const a = pins[attached], delta = pos.clone().sub(a);
    tether.position.copy(a).add(pos).multiplyScalar(0.5);
    tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    tether.scale.set(1, delta.length(), 1);
  }
  path.visible = aiming && drag.length() > 15;
  if (path.visible) previewPath();

  // Frame the slime low on screen so the obstacles above it are visible.
  const target = new THREE.Vector3(pos.x * 0.15, pos.y + 3.5, 0);
  camera.position.lerp(new THREE.Vector3(target.x, target.y + 1, camDistance()), 0.08);
  camera.lookAt(target.x, camera.position.y - 1, 0);

  // HUD
  const t = finished ? elapsed : started ? (now - started) / 1000 : 0;
  const layer = Math.min(LAYERS, Math.floor(Math.max(topY, 0) / LAYER_HEIGHT) + 1);
  $('time').textContent = `${t.toFixed(1)}s`;
  $('layer').textContent = `${layer}/${LAYERS}`;
  $('misses').textContent = String(misses);
  $('best').textContent = best ? `${best.toFixed(1)}s` : '—';
  missFlash = Math.max(0, missFlash - dt);
  bankFlash = Math.max(0, bankFlash - dt);
  $('hint').textContent = finished ? 'Summit reached! Restart to race again.'
    : missFlash > 0 ? 'Missed. Back to your last pin.'
    : bankFlash > 0 ? (bankCount > 1 ? `Bank shot ×${bankCount}!` : 'Bank shot!')
    : air ? 'Catch a pin!'
    : aiming ? 'Release to fling'
    : 'Drag anywhere and pull back to aim';
  renderer.render(scene, camera);
}

setMode(0);
reset();
requestAnimationFrame(frame);
