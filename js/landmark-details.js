// Reusable, metre-scaled details. Shared textures/materials keep landmark draw calls bounded.
import * as THREE from 'three';
import { mat, put, UNIT, instancedBoxes, registerEnv } from './lib.js';
import { footprintOverlapsWater } from './water-mask.js';

let tileMap;
const roofs = new Map();
export function tileMaterial(color) {
  if (roofs.has(color)) return roofs.get(color);
  if (!tileMap) {
    const n = 64, pixels = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const joint = y % 16 < 2;
      const v = Math.round(joint ? 130 : 206 + 28 * Math.cos(x / n * Math.PI * 2) + 9 * Math.sin(y * .8));
      const i = (y * n + x) * 4;
      pixels.set([v, v, v, 255], i);
    }
    tileMap = new THREE.DataTexture(pixels, n, n);
    tileMap.colorSpace = THREE.SRGBColorSpace;
    tileMap.wrapS = tileMap.wrapT = THREE.RepeatWrapping;
    tileMap.magFilter = THREE.LinearFilter;
    tileMap.minFilter = THREE.LinearMipmapLinearFilter;
    tileMap.generateMipmaps = true;
    tileMap.needsUpdate = true;
  }
  const material = new THREE.MeshStandardMaterial({ color, map: tileMap,
    roughness: .86, metalness: 0, side: THREE.DoubleSide, envMapIntensity: .35 });
  registerEnv(material, .35);
  roofs.set(color, material);
  return material;
}

export function localSite(parent, x, z, y, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z); group.rotation.y = rot; parent.add(group);
  return group;
}

// Windows sit outside the opaque shell; frames and mullions are instanced by material.
export function facade(parent, { w, d, h, y = 0, floors = 2, bays = 7, trim = '#d4ccb9', glass = '#354b52' }) {
  const panes = [], frames = [];
  for (const side of [-1, 1]) for (const axis of [0, 1]) {
    const len = axis ? d : w, count = Math.max(2, Math.round(bays * len / w));
    const fy = h / floors;
    for (let f = 0; f < floors; f++) for (let b = 0; b < count; b++) {
      const along = (b + .5) * len / count - len / 2;
      const ww = Math.min(2.8, len / count * .54), hh = fy * .57;
      const x = axis ? side * (w / 2 + .1) : along;
      const z = axis ? along : side * (d / 2 + .1);
      const yy = y + f * fy + fy * .21, rot = axis ? Math.PI / 2 : 0;
      panes.push({ x, z, y: yy, w: ww, h: hh, d: .12, rot });
      for (const dx of [-ww / 2, 0, ww / 2]) frames.push({ x: x + (axis ? 0 : dx), z: z + (axis ? dx : 0), y: yy - .12, w: .16, h: hh + .24, d: .24, rot });
      for (const dy of [-.12, hh * .5, hh]) frames.push({ x, z, y: yy + dy, w: ww + .3, h: .16, d: .26, rot });
    }
    for (let f = 0; f <= floors; f++) frames.push({ x: axis ? side * (w / 2 + .18) : 0,
      z: axis ? 0 : side * (d / 2 + .18), y: y + f * fy, w: len + .4, h: .24, d: .38, rot: axis ? Math.PI / 2 : 0 });
  }
  // Flat facade details need two triangles each, rather than twelve per tiny box.
  // Lift frames off the glazing to prevent coplanar flicker at grazing angles.
  for (const frame of frames) {
    if (Math.abs(frame.x) > w / 2) frame.x += Math.sign(frame.x) * .09;
    else frame.z += Math.sign(frame.z) * .09;
  }
  const panels = (items, material) => {
    const mesh = instancedBoxes(items, material);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
    parent.add(mesh);
  };
  const glazing = mat(glass, { rough: .48, metal: .12, env: .65, side: THREE.DoubleSide,
    emissive: '#8c7551', emissiveIntensity: 0 });
  glazing.userData.nightGlow = .45;
  panels(panes, glazing);
  panels(frames, mat(trim, { rough: .86, side: THREE.DoubleSide }));
}

export function entranceSteps(parent, w, depth, height, z, color = '#b8b2a2') {
  const count = Math.max(3, Math.ceil(height / .22)), boxes = [];
  for (let i = 0; i < count; i++) boxes.push({ x: 0, z: z + depth * (1 - (i + .5) / count), y: 0,
    w, h: height * (i + 1) / count, d: depth / count + .015 });
  parent.add(instancedBoxes(boxes, mat(color, { rough: .94 })));
}

export function plaque(parent, text, w, h, x, y, z) {
  const material = mat('#292922', { rough: .85 });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#292922'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#b9a57c'; ctx.lineWidth = 6; ctx.strokeRect(9, 9, 494, 110);
    ctx.fillStyle = '#d8c69e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '64px serif'; ctx.fillText(text, 256, 66, 460);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const m = material.clone(); m.color.set('#ffffff'); m.map = tex;
    return put(parent, UNIT.box, m, { pos: [x, y, z], scale: [w, h, .18] });
  }
  return put(parent, UNIT.box, material, { pos: [x, y, z], scale: [w, h, .18] });
}

export function dryBuilding(x, z, w, d, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return !footprintOverlapsWater([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b]) => [x+a*c+b*s,z-a*s+b*c]));
}
