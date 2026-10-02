// 步行模式:第三人称小人 + WASD 相对相机移动 + 跳跃/涉水
import * as THREE from 'three';
import { clamp, lerp } from './geo.js';
import { groundY, isWater } from './ground.js';
import { mat, put, UNIT } from './lib.js';

/** 程序化小人(胶囊 + 头 + 四肢摆动) */
function buildAvatar() {
  const g = new THREE.Group();
  const cloth = mat('#3a5a8c', { rough: 0.8 });
  const skin = mat('#d8a882', { rough: 0.9 });
  const pants = mat('#2c3038', { rough: 0.9 });
  put(g, UNIT.cyl, pants, { pos: [0, 0.0, 0], scale: [0.36, 0.85, 0.30] });            // 腿(整体近似)
  put(g, UNIT.box, cloth, { pos: [0, 0.85, 0], scale: [0.46, 0.62, 0.28] });           // 上身
  put(g, UNIT.sphere, skin, { pos: [0, 1.62, 0], scale: [0.24, 0.28, 0.24] });         // 头
  // 手臂(前后摆)
  const armL = put(g, UNIT.box, cloth, { pos: [-0.30, 0.95, 0], scale: [0.11, 0.52, 0.11] });
  const armR = put(g, UNIT.box, cloth, { pos: [0.30, 0.95, 0], scale: [0.11, 0.52, 0.11] });
  // 腿(两截,摆动)
  const legL = put(g, UNIT.box, pants, { pos: [-0.11, 0.42, 0], scale: [0.13, 0.44, 0.13] });
  const legR = put(g, UNIT.box, pants, { pos: [0.11, 0.42, 0], scale: [0.13, 0.44, 0.13] });
  g.userData.limbs = { armL, armR, legL, legR };
  return g;
}

export class Player {
  constructor(scene, x, z, heading = 0) {
    this.mesh = buildAvatar();
    this.mesh.position.set(x, groundY(x, z), z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.vy = 0;
    this.phase = 0;
    this.swimming = false;
  }

  update(dt, input, camYaw, nightK) {
    // 相对相机方向的移动
    let mx = 0, mz = 0;
    if (input.fwd) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.left) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
    if (input.right) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
    const moving = mx !== 0 || mz !== 0;
    const speed = this.swimming ? 2.6 : (input.boost ? 8.5 : 4.2);

    let nx = this.mesh.position.x, nz = this.mesh.position.z;
    if (moving) {
      const len = Math.hypot(mx, mz);
      nx += (mx / len) * speed * dt;
      nz += (mz / len) * speed * dt;
      this.heading = Math.atan2(mx, mz);
    }

    // 水域:游泳(贴水面),不能进深水中心太远——速度已降
    this.swimming = isWater(nx, nz);
    const gy = groundY(nx, nz);
    const floor = this.swimming ? 0.9 : gy;

    // 跳跃/重力
    if (input.jump && this.vy === 0 && !this.swimming) this.vy = 5.2;
    this.vy -= 14 * dt;
    let y = this.mesh.position.y + this.vy * dt;
    if (y <= floor) { y = floor; this.vy = 0; }

    this.mesh.position.set(nx, y, nz);
    // 朝向平滑
    let dh = this.heading - this.mesh.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.mesh.rotation.y += dh * Math.min(1, dt * 12);

    // 四肢摆动
    this.phase += dt * (moving ? (input.boost ? 13 : 8) : 0);
    const sw = moving ? Math.sin(this.phase) * 0.6 : 0;
    const L = this.mesh.userData.limbs;
    L.armL.rotation.x = sw;
    L.armR.rotation.x = -sw;
    L.legL.rotation.x = -sw * 0.9;
    L.legR.rotation.x = sw * 0.9;

    return { moving, speed };
  }

  /** 第三人称跟随相机(带肩部偏移) */
  applyCamera(camera, dt, camYaw, camPitch) {
    const dist = 7.5, height = 3.0 + Math.sin(camPitch) * 3;
    const cx = this.mesh.position.x - Math.sin(camYaw) * dist;
    const cz = this.mesh.position.z - Math.cos(camYaw) * dist;
    const cy = this.mesh.position.y + height;
    const k = 1 - Math.pow(0.0003, dt);
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), k);
    camera.lookAt(this.mesh.position.x, this.mesh.position.y + 1.5, this.mesh.position.z);
  }
}
