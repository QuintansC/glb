# virtual-tryon

Provador virtual de armações para VTEX IO. Usa MediaPipe Face Landmarker para detecção facial em tempo real e sobrepõe a imagem da armação via Canvas 2D.

## Uso no tema VTEX

Após publicar e instalar o app, adicione o bloco no tema:

```json
{
  "oticasdiniz.virtual-tryon": {}
}
```

## Passando armações via props

O componente `VirtualTryon` recebe um array de `VtexFrame`:

```ts
interface VtexFrame {
  productId: string;
  skuId: string;
  name: string;
  brand: string;
  imageUrl: string;       // URL do CDN VTEX (PNG com fundo transparente)
  thumbnailUrl: string;
  lensWidth_mm: number;
  bridgeWidth_mm: number;
  templeLength_mm: number;
  pdRange_mm: [number, number];
  fitProfile: "small" | "medium" | "large";
  price: number;
  link: string;
}
```

## Desenvolvimento local

```bash
vtex link
```

## Deploy

```bash
vtex release minor stable
vtex publish
vtex install oticasdiniz.virtual-tryon@x.x.x
