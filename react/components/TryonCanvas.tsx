import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import type { FaceLandmarkerResult } from "../typings/mediapipe";
import { drawFrameOverlay } from "../utils/frameOverlay";
import type { VtexFrame } from "../types";

export interface TryonCanvasHandle {
  draw: (result: FaceLandmarkerResult) => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface TryonCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  selectedFrame: VtexFrame | null;
}

export const TryonCanvas = forwardRef<TryonCanvasHandle, TryonCanvasProps>(
  ({ videoRef, selectedFrame }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameImgRef = useRef<HTMLImageElement | null>(null);
    const selectedFrameRef = useRef<VtexFrame | null>(selectedFrame);

    useEffect(() => {
      selectedFrameRef.current = selectedFrame;
      if (!selectedFrame) {
        frameImgRef.current = null;
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFrame.imageUrl;
      img.onload = () => {
        frameImgRef.current = img;
      };
    }, [selectedFrame]);

    useImperativeHandle(ref, () => ({
      draw(result: FaceLandmarkerResult) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const frame = selectedFrameRef.current;
        const img = frameImgRef.current;
        if (frame && img && result.faceLandmarks.length) {
          drawFrameOverlay(ctx, result, img, frame, video.videoWidth, video.videoHeight);
        }
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
          // Mesmo recorte do <video> (object-fit: cover); sem isso o canvas é
          // esticado e o overlay desalinha quando o aspecto do vídeo difere do box.
          objectFit: "cover",
          pointerEvents: "none",
          transform: "scaleX(-1)",
        }}
      />
    );
  }
);
