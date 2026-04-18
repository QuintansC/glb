import React from "react";

interface ConsentGateProps {
  onConsent: () => void;
}

export function ConsentGate({ onConsent }: ConsentGateProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        gap: 16,
        padding: 24,
        textAlign: "center",
        color: "#fff",
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Experimente antes de comprar</h2>
      <p style={{ maxWidth: 320, lineHeight: 1.6, color: "#ccc", fontSize: 14 }}>
        O provador virtual usa a câmera do seu dispositivo. O vídeo é processado
        localmente e não é gravado nem enviado para nenhum servidor.
      </p>
      <button
        onClick={onConsent}
        style={{
          padding: "12px 28px",
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Ativar câmera
      </button>
    </div>
  );
}
