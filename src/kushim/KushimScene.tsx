import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { setGaze } from "@/kushim/lipsync";
import { LOCK } from "@/kushim/lock";
import { tickKushim, type Pose } from "@/kushim/motion";

function Framing() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fov = 26;
    cam.fov = fov;
    const aspect = size.width / Math.max(1, size.height);
    const vertical = (fov * Math.PI) / 180;
    const distV = (1.12 / Math.tan(vertical / 2)) * 1.08;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distH = (0.72 / Math.tan(horizontal / 2)) * 1.18;
    const center = 0.92;
    cam.position.set(0, center + 0.08, Math.max(distV, distH));
    cam.lookAt(0, center, 0);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Avatar({ poseRef }: { poseRef: RefObject<Pose> }) {
  const rig = useMemo(() => createKushim(), []);
  const { scene, pointer } = useThree();
  const elapsed = useRef(0);

  useEffect(() => {
    scene.add(rig.root);
    return () => {
      scene.remove(rig.root);
      rig.dispose();
    };
  }, [scene, rig]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;
    setGaze(pointer.x, pointer.y);
    const pose = poseRef.current;
    if (!pose) return;
    tickKushim(rig, pose, dt, elapsed.current);
  });

  return null;
}

export function KushimScene({ poseRef }: { poseRef: RefObject<Pose> }) {
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
      <Avatar poseRef={poseRef} />
    </Canvas>
  );
}
