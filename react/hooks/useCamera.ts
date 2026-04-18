import { useEffect, useRef, useState } from "react";

export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() =>
        setError("Permissão de câmera negada ou dispositivo não encontrado.")
      );

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { videoRef, ready, error };
}
