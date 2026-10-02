// 载具:街机车辆(加速/转向/漂移手感)+ 追尾相机 + 车体网格
import * as THREE from 'three';
import { clamp, lerp } from './geo.js';
import { groundY, isWater } from './ground.js';
import { bridgeHeightAt } from './bridges.js';
import { mat, put, UNIT, registerEnv } from './lib.js';

/* ---------- 车体(程序化小轿车) ---------- */
export function buildCarMesh(bodyColor = '#c9412e') {
  const g = new THREE.Group();
  const paint = mat(bodyColor, { rough: 0.28, metal: 0.5, env: 1.3 });
  const glass = mat('#20303a', { rough: 0.12, metal: 0.4, env: 1.5 });
  const dark = mat('#1c1e22', { rough: 0.7 });
  // 车身(前低后高的两段)
  put(g, UNIT.box, paint, { pos: [0, 0.55, 0], scale: [1.84, 0.62, 4.6] });         // 底盘体
  put(g, UNIT.box, paint, { pos: [0, 1.02, -0.25], scale: [1.7, 0.52, 2.5] });      // 座舱
  put(g, UNIT.box, glass, { pos: [0, 1.06, -0.25], scale: [1.56, 0.4, 2.2] });      // 玻璃舱
  put(g, UNIT.box, dark, { pos: [0, 0.5, 2.28], scale: [1.6, 0.34, 0.3] });         // 前杠
  put(g, UNIT.box, dark, { pos: [0, 0.5, -2.28], scale: [1.6, 0.34, 0.3] });        // 后杠
  // 车灯(夜间点亮)
  const headMat = mat('#fff4d8', { emissive: '#ffedb0', emissiveIntensity: 0.1 });
  headMat.userData.nightGlow = 3.2;
  const tailMat = mat('#7a1410', { emissive: '#c01808', emissiveIntensity: 0.1 });
  tailMat.userData.nightGlow = 2.6;
  for (const sx of [-0.62, 0.62]) {
    put(g, UNIT.box, headMat, { pos: [sx, 0.86, 2.31], scale: [0.42, 0.16, 0.06] });
    put(g, UNIT.box, tailMat, { pos: [sx, 0.86, -2.31], scale: [0.42, 0.16, 0.06] });
  }
  // 车轮
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14).rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.5], [0.86, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.34, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.headMat = headMat;
  g.userData.tailMat = tailMat;
  return g;
}

/* ---------- 车辆控制 ---------- */
export class Vehicle {
  constructor(scene, x, z, heading = 0) {
    this.mesh = buildCarMesh();
    this.mesh.position.set(x, groundY(x, z), z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.drift = 0;
    this.inWater = false;
  }

  update(dt, input, nightK) {
    const MAX = input.boost ? 52 : 36;          // m/s(约 130/187 km/h)
    const accel = input.boost ? 16 : 11;
    // 油门/刹车/倒车
    if (input.throttle > 0) this.speed += accel * input.throttle * dt;
    else if (input.throttle < 0) this.speed += input.throttle * (this.speed > 0.5 ? 22 : 7) * dt;
    if (input.brake) {
      const s = Math.sign(this.speed);
      this.speed -= s * Math.min(Math.abs(this.speed), 24 * dt);
    }
    // 阻力
    this.speed *= 1 - (0.35 + Math.abs(this.speed) * 0.006) * dt;
    this.speed = clamp(this.speed, -12, MAX);

    // 转向:速度越低转向越灵;高速压低
    const steerAuth = 2.6 / (1 + Math.abs(this.speed) * 0.045);
    const steerInput = input.steer * (input.drift ? 1.9 : 1);
    this.steer = lerp(this.steer, steerInput, 1 - Math.pow(0.0008, dt));
    this.heading -= this.steer * steerAuth * dt * clamp(Math.abs(this.speed) / 4, 0, 1) * Math.sign(this.speed || 1);
    // 漂移侧滑(视觉朝向滞后)
    const targetDrift = input.drift ? this.steer * 0.5 : 0;
    this.drift = lerp(this.drift, targetDrift, 1 - Math.pow(0.001, dt));

    // 位移
    const dir = this.heading + this.drift * 0.6;
    const nx = this.mesh.position.x + Math.sin(dir) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(dir) * this.speed * dt;

    // 水域:大幅减速并推回
    this.inWater = isWater(nx, nz) && bridgeHeightAt(nx, nz) == null;
    let fx = nx, fz = nz;
    if (this.inWater) {
      this.speed *= 0.4;
      fx = this.mesh.position.x + Math.sin(dir) * this.speed * dt * 0.2;
      fz = this.mesh.position.z + Math.cos(dir) * this.speed * dt * 0.2;
    }

    const gy = groundY(fx, fz);
    this.mesh.position.set(fx, lerp(this.mesh.position.y, gy, 1 - Math.pow(0.0001, dt)), fz);
    this.mesh.rotation.y = dir + this.drift * 0.9;
    // 车身侧倾 + 俯仰(手感)
    this.mesh.rotation.z = lerp(this.mesh.rotation.z, -this.steer * clamp(Math.abs(this.speed) / 40, 0, 1) * 0.09, 1 - Math.pow(0.001, dt));
    this.mesh.rotation.x = lerp(this.mesh.rotation.x, clamp((this.speed - this.lastSpeed || 0) * 0.02, -0.06, 0.06), 0.1);
    this.lastSpeed = this.speed;

    // 车轮滚动
    this.wheelSpin += this.speed * dt / 0.34;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;

    // 夜间车灯
    const hm = this.mesh.userData.headMat, tm = this.mesh.userData.tailMat;
    hm.emissiveIntensity = 0.1 + nightK * 3.2;
    tm.emissiveIntensity = 0.1 + nightK * 2.6;

    return this.speed;
  }

  /** 追尾相机 */
  applyCamera(camera, dt) {
    const back = 9 + Math.abs(this.speed) * 0.14;
    const cx = this.mesh.position.x - Math.sin(this.heading) * back;
    const cz = this.mesh.position.z - Math.cos(this.heading) * back;
    const cy = this.mesh.position.y + 3.6 + Math.abs(this.speed) * 0.02;
    const k = 1 - Math.pow(0.0005, dt);
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), k);
    const lx = this.mesh.position.x + Math.sin(this.heading) * 10;
    const lz = this.mesh.position.z + Math.cos(this.heading) * 10;
    camera.lookAt(lx, this.mesh.position.y + 1.6, lz);
  }
}
