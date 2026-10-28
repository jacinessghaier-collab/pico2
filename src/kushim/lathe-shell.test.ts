import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import type { BufferGeometry, Mesh, Object3D } from "three";
import { bendCalfNormal, calfRimAlpha, createKushim, type Rig } from "@/kushim/anatomy";
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

function scan(geo: BufferGeometry, each: (x: number, y: number, z: number) => void) {
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) each(pos.getX(i), pos.getY(i), pos.getZ(i));
}

describe("lathe shell", () => {
  let rig: Rig;
  before(() => {
    rig = createKushim();
  });

  it("keeps the upper-arm outer line on or inside the shoulder", () => {
    for (const shoulder of [rig.shoulderL, rig.shoulderR]) {
      const geo = tubeOn(shoulder);
      let outer = 0;
      let samples = 0;
      scan(geo, (x) => {
        outer = Math.max(outer, Math.abs(shoulder.position.x + x));
        samples += 1;
      });
      assert.ok(samples > 100);
      assert.ok(outer <= SHOULDER_LINE + 1e-3, `outer ${outer} past ${SHOULDER_LINE}`);
      assert.ok(outer >= SHOULDER_LINE - 0.012, `outer ${outer} never reaches the shoulder line`);
    }
  });

  it("splits the calf into two posterior heads without a frontal spindle", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      const kneeJoint = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!kneeJoint) throw new Error("knee missing");
      const geo = tubeOn(kneeJoint);
      let maxX = -Infinity;
      let minX = Infinity;
      let cleft = Infinity;
      let head = Infinity;
      let belly = 0;
      scan(geo, (x, y, z) => {
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        if (t < 0.46 || t > 0.6) return;
        belly += 1;
        maxX = Math.max(maxX, x);
        minX = Math.min(minX, x);
        if (Math.abs(x) < 0.012) cleft = Math.min(cleft, z);
        if (x > 0.028) head = Math.min(head, z);
      });
      assert.ok(belly > 20);
      const width = maxX - minX;
      // Same x scale as #29. The finer calf ring lands on the lateral peak.
      assert.ok(width < 0.136, `frontal width ${width} is still the spindle`);
      assert.ok(width > 0.09, `frontal width ${width} collapsed`);
      assert.ok(head < -0.1, `posterior belly ${head} flattened`);
      assert.ok(cleft > head + 0.012, `cleft ${cleft} does not sit in front of the head ${head}`);
    }
  });

  it("cuts a narrow sulcus between the gastrocnemius heads", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    for (const hip of hips) {
      const kneeJoint = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!kneeJoint) throw new Error("knee missing");
      const geo = tubeOn(kneeJoint);
      let floorFront = -Infinity;
      let floorBack = Infinity;
      let plateau = Infinity;
      let samples = 0;
      scan(geo, (x, y, z) => {
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        if (t < 0.52 || t > 0.58 || z >= 0) return;
        samples += 1;
        if (Math.abs(x) < 0.004) {
          floorFront = Math.max(floorFront, z);
          floorBack = Math.min(floorBack, z);
        }
        // Inner slope of each head. A wide valley lifts this station forward.
        if (Math.abs(x) > 0.02 && Math.abs(x) < 0.03) plateau = Math.min(plateau, z);
      });
      assert.ok(samples > 20);
      assert.ok(floorFront < -0.02, `sulcus floor ${floorFront} reaches the tibia`);
      assert.ok(floorBack > -0.055, `sulcus floor ${floorBack} filled back in`);
      assert.ok(plateau < -0.092, `inner head ${plateau} is still the soft valley`);
      assert.ok(floorBack > plateau + 0.05, `sulcus relief ${floorBack - plateau} is too shallow`);
    }
  });

  it("rims both calf heads from the oblique rear and keeps the front dark", () => {
    const cam = new THREE.Vector3(0, 1.04, 8.399);
    rig.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.userData?.lockKey !== "skull") return;
      const kante = mesh.geometry?.getAttribute?.("aKante");
      const band = mesh.geometry?.getAttribute?.("aBand");
      assert.ok(kante, "skull shares the glass shader and must stay unmarked");
      assert.ok(band, "skull shares the body-band attribute");
      for (let i = 0; i < kante.count; i++) {
        assert.equal(kante.getX(i), 0);
        assert.equal(band.getX(i), 0, "skull rim stays on the locked exponent");
      }
    });
    const torso = rig.chest.children.find((child) => (child as Mesh).userData?.lockKey === "torso") as Mesh;
    const torsoBand = torso.geometry.getAttribute("aBand");
    assert.ok(torsoBand && torsoBand.getX(0) === 1, "torso carries the wider body band");

    const sample = (yaw: number) => {
      rig.root.rotation.y = yaw;
      rig.root.updateMatrixWorld(true);
      const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
      return hips.map((hip) => {
        const side = hip.userData.lockSide as number;
        const knee = hip.children.find((child) => child.userData.lockKey === "knee");
        if (!knee) throw new Error("knee missing");
        const geo = tubeOn(knee);
        const mesh = knee.children.find((child) => (child as Mesh).geometry === geo) as Mesh;
        const pos = geo.getAttribute("position");
        const nrm = geo.getAttribute("normal");
        const kante = geo.getAttribute("aKante");
        const fade = geo.getAttribute("aFade");
        const band = geo.getAttribute("aBand");
        assert.ok(kante, "calf is missing the rear-rim mark");
        const ax = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
        const p = new THREE.Vector3();
        const n = new THREE.Vector3();
        const view = new THREE.Vector3();
        let marked = 0;
        let posHead = 0;
        let negHead = 0;
        let floorRear = 0;
        let floorN = 0;
        let crestJump = 0;
        let prevCrest = 0;
        const row = 57;
        const rings = pos.count / row;
        for (let ring = 0; ring < rings; ring++) {
          let crest = 0;
          for (let j = 0; j < row; j++) crest = Math.max(crest, kante.getX(ring * row + j));
          const t = ring / Math.max(1, rings - 1);
          if (t > 0.08 && t < 0.5) crestJump = Math.max(crestJump, crest - prevCrest);
          prevCrest = crest;
        }
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
          if (t < 0.28 || t > 0.74) continue;
          p.set(pos.getX(i), y, pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
          view.copy(cam).sub(p).normalize();
          const viewLocal = view.clone().transformDirection(mesh.matrixWorld.clone().invert());
          const bent = bendCalfNormal(
            nrm.getX(i),
            nrm.getY(i),
            nrm.getZ(i),
            pos.getX(i),
            viewLocal.x,
            viewLocal.y,
            viewLocal.z,
            kante.getX(i),
          );
          n.set(bent.x, bent.y, bent.z).transformDirection(mesh.matrixWorld);
          const alpha = calfRimAlpha(
            n.dot(view),
            kante.getX(i),
            Math.abs(ax.dot(view)),
            fade.getX(i),
            band?.getX(i) ?? 0,
          );
          const x = pos.getX(i);
          const z = pos.getZ(i);
          if (z < -0.05 && kante.getX(i) > 0.35 && x > 0.012) posHead = Math.max(posHead, alpha);
          if (z < -0.05 && kante.getX(i) > 0.35 && x < -0.012) negHead = Math.max(negHead, alpha);
          if (
            t > 0.45 &&
            t < 0.72 &&
            kante.getX(i) < 0.01 &&
            Math.abs(x) < 0.005 &&
            z < -0.02 &&
            z > -0.08
          ) {
            floorRear = Math.max(floorRear, alpha);
            floorN += 1;
          }
          if (kante.getX(i) > 0.45) marked += 1;
        }
        return { side, marked, posHead, negHead, floorRear, floorN, crestJump };
      });
    };

    const front = sample(0);
    for (const leg of front) {
      assert.ok(leg.marked > 30, `side ${leg.side} marked ${leg.marked}`);
      assert.ok(leg.posHead < 0.02, `front +x head rim ${leg.posHead} on side ${leg.side}`);
      assert.ok(leg.negHead < 0.02, `front -x head rim ${leg.negHead} on side ${leg.side}`);
      assert.ok(leg.crestJump < 0.22, `rim onset steps by ${leg.crestJump} on side ${leg.side}`);
    }

    const rear = sample(-0.68);
    for (const leg of rear) {
      assert.ok(leg.posHead > 0.18, `+x head lost, alpha ${leg.posHead} side ${leg.side}`);
      assert.ok(leg.negHead > 0.18, `-x head lost, alpha ${leg.negHead} side ${leg.side}`);
      assert.ok(leg.floorN > 4, `sulcus floor samples ${leg.floorN} side ${leg.side}`);
      const lip = Math.min(leg.posHead, leg.negHead);
      assert.ok(leg.floorRear < lip * 0.55, `floor ${leg.floorRear} fills the sulcus on side ${leg.side}`);
    }
    rig.root.rotation.y = 0;
  });

  it("notches the yawed calf outline between the two heads", () => {
    const yaw = -0.68;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    rig.root.rotation.y = yaw;
    rig.root.updateMatrixWorld(true);
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    let notched = 0;
    for (const hip of hips) {
      const knee = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!knee) throw new Error("knee missing");
      const geo = tubeOn(knee);
      const mesh = knee.children.find((child) => (child as Mesh).geometry === geo) as Mesh;
      mesh.updateWorldMatrix(true, false);
      const pos = geo.getAttribute("position");
      const row = 57;
      const rings = pos.count / row;
      const rows: Array<{ t: number; s: number; x: number }> = [];
      const p = new THREE.Vector3();
      for (let ring = 0; ring < rings; ring++) {
        let maxS = -Infinity;
        let atX = 0;
        for (let j = 0; j < row; j++) {
          const i = ring * row + j;
          p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
          const s = cos * p.x + sin * p.z;
          if (s > maxS) {
            maxS = s;
            atX = pos.getX(i);
          }
        }
        const y = pos.getY(ring * row);
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        rows.push({ t, s: maxS, x: atX });
      }
      const peaks: Array<{ t: number; s: number; x: number }> = [];
      for (let i = 1; i < rows.length - 1; i++) {
        const rowT = rows[i];
        if (!rowT || rowT.t < 0.24 || rowT.t > 0.76) continue;
        const prev = rows[i - 1];
        const next = rows[i + 1];
        if (!prev || !next) continue;
        if (rowT.s >= prev.s && rowT.s > next.s) peaks.push(rowT);
      }
      if (peaks.length < 2) continue;
      const a = peaks[0];
      const b = peaks[peaks.length - 1];
      if (!a || !b || Math.sign(a.x) === Math.sign(b.x)) continue;
      const mid = rows.filter((r) => r.t > a.t && r.t < b.t);
      const valley = Math.min(...mid.map((r) => r.s));
      const dip = Math.min(a.s, b.s) - valley;
      if (dip > 0.012) notched += 1;
    }
    assert.ok(notched >= 1, "neither calf notches between the gastrocnemius heads");
    rig.root.rotation.y = 0;
  });
});
