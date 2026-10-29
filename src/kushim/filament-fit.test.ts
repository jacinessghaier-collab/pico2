import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Raycaster, Vector3, type BufferGeometry, type Mesh, type Object3D } from "three";
import { createKushim, SHOULDER_LINE, type Rig } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

function tubeOn(parent: Object3D) {
  let best: Mesh | null = null;
  let span = 0.3;
  for (const child of parent.children) {
    const mesh = child as Mesh;
    if (!mesh.isMesh) continue;
    const pos = mesh.geometry?.getAttribute?.("position");
    if (!pos || mesh.geometry.getAttribute("aRank")) continue;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxY - minY > span) {
      best = mesh;
      span = maxY - minY;
    }
  }
  if (!best) throw new Error("limb tube missing");
  return best.geometry;
}

function nervePoints(parent: Object3D, material: Rig["nerve"]) {
  const out: Array<{ x: number; y: number; z: number }> = [];
  const seen = new Set<string>();
  for (const child of parent.children) {
    const mesh = child as Mesh;
    if (!mesh.isMesh || mesh.material !== material) continue;
    const pos = mesh.geometry?.getAttribute?.("position");
    if (!pos || !mesh.geometry.getAttribute("aRank")) continue;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const key = `${x.toFixed(5)}:${y.toFixed(5)}:${z.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y, z });
    }
  }
  return out;
}

function glassPoints(geo: BufferGeometry) {
  const pos = geo.getAttribute("position");
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < pos.count; i++) {
    out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  }
  return out;
}

/** How far a centerline sits outside the glass slice at the same height. */
function overflow(point: { x: number; y: number; z: number }, glass: Array<{ x: number; y: number; z: number }>) {
  const band = glass.filter((p) => Math.abs(p.y - point.y) < 0.018);
  if (band.length < 8) return 0;
  let cx = 0;
  let cz = 0;
  for (const p of band) {
    cx += p.x;
    cz += p.z;
  }
  cx /= band.length;
  cz /= band.length;
  const dx = point.x - cx;
  const dz = point.z - cz;
  const rad = Math.hypot(dx, dz);
  if (rad < 1e-5) return 0;
  const ang = Math.atan2(dz, dx);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let ray = 0;
  for (const q of band) {
    const dot = (q.x - cx) * c + (q.z - cz) * s;
    if (dot > ray) ray = dot;
  }
  return rad - ray;
}

/**
 * Centerline radius over the lathe surface at the same height.
 * Rings are read off the torso mesh and lerped, so a taper is not scored
 * against a narrower neighbor. 1 sits on the glass.
 */
function shellRatio(
  point: { x: number; y: number; z: number },
  rings: Array<{ y: number; pts: Array<{ x: number; z: number }> }>,
) {
  if (rings.length < 2) return 0;
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].y < point.y) i += 1;
  const a = rings[i];
  const b = rings[Math.min(rings.length - 1, i + 1)];
  const span = b.y - a.y;
  const t = span < 1e-6 ? 0 : Math.min(1, Math.max(0, (point.y - a.y) / span));
  const rayOf = (ring: { pts: Array<{ x: number; z: number }> }) => {
    let cx = 0;
    let cz = 0;
    for (const p of ring.pts) {
      cx += p.x;
      cz += p.z;
    }
    cx /= ring.pts.length;
    cz /= ring.pts.length;
    const dx = point.x - cx;
    const dz = point.z - cz;
    const rad = Math.hypot(dx, dz);
    if (rad < 1e-5) return { rad: 0, ray: 1 };
    const ang = Math.atan2(dz, dx);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let ray = 0;
    for (const q of ring.pts) {
      const dot = (q.x - cx) * c + (q.z - cz) * s;
      if (dot > ray) ray = dot;
    }
    return { rad, ray: Math.max(ray, 1e-4) };
  };
  const left = rayOf(a);
  const right = rayOf(b);
  const rad = left.rad * (1 - t) + right.rad * t;
  const ray = left.ray * (1 - t) + right.ray * t;
  return rad / ray;
}

describe("filament fit", () => {
  let rig: Rig;
  before(() => {
    rig = createKushim();
  });

  it("fills the chest and keeps torso centerlines off the cyan rim", () => {
    const torso = rig.chest.children.find((child) => child.userData.lockKey === "torso") as Mesh | undefined;
    if (!torso) throw new Error("torso glass missing");
    const pos = torso.geometry.getAttribute("position");
    const byY = new Map<number, Array<{ x: number; z: number }>>();
    for (let i = 0; i < pos.count; i++) {
      const y = Math.round(pos.getY(i) * torso.scale.y * 10000) / 10000;
      const list = byY.get(y);
      const p = { x: pos.getX(i) * torso.scale.x, z: pos.getZ(i) * torso.scale.z };
      if (list) list.push(p);
      else byY.set(y, [p]);
    }
    const rings = [...byY.entries()]
      .map(([y, pts]) => ({ y, pts }))
      .sort((a, b) => a.y - b.y);
    const nerves = nervePoints(rig.chest, rig.nerve);
    assert.ok(nerves.length > 18000, `torso centerlines ${nerves.length}`);
    const chest = nerves.filter((p) => p.y >= 0.06 && p.y <= 0.3);
    assert.ok(chest.length > 18000, `chest centerlines ${chest.length}, was a sparse web`);
    let worst = 0;
    let kissed = 0;
    const ratios: number[] = [];
    for (const p of nerves) {
      const ratio = shellRatio(p, rings);
      if (ratio <= 0) continue;
      ratios.push(ratio);
      worst = Math.max(worst, ratio);
      if (ratio > 0.84) kissed += 1;
    }
    assert.ok(ratios.length > 1000, `torso samples against the glass ${ratios.length}`);
    ratios.sort((a, b) => a - b);
    const mid = ratios[Math.floor(ratios.length / 2)] ?? 0;
    assert.ok(worst <= 0.84, `torso centerline reaches ${worst} of the glass`);
    assert.equal(kissed, 0, `${kissed} centerlines sit on the rim`);
    assert.ok(mid >= 0.35 && mid <= 0.65, `chest mass collapsed or rode the rim, median ${mid}`);
  });

  it("keeps upper-arm filaments inside the shoulder-fit tube", () => {
    for (const shoulder of [rig.shoulderL, rig.shoulderR]) {
      const glass = glassPoints(tubeOn(shoulder));
      const nerves = nervePoints(shoulder, rig.nerve);
      assert.ok(nerves.length > 2300, `upper-arm centerlines ${nerves.length}, was a sparse cord`);
      let worst = 0;
      let world = 0;
      for (const p of nerves) {
        worst = Math.max(worst, overflow(p, glass));
        world = Math.max(world, Math.abs(shoulder.position.x + p.x));
      }
      assert.ok(worst <= 0, `upper-arm centerline leaves the tube by ${worst}`);
      assert.ok(world <= SHOULDER_LINE + 1e-3, `upper-arm filament at ${world} past the shoulder line`);
    }
  });

  it("keeps hand filaments inside the hand glass", () => {
    rig.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    const dirs = [
      [1, 0, 0.137],
      [-0.71, 0, 0.7],
      [0.3, 0, -0.95],
      [-0.9, 0, -0.43],
      [0.62, 0.02, 0.78],
    ].map(([x, y, z]) => new Vector3(x, y, z).normalize());
    const insideMesh = (point: Vector3, mesh: Mesh) => {
      let votes = 0;
      for (const dir of dirs) {
        ray.set(point, dir);
        const distances: number[] = [];
        for (const hit of ray.intersectObject(mesh, false)) {
          if (!distances.some((d) => Math.abs(d - hit.distance) < 1e-6)) {
            distances.push(hit.distance);
          }
        }
        if (distances.length % 2 === 1) votes += 1;
      }
      return votes >= 3;
    };
    for (const wrist of [rig.wristL, rig.wristR]) {
      const glass: Mesh[] = [];
      wrist.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh && mesh.material === rig.glass) glass.push(mesh);
      });
      const seen = new Set<string>();
      const nerves: Vector3[] = [];
      for (const child of wrist.children) {
        const mesh = child as Mesh;
        if (!mesh.isMesh || mesh.material !== rig.nerve) continue;
        const pos = mesh.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          const point = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          const key = `${point.x.toFixed(5)}:${point.y.toFixed(5)}:${point.z.toFixed(5)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nerves.push(point);
        }
      }
      const outside = nerves.filter((point) => !glass.some((mesh) => insideMesh(point, mesh)));
      assert.equal(nerves.length, 54, `hand centerlines ${nerves.length}`);
      assert.equal(outside.length, 0, `${outside.length} hand filaments outside the glass`);
    }
  });

  it("keeps forearm filaments inside the forearm tube", () => {
    for (const elbow of [rig.elbowL, rig.elbowR]) {
      const glass = glassPoints(tubeOn(elbow));
      const nerves = nervePoints(elbow, rig.nerve);
      assert.ok(nerves.length > 2000, `forearm centerlines ${nerves.length}, was a sparse cord`);
      let worst = 0;
      for (const p of nerves) worst = Math.max(worst, overflow(p, glass));
      assert.ok(worst <= 0, `forearm centerline leaves the tube by ${worst}`);
    }
  });

  it("fills the calf belly inside the glass, on both sides", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      const knee = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!knee) throw new Error("knee missing");
      const glass = glassPoints(tubeOn(knee));
      const nerves = nervePoints(knee, rig.nerve);
      assert.ok(nerves.length > 1900, `calf centerlines ${nerves.length}, was a sparse cord`);
      let worst = 0;
      for (const p of nerves) worst = Math.max(worst, overflow(p, glass));
      assert.ok(worst <= 0.001, `calf centerline leaves the glass by ${worst}`);

      const belly = nerves.filter((p) => {
        const t = (0.14 - p.y) / (0.14 + LOCK.proportions.shin);
        return t >= 0.34 && t <= 0.55;
      });
      const glassBelly = glass.filter((p) => {
        const t = (0.14 - p.y) / (0.14 + LOCK.proportions.shin);
        return t >= 0.34 && t <= 0.55;
      });
      assert.ok(belly.length > 20, `belly samples ${belly.length}`);
      const nerveWidth = Math.max(...belly.map((p) => p.x)) - Math.min(...belly.map((p) => p.x));
      const glassWidth = Math.max(...glassBelly.map((p) => p.x)) - Math.min(...glassBelly.map((p) => p.x));
      assert.ok(nerveWidth > glassWidth * 0.35, `calf filaments collapsed, width ${nerveWidth}`);
      assert.ok(nerveWidth < glassWidth + 0.004, `calf filaments ${nerveWidth} wider than glass ${glassWidth}`);
      const posterior = belly.filter((p) => p.z < -0.03);
      assert.ok(posterior.length >= 8, `posterior calf filaments ${posterior.length}`);
    }
  });

  /**
   * Scene units are meters (LOCK.proportions: hip at 1, figure about 1.8 tall),
   * so 0.001 is 1 mm. Left and right nerves are built in the same order, so
   * vertex i on one side must sit on the X-mirror of vertex i on the other.
   */
  it("mirrors left and right limb and calf filaments within 1 mm", () => {
    const MIRROR_TOL = 0.001;
    const worldNerves = (parent: Object3D) => {
      parent.updateWorldMatrix(true, false);
      const out: Vector3[] = [];
      for (const child of parent.children) {
        const mesh = child as Mesh;
        if (!mesh.isMesh || mesh.material !== rig.nerve) continue;
        mesh.updateWorldMatrix(false, false);
        const pos = mesh.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
        }
      }
      return out;
    };
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    const hipL = hips.find((hip) => hip.userData.lockSide === 1);
    const hipR = hips.find((hip) => hip.userData.lockSide === -1);
    if (!hipL || !hipR) throw new Error("hips missing");
    const kneeOf = (hip: Object3D) => {
      const knee = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!knee) throw new Error("knee missing");
      return knee;
    };
    const pairs: Array<[string, Object3D, Object3D]> = [
      ["upper arm", rig.shoulderL, rig.shoulderR],
      ["forearm", rig.elbowL, rig.elbowR],
      ["hand", rig.wristL, rig.wristR],
      ["thigh", hipL, hipR],
      ["calf", kneeOf(hipL), kneeOf(hipR)],
    ];
    for (const [name, left, right] of pairs) {
      const a = worldNerves(left);
      const b = worldNerves(right);
      assert.ok(a.length > 0, `${name} has no filaments`);
      assert.equal(a.length, b.length, `${name} filament counts differ`);
      let worst = 0;
      for (let i = 0; i < a.length; i++) {
        worst = Math.max(worst, Math.hypot(a[i].x + b[i].x, a[i].y - b[i].y, a[i].z - b[i].z));
      }
      assert.ok(worst <= MIRROR_TOL, `${name} filaments off mirror by ${worst} m`);
    }
  });
});
