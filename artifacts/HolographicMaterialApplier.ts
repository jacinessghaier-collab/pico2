/**
 * Kushim HolographicMaterialApplier — Hourly Delta v2026-10-27-21
 * Applies locked MeshPhysicalMaterial (transmission) to VRM body meshes.
 * Removes skin/clothes appearance. Eyes stay as two small brighter points.
 *
 * Usage (inside KushimScene after VRM load):
 *   applyHolographicBody(vrm);
 *
 * Compatible with @pixiv/three-vrm. Call once after gltf load + VRMUtils.rotateVRM0.
 * Colors locked: CYAN #3AD7FF emissive low, transmission high.
 */

import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

const CYAN = new THREE.Color('#3AD7FF');
const CORE = new THREE.Color('#E7FBFF');

export function applyHolographicBody(vrm: VRM | null) {
  if (!vrm) return;

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;
    // Skip if already energy or aura related (by name convention)
    if (mesh.name.toLowerCase().includes('energy') || mesh.name.toLowerCase().includes('aura')) return;

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x02060a), // near-black base so transmission dominates
      emissive: CYAN,
      emissiveIntensity: 0.18,
      roughness: 0.06,
      metalness: 0.0,
      transmission: 0.94,
      thickness: 0.02, // Stufe 3: war 0.25 — dünnes klares Medium, kein milchiges Volumen
      transparent: true,
      opacity: 1.0, // transmission handles clarity
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Preserve existing maps if any, but force holographic look
    const old = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(old)) {
      mesh.material = old.map(() => mat.clone());
    } else {
      mesh.material = mat;
    }

    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });

  // Optional: force eye materials to small bright points if morphs exist
  // (handled by expression manager; visual is emissive points)
}

/**
 * Optional wrapper for ektogamat-style Fresnel rim only.
 * Import HolographicMaterial if available, otherwise fall back to above.
 */
export function applyFresnelRim(vrm: VRM | null, HolographicMaterial?: any) {
  if (!vrm || !HolographicMaterial) return applyHolographicBody(vrm);

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;
    const holo = new HolographicMaterial({
      hologramColor: '#3AD7FF',
      fresnelAmount: 0.55,
      fresnelOpacity: 0.22,
      hologramBrightness: 0.8,
      scanlineSize: 4.5,
      signalSpeed: 0.35,
      hologramOpacity: 0.35,
      blinkFresnelOnly: true,
      enableBlinking: false,
      enableAdditive: true,
      side: THREE.FrontSide,
    });
    mesh.material = holo;
  });
}
