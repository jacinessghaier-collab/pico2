/**
 * Manifold / normal smoke for the existing Kushim lathe.
 * Read-only: does not rewrite glass, filament, or LOCK.
 *
 * The torso is one LatheGeometry (see createKushim). Bands are profile Y
 * in that lathe's local space, the same numbers as the shell table:
 *   neck  y >= 0.39     (world ≈ chestY + y, the skull sits on this)
 *   chest 0.14 … 0.29
 *   hip   y <= -0.15    down to the open iliac ring
 *
 * How to read a band: `0.65 / 17°` is the worst outward dot (1 = the normal
 * points straight away from the lathe axis) and the sharpest step around
 * that ring. A flipped shell jumps toward 180°. The chest profile bends
 * about 46° from rib to shoulder; that is along the body, not around it.
 * `Naht zu` means the theta seam welds shut: no edge with 3+ faces, no
 * triple-stacked boundary. `Rand` is the open boundary after that weld
 * (neck loop + hip loop). The live figure stays on its own canvas — this
 * view is a second one, because the lock rejects any extra scene child.
 *
 * Toggle: header control, or `?mesh=wire` / `?mesh=normals`.
 */
import * as THREE from "three";
import { LOCK } from "@/kushim/lock";

export const MANIFOLD_MODES = ["off", "wire", "normals"] as const;
export type ManifoldMode = (typeof MANIFOLD_MODES)[number];
export type ManifoldViewMode = Exclude<ManifoldMode, "off">;

export const TORSO_BANDS = {
  neck: { min: 0.39, max: 0.501 },
  chest: { min: 0.14, max: 0.2901 },
  hip: { min: -0.341, max: -0.15 },
} as const;

export type BandId = keyof typeof TORSO_BANDS;

const WELD = 1e5;

export type EdgeCensus = {
  triangles: number;
  collapsed: number;
  nonManifold: number;
  trueBoundary: number;
  seamPairs: number;
  weldClash: number;
};

export type BandContinuity = {
  id: BandId;
  samples: number;
  minOutward: number;
  meanOutward: number;
  /** Neighboring vertices around one lathe ring. */
  maxRingDeg: number;
  /** Neighboring profile stations along the body. */
  maxProfileDeg: number;
};

export type ShellCensus = {
  label: string;
  vertices: number;
  edges: EdgeCensus;
  zeroNormals: number;
  maxSeamNormalDeg: number;
};

export type ManifoldReport = {
  shells: ShellCensus[];
  torso: ShellCensus | null;
  bands: BandContinuity[];
  meridianDeg: number;
  ok: boolean;
};

export type ManifoldView = {
  group: THREE.Group;
  material: THREE.Material;
  dispose: () => void;
};

export function readManifoldMode(search: string): ManifoldMode {
  const value = new URLSearchParams(search).get("mesh");
  if (value === "wire" || value === "normals") return value;
  return "off";
}

export function cycleManifoldMode(mode: ManifoldMode): ManifoldMode {
  if (mode === "off") return "wire";
  if (mode === "wire") return "normals";
  return "off";
}

export function manifoldModeLabel(mode: ManifoldMode): string {
  if (mode === "wire") return "Draht";
  if (mode === "normals") return "Normal";
  return "Netz";
}

function quantKey(x: number, y: number, z: number) {
  return `${Math.round(x * WELD)}:${Math.round(y * WELD)}:${Math.round(z * WELD)}`;
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function angleDeg(a: THREE.Vector3, b: THREE.Vector3) {
  const d = Math.min(1, Math.max(-1, a.dot(b)));
  return (Math.acos(d) * 180) / Math.PI;
}

/** Glass shells only. Nerve ribbons carry `aRank` and stay out. */
export function collectShellMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const shells: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    if (!geo?.getAttribute?.("position") || !geo.getAttribute("normal")) return;
    if (geo.getAttribute("aRank")) return;
    const key = mesh.userData?.lockKey as string | undefined;
    if (key === "aura" || key === "ground" || key === "chest-core") return;
    shells.push(mesh);
  });
  return shells;
}

export function shellLabel(mesh: THREE.Mesh): string {
  const key = mesh.userData?.lockKey as string | undefined;
  if (key) return key;
  return mesh.geometry.type || "shell";
}

