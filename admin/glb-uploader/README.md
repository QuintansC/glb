# Painel de Cadastro de Modelos 3D (.glb)

Ferramenta **interna** para cadastrar os modelos 3D do provador virtual no storage
S3. Roda **localmente na máquina de quem faz o cadastro** — não é publicada na VTEX.

O provador (no front) busca o modelo de cada produto pela convenção
`{skuId}.glb` dentro do storage. Ver [`react/VirtualTryon.tsx`](../../react/VirtualTryon.tsx):

```text
https://s3-sp4.ssc.cl9.cloud/ecommerce/glb-models/{skuId}.glb
```

Cadastrar um modelo = subir um arquivo `{skuId}.glb` nessa pasta. É exatamente
isso que este painel faz — com preview 3D, listagem e exclusão.

## Como funciona

```text
Navegador (localhost) ──► Servidor local ──► Storage S3 (ecommerce/glb-models)
   painel + preview         + AWS SDK            {skuId}.glb
```

As **credenciais do S3 ficam só no servidor local**, nunca no navegador.

Existem duas formas de rodar o mesmo painel:

| Forma                         | Para quem                       | Precisa instalar |
| ----------------------------- | ------------------------------- | ---------------- |
| **Executável único** (`.exe`) | Quem faz o cadastro (uso comum) | Nada             |
| **Servidor de dev** (Node)    | Quem mexe no código             | Node + `npm i`   |

---

## Parte 1 — Executável único (uso do dia a dia)

### Para quem vai cadastrar os modelos

1. Receba o arquivo **`cadastro-modelos-3d.exe`** e salve na Área de Trabalho.
2. **Dois cliques** nele.
3. Abre uma **janela preta** (é o programa rodando) e, logo em seguida, o painel
   no navegador. Se o navegador não abrir sozinho, copie o endereço que aparece
   na janela preta (`http://localhost:4173`).
4. Use o painel normalmente (ver "Usar o painel" abaixo).
5. Ao terminar, **feche a janela preta**.

> **Deixe a janela preta aberta** enquanto estiver usando o painel — fechá-la
> encerra o programa.

O Windows pode mostrar um aviso de "aplicativo não reconhecido" na primeira vez
(o executável não tem assinatura digital): clique em **Mais informações → Executar
assim mesmo**.

Não precisa instalar Node, nem configurar chave nenhuma — já vai tudo dentro do
arquivo.

### Para quem gera o executável

```bash
cd admin/glb-uploader
npm install
curl -fsSL https://bun.sh/install | bash   # só na primeira vez
npm run build:exe                          # gera dist/cadastro-modelos-3d.exe
```

O script lê o `.env` deste diretório e **embute as credenciais no binário**, junto
com os arquivos do painel — por isso o resultado é um arquivo só, autossuficiente
(~95 MB).

Outros alvos: `npm run build:exe:mac`, `npm run build:exe:linux`.

> ⚠️ **O executável contém as chaves do storage.** Trate-o como segredo: entregue
> direto ao responsável pelo cadastro (pen drive, canal interno) e **nunca**
> publique nem versione. `dist/` já está no `.gitignore`.

Se precisar apontar o executável para outro bucket sem recompilar, basta colocar
um `.env` **na mesma pasta do executável** — ele tem prioridade sobre os valores
embutidos.

---

## Parte 2 — Servidor de desenvolvimento

### Pré-requisitos

- Node.js 18+ (testado no 24)
- Chaves de acesso do storage S3 (`ACCESS_KEY_ID` / `SECRET_ACCESS_KEY`)

### Configuração

```bash
cd admin/glb-uploader
cp .env.example .env      # preencha as chaves e confira endpoint/bucket/prefixo
npm install
```

Edite o `.env`. Os valores padrão já apontam para o storage atual do provador
(`s3-sp4.ssc.cl9.cloud`, bucket `ecommerce`, prefixo `glb-models`). Você só
precisa preencher `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`.

> Se o provedor recusar ACL no upload (usa política de bucket), deixe
> `S3_OBJECT_ACL` em branco.

### Rodar

```bash
npm run dev      # http://localhost:4173  (recarrega ao editar)
# ou
npm start
```

Abra `http://localhost:4173` no navegador.

O `server.ts` (Fastify) e o `standalone.ts` (executável) expõem exatamente a
mesma API e o mesmo painel — mudou só o runtime. As validações ficam em
`validation.ts`, compartilhadas pelos dois.

---

## Usar o painel

### Um modelo (aba "Um modelo")

1. **SKU** — informe o `itemId` do SKU da VTEX (o painel avisa se já existe modelo).
2. **Arraste o `.glb`** — o preview 3D aparece na hora (ainda é local, não foi enviado).
3. **Enviar modelo** — sobe como `{skuId}.glb`. Se já existir, pede confirmação para substituir.

### Vários de uma vez (aba "Vários (lote)")

1. **Arraste vários `.glb`** de uma vez. O **SKU de cada arquivo é lido do nome**
   — `12345.glb` vira o SKU `12345`. (Dica: nomeie os arquivos assim antes de exportar.)
2. Ajuste o SKU de qualquer linha se precisar. O painel avisa SKUs inválidos e
   SKUs repetidos dentro do lote.
3. Marque **"Substituir modelos que já existem"** se quiser sobrescrever; senão,
   os que já existem são pulados.
4. **Enviar modelos** — envia em fila (até 3 em paralelo) com status por linha.

### Modelos cadastrados

Lista o que já está no storage, com preview 3D, link e exclusão.

Assim que o arquivo está no storage, o provador passa a oferecer o modo 3D
naquele produto automaticamente (ele faz um `HEAD` para detectar o modelo).

## Endpoints da API (uso interno do painel)

| Método | Rota                       | Descrição                              |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/api/config`             | Config não-sensível (URL base, limites) |
| GET    | `/api/models`             | Lista os modelos cadastrados           |
| GET    | `/api/models/:sku/exists` | Verifica se o SKU já tem modelo        |
| POST   | `/api/models/:sku`        | Sobe/substitui o `.glb` (multipart)    |
| DELETE | `/api/models/:sku`        | Remove o modelo do SKU                 |

## Validações

- SKU: `A-Z a-z 0-9 - _`, até 128 caracteres.
- Arquivo: extensão `.glb` **e** magic bytes `glTF` versão 2 (evita subir arquivo errado).
- Tamanho máximo: `MAX_UPLOAD_MB` (padrão 40 MB).

## Segurança

- O servidor escuta só em `127.0.0.1` (não exposto na rede), nas duas formas de rodar.
- `.env`, `dist/` e `build/` estão no `.gitignore` — chaves e binário nunca vão pro repositório.
- **O executável embute as credenciais.** Quem tiver o arquivo consegue extraí-las.
  Entregue só a quem faz o cadastro e, se essa pessoa sair da função, **rotacione
  as chaves do storage** e gere um executável novo.
- É uma ferramenta de uso interno; não exponha esta porta publicamente.
