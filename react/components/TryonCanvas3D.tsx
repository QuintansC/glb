import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import type { FaceLandmarkerResult } from "../typings/mediapipe";
import { useRuntime } from "vtex.render-runtime";

export interface TryonCanvas3DHandle {
  draw: (result: FaceLandmarkerResult) => void;
}

interface TryonCanvas3DProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  modelUrl: string;
}

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const GLTF_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

async function loadThree() {
  if (window.threeModules) return window.threeModules;
  const THREE = await import(/* webpackIgnore: true */ THREE_CDN as any);
  const { GLTFLoader } = await import(/* webpackIgnore: true */ GLTF_CDN as any);
  window.threeModules = { THREE, GLTFLoader };
  return window.threeModules;
}

export const TryonCanvas3D = forwardRef<TryonCanvas3DHandle, TryonCanvas3DProps>(
  ({ videoRef, modelUrl }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneStateRef = useRef<any>(null);

    const { rootPath = "" } = (useRuntime() as any) || {};

    useEffect(() => {
      let mounted = true;

      (async () => {
        const mods = await loadThree();
        if (!mounted) return;
        const { THREE, GLTFLoader } = mods as any;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height, false);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0, 1, 1);
        scene.add(dir);

        const fov = 63;
        const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
        camera.position.set(0, 0, 0);

        const loader = new GLTFLoader();
        loader.load(modelUrl, (gltf: any) => {
          if (!mounted) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const TARGET_WIDTH = 0.14;
          const scale = TARGET_WIDTH / (size.x || 1);
          model.scale.setScalar(scale);
          const group = new THREE.Group();
          group.add(model);
          group.matrixAutoUpdate = false;
          scene.add(group);
          sceneStateRef.current = { THREE, renderer, scene, camera, group };
        });
      })();

      return () => {
        mounted = false;
        const s = sceneStateRef.current;
        if (s) {
          s.renderer.dispose();
          sceneStateRef.current = null;
        }
      };
    }, [modelUrl, videoRef, rootPath]);

    useImperativeHandle(ref, () => ({
      draw(result: FaceLandmarkerResult) {
        const s = sceneStateRef.current;
        const video = videoRef.current;
        if (!s || !video) return;

        const { THREE, renderer, scene, camera, group } = s;

        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width && (renderer.domElement.width !== width || renderer.domElement.height !== height)) {
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }

        const matrices = result.facialTransformationMatrixes;
        if (matrices && matrices.length && matrices[0].data && matrices[0].data.length === 16) {
          const m = new THREE.Matrix4().fromArray(matrices[0].data);
          group.matrix.copy(m);
          group.visible = true;
        } else {
          group.visible = false;
        }

        renderer.render(scene, camera);
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          transform: "scaleX(-1)",
        }}
      />
    );
  }
);