function addEdge(map: Map<string, number>, a: number, b: number) {
  if (a === b) return;
  const key = pairKey(a, b);
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Weld coincident seam vertices, then count faces per edge. */
export function censusEdges(geo: THREE.BufferGeometry): EdgeCensus {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const weldOf = new Map<string, number>();
  const weld = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = quantKey(pos.getX(i), pos.getY(i), pos.getZ(i));
    let id = weldOf.get(key);
    if (id === undefined) {
      id = weldOf.size;
      weldOf.set(key, id);
    }
    weld[i] = id;
  }

  const indexFaces = new Map<string, number>();
  const weldedFaces = new Map<string, number>();
  let triangles = 0;
  let collapsed = 0;

  const emit = (ia: number, ib: number, ic: number) => {
    if (ia === ib || ib === ic || ic === ia) return;
    addEdge(indexFaces, ia, ib);
    addEdge(indexFaces, ib, ic);
    addEdge(indexFaces, ic, ia);
    const a = weld[ia];
    const b = weld[ib];
    const c = weld[ic];
    if (a === b || b === c || c === a) {
      collapsed += 1;
      return;
    }
    triangles += 1;
    addEdge(weldedFaces, a, b);
    addEdge(weldedFaces, b, c);
    addEdge(weldedFaces, c, a);
  };

  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      emit(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i + 2 < pos.count; i += 3) emit(i, i + 1, i + 2);
  }

  let nonManifold = 0;
  let trueBoundary = 0;
  for (const count of weldedFaces.values()) {
    if (count > 2) nonManifold += 1;
    else if (count === 1) trueBoundary += 1;
  }

  const boundaryTwins = new Map<string, number>();
  for (const [key, count] of indexFaces) {
    if (count !== 1) continue;
    const split = key.split("|");
    const a = weld[Number(split[0])];
    const b = weld[Number(split[1])];
    if (a === b) continue;
    const welded = pairKey(a, b);
    boundaryTwins.set(welded, (boundaryTwins.get(welded) ?? 0) + 1);
  }
  let seamPairs = 0;
  let weldClash = 0;
  for (const count of boundaryTwins.values()) {
    if (count === 2) seamPairs += 1;
    else if (count > 2) weldClash += 1;
  }

  return { triangles, collapsed, nonManifold, trueBoundary, seamPairs, weldClash };
}

function worldNormals(mesh: THREE.Mesh) {
  const pos = mesh.geometry.getAttribute("position");
  const nrm = mesh.geometry.getAttribute("normal");
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const normals: Array<THREE.Vector3 | null> = new Array(pos.count);
  let zeroNormals = 0;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix);
    if (tmp.lengthSq() < 1e-12) {
      zeroNormals += 1;
      normals[i] = null;
      continue;
    }
    normals[i] = tmp.clone().normalize();
  }
  return { pos, normals, zeroNormals };
}

function seamGap(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normals: Array<THREE.Vector3 | null>,
) {
  const groups = new Map<string, THREE.Vector3[]>();
  for (let i = 0; i < pos.count; i++) {
    const normal = normals[i];
    if (!normal) continue;
    const key = quantKey(pos.getX(i), pos.getY(i), pos.getZ(i));
    const list = groups.get(key);
    if (list) list.push(normal);
    else groups.set(key, [normal]);
  }
  let maxDeg = 0;
  for (const list of groups.values()) {
    const limit = Math.min(list.length, 24);
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        maxDeg = Math.max(maxDeg, angleDeg(list[i], list[j]));
      }
    }
  }
  return maxDeg;
}

function outwardDot(
  mesh: THREE.Mesh,
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  normal: THREE.Vector3,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  radial: THREE.Vector3,
  point: THREE.Vector3,
) {
  point.fromBufferAttribute(pos, index).applyMatrix4(mesh.matrixWorld);
  radial.copy(point).sub(origin);
  radial.addScaledVector(axis, -axis.dot(radial));
  if (radial.lengthSq() < 1e-10) return null;
  return normal.dot(radial.normalize());
}

function torsoContinuity(mesh: THREE.Mesh) {
  const geo = mesh.geometry as THREE.LatheGeometry;
  const points = geo.parameters?.points;
  const segments = geo.parameters?.segments;
  const empty: BandContinuity[] = (Object.keys(TORSO_BANDS) as BandId[]).map((id) => ({
    id,
    samples: 0,
    minOutward: 1,
    meanOutward: 0,
    maxRingDeg: 0,
    maxProfileDeg: 0,
  }));
  if (!points || !segments) return { bands: empty, meridianDeg: 0 };

  const stride = points.length;
  const count = (segments + 1) * stride;
  const pos = geo.getAttribute("position");
  if (pos.count !== count) return { bands: empty, meridianDeg: 0 };

  mesh.updateWorldMatrix(true, false);
  const { normals } = worldNormals(mesh);
  const origin = new THREE.Vector3();
  mesh.getWorldPosition(origin);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
  const radial = new THREE.Vector3();
  const point = new THREE.Vector3();

  const at = (ring: number, row: number) => normals[ring * stride + row];

  let meridianDeg = 0;
  for (let row = 0; row < stride - 1; row++) {
    for (let ring = 0; ring <= segments; ring++) {
      const a = at(ring, row);
      const b = at(ring, row + 1);
      if (!a || !b) continue;
      meridianDeg = Math.max(meridianDeg, angleDeg(a, b));
    }
  }

  const bands = (Object.keys(TORSO_BANDS) as BandId[]).map((id) => {
    const span = TORSO_BANDS[id];
    const rows: number[] = [];
    for (let row = 0; row < stride; row++) {
      const y = points[row].y;
      if (y >= span.min - 1e-4 && y <= span.max + 1e-4) rows.push(row);
    }
    let samples = 0;
    let minOutward = 1;
    let sum = 0;
    let maxRingDeg = 0;
    let maxProfileDeg = 0;
    for (const row of rows) {
      for (let ring = 0; ring <= segments; ring++) {
        const normal = at(ring, row);
        if (!normal) continue;
        const dot = outwardDot(mesh, pos, ring * stride + row, normal, origin, axis, radial, point);
        if (dot === null) continue;
        samples += 1;
        sum += dot;
        minOutward = Math.min(minOutward, dot);
        if (ring < segments) {
          const next = at(ring + 1, row);
          if (next) maxRingDeg = Math.max(maxRingDeg, angleDeg(normal, next));
        }
      }
    }
    for (let k = 0; k < rows.length - 1; k++) {
      if (rows[k + 1] !== rows[k] + 1) continue;
      for (let ring = 0; ring <= segments; ring++) {
        const a = at(ring, rows[k]);
        const b = at(ring, rows[k + 1]);
        if (!a || !b) continue;
        maxProfileDeg = Math.max(maxProfileDeg, angleDeg(a, b));
      }
    }
    return {
      id,
      samples,
      minOutward: samples ? minOutward : 0,
      meanOutward: samples ? sum / samples : 0,
      maxRingDeg,
      maxProfileDeg,
    };
  });

  return { bands, meridianDeg };
}

