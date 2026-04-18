import React from "react";
import type { VtexFrame } from "../types";

interface FrameSelectorProps {
  frames: VtexFrame[];
  selectedFrame: VtexFrame | null;
  onSelect: (frame: VtexFrame | null) => void;
}

export function FrameSelector({ frames = [], selectedFrame, onSelect }: FrameSelectorProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        gap: 12,
        padding: "16px",
        overflowX: "auto",
        background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
      }}
    >
      {frames.map((frame) => (
        <button
          key={frame.skuId}
          onClick={() => onSelect(selectedFrame && selectedFrame.skuId === frame.skuId ? null : frame)}
          title={frame.name}
          style={{
            flexShrink: 0,
            width: 80,
            height: 60,
            border: selectedFrame && selectedFrame.skuId === frame.skuId
              ? "2px solid #fff"
              : "2px solid transparent",
            borderRadius: 8,
            background: "rgba(255,255,255,0.1)",
            cursor: "pointer",
            overflow: "hidden",
            padding: 0,
          }}
        >
          <img
            src={frame.thumbnailUrl}
            alt={frame.name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </button>
      ))}
    </div>
  );
}
