import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FaceLandmarkerResult } from "../typings/mediapipe";
import { useCamera } from "../hooks/useCamera";
import { useFaceTracking } from "../hooks/useFaceTracking";
import { useTryonState } from "../store/tryon.store";
import { TryonCanvas } from "./TryonCanvas";
import type { TryonCanvasHandle } from "./TryonCanvas";
import { TryonCanvas3D } from "./TryonCanvas3D";
import type { TryonCanvas3DHandle } from "./TryonCanvas3D";
import { FrameSelector } from "./FrameSelector";
import { ConsentGate } from "./ConsentGate";
import type { VtexFrame } from "../types";

interface TryonModalProps {
  open: boolean;
  onClose: () => void;
  frames: VtexFrame[];
  modelUrl: string;
}

export function TryonModal({ open, onClose, frames, modelUrl }: TryonModalProps) {
  const [hasConsent, setHasConsent] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const canvasRef = useRef<TryonCanvasHandle>(null);
  const canvas3DRef = useRef<TryonCanvas3DHandle>(null);

  const { videoRef, ready, error } = useCamera(hasConsent && open);
  const { selectedFrame, setSelectedFrame } = useTryonState();

  // Para câmera quando fecha o modal
  useEffect(() => {
    if (!open) setHasConsent(false);
  }, [open]);

  // Fecha com Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Trava scroll do body enquanto modal está aberto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleResult = useCallback((result: FaceLandmarkerResult) => {
    setFaceDetected(result.faceLandmarks.length > 0);
    if (use3D) {
      canvas3DRef.current?.draw(result);
    } else {
      canvasRef.current?.draw(result);
    }
  }, [use3D]);

  useFaceTracking(videoRef, { onResult: handleResult, enabled: hasConsent && ready && open });

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Caixa do modal — stopPropagation impede fechar ao clicar dentro */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
          aspectRatio: "4/3",
        }}
      >
        {/* Botão fechar */}
        <button
          onClick={onClose}
          aria-label="Fechar provador"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "50%",
            width: 36,
            height: 36,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#ccc",
              fontSize: 14,
              textAlign: "center",
              padding: 24,
            }}
          >
            {error}
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
            display: hasConsent ? "block" : "none",
          }}
        />

        {hasConsent && ready && (
          <React.Fragment>
            {use3D ? (
              <TryonCanvas3D ref={canvas3DRef} videoRef={videoRef} modelUrl={modelUrl} />
            ) : (
              <TryonCanvas ref={canvasRef} videoRef={videoRef} selectedFrame={selectedFrame} />
            )}

            {frames.length > 1 && (
              <FrameSelector
                frames={frames}
                selectedFrame={selectedFrame}
                onSelect={setSelectedFrame}
              />
            )}

            <button
              onClick={() => setUse3D((v) => !v)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
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
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Posicione seu rosto no centro
              </div>
            )}
          </React.Fragment>
        )}

        {!hasConsent && !error && (
          <ConsentGate onConsent={() => setHasConsent(true)} onCancel={onClose} />
        )}
      </div>
    </div>,
    document.body
  );
}
