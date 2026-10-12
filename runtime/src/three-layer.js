// Optional 3D layer. Renders toon-shaded models with wobbling ink outlines into an
// offscreen WebGL canvas, which main.js composites between the back and front 2D layers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { S, deg, color } from './core.js';
import { PRESETS } from './presets.js';

let R = null, scene, cam, gradMap, outlineMat, Ro = 1, anyVisible = false;
const instances = [];
const texCache = {};

export function init() {
  if (R) return;
  const cv = document.createElement('canvas');
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  R.setClearColor(0, 0); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, 16 / 9, 8, 90); // tight range = depth precision for thin decals
  const sun = new THREE.DirectionalLight(0xffffff, S.theme.toon.light ?? 2.3);
  sun.position.set(-6, 10, 12); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, S.theme.toon.ambient ?? 0.9));
  const steps = S.theme.toon.steps || [90, 170, 255];
  gradMap = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter; gradMap.needsUpdate = true;
  outlineMat = new THREE.ShaderMaterial({
    uniforms: { uW: { value: 5.5 }, uT: { value: 0 }, uJ: { value: 0.45 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uCol: { value: new THREE.Color(color('ink')) } },
    vertexShader: `uniform float uW, uT, uJ; uniform vec2 uRes;
      void main(){
        vec4 c = projectionMatrix * modelViewMatrix * vec4(position,1.);
        vec3 n = normalize(normalMatrix * normal);
        vec2 d = (projectionMatrix * vec4(n,0.)).xy; d = normalize(d + 1e-5);
        float wob = 1. + uJ*sin(position.y*2.3 + position.x*3.1 + uT*6.283);
        c.xy += d * uW * wob * c.w * 2. / uRes;
        gl_Position = c; }`,
    fragmentShader: 'uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol,1.); }',
    side: THREE.BackSide,
  });
  resize();
}

export function resize() {
  if (!R) return;
  const pw = Math.round(S.W * S.scale), ph = Math.round(S.H * S.scale);
  R.setPixelRatio(1); R.setSize(pw, ph, false);
  cam.aspect = S.W / S.H; cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0); cam.fov = 30; cam.updateProjectionMatrix();
  Ro = S.H / (2 * 40 * Math.tan((15 * Math.PI) / 180)); // logical px per world unit at z=0
  outlineMat.uniforms.uRes.value.set(pw, ph);
  outlineMat.uniforms.uW.value = (S.theme.toon.outline ?? 5.5) * S.scale;
}

export const toon = (c) => new THREE.MeshToonMaterial({ color: new THREE.Color(color(c)), gradientMap: gradMap });
// flat = unlit decal (screens, keys, lenses): pulled toward camera to beat z-fighting
const decal = (m) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
const flat = (c) => decal(new THREE.MeshBasicMaterial({ color: new THREE.Color(color(c)) }));

// ---------- geometry builders ----------
function roundRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function normUV(g, w, h) {
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  uv.needsUpdate = true; return g;
}
function geom(sh) {
  const z = sh.size || [1, 1, 1];
  switch (sh.kind) {
    case 'slab': { // rounded-rect extruded along Z, centered
      const [w, h, d] = z, r = sh.radius ?? Math.min(w, h) * 0.12, b = Math.min(d * 0.35, r * 0.5);
      const g = new THREE.ExtrudeGeometry(roundRectShape(w - b * 2, h - b * 2, Math.max(0.01, r - b)), { depth: d - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
      g.translate(0, 0, -(d - b * 2) / 2); g.computeVertexNormals(); return g;
    }
    case 'roundRect': { const [w, h] = z; return normUV(new THREE.ShapeGeometry(roundRectShape(w, h, sh.radius ?? Math.min(w, h) * 0.08), 10), w, h); }
    case 'box': return new THREE.BoxGeometry(z[0], z[1], z[2]);
    case 'sphere': return new THREE.SphereGeometry(z[0], 32, 20);
    case 'cylinder': return new THREE.CylinderGeometry(z[0], z[1] ?? z[0], z[2] ?? 1, 40);
    case 'cone': return new THREE.ConeGeometry(z[0], z[1] ?? 1, 40);
    case 'torus': return new THREE.TorusGeometry(z[0], z[1] ?? 0.2, 16, 48);
    case 'capsule': return new THREE.CapsuleGeometry(z[0], z[1] ?? 1, 8, 24);
    case 'disc': return new THREE.CircleGeometry(z[0], 40);
    case 'plane': return new THREE.PlaneGeometry(z[0], z[1]);
    default: throw new Error('unknown shape kind: ' + sh.kind);
  }
}
const NO_OUTLINE = new Set(['plane', 'disc', 'roundRect']);

function buildShapes(list, parent, meshes) {
  for (const sh of list) {
    let o;
    if (sh.kind === 'group') { o = new THREE.Group(); buildShapes(sh.children || [], o, meshes); }
    else {
      const g = geom(sh);
      o = new THREE.Mesh(g, sh.shade === 'flat' ? flat(sh.color || '#888') : toon(sh.color || '#888'));
      o.userData.part = sh.part || sh.id; o.userData.flat = sh.shade === 'flat';
      if (sh.outline ?? !NO_OUTLINE.has(sh.kind)) { const ol = new THREE.Mesh(g, outlineMat); ol.userData.isOutline = true; o.add(ol); }
      meshes.push(o);
    }
    o.name = sh.id || '';
    if (sh.pos) o.position.set(...sh.pos);
    if (sh.rot) { o.rotation.order = 'YXZ'; o.rotation.set(deg(sh.rot[0]), deg(sh.rot[1]), deg(sh.rot[2])); }
    if (sh.scale) Array.isArray(sh.scale) ? o.scale.set(...sh.scale) : o.scale.setScalar(sh.scale);
    parent.add(o);
  }
}

// def: {preset} | {shapes:[...]} | {glb: base64} ; returns template record
export async function loadModel(name, def, b64) {
  init();
  const root = new THREE.Group(), meshes = [];
  let presetAnchors = {};
  if (def.preset || def.shapes) {
    if (def.preset && !PRESETS[def.preset]) throw new Error(`unknown preset "${def.preset}". available: ${Object.keys(PRESETS).join(', ')}`);
    const P = def.preset ? PRESETS[def.preset]() : { shapes: def.shapes, anchors: {} };
    presetAnchors = P.anchors || {};
    buildShapes(P.shapes, root, meshes);
  } else if (b64) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin, '', res, rej));
    root.add(gltf.scene);
    const all = [];
    gltf.scene.traverse((m) => { if (m.isMesh) all.push(m); });
    const tot = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).length();
    for (const m of all) {
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      const mat = new THREE.MeshToonMaterial({ color: src.color ? src.color.clone() : new THREE.Color('#888'), map: src.map || null, gradientMap: gradMap });
      m.material = mat; m.userData.part = src.name || m.name;
      const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).length();
      if (def.outline !== false && sz > tot * (def.outlineMin ?? 0.04)) { const ol = new THREE.Mesh(m.geometry, outlineMat); ol.userData.isOutline = true; m.add(ol); }
      meshes.push(m);
    }
  } else throw new Error(`model "${name}" needs preset, shapes, or src`);

  // center on bbox
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group(); root.position.sub(c); pivot.add(root); pivot.updateMatrixWorld(true);
  const anchors = {};
  pivot.traverse((o) => { if (o.name && !o.userData.isOutline) { const b = new THREE.Box3().setFromObject(o); if (!b.isEmpty()) anchors[o.name] = b.getCenter(new THREE.Vector3()); } });
  for (const [k, v] of Object.entries({ ...presetAnchors, ...(def.anchors || {}) })) anchors[k] = new THREE.Vector3(...v).sub(c);
  return { name, pivot, size: box.getSize(new THREE.Vector3()), anchors };
}

