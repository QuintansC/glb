# Claude.md

## Objetivo do projeto
Construir um provador virtual para oticas que usa a camera do dispositivo para sobrepor armacoes no rosto do usuario em tempo real.

## Mapeamento das melhores sugestoes

| Area | Melhor escolha agora | Alternativas | Motivo | Quando evoluir |
|---|---|---|---|---|
| Frontend | React + Vite + TypeScript | Next.js | Setup rapido, bom DX, facil deploy SPA | Se precisar SEO forte ou SSR |
| Face tracking | MediaPipe Face Landmarker (web) | TensorFlow.js FaceMesh | Melhor equilibrio entre performance e precisao no browser | Se precisar mais controle de modelo |
| Render do provador | Canvas 2D no MVP | Three.js/WebGL para 3D | Entrega rapida e menos complexidade inicial | Quando for vender premium com maior realismo |
| Estado no frontend | Zustand | Redux Toolkit | Simples, leve, escalavel para MVP | Se fluxo de estado ficar muito complexo |
| Backend API | Node.js + Fastify + TypeScript | Express, NestJS | Fastify e rapido, tipado e simples de manter | Se precisar arquitetura enterprise, migrar para Nest |
| Validacao API | Zod | Joi, Yup | Tipagem compartilhavel entre frontend e backend | Se houver legado sem TS |
| Banco | PostgreSQL + Prisma | MongoDB | Bom para catalogo, filtros e relatorios | Se houver forte necessidade de documento flexivel |
| Storage de imagens | S3 compativel | Cloudinary | Escalavel e padrao de mercado | Se quiser pipeline pronto de media |
| Auth | JWT + Refresh Token | Auth0, Clerk | Controle de custo e fluxo customizado | Se quiser acelerar time-to-market com SaaS |
| Telemetria | Sentry + OpenTelemetry | LogRocket | Observabilidade de erro, performance e tracing | Se precisar replay de sessao detalhado |
| Testes | Vitest + React Testing Library + Playwright | Cypress | Cobertura unitaria, integracao e e2e com bom custo | Se equipe ja domina Cypress |
| Deploy | Docker + Render/Fly.io | AWS ECS, GCP Cloud Run | Facil para iniciar e escalar gradualmente | Migrar para cloud maior quando tracao subir |

## Arquitetura recomendada (MVP)

Monorepo com pnpm:

- apps/web: React (camera, tracking, render)
- apps/api: Node/Fastify (catalogo, usuarios, sessoes, historico)
- packages/shared: tipos, schemas Zod, utilitarios comuns

Fluxo principal:

1. Usuario permite camera no frontend.
2. Frontend detecta landmarks faciais com MediaPipe.
3. Frontend sobrepoe armacao 2D com ajuste de escala, rotacao e posicao.
4. Backend entrega catalogo, medidas da armacao e configuracoes.
5. Usuario salva tentativa (snapshot opcional) no backend.

## Modelo de dados inicial

Entidades principais:

- users
- stores
- frame_brands
- frames
- frame_assets (png transparente, opcional glb)
- tryon_sessions
- tryon_events

Campos importantes em frames:

- lens_width_mm
- bridge_width_mm
- temple_length_mm
- pd_range_mm
- fit_profile (small, medium, large)

## API minima sugerida

- GET /health
- POST /auth/login
- GET /frames
- GET /frames/:id
- GET /stores/:id/frames
- POST /tryon/sessions
- POST /tryon/events
- POST /tryon/snapshot

## Roadmap de entrega

### Fase 1 - MVP funcional (2 a 4 semanas)

- Camera em tempo real no browser
- Face tracking estavel
- Sobreposicao de 5 a 20 armacoes 2D
- Ajuste basico de alinhamento
- Salvamento de sessao e eventos

### Fase 2 - Qualidade comercial (4 a 8 semanas)

- Calibracao por distancia aparente
- Ajuste por formato de rosto
- Melhorias de UX para baixa iluminacao
- Painel simples para cadastro de armacoes

### Fase 3 - Diferencial competitivo

- Modelos 3D por armacao
- Oclusao parcial (haste atras da orelha quando possivel)
- Recomendacao por perfil e historico
- Integracao com ecommerce e CRM

## Regras de qualidade para o provador

- Tempo para primeira renderizacao menor que 2s
- FPS alvo maior que 24 em celular medio
- Erro medio de alinhamento visual menor que 5%
- Queda graciosa quando tracking falhar

## Privacidade e compliance (LGPD)

- Solicitar consentimento explicito para uso de camera
- Processar video localmente no browser sempre que possivel
- Nao gravar video continuo por padrao
- Salvar apenas snapshots quando usuario confirmar
- Exibir politica de dados de forma clara

## Riscos principais e mitigacao

- Iluminacao ruim: guias visuais e auto ajuste de exposicao
- Camera fraca: modo leve com menos pontos faciais
- Diferenca entre medida real e virtual: usar metadados corretos da armacao
- Latencia alta em mobile: reduzir resolucao de processamento

## KPIs recomendados

- Taxa de inicio de provador
- Taxa de conclusao de provador
- Tempo medio de sessao
- Frames provadas por sessao
- Conversao apos provador
- Erro tecnico por dispositivo

## Decisoes padrao para este repositorio

- Linguagem: TypeScript em todo o projeto
- Gestao de pacotes: pnpm
- Padrao de API: REST com validacao Zod
- Banco: PostgreSQL via Prisma
- Tracking: MediaPipe no frontend
- Render inicial: 2D, com plano para 3D
- Testes obrigatorios: unitario + e2e para fluxo de camera e catalogo

## Proximo passo pratico

Comecar pelo MVP 2D com tracking facial no frontend e API minima no backend. Validar em 3 aparelhos reais (Android medio, iPhone, desktop) antes de investir em 3D.
