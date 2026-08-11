import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FaceLandmarkerResult } from "../typings/mediapipe";
import { useCamera } from "../hooks/useCamera";
import { useFaceTracking } from "../hooks/useFaceTracking";
import { useTryonState } from "../store/tryon.store";
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
  /** Largura total real da armação em mm — dimensiona o modelo no rosto. */
  frameWidthMm?: number;
}

export function TryonModal({ open, onClose, frames, modelUrl, frameWidthMm }: TryonModalProps) {
  const [hasConsent, setHasConsent] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [model3dLoading, setModel3dLoading] = useState(true);
  const [photoFlash, setPhotoFlash] = useState(false);
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
    canvas3DRef.current?.draw(result);
  }, []);

  useFaceTracking(videoRef, { onResult: handleResult, enabled: hasConsent && ready && open });

  // Compõe vídeo + óculos num canvas com o mesmo recorte/espelhamento da tela
  // e baixa como PNG.
  const handlePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const overlay = canvas3DRef.current?.getCanvas();

    const box = video.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cover = Math.max(box.width / vw, box.height / vh);
    const visW = vw && cover ? box.width / cover : vw;
    const visH = vh && cover ? box.height / cover : vh;
    const cropX = (vw - visW) / 2;
    const cropY = (vh - visH) / 2;

    const out = document.createElement("canvas");
    out.width = Math.round(visW);
    out.height = Math.round(visH);
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, cropX, cropY, visW, visH, 0, 0, out.width, out.height);
    if (overlay && overlay.width) {
      // canvas 3D já representa exatamente o recorte visível
      ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, out.width, out.height);
    }

    setPhotoFlash(true);
    setTimeout(() => setPhotoFlash(false), 180);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provador-virtual-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [videoRef]);

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
            <TryonCanvas3D
              ref={canvas3DRef}
              videoRef={videoRef}
              modelUrl={modelUrl}
              frameWidthMm={frameWidthMm}
              onLoadingChange={setModel3dLoading}
            />

            {frames.length > 1 && (
              <FrameSelector
                frames={frames}
                selectedFrame={selectedFrame}
                onSelect={setSelectedFrame}
              />
            )}

            {/* Loading do modelo 3D */}
            {model3dLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 56,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "tryon-spin 0.8s linear infinite",
                  }}
                />
                Carregando óculos 3D…
                <style>{`@keyframes tryon-spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Botão de foto (obturador) */}
            <button
              onClick={handlePhoto}
              disabled={model3dLoading}
              aria-label="Tirar foto e baixar"
              title="Tirar foto e baixar"
              style={{
                position: "absolute",
                bottom: frames.length > 1 ? 104 : 16,
                left: "50%",
                transform: "translateX(-50%)",
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "3px solid #fff",
                background: "rgba(255,255,255,0.25)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                cursor: model3dLoading ? "default" : "pointer",
                opacity: model3dLoading ? 0.4 : 1,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#fff",
                }}
              />
            </button>

            {/* Flash de captura */}
            {photoFlash && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#fff",
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            )}

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
