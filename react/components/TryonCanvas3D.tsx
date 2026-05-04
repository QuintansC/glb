import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import type { FaceLandmarkerResult } from "../typings/mediapipe";

export interface TryonCanvas3DHandle {
  draw: (result: FaceLandmarkerResult) => void;
}

interface TryonCanvas3DProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  modelUrl: string;
}

const THREE_CDN = "https://esm.sh/three@0.160.0";
const GLTF_CDN = "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

async function loadThree() {
  if (window.threeModules) return window.threeModules;
  console.log("[tryon3d] carregando Three.js...");
  const THREE = await import(/* webpackIgnore: true */ THREE_CDN as any);
  console.log("[tryon3d] Three.js carregado", THREE);
  const gltfMod = await import(/* webpackIgnore: true */ GLTF_CDN as any);
  console.log("[tryon3d] GLTFLoader carregado", gltfMod);
  const GLTFLoader = gltfMod.GLTFLoader || gltfMod.default?.GLTFLoader;
  window.threeModules = { THREE, GLTFLoader };
  return window.threeModules;
}

export const TryonCanvas3D = forwardRef<TryonCanvas3DHandle, TryonCanvas3DProps>(
  ({ videoRef, modelUrl }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneStateRef = useRef<any>(null);

    useEffect(() => {
      let mounted = true;

      (async () => {
        console.log("[tryon3d] inicializando cena, modelo:", modelUrl);
        const mods = await loadThree();
        if (!mounted) return;
        const { THREE, GLTFLoader } = mods as any;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) {
          console.warn("[tryon3d] canvas ou video não disponível");
          return;
        }

        const displayW = canvas.clientWidth || 640;
        const displayH = canvas.clientHeight || 480;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(displayW, displayH, false);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0, 1, 1);
        scene.add(dir);

        const fov = 63;
        const camera = new THREE.PerspectiveCamera(fov, displayW / displayH, 1, 1000);
        camera.position.set(0, 0, 0);

        // Occluder simples: elipsóide invisível no lugar da cabeça.
        // Escreve no depth buffer mas não nas cores, então tudo que estiver "atrás"
        // dele (ex: hastes do óculos passando pelo meio do rosto) é descartado.
        //
        // TODO (evolução): substituir por face mesh completa usando os 468 landmarks
        // do MediaPipe + índices FACE_MESH_TESSELATION. Passos:
        //   1. Criar BufferGeometry com position attribute de 468 vértices.
        //   2. Popular indices com os triângulos de FACE_MESH_TESSELATION (do pacote
        //      @mediapipe/tasks-vision ou copiar a constante).
        //   3. A cada frame, atualizar os vértices com result.faceLandmarks[0]
        //      convertidos do espaço normalizado para o espaço 3D da matriz facial.
        //   4. Material com colorWrite: false, depthWrite: true (igual ao elipsóide).
        // Isso dá oclusão perfeita respeitando o contorno real do rosto.
        const occluderGeom = new THREE.SphereGeometry(7, 24, 24);
        occluderGeom.scale(1, 1.3, 1);
        occluderGeom.translate(0, 0, -7);
        const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false });
        const occluder = new THREE.Mesh(occluderGeom, occluderMat);
        occluder.renderOrder = -1;
        occluder.matrixAutoUpdate = false;

        const loader = new GLTFLoader();
        console.log("[tryon3d] carregando modelo de:", modelUrl);
        loader.load(
          modelUrl,
          (gltf: any) => {
            if (!mounted) return;
            console.log("[tryon3d] modelo carregado", gltf);
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            console.log("[tryon3d] dimensões originais:", size.x, size.y, size.z);
            const TARGET_WIDTH_CM = 14;
            const scale = TARGET_WIDTH_CM / (size.x || 1);
            model.scale.setScalar(scale);
            const center = new THREE.Vector3();
            box.getCenter(center);
            model.position.sub(center.multiplyScalar(scale));
            const group = new THREE.Group();
            group.add(model);
            group.matrixAutoUpdate = false;
            scene.add(group);
            scene.add(occluder);
            sceneStateRef.current = { THREE, renderer, scene, camera, group, occluder };
            console.log("[tryon3d] cena pronta");
          },
          undefined,
          (err: any) => {
            console.error("[tryon3d] erro ao carregar modelo:", err);
          }
        );
      })();

      return () => {
        mounted = false;
        const s = sceneStateRef.current;
        if (s) {
          s.renderer.dispose();
          sceneStateRef.current = null;
        }
      };
    }, [modelUrl, videoRef]);

    useImperativeHandle(ref, () => ({
      draw(result: FaceLandmarkerResult) {
        const s = sceneStateRef.current;
        const video = videoRef.current;
        if (!s || !video) return;

        const { THREE, renderer, scene, camera, group, occluder } = s;

        const displayW = renderer.domElement.clientWidth;
        const displayH = renderer.domElement.clientHeight;
        if (displayW && (renderer.domElement.width !== displayW || renderer.domElement.height !== displayH)) {
          renderer.setSize(displayW, displayH, false);
          camera.aspect = displayW / displayH;
          camera.updateProjectionMatrix();
        }

        const matrices = result.facialTransformationMatrixes;
        if (matrices && matrices.length && matrices[0].data && matrices[0].data.length === 16) {
          const baseMatrix = new THREE.Matrix4().fromArray(matrices[0].data);
          if (occluder) {
            occluder.matrix.copy(baseMatrix);
            occluder.visible = true;
          }
          const offset = new THREE.Matrix4().makeTranslation(0, 1.5, 0);
          const framesMatrix = baseMatrix.clone().multiply(offset);
          group.matrix.copy(framesMatrix);
          group.visible = true;
        } else {
          group.visible = false;
          if (occluder) occluder.visible = false;
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
