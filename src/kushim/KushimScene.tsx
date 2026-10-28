import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createKushim, type Rig } from "@/kushim/anatomy";
import { ATHLETIC_URL, seatedFromGltf } from "@/kushim/athletic-shell";
import { noteLiveFrame, resetLiveFrame } from "@/kushim/frame-time";
import { setGaze } from "@/kushim/lipsync";
import { LOCK } from "@/kushim/lock";
import {
  LOCK_READ_SEC,
  assertClearLock,
  assertFrontalCamera,
  assertRigLock,
} from "@/kushim/lock-check";
import { tickKushim, type Pose } from "@/kushim/motion";

function shotYaw() {
  if (!import.meta.env.DEV || typeof window === "undefined") return 0;
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "threequarter" ? 0.46 : 0;
}

function Framing() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fov = 26;
    cam.fov = fov;
    const aspect = size.width / Math.max(1, size.height);
    const vertical = (fov * Math.PI) / 180;
    const distV = (0.96 / Math.tan(vertical / 2)) * 1.04;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distH = (0.58 / Math.tan(horizontal / 2)) * 1.1;
    const dist = Math.max(distV, distH);
    const center = 0.8;
    const yaw = shotYaw();
    cam.position.set(Math.sin(yaw) * dist, center + 0.02, Math.cos(yaw) * dist);
    cam.lookAt(0, center, 0);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Avatar({
  poseRef,
  onBreach,
}: {
  poseRef: RefObject<Pose>;
  onBreach: (message: string) => void;
}) {
  const [rig, setRig] = useState<Rig | null>(null);
  const { scene, pointer, camera, gl } = useThree();
  const elapsed = useRef(0);
  const lockAcc = useRef(0);
  const lockSeen = useRef(false);
  const reported = useRef(false);

  useEffect(() => {
    let alive = true;
    const loader = new GLTFLoader();
    loader.load(
      ATHLETIC_URL,
      (gltf) => {
        if (!alive) return;
        const geo = seatedFromGltf(gltf);
        void createKushim(geo).then((next) => {
          if (!alive) {
            next.dispose();
            return;
          }
          setRig(next);
        });
      },
      undefined,
      (err) => {
        if (!alive) return;
        onBreach(err instanceof Error ? err.message : "Athletic mesh failed to load.");
      },
    );
    return () => {
      alive = false;
    };
  }, [onBreach]);

  useEffect(() => {
    if (!rig) return;
    resetLiveFrame();
    scene.add(rig.root);
    return () => {
      scene.remove(rig.root);
      rig.dispose();
      resetLiveFrame();
    };
  }, [scene, rig]);

  useFrame((_, delta) => {
    if (!rig) return;
    noteLiveFrame(delta);
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;
    setGaze(pointer.x, pointer.y);
    const pose = poseRef.current;
    if (pose) tickKushim(rig, pose, dt, elapsed.current);
    if (reported.current) return;
    lockAcc.current += dt;
    if (lockSeen.current && lockAcc.current < LOCK_READ_SEC) return;
    lockSeen.current = true;
    lockAcc.current = 0;
    try {
      assertRigLock(rig, "live", scene);
      if (shotYaw() === 0) assertFrontalCamera(camera);
      assertClearLock(gl, scene);
    } catch (error) {
      reported.current = true;
      onBreach(error instanceof Error ? error.message : String(error));
    }
  });

  return null;
}

export function KushimScene({ poseRef }: { poseRef: RefObject<Pose> }) {
  const [breach, setBreach] = useState<string | null>(null);
  if (breach) throw new Error(breach);
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 26, near: 0.08, far: 40, position: [0, 1, 6] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(LOCK.void, 1);
        gl.toneMapping = THREE.NoToneMapping;
        assertClearLock(gl, scene);
      }}
    >
      <Framing />
      <Avatar poseRef={poseRef} onBreach={setBreach} />
    </Canvas>
  );
}
