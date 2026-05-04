import React from "react";

interface ConsentGateProps {
  onConsent: () => void;
  onCancel?: () => void;
}

export function ConsentGate({ onConsent, onCancel }: ConsentGateProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.92)",
        gap: 16,
        padding: 32,
        textAlign: "center",
        color: "#fff",
      }}
    >
      {/* Ícone de câmera */}
      <div style={{ fontSize: 48, lineHeight: 1 }}>📷</div>

      <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
        Experimente antes de comprar
      </h2>
      <p style={{ maxWidth: 300, lineHeight: 1.6, color: "#bbb", fontSize: 14, margin: 0 }}>
        O provador virtual usa a câmera do seu dispositivo. O vídeo é processado
        localmente e não é gravado nem enviado para nenhum servidor.
      </p>

      <button
        onClick={onConsent}
        style={{
          marginTop: 8,
          padding: "13px 32px",
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          width: "100%",
          maxWidth: 280,
        }}
      >
        Ativar câmera
      </button>

      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            padding: "10px 32px",
            background: "transparent",
            color: "#888",
            border: "none",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
