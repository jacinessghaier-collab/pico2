import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";
import {
  createManifoldView,
  formatManifoldReadout,
  inspectManifold,
  type ManifoldViewMode,
} from "@/kushim/manifold-smoke";

/** Same framing as KushimScene. Rest pose only — the lock scene is untouched. */
function Framing() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fov = 26;
    cam.fov = fov;
    const aspect = size.width / Math.max(1, size.height);
    const vertical = (fov * Math.PI) / 180;
    const distV = (1.22 / Math.tan(vertical / 2)) * 1.06;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distH = (0.8 / Math.tan(horizontal / 2)) * 1.12;
    const center = 0.96;
    cam.position.set(0, center + 0.08, Math.max(distV, distH));
    cam.lookAt(0, center, 0);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Shells({ mode, onReport }: { mode: ManifoldViewMode; onReport: (line: string) => void }) {
  const { scene } = useThree();

  useEffect(() => {
    const rig = createKushim();
    const view = createManifoldView(rig.root, mode);
    const line = formatManifoldReadout(inspectManifold(rig.root));
    scene.add(view.group);
    onReport(mode === "wire" ? `Draht · ${line}` : `Normal · ${line}`);
    return () => {
      scene.remove(view.group);
      view.dispose();
      rig.dispose();
    };
  }, [scene, mode, onReport]);

  return null;
}

export function ManifoldOverlay({
  mode,
  onReport,
}: {
  mode: ManifoldViewMode;
  onReport: (line: string) => void;
}) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 26, near: 0.08, far: 40, position: [0, 1, 6] }}
      onCreated={({ gl }) => {
        gl.setClearColor(LOCK.void, 1);
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <Framing />
      <Shells mode={mode} onReport={onReport} />
    </Canvas>
  );
}
