// Tipos mínimos do Three.js — carregado via CDN em runtime
declare global {
  interface Window {
    threeModules?: {
      THREE: any;
      GLTFLoader: any;
    };
  }
}

export {};
