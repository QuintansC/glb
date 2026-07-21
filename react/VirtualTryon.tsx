import React, { useEffect, useMemo, useState } from "react";
import { useProduct } from "vtex.product-context";
import { useCssHandles } from "vtex.css-handles";
import { useTryonState } from "./store/tryon.store";
import { TryonModal } from "./components/TryonModal";
import type { VtexFrame } from "./types";
// Default styling for the handles below (single-class, theme-overridable).
import "./VirtualTryon.css";

const CSS_HANDLES = ["tryonButton", "tryonButtonIcon"] as const;

const DEFAULT_MODELS_BASE_URL =
  "https://s3-sp4.ssc.cl9.cloud/ecommerce/glb-models";

interface VirtualTryonProps {
  /** URL fixa de um GLB — sobrepõe a descoberta automática por SKU. */
  modelUrl?: string;
  /** Base onde os modelos ficam salvos seguindo a convenção {base}/{skuId}.glb */
  modelsBaseUrl?: string;
  buttonLabel?: string;
}

/**
 * Resolve a URL do modelo 3D do SKU atual: usa a override quando informada,
 * senão monta {modelsBaseUrl}/{skuId}.glb e confirma via HEAD que o arquivo
 * existe no storage. Retorna null enquanto verifica ou quando não há modelo —
 * nesse caso o provador cai no modo 2D.
 */
function useSkuModelUrl(
  skuId: string | undefined,
  modelsBaseUrl: string,
  overrideUrl?: string
): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (overrideUrl) {
      setResolvedUrl(overrideUrl);
      return;
    }
    if (!skuId) {
      setResolvedUrl(null);
      return;
    }

    const url = `${modelsBaseUrl.replace(/\/+$/, "")}/${skuId}.glb`;
    let cancelled = false;

    setResolvedUrl(null);
    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && res.ok) setResolvedUrl(url);
      })
      .catch(() => {
        // Sem modelo para este SKU (ou storage fora do ar): segue sem 3D.
      });

    return () => {
      cancelled = true;
    };
  }, [skuId, modelsBaseUrl, overrideUrl]);

  return resolvedUrl;
}

function useFrameFromContext(): VtexFrame | null {
  const productContext = useProduct();

  return useMemo(() => {
    if (!productContext?.product) return null;

    const { product, selectedItem } = productContext;
    const sku = selectedItem ?? product.items?.[0];
    if (!sku) return null;

    const image = sku.images?.[0];

    const spec = (name: string) =>
      product.properties?.find(
        (p: { name: string; values: string[] }) =>
          p.name.toLowerCase() === name.toLowerCase()
      )?.values?.[0];

    const lensWidth = parseFloat(spec("Largura da Lente (mm)") ?? "52");
    const bridgeWidth = parseFloat(spec("Largura da Ponte (mm)") ?? "18");
    const templeLength = parseFloat(spec("Comprimento da Haste (mm)") ?? "140");
    const pdMin = parseFloat(spec("DP Mínima (mm)") ?? "60");
    const pdMax = parseFloat(spec("DP Máxima (mm)") ?? "70");
    const fitProfile =
      (spec("Perfil de Ajuste") as VtexFrame["fitProfile"]) ?? "medium";

    const seller = sku.sellers?.[0];
    const price =
      seller?.commertialOffer?.Price ?? seller?.commertialOffer?.ListPrice ?? 0;

    return {
      productId: product.productId,
      skuId: sku.itemId,
      name: product.productName,
      brand: product.brand,
      imageUrl: image?.imageUrl ?? "",
      thumbnailUrl: image?.imageUrl ?? "",
      lensWidth_mm: isNaN(lensWidth) ? 52 : lensWidth,
      bridgeWidth_mm: isNaN(bridgeWidth) ? 18 : bridgeWidth,
      templeLength_mm: isNaN(templeLength) ? 140 : templeLength,
      pdRange_mm: [isNaN(pdMin) ? 60 : pdMin, isNaN(pdMax) ? 70 : pdMax],
      fitProfile,
      price,
      link: product.link ?? "",
    };
  }, [productContext]);
}

export default function VirtualTryon({
  modelUrl,
  modelsBaseUrl = DEFAULT_MODELS_BASE_URL,
  buttonLabel = "Experimente agora",
}: VirtualTryonProps) {
  const [open, setOpen] = useState(false);
  const { handles } = useCssHandles(CSS_HANDLES);
  const { setSelectedFrame } = useTryonState();

  const frameFromContext = useFrameFromContext();
  const resolvedModelUrl = useSkuModelUrl(
    frameFromContext?.skuId,
    modelsBaseUrl,
    modelUrl
  );
  const frames: VtexFrame[] = useMemo(
    () => (frameFromContext ? [frameFromContext] : []),
    [frameFromContext]
  );

  function handleOpen() {
    if (frameFromContext) setSelectedFrame(frameFromContext);
    setOpen(true);
  }

  // Sem modelo 3D para o SKU (e sem override manual), o provador não é
  // oferecido — o botão simplesmente não renderiza.
  if (!resolvedModelUrl) return null;

  return (
    <>
      <button type="button" onClick={handleOpen} className={handles.tryonButton}>
        <svg
          className={handles.tryonButtonIcon}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="6" cy="15" r="4" />
          <circle cx="18" cy="15" r="4" />
          <path d="M10 15a2 2 0 0 1 4 0" />
          <path d="M2.5 13 5 7a2 2 0 0 1 2-1" />
          <path d="M21.5 13 19 7a2 2 0 0 0-2-1" />
        </svg>
        {buttonLabel}
      </button>

      <TryonModal
        open={open}
        onClose={() => setOpen(false)}
        frames={frames}
        modelUrl={resolvedModelUrl}
      />
    </>
  );
}

VirtualTryon.schema = {
  title: "Provador Virtual",
  description: "Botão que abre o provador virtual em modal na PDP",
  type: "object",
  properties: {
    buttonLabel: {
      title: "Texto do botão",
      type: "string",
      default: "Experimente agora",
    },
    modelsBaseUrl: {
      title: "URL base dos modelos 3D (convenção {base}/{skuId}.glb)",
      type: "string",
      default: DEFAULT_MODELS_BASE_URL,
    },
    modelUrl: {
      title: "URL fixa de um modelo 3D (sobrepõe a busca por SKU)",
      type: "string",
    },
  },
};
