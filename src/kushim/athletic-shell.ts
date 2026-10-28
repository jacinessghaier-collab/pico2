/**
 * Athletic male glass shell. Mesh-only GLB from MPFB (Y-up, A-pose, no skin).
 * Blender's placeholder transmission material is discarded; the pico2 shader
 * is applied by the rig. GLTFLoader.parse is asynchronous, so tests and the
 * scene both go through this loader and then share one seating step.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const ATHLETIC_SOURCE = "kushim-athletic-male.glb";
export const ATHLETIC_URL = "/avatar/kushim-athletic-male.glb";
/** Position accessor count of the shipped mesh. The lock re-reads this. */
export const ATHLETIC_VERTS = 14517;
/** Standing height after seating. Soles land on y = 0. */
export const ATHLETIC_HEIGHT = 1.67;

type GltfLike = { scene: THREE.Object3D };

let seatedCache: Promise<THREE.BufferGeometry> | null = null;

export function seatAthleticGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = source.clone();
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) throw new Error("Athletic mesh has no bounds.");
  const height = box.max.y - box.min.y;
  if (!(height > 0.2)) throw new Error("Athletic mesh height is unusable.");
  const s = ATHLETIC_HEIGHT / height;
  const cx = (box.min.x + box.max.x) * 0.5;
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, 0));
  geo.applyMatrix4(new THREE.Matrix4().makeScale(s, s, s));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.name = ATHLETIC_SOURCE;
  return geo;
}

/** Drop the Blender material and return the seated glass shell. */
export function seatedFromGltf(gltf: GltfLike): THREE.BufferGeometry {
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
  });
  const mesh = meshes[0];
  if (!mesh) throw new Error(`${ATHLETIC_SOURCE} has no mesh.`);
  for (const body of meshes) {
    const mats = Array.isArray(body.material) ? body.material : [body.material];
    for (const mat of mats) mat?.dispose();
  }
  const seated = seatAthleticGeometry(mesh.geometry);
  mesh.geometry.dispose();
  return seated;
}

function readGlbBytes(): ArrayBuffer {
  const proc = process as NodeJS.Process & {
    getBuiltinModule?: (id: string) => {
      readFileSync: (path: string) => Buffer;
      join: (...parts: string[]) => string;
    };
  };
  if (!proc.getBuiltinModule) {
    throw new Error("Athletic shell bytes are only read from disk in Node tests.");
  }
  const fs = proc.getBuiltinModule("node:fs");
  const path = proc.getBuiltinModule("node:path");
  const file = path.join(process.cwd(), "public", "avatar", ATHLETIC_SOURCE);
  const bytes = fs.readFileSync(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Clone of the seated shell. Safe to dispose per rig. */
export function loadSeatedAthleticGeometry(): Promise<THREE.BufferGeometry> {
  if (!seatedCache) {
    seatedCache = (async () => {
      const gltf = await new GLTFLoader().parseAsync(readGlbBytes(), "");
      return seatedFromGltf(gltf);
    })();
  }
  return seatedCache.then((geo) => geo.clone());
}
