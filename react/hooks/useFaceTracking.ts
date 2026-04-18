import { useEffect, useRef, useCallback } from "react";
import type { FaceLandmarkerResult, FaceLandmarkerInstance } from "../typings/mediapipe";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface UseFaceTrackingOptions {
  onResult: (result: FaceLandmarkerResult) => void;
  enabled: boolean;
}

async function loadMediaPipe() {
  if (window.mediapipeTasks) return window.mediapipeTasks;

  const mp = await import(
    /* webpackIgnore: true */
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs" as any
  );

  window.mediapipeTasks = mp;
  return mp;
}

export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement>,
  { onResult, enabled }: UseFaceTrackingOptions
) {
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const rafRef = useRef<number>(0);

  const init = useCallback(async () => {
    try {
      console.log("[tryon] carregando MediaPipe...");
      const mp = await loadMediaPipe();
      console.log("[tryon] MediaPipe carregado", mp);
      const { FaceLandmarker, FilesetResolver } = mp;
      const resolver = await FilesetResolver.forVisionTasks(WASM_CDN);
      console.log("[tryon] resolver pronto");
      landmarkerRef.current = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
      console.log("[tryon] landmarker criado");
    } catch (err) {
      console.error("[tryon] erro ao iniciar MediaPipe:", err);
    }
  }, []);

  const detect = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }
    const result = landmarker.detectForVideo(video, performance.now());
    onResult(result);
    rafRef.current = requestAnimationFrame(detect);
  }, [videoRef, onResult]);

  useEffect(() => {
    if (!enabled) return;
    init().then(() => {
      rafRef.current = requestAnimationFrame(detect);
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [enabled, init, detect]);
}
