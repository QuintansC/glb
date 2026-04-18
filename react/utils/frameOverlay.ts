import type { FaceLandmarkerResult } from "../typings/mediapipe";
import type { VtexFrame } from "../types";

const LEFT_EYE = 33;
const RIGHT_EYE = 263;
const NOSE_BRIDGE = 6;

export function drawFrameOverlay(
  ctx: CanvasRenderingContext2D,
  result: FaceLandmarkerResult,
  frameImage: HTMLImageElement,
  frame: VtexFrame,
  videoWidth: number,
  videoHeight: number
) {
  if (!result.faceLandmarks.length) return;

  const landmarks = result.faceLandmarks[0];
  const leftEye = landmarks[LEFT_EYE];
  const rightEye = landmarks[RIGHT_EYE];
  const noseBridge = landmarks[NOSE_BRIDGE];

  const lx = leftEye.x * videoWidth;
  const ly = leftEye.y * videoHeight;
  const rx = rightEye.x * videoWidth;
  const ry = rightEye.y * videoHeight;

  const eyeDistance = Math.hypot(rx - lx, ry - ly);
  const AVERAGE_INTEROCULAR_MM = 62;
  const totalFrameWidthMm = frame.lensWidth_mm * 2 + frame.bridgeWidth_mm;
  const frameWidth = (totalFrameWidthMm / AVERAGE_INTEROCULAR_MM) * eyeDistance;
  const scaleFactor = frameWidth / frameImage.naturalWidth;
  const frameHeight = frameImage.naturalHeight * scaleFactor;

  const centerX = noseBridge.x * videoWidth;
  const centerY = noseBridge.y * videoHeight;
  const angle = Math.atan2(ry - ly, rx - lx);

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.drawImage(frameImage, -frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
  ctx.restore();
}
