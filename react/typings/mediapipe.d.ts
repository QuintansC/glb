// Tipos mínimos do MediaPipe para evitar import do pacote npm
// O script é carregado via CDN em runtime

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmarkerResult {
  faceLandmarks: NormalizedLandmark[][];
  facialTransformationMatrixes?: { data: number[] }[];
}

export interface FaceLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult;
  close(): void;
}

export interface FilesetResolverStatic {
  forVisionTasks(wasmPath: string): Promise<unknown>;
}

export interface FaceLandmarkerStatic {
  createFromOptions(
    resolver: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate?: string };
      runningMode: string;
      numFaces: number;
      outputFaceBlendshapes: boolean;
      outputFacialTransformationMatrixes: boolean;
    }
  ): Promise<FaceLandmarkerInstance>;
}

declare global {
  interface Window {
    mediapipeTasks?: {
      FaceLandmarker: FaceLandmarkerStatic;
      FilesetResolver: FilesetResolverStatic;
    };
  }
}