function inspectShell(mesh: THREE.Mesh): ShellCensus {
  mesh.updateWorldMatrix(true, false);
  const { pos, normals, zeroNormals } = worldNormals(mesh);
  return {
    label: shellLabel(mesh),
    vertices: pos.count,
    edges: censusEdges(mesh.geometry),
    zeroNormals,
    maxSeamNormalDeg: seamGap(pos, normals),
  };
}

export function inspectManifold(root: THREE.Object3D): ManifoldReport {
  root.updateMatrixWorld(true);
  const shells = collectShellMeshes(root).map(inspectShell);
  const torsoMesh = collectShellMeshes(root).find((mesh) => mesh.userData?.lockKey === "torso");
  const torso = shells.find((shell) => shell.label === "torso") ?? null;
  const continuity = torsoMesh ? torsoContinuity(torsoMesh) : { bands: [], meridianDeg: 0 };
  // Rest-pose ceilings on this lathe, with slack. A flipped normal is ~180°.
  // Chest profile ~46° is the rib-to-shoulder bend, not a crack.
  const limits: Record<BandId, { outward: number; ring: number; profile: number }> = {
    neck: { outward: 0.6, ring: 22, profile: 28 },
    chest: { outward: 0.75, ring: 22, profile: 55 },
    hip: { outward: 0.5, ring: 22, profile: 42 },
  };
  const bandsOk = continuity.bands.every((band) => {
    const limit = limits[band.id];
    return (
      band.samples > 40 &&
      band.minOutward > limit.outward &&
      band.maxRingDeg < limit.ring &&
      band.maxProfileDeg < limit.profile
    );
  });
  const torsoOk =
    !!torso &&
    torso.edges.nonManifold === 0 &&
    torso.edges.weldClash === 0 &&
    torso.edges.collapsed === 0 &&
    torso.zeroNormals === 0 &&
    torso.maxSeamNormalDeg < 25 &&
    continuity.meridianDeg < 55;
  const shellsOk = shells.every(
    (shell) => shell.edges.nonManifold === 0 && shell.edges.weldClash === 0,
  );
  return {
    shells,
    torso,
    bands: continuity.bands,
    meridianDeg: continuity.meridianDeg,
    ok: torsoOk && bandsOk && shellsOk,
  };
}

export function formatManifoldReadout(report: ManifoldReport): string {
  const bit = (id: BandId, label: string) => {
    const band = report.bands.find((item) => item.id === id);
    if (!band || band.samples === 0) return `${label} —`;
    return `${label} ${band.minOutward.toFixed(2)} / ${band.maxRingDeg.toFixed(0)}°`;
  };
  const torso = report.torso;
  const seam = !torso
    ? "Rumpf fehlt"
    : torso.edges.nonManifold === 0 && torso.edges.weldClash === 0
      ? `Naht zu · Rand ${torso.edges.trueBoundary}`
      : `Naht offen · Rand ${torso.edges.trueBoundary}`;
  return `${bit("neck", "Hals")} · ${bit("chest", "Brust")} · ${bit("hip", "Hüfte")} · ${seam}`;
}

export function createManifoldView(root: THREE.Object3D, mode: ManifoldViewMode): ManifoldView {
  const group = new THREE.Group();
  group.name = "manifold-smoke";
  const material =
    mode === "normals"
      ? new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({
          color: new THREE.Color(LOCK.strom),
          wireframe: true,
          side: THREE.DoubleSide,
        });
  root.updateMatrixWorld(true);
  for (const mesh of collectShellMeshes(root)) {
    const clone = new THREE.Mesh(mesh.geometry, material);
    clone.name = shellLabel(mesh);
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(mesh.matrixWorld);
    clone.frustumCulled = false;
    group.add(clone);
  }
  group.updateMatrixWorld(true);
  return {
    group,
    material,
    dispose() {
      group.clear();
      material.dispose();
    },
  };
}
