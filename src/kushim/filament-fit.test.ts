import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { BufferGeometry, Mesh, Object3D } from "three";
import { createKushim, type Rig } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

/** Widest torso ring at the shoulder. Same lathe the shell uses, times SHELL_SX. */
const SHOULDER_LINE = 0.25452;

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
      assert.ok(nerves.length > 200, `upper-arm nerves ${nerves.length}`);
      let worst = 0;
      let world = 0;
      for (const p of nerves) {
        worst = Math.max(worst, overflow(p, glass));
        world = Math.max(world, Math.abs(shoulder.position.x + p.x));
      }
      assert.ok(worst <= 0.0025, `upper-arm centerline leaves the tube by ${worst}`);
      assert.ok(world <= SHOULDER_LINE + 1e-3, `upper-arm filament at ${world} past the shoulder line`);
    }
  });

  it("keeps forearm filaments inside the forearm tube", () => {
    for (const elbow of [rig.elbowL, rig.elbowR]) {
      const glass = glassPoints(tubeOn(elbow));
      const nerves = nervePoints(elbow, rig.nerve);
      assert.ok(nerves.length > 150);
      let worst = 0;
      for (const p of nerves) worst = Math.max(worst, overflow(p, glass));
      assert.ok(worst <= 0.0025, `forearm centerline leaves the tube by ${worst}`);
    }
  });

  it("routes calf filaments along both heads and the groove, inside the new width", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      const side = hip.userData.lockSide as 1 | -1;
      const knee = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!knee) throw new Error("knee missing");
      const glass = glassPoints(tubeOn(knee));
      const nerves = nervePoints(knee, rig.nerve);
      assert.ok(nerves.length > 200, `calf nerves ${nerves.length}`);
      let worst = 0;
      for (const p of nerves) worst = Math.max(worst, overflow(p, glass));
      assert.ok(worst <= 0.0025, `calf centerline leaves the glass by ${worst}`);

      const belly = nerves.filter((p) => {
        const t = (0.14 - p.y) / (0.14 + LOCK.proportions.shin);
        return t >= 0.46 && t <= 0.6;
      });
      const glassBelly = glass.filter((p) => {
        const t = (0.14 - p.y) / (0.14 + LOCK.proportions.shin);
        return t >= 0.46 && t <= 0.6;
      });
      assert.ok(belly.length > 20, `belly samples ${belly.length}`);
      const nerveWidth = Math.max(...belly.map((p) => p.x)) - Math.min(...belly.map((p) => p.x));
      const glassWidth = Math.max(...glassBelly.map((p) => p.x)) - Math.min(...glassBelly.map((p) => p.x));
      assert.ok(nerveWidth > 0.09, `calf filaments still a midlane, width ${nerveWidth}`);
      assert.ok(nerveWidth < glassWidth + 0.004, `calf filaments ${nerveWidth} wider than glass ${glassWidth}`);

      const lat = belly.filter((p) => side * p.x > 0.02 && p.z < -0.04);
      const med = belly.filter((p) => side * p.x < -0.02 && p.z < -0.04);
      assert.ok(lat.length >= 4, `lateral head filaments ${lat.length}`);
      assert.ok(med.length >= 4, `medial head filaments ${med.length}`);
      const headZ = [...lat, ...med].reduce((sum, p) => sum + p.z, 0) / (lat.length + med.length);
      const groove = belly.filter((p) => Math.abs(p.x) < 0.016 && p.z < -0.015 && p.z > headZ + 0.01);
      assert.ok(groove.length >= 3, `groove filaments ${groove.length}, headZ ${headZ}`);
    }
  });
});