// one instance per model element (lets each element recolor/retexture)
export function instance(tmpl, { colors = {}, textures = {} } = {}) {
  const root = tmpl.pivot.clone(true);
  root.rotation.order = 'YXZ';
  root.traverse((m) => {
    if (!m.isMesh || m.userData.isOutline) return;
    const part = m.userData.part, key = colors[part] ?? colors[m.name];
    const tex = textures[part] ?? textures[m.name];
    if (tex) m.material = decal(new THREE.MeshBasicMaterial({ map: texture(tex) }));
    else if (key) m.material = m.userData.flat ? flat(key) : toon(key);
  });
  root.visible = false; scene.add(root);
  const inst = { tmpl, root }; instances.push(inst); return inst;
}

function texture(spec) {
  const k = JSON.stringify(spec);
  if (texCache[k]) return texCache[k];
  let t;
  if (typeof spec === 'string') {
    const img = S.images[spec]; if (!img) throw new Error('missing image ' + spec);
    t = new THREE.Texture(img); t.needsUpdate = true;
  } else if (spec.gradient) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
    const x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512);
    spec.gradient.forEach((c, i) => g.addColorStop(i / Math.max(1, spec.gradient.length - 1), color(c)));
    x.fillStyle = g; x.fillRect(0, 0, 256, 512); t = new THREE.CanvasTexture(cv);
  }
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[k] = t);
}

export function beginFrame() { for (const i of instances) i.root.visible = false; anyVisible = false; }

// place instance so its bbox center (or a named anchor `pin`) lands on logical (x,y)
export function place(inst, x, y, px, rot = [0, 0, 0], { fit = 'height', pin = null } = {}) {
  const r = inst.root, sz = inst.tmpl.size;
  r.visible = true; anyVisible = true;
  r.rotation.set(deg(rot[0]), deg(rot[1]), deg(rot[2]));
  r.scale.setScalar(px / ((fit === 'width' ? sz.x : sz.y) * Ro));
  r.position.set((x - S.W / 2) / Ro, -(y - S.H / 2) / Ro, 0);
  if (pin) for (let k = 0; k < 2; k++) { const p = project(inst, pin); r.position.x += (x - p[0]) / Ro; r.position.y -= (y - p[1]) / Ro; }
}

const _v = new THREE.Vector3();
export function project(inst, pt) {
  const a = typeof pt === 'string' ? inst.tmpl.anchors[pt] : new THREE.Vector3(...pt);
  if (!a) throw new Error(`anchor "${pt}" not found. available: ${Object.keys(inst.tmpl.anchors).join(', ')}`);
  inst.root.updateMatrixWorld(true); _v.copy(a); inst.root.localToWorld(_v); _v.project(cam);
  return [(_v.x * 0.5 + 0.5) * S.W, (-_v.y * 0.5 + 0.5) * S.H];
}
export function screenBox(inst) {
  const s = inst.tmpl.size, xs = [], ys = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const p = project(inst, [sx * s.x / 2, sy * s.y / 2, sz * s.z / 2]); xs.push(p[0]); ys.push(p[1]); }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

export function render(ctx) {
  if (!R || !anyVisible) return;
  // ink outline wobble follows theme.jitter/motion; boil:false freezes it
  outlineMat.uniforms.uT.value = (S.btick / 12) * 0.5 * S.boil;
  outlineMat.uniforms.uJ.value = 0.45 * Math.min(S.jitter, 2);
  R.render(scene, cam);
  ctx.drawImage(R.domElement, 0, 0, S.W, S.H);
}
export const anchorsOf = (tmpl) => Object.keys(tmpl.anchors);
