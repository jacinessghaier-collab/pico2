import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";
import { LockBreach, assertRigLock } from "@/kushim/lock-check";
import {
  collectShellMeshes,
  createManifoldView,
  cycleManifoldMode,
  formatManifoldReadout,
  inspectManifold,
  readManifoldMode,
  shellLabel,
} from "@/kushim/manifold-smoke";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

describe("manifold smoke", () => {
  it("reads the debug query and cycles the view", () => {
    assert.equal(readManifoldMode(""), "off");
    assert.equal(readManifoldMode("?mesh=wire"), "wire");
    assert.equal(readManifoldMode("?mesh=normals"), "normals");
    assert.equal(readManifoldMode("?mesh=glass"), "off");
    assert.equal(cycleManifoldMode("off"), "wire");
    assert.equal(cycleManifoldMode("wire"), "normals");
    assert.equal(cycleManifoldMode("normals"), "off");
  });

  it("keeps the torso lathe watertight except the open neck and hip", () => {
    const rig = createKushim();
    try {
      const fragment = rig.glass.fragmentShader;
      const vertex = rig.glass.vertexShader;
      const shells = collectShellMeshes(rig.root);
      const torso = shells.find((mesh) => shellLabel(mesh) === "torso");
      const skull = shells.find((mesh) => shellLabel(mesh) === "skull");
      assert.ok(torso, "torso lathe missing");
      assert.ok(skull, "skull missing");
      assert.equal(torso.geometry.type, "LatheGeometry");
      let ranked = 0;
      rig.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry?.getAttribute?.("aRank")) ranked += 1;
      });
      assert.ok(ranked > 0, "filaments should still be in the figure");
      for (const mesh of shells) assert.equal(mesh.geometry.getAttribute("aRank"), undefined);

      const report = inspectManifold(rig.root);
      assert.ok(report.torso);
      const lathe = torso.geometry as THREE.LatheGeometry;
      assert.equal(report.torso.edges.nonManifold, 0);
      assert.equal(report.torso.edges.weldClash, 0);
      assert.equal(report.torso.edges.collapsed, 0);
      assert.equal(report.torso.edges.seamPairs, lathe.parameters.points.length - 1);
      assert.equal(report.torso.edges.trueBoundary, lathe.parameters.segments * 2);
      assert.equal(report.torso.zeroNormals, 0);
      assert.ok(report.torso.maxSeamNormalDeg < 25, `seam ${report.torso.maxSeamNormalDeg}`);
      assert.ok(report.meridianDeg < 55, `meridian ${report.meridianDeg}`);
      const bandLimits = {
        neck: { outward: 0.6, ring: 22, profile: 28 },
        chest: { outward: 0.75, ring: 22, profile: 55 },
        hip: { outward: 0.5, ring: 22, profile: 42 },
      } as const;
      for (const id of ["neck", "chest", "hip"] as const) {
        const band = report.bands.find((item) => item.id === id);
        const limit = bandLimits[id];
        assert.ok(band && band.samples > 40, `${id} samples`);
        assert.ok(band.minOutward > limit.outward, `${id} outward ${band.minOutward}`);
        assert.ok(band.maxRingDeg < limit.ring, `${id} ring ${band.maxRingDeg}`);
        assert.ok(band.maxProfileDeg < limit.profile, `${id} profile ${band.maxProfileDeg}`);
      }
      assert.equal(report.ok, true, formatManifoldReadout(report));
      assert.match(formatManifoldReadout(report), /Hals .+ · Brust .+ · Hüfte .+ · Naht zu/);
      for (const shell of report.shells) {
        assert.equal(shell.edges.nonManifold, 0, shell.label);
        assert.equal(shell.edges.weldClash, 0, shell.label);
      }

      assert.equal(rig.glass.fragmentShader, fragment);
      assert.equal(rig.glass.vertexShader, vertex);
      assert.equal(rig.glass.uniforms.uRim.value, LOCK.glass.rim);
      assert.equal(rig.glass.uniforms.uFill.value, LOCK.glass.fill);
      assert.doesNotThrow(() => assertRigLock(rig, "live"));
    } finally {
      rig.dispose();
    }
  });

  it("builds a wireframe and a normal view without joining the locked scene", () => {
    const rig = createKushim();
    try {
      const wire = createManifoldView(rig.root, "wire");
      const normals = createManifoldView(rig.root, "normals");
      try {
        assert.equal(wire.group.parent, null);
        assert.equal(rig.root.getObjectByName("manifold-smoke"), undefined);
        assert.ok(wire.group.children.length > 5);
        const wireMat = wire.material as THREE.MeshBasicMaterial;
        assert.equal(wireMat.isMeshBasicMaterial, true);
        assert.equal(wireMat.wireframe, true);
        assert.equal(
          wire.group.children.every((child) => (child as THREE.Mesh).material === wireMat),
          true,
        );
        const normalMat = normals.material as THREE.MeshNormalMaterial;
        assert.equal(normalMat.isMeshNormalMaterial, true);
        assert.equal(normalMat.side, THREE.DoubleSide);
        for (const child of wire.group.children) {
          const mesh = child as THREE.Mesh;
          assert.equal(mesh.geometry.getAttribute("aRank"), undefined);
          assert.notEqual(mesh.material, rig.glass);
        }

        const scene = new THREE.Scene();
        scene.add(rig.root);
        assert.doesNotThrow(() => assertRigLock(rig, "live", scene));
        scene.add(wire.group);
        assert.throws(() => assertRigLock(rig, "live", scene), LockBreach);
        scene.remove(wire.group);
        assert.doesNotThrow(() => assertRigLock(rig, "live", scene));

        const torso = collectShellMeshes(rig.root).find((mesh) => shellLabel(mesh) === "torso");
        assert.ok(torso);
        const position = torso.geometry.getAttribute("position");
        wire.dispose();
        normals.dispose();
        assert.equal(torso.geometry.getAttribute("position"), position);
        assert.equal(rig.glass.fragmentShader.includes("uRim"), true);
      } finally {
        wire.dispose();
        normals.dispose();
      }
    } finally {
      rig.dispose();
    }
  });
});
