import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import type { FaceLandmarkerResult } from "../typings/mediapipe";

export interface TryonCanvas3DHandle {
  draw: (result: FaceLandmarkerResult) => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface TryonCanvas3DProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  modelUrl: string;
  onLoadingChange?: (loading: boolean) => void;
}

const THREE_CDN = "https://esm.sh/three@0.160.0";
const GLTF_CDN = "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// Espaço métrico do MediaPipe: origem na superfície do rosto entre os olhos,
// x direita, y cima, z em direção à câmera, unidades em cm.
const MODEL_WIDTH_CM = 15; // largura total da armação incluindo terminais das hastes
const MODEL_SCALE_BOOST = 1.1; // fator de aumento proporcional aplicado a TODAS as armações
const OFFSET_Y_CM = -0.9; // ajuste fino vertical a partir do topo do nariz: + sobe, - desce
const OFFSET_Z_CM = 0.5; // distância da frente da armação até a superfície do rosto
// Gira a armação em torno do eixo X com pivô na frente (plano z=0): valores
// positivos LEVANTAM a ponta das hastes, corrigindo a impressão de que elas
// passam abaixo da orelha quando o rosto olha reto para a câmera.
const TEMPLE_TILT_DEG = 6;
// Corta a haste a partir desta profundidade (cm atrás da frente da armação),
// escondendo a dobra da perninha que desce para trás da orelha. Menor (mais
// negativo) = corta menos; null desliga o corte.
const TEMPLE_CLIP_Z_CM: number | null = -9;
const MEDIAPIPE_FOV_DEG = 63; // FOV vertical assumido pelo Face Landmarker

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
  ({ videoRef, modelUrl, onLoadingChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneStateRef = useRef<any>(null);
    // Ref para não recriar a cena quando a identidade do callback mudar
    const onLoadingChangeRef = useRef(onLoadingChange);
    onLoadingChangeRef.current = onLoadingChange;

    useEffect(() => {
      let mounted = true;
      onLoadingChangeRef.current?.(true);

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

        // preserveDrawingBuffer permite ler o canvas na captura de foto
        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(displayW, displayH, false);
        renderer.localClippingEnabled = TEMPLE_CLIP_Z_CM !== null;

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0, 1, 1);
        scene.add(dir);

        const camera = new THREE.PerspectiveCamera(MEDIAPIPE_FOV_DEG, displayW / displayH, 1, 1000);
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
        // Largura (x) um pouco menor que a armação para as hastes aparecerem
        // de leve contornando a lateral da cabeça até a orelha.
        const occluderGeom = new THREE.SphereGeometry(7, 24, 24);
        occluderGeom.scale(0.92, 1.3, 1);
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
            const scale = (MODEL_WIDTH_CM * MODEL_SCALE_BOOST) / (size.x || 1);
            model.scale.setScalar(scale);
            const center = new THREE.Vector3();
            box.getCenter(center);
            // Âncora: centro em X/Y, mas em Z a FRENTE da armação fica no plano
            // z=0 (superfície do rosto). Centralizar em Z empurraria a armação
            // meia haste à frente do rosto, pois o glb inclui as hastes.
            model.position.set(
              -center.x * scale,
              -center.y * scale,
              -box.max.z * scale
            );
            const group = new THREE.Group();
            group.add(model);
            group.matrixAutoUpdate = false;
            scene.add(group);
            scene.add(occluder);

            // Plano de corte da haste. Fica em coordenadas do grupo (z=0 na
            // frente da armação) e é convertido para o mundo a cada frame,
            // acompanhando a rotação da cabeça.
            let clipPlane: any = null;
            let clipPlaneLocal: any = null;
            if (TEMPLE_CLIP_Z_CM !== null) {
              // mantém o que está à FRENTE de z = TEMPLE_CLIP_Z_CM
              clipPlaneLocal = new THREE.Plane(new THREE.Vector3(0, 0, 1), -TEMPLE_CLIP_Z_CM);
              clipPlane = clipPlaneLocal.clone();
              model.traverse((obj: any) => {
                if (!obj.isMesh) return;
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m: any) => {
                  if (!m) return;
                  m.clippingPlanes = [clipPlane];
                  m.clipIntersection = false;
                  m.needsUpdate = true;
                });
              });
            }

            sceneStateRef.current = {
              THREE,
              renderer,
              scene,
              camera,
              group,
              occluder,
              clipPlane,
              clipPlaneLocal,
            };
            onLoadingChangeRef.current?.(false);
            console.log("[tryon3d] cena pronta");
          },
          undefined,
          (err: any) => {
            console.error("[tryon3d] erro ao carregar modelo:", err);
            if (mounted) onLoadingChangeRef.current?.(false);
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

        const { THREE, renderer, scene, camera, group, occluder, clipPlane, clipPlaneLocal } = s;

        const displayW = renderer.domElement.clientWidth;
        const displayH = renderer.domElement.clientHeight;
        if (displayW && (renderer.domElement.width !== displayW || renderer.domElement.height !== displayH)) {
          renderer.setSize(displayW, displayH, false);
        }

        // O vídeo usa object-fit: cover, então só uma fração do frame aparece.
        // A matriz do MediaPipe é relativa ao frame INTEIRO — a câmera 3D precisa
        // reproduzir o mesmo recorte, senão o óculos sai menor que o rosto
        // (efeito forte no mobile, onde o corte vertical é grande).
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh || !displayW || !displayH) return;
        const cover = Math.max(displayW / vw, displayH / vh);
        const visibleFrac = Math.min(1, displayH / (vh * cover));
        const baseFov = (MEDIAPIPE_FOV_DEG * Math.PI) / 180;
        const fovDeg = (2 * Math.atan(Math.tan(baseFov / 2) * visibleFrac) * 180) / Math.PI;
        const aspect = displayW / displayH;
        if (Math.abs(camera.fov - fovDeg) > 0.01 || Math.abs(camera.aspect - aspect) > 0.001) {
          camera.fov = fovDeg;
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
        }

        const matrices = result.facialTransformationMatrixes;
        const landmarks = result.faceLandmarks && result.faceLandmarks[0];
        if (
          matrices && matrices.length && matrices[0].data && matrices[0].data.length === 16 &&
          landmarks && landmarks.length
        ) {
          const baseMatrix = new THREE.Matrix4().fromArray(matrices[0].data);

          // A translação da matriz do MediaPipe usa intrínsecos genéricos de
          // câmera e desvia lateralmente quando o rosto sai do centro do frame.
          // Só a ROTAÇÃO vem da matriz; a POSIÇÃO é ancorada no landmark do topo
          // do nariz (o mesmo ponto usado pelo modo 2D), reprojetado na
          // profundidade métrica da matriz — assim o óculos fica colado no rosto.
          const NOSE_BRIDGE = 6;
          const lm = landmarks[NOSE_BRIDGE];
          const depth = Math.abs(new THREE.Vector3().setFromMatrixPosition(baseMatrix).z) || 45;

          // landmark (normalizado no frame inteiro) -> NDC do viewport recortado
          const visW = displayW / cover;
          const visH = displayH / cover;
          const cropX = (vw - visW) / 2;
          const cropY = (vh - visH) / 2;
          const ndcX = ((lm.x * vw - cropX) / visW) * 2 - 1;
          const ndcY = -(((lm.y * vh - cropY) / visH) * 2 - 1);
          const tanV = Math.tan((camera.fov * Math.PI) / 360);
          const tanH = tanV * camera.aspect;
          const anchor = new THREE.Matrix4().makeTranslation(
            ndcX * tanH * depth,
            ndcY * tanV * depth,
            -depth
          );

          const rotation = new THREE.Matrix4().extractRotation(baseMatrix);
          const headMatrix = anchor.multiply(rotation);
          if (occluder) {
            occluder.matrix.copy(headMatrix);
            occluder.visible = true;
          }
          // Translação fina + inclinação das hastes. A rotação é aplicada depois
          // da translação (ordem offset * tilt), então o pivô fica na frente da
          // armação (z=0): a frente permanece colada no nariz e só a parte de
          // trás (hastes) sobe.
          const offset = new THREE.Matrix4()
            .makeTranslation(0, OFFSET_Y_CM, OFFSET_Z_CM)
            .multiply(new THREE.Matrix4().makeRotationX((TEMPLE_TILT_DEG * Math.PI) / 180));
          group.matrix.copy(headMatrix.clone().multiply(offset));
          group.visible = true;
          if (clipPlane && clipPlaneLocal) {
            clipPlane.copy(clipPlaneLocal).applyMatrix4(group.matrix);
          }
        } else {
          group.visible = false;
          if (occluder) occluder.visible = false;
        }

        renderer.render(scene, camera);
      },
      getCanvas: () => canvasRef.current,
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
