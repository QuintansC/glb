import React, { useMemo, useState } from "react";
import { useProduct } from "vtex.product-context";
import { useTryonState } from "./store/tryon.store";
import { TryonModal } from "./components/TryonModal";
import type { VtexFrame } from "./types";

const MODEL_3D_URL =
  "https://cdn.jsdelivr.net/gh/QuintansC/glb@main/public/glb-models/diniz-test/model.glb";

interface VirtualTryonProps {
  modelUrl?: string;
  buttonLabel?: string;
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
  modelUrl = MODEL_3D_URL,
  buttonLabel = "Experimente agora",
}: VirtualTryonProps) {
  const [open, setOpen] = useState(false);
  const { setSelectedFrame } = useTryonState();

  const frameFromContext = useFrameFromContext();
  const frames: VtexFrame[] = useMemo(
    () => (frameFromContext ? [frameFromContext] : []),
    [frameFromContext]
  );

  function handleOpen() {
    if (frameFromContext) setSelectedFrame(frameFromContext);
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          background: "#000",
          color: "#fff",
          border: "2px solid #000",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 18 }}>👓</span>
        {buttonLabel}
      </button>

      <TryonModal
        open={open}
        onClose={() => setOpen(false)}
        frames={frames}
        modelUrl={modelUrl}
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
    modelUrl: {
      title: "URL do modelo 3D padrão",
      type: "string",
      default: MODEL_3D_URL,
    },
  },
};
