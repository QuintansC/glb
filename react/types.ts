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
  /**
   * Largura total da armação em mm, quando o catálogo permitiu apurá-la (spec
   * "Tamanho Frontal", ou lente × 2 + ponte + charneiras). `undefined` quando as
   * specs não foram encontradas — aí o provador usa a armação média em vez de
   * fingir uma medida.
   */
  totalWidth_mm?: number;
  pdRange_mm: [number, number];
  fitProfile: FitProfile;
  price: number;
  link: string;
}
