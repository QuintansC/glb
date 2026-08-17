import type { VtexFrame } from "../types";

/**
 * Empurra um evento do provador para o dataLayer do GTM.
 *
 * `item_id` é o SKU (e não o productId) de propósito: é a chave que a loja já
 * usa nos eventos de ecommerce, então os eventos do provador cruzam com
 * view_item/purchase nos relatórios do GA4 sem tradução no meio.
 *
 * Sem frame não há nada a atribuir, então o evento é descartado em vez de
 * subir uma linha sem produto.
 */
export function pushTryonEvent(event: string, frame?: VtexFrame | null): void {
  if (typeof window === "undefined" || !frame) return;

  const target = window as Window & { dataLayer?: unknown[] };
  target.dataLayer = target.dataLayer || [];
  target.dataLayer.push({
    event,
    item_id: frame.skuId,
    item_name: frame.name,
    item_brand: frame.brand,
    product_id: frame.productId,
    item_reference: frame.referenceId,
    price: frame.price,
  });
}
