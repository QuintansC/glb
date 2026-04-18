import React, { useCallback, useState, useRef } from "react";
import type { FaceLandmarkerResult } from "./typings/mediapipe";
import { useCamera } from "./hooks/useCamera";
import { useFaceTracking } from "./hooks/useFaceTracking";
import { useTryonState } from "./store/tryon.store";
import { TryonCanvas } from "./components/TryonCanvas";
import type { TryonCanvasHandle } from "./components/TryonCanvas";
import { TryonCanvas3D } from "./components/TryonCanvas3D";
import type { TryonCanvas3DHandle } from "./components/TryonCanvas3D";
import { FrameSelector } from "./components/FrameSelector";
import { ConsentGate } from "./components/ConsentGate";
import type { VtexFrame } from "./types";

const MODEL_3D_URL = "/assets/oticasdiniz.virtual-tryon/public/glb-models/diniz-test/model.glb";

interface VirtualTryonProps {
  frames: VtexFrame[];
}

const MOCK_FRAMES: VtexFrame[] = [
  {
    productId: "mock-1",
    skuId: "541516",
    name: "Armação Teste",
    brand: "Óticas Diniz",
    imageUrl: "https://oticasdiniz.vtexassets.com/arquivos/ids/541516-1200-auto?v=638932969571430000&width=1200&height=auto&aspect=true",
    thumbnailUrl: "https://oticasdiniz.vtexassets.com/arquivos/ids/541516-1200-auto?v=638932969571430000&width=200&height=auto&aspect=true",
    lensWidth_mm: 52,
    bridgeWidth_mm: 18,
    templeLength_mm: 140,
    pdRange_mm: [60, 70],
    fitProfile: "medium",
    price: 0,
    link: "",
  },
];

export default function VirtualTryon({ frames = [] }: VirtualTryonProps) {
  const [hasConsent, setHasConsent] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const canvasRef = useRef<TryonCanvasHandle>(null);
  const canvas3DRef = useRef<TryonCanvas3DHandle>(null);

  const { videoRef, ready, error } = useCamera(hasConsent);
  const { selectedFrame, setSelectedFrame } = useTryonState();

  const displayFrames = frames.length > 0 ? frames : MOCK_FRAMES;

  const handleResult = useCallback((result: FaceLandmarkerResult) => {
    setFaceDetected(result.faceLandmarks.length > 0);
    if (use3D) {
      if (canvas3DRef.current) canvas3DRef.current.draw(result);
    } else {
      if (canvasRef.current) canvasRef.current.draw(result);
    }
  }, [use3D]);

  useFaceTracking(videoRef, { onResult: handleResult, enabled: hasConsent && ready });

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", background: "#000", overflow: "hidden", borderRadius: 8 }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ccc", fontSize: 14, textAlign: "center", padding: 24 }}>
            {error}
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: hasConsent ? "block" : "none" }}
        />

        {hasConsent && ready && (
          <React.Fragment>
            {use3D ? (
              <TryonCanvas3D ref={canvas3DRef} videoRef={videoRef} modelUrl={MODEL_3D_URL} />
            ) : (
              <TryonCanvas ref={canvasRef} videoRef={videoRef} selectedFrame={selectedFrame} />
            )}
            <FrameSelector frames={displayFrames} selectedFrame={selectedFrame} onSelect={setSelectedFrame} />
            <button
              onClick={() => setUse3D((v) => !v)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {use3D ? "2D" : "3D"}
            </button>
            {!faceDetected && (
              <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", color: "#fff", padding: "8px 16px", borderRadius: 20, fontSize: 13, whiteSpace: "nowrap" }}>
                Posicione seu rosto no centro
              </div>
            )}
          </React.Fragment>
        )}

        {!hasConsent && !error && <ConsentGate onConsent={() => setHasConsent(true)} />}
      </div>
    </div>
  );
}
