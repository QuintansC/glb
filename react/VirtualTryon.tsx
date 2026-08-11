import React, { useEffect, useMemo, useState } from "react";
import { useProduct } from "vtex.product-context";
import { useCssHandles } from "vtex.css-handles";
import { useTryonState } from "./store/tryon.store";
import { TryonModal } from "./components/TryonModal";
import {
  deriveFrontWidthMm,
  isPlausibleFrontWidthMm,
  parseFrameModelMeta,
  resolveFrameWidthMm,
  totalFromFrontWidthMm,
} from "./utils/frameMetrics";
import type { FrameModelMeta } from "./utils/frameMetrics";
import {
  SPEC_ALIASES,
  collectSpecs,
  readSpecNumber,
  readSpecText,
} from "./utils/productSpecs";
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

interface SkuModel {
  url: string;
  /** Conteúdo de {skuId}.json, quando o modelo foi cadastrado com as medidas. */
  meta: FrameModelMeta | null;
}

/**
 * Resolve o modelo 3D do SKU atual: usa a override quando informada, senão
 * monta {modelsBaseUrl}/{skuId}.glb e confirma via HEAD que o arquivo existe no
 * storage. Em paralelo busca o sidecar {skuId}.json com as medidas físicas da
 * armação — ele é opcional, e sem ele a largura cai para as specs do catálogo.
 * Retorna null enquanto verifica ou quando não há modelo — nesse caso o
 * provador cai no modo 2D.
 */
function useSkuModel(
  skuId: string | undefined,
  modelsBaseUrl: string,
  overrideUrl?: string
): SkuModel | null {
  const [resolved, setResolved] = useState<SkuModel | null>(null);

  useEffect(() => {
    if (overrideUrl) {
      // URL avulsa não segue a convenção por SKU, então não há sidecar a buscar.
      setResolved({ url: overrideUrl, meta: null });
      return;
    }
    if (!skuId) {
      setResolved(null);
      return;
    }

    const base = modelsBaseUrl.replace(/\/+$/, "");
    const url = `${base}/${skuId}.glb`;
    const metaUrl = `${base}/${skuId}.json`;
    let cancelled = false;

    setResolved(null);

    // As duas buscas são independentes de propósito: o sidecar é opcional e não
    // pode segurar o botão do provador se o storage responder devagar. O modelo
    // aparece assim que o HEAD confirma, com a largura das specs, e a medida do
    // sidecar entra quando chegar — a escala é aplicada por frame, então trocá-la
    // com a cena já montada não recarrega nada.
    //
    // `modelReady`/`pendingMeta` cobrem as duas ordens de chegada: se o sidecar
    // vier primeiro, ele espera o HEAD em vez de se perder.
    let modelReady = false;
    let pendingMeta: FrameModelMeta | null = null;

    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (cancelled || !res.ok) return;
        modelReady = true;
        setResolved({ url, meta: pendingMeta });
      })
      // Sem modelo para este SKU (ou storage fora do ar): segue sem 3D.
      .catch(() => undefined);

    fetch(metaUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((rawMeta) => {
        const meta = parseFrameModelMeta(rawMeta);
        if (cancelled || !meta) return;
        pendingMeta = meta;
        if (modelReady) setResolved((prev) => (prev ? { ...prev, meta } : prev));
      })
      // Sidecar é opcional: 404, CORS ou JSON inválido caem nas specs.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [skuId, modelsBaseUrl, overrideUrl]);

  return resolved;
}

function useFrameFromContext(): VtexFrame | null {
  const productContext = useProduct();

  return useMemo(() => {
    if (!productContext?.product) return null;

    const { product, selectedItem } = productContext;
    const sku = selectedItem ?? product.items?.[0];
    if (!sku) return null;

    const image = sku.images?.[0];

    const specs = collectSpecs(product);
    const lensWidth = readSpecNumber(specs, SPEC_ALIASES.lensWidth);
    const bridgeWidth = readSpecNumber(specs, SPEC_ALIASES.bridgeWidth);
    const templeLength = readSpecNumber(specs, SPEC_ALIASES.templeLength);

    // "Tamanho Frontal" é a largura FRONTAL (2A+DBL), não a total: num produto
    // 50–18 o catálogo traz 118 = 50·2 + 18. Prefiro a spec pronta à derivação,
    // mas as duas passam pela mesma conversão para largura total — é o que
    // impede o mesmo produto de ter dois tamanhos conforme o preenchimento.
    const declaredFront = readSpecNumber(specs, SPEC_ALIASES.frontWidth);
    const frontWidth = isPlausibleFrontWidthMm(declaredFront)
      ? declaredFront
      : deriveFrontWidthMm(lensWidth, bridgeWidth);
    const totalWidth = totalFromFrontWidthMm(frontWidth) ?? undefined;

    if (totalWidth === undefined) {
      // Falha silenciosa aqui significa TODA armação renderizada no tamanho
      // médio, então vale gritar com os nomes reais para comparar.
      console.warn(
        "[tryon] não foi possível apurar a largura da armação nas specs do produto. " +
          `Specs disponíveis: ${specs.map((s) => s.name).join(" | ") || "(nenhuma)"}`
      );
    }

    const pdMin = readSpecNumber(specs, ["dp minima", "dp min"]);
    const pdMax = readSpecNumber(specs, ["dp maxima", "dp max"]);
    const fitProfile =
      (readSpecText(specs, ["perfil de ajuste"]) as VtexFrame["fitProfile"]) ??
      "medium";

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
      lensWidth_mm: lensWidth ?? 52,
      bridgeWidth_mm: bridgeWidth ?? 18,
      templeLength_mm: templeLength ?? 140,
      totalWidth_mm: totalWidth,
      pdRange_mm: [pdMin ?? 60, pdMax ?? 70],
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
  const resolvedModel = useSkuModel(
    frameFromContext?.skuId,
    modelsBaseUrl,
    modelUrl
  );
  const frames: VtexFrame[] = useMemo(
    () => (frameFromContext ? [frameFromContext] : []),
    [frameFromContext]
  );

  // Tamanho físico da armação: sidecar do storage > specs do catálogo > média.
  const frameWidth = useMemo(
    () => resolveFrameWidthMm(resolvedModel?.meta, frameFromContext),
    [resolvedModel, frameFromContext]
  );

  useEffect(() => {
    if (!resolvedModel) return;
    console.log(
      `[tryon] largura da armação: ${frameWidth.widthMm} mm (fonte: ${frameWidth.source})`
    );
  }, [resolvedModel, frameWidth]);

  function handleOpen() {
    if (frameFromContext) setSelectedFrame(frameFromContext);
    setOpen(true);
  }

  // Sem modelo 3D para o SKU (e sem override manual), o provador não é
  // oferecido — o botão simplesmente não renderiza.
  if (!resolvedModel) return null;

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
        modelUrl={resolvedModel.url}
        frameWidthMm={frameWidth.widthMm}
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
