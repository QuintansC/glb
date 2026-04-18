import { useReducer, useCallback } from "react";
import type { VtexFrame } from "../types";

interface TryonState {
  selectedFrame: VtexFrame | null;
  frames: VtexFrame[];
  isTracking: boolean;
  faceDetected: boolean;
}

type Action =
  | { type: "SET_FRAME"; payload: VtexFrame | null }
  | { type: "SET_FRAMES"; payload: VtexFrame[] }
  | { type: "SET_TRACKING"; payload: boolean }
  | { type: "SET_FACE_DETECTED"; payload: boolean };

const initialState: TryonState = {
  selectedFrame: null,
  frames: [],
  isTracking: false,
  faceDetected: false,
};

function reducer(state: TryonState, action: Action): TryonState {
  switch (action.type) {
    case "SET_FRAME": return { ...state, selectedFrame: action.payload };
    case "SET_FRAMES": return { ...state, frames: action.payload };
    case "SET_TRACKING": return { ...state, isTracking: action.payload };
    case "SET_FACE_DETECTED": return { ...state, faceDetected: action.payload };
    default: return state;
  }
}

export function useTryonState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setSelectedFrame = useCallback((frame: VtexFrame | null) =>
    dispatch({ type: "SET_FRAME", payload: frame }), []);

  const setFrames = useCallback((frames: VtexFrame[]) =>
    dispatch({ type: "SET_FRAMES", payload: frames }), []);

  const setTracking = useCallback((tracking: boolean) =>
    dispatch({ type: "SET_TRACKING", payload: tracking }), []);

  const setFaceDetected = useCallback((detected: boolean) =>
    dispatch({ type: "SET_FACE_DETECTED", payload: detected }), []);

  return { ...state, setSelectedFrame, setFrames, setTracking, setFaceDetected };
}
