export type FitProfile = "small" | "medium" | "large";

export interface VtexFrame {
  productId: string;
  skuId: string;
  name: string;
  brand: string;
  imageUrl: string;
  thumbnailUrl: string;
  lensWidth_mm: number;
  bridgeWidth_mm: number;
  templeLength_mm: number;
  pdRange_mm: [number, number];
  fitProfile: FitProfile;
  price: number;
  link: string;
}
