# Motor IQ — Sales Intelligence for Automotive

**Convertí conversaciones en ventas.**

Motor IQ es una plataforma comercial completa para agencias y concesionarias de autos: CRM, pipeline,
stock, seguimientos, analytics y un motor de inteligencia que observa la actividad comercial,
la convierte en señales y le dice al equipo **qué hacer hoy para vender más** — quién está cerca
de comprar, quién se está enfriando, qué auto tiene demanda y qué cliente coincide con qué vehículo.

> La pantalla principal responde una sola pregunta: *¿qué tengo que hacer hoy para vender más?*

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Command Center** | Resumen del día, prioridades rankeadas por IA con motivos, agenda comercial |
| **CRM / Cliente 360** | Ficha completa con timeline, conversación, seguimientos, cotizaciones, permuta y financiación |
| **Lead Scoring** | 0–99 con reglas determinísticas explicables («¿Por qué 82?» abre el desglose de señales) |
| **Pipeline Kanban** | Etapas personalizables, drag & drop, salud por oportunidad, diálogos de venta/pérdida |
| **Conversaciones** | Inbox unificado multicanal con asistente de respuestas IA (3 tonos) y detección de fechas («escribime la semana que viene» → seguimiento sugerido) |
| **Vehículos / Stock** | Ficha 360 con demanda, margen (solo gerencia), interesados y matching automático |
| **Matching** | Cliente ↔ vehículo bidireccional con porcentaje y razones; corre solo al ingresar stock |
| **Radar Motor IQ** | Calientes · urgentes · fantasmas · alta demanda · stock estancado · matches · posibles cierres |
| **Insights** | Detecciones persistidas con formato *qué detectamos / por qué / qué hacer* |
| **Preguntale a Motor IQ** | Chat con los datos vía tools controladas (nunca inventa; sin SQL directo del LLM) |
| **Analytics** | Overview con deltas, funnel, vendedores, fuentes, stock intelligence, precio vs interés, forecast ponderado |
| **Automatizaciones** | Trigger → condiciones → acciones seguras (asignación round-robin, tareas, matching, avisos) |
| **Operación** | Leads entrantes con tiempo de respuesta, tareas, calendario, notificaciones, import/export CSV, auditoría, segmentos guardados |

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2 — 100 endpoints REST (`/docs` con OpenAPI)
- **DB**: SQLite por defecto (cero fricción local) · PostgreSQL vía `DATABASE_URL` (docker-compose incluido, mismo schema portable)
- **Frontend**: React 19 · TypeScript strict · Vite 7 · Tailwind CSS v4 · shadcn/ui · TanStack Query/Table · React Hook Form + Zod · Recharts · dnd-kit
- **IA**: capa `AIProvider` desacoplada — OpenAI, Anthropic, Gemini o cualquier endpoint compatible OpenAI. Keys por organización o entorno, límite de gasto mensual y panel de consumo. Sin key configurada, todos los motores determinísticos (scoring, matching, radar, NBA) funcionan igual.
- **Eventos**: bus de dominio in-process (`vehicle.created`, `message.received`, …) — automatizaciones, matching y notificaciones desacoplados
- **Scheduler**: tick in-process de 60 s (vencimientos, clientes olvidados, insights) con dedup idempotente

La referencia completa del dominio (vocabulario congelado, pesos de scoring/matching, reglas NBA,
convenciones de API) está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requisitos

- Python **3.12** (`py -3.12` en Windows)
- Node.js **22+** y npm
- (Opcional) Docker para el stack con PostgreSQL

## Instalación y desarrollo

```powershell
# 1 · Backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python -m alembic upgrade head     # crea el schema (31 tablas)
.\.venv\Scripts\python -m app.seed                 # datos demo (¡recomendado!)
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 2 · Frontend (otra terminal)
cd frontend
npm install
npm run dev                                        # http://localhost:5180
```

O directamente, después de la primera instalación:

```powershell
.\start.ps1
```

**Credenciales demo** (contraseña `demo1234` para todas):

| Email | Rol |
|---|---|
| `admin@motoriq.demo` | Administrador |
| `gerente@motoriq.demo` | Gerente |
| `lucas@motoriq.demo` · `sofia@motoriq.demo` · `diego@motoriq.demo` | Vendedores |

El seed crea una agencia viva: 50+ clientes con conversaciones reales que disparan el scoring,
28 vehículos del mercado argentino con fotos, oportunidades en todas las etapas, ventas históricas
para los analytics, seguimientos de hoy/vencidos y matches ya calculados. Es determinístico
(`random.Random(42)`) con fechas relativas al momento de ejecución. Para volver al estado demo
prístino: `python -m app.seed` (borra y recrea todo).

## Variables de entorno

Documentadas una por una en [`backend/.env.example`](backend/.env.example). Nada es obligatorio
para desarrollo; en producción cambiá `POPS_SECRET_KEY` y desactivá `POPS_DEMO_MODE`.

## Producción con Docker (PostgreSQL)

```bash
docker compose up --build
# frontend → http://localhost:8080 · API → http://localhost:8000
```

El compose levanta PostgreSQL 16, aplica migraciones, siembra si la base está vacía y sirve el
frontend compilado detrás de nginx (proxy de `/api` y `/uploads`). La ruta PostgreSQL está
verificada con la misma migración y seed que SQLite.

## Tests

```powershell
# Backend — 37 tests de integración de API (auth, scoring, matching, ventas, RBAC…)
cd backend; .\.venv\Scripts\python -m pytest

# Frontend — unit tests (formateo, utilidades, ScoreRing)
cd frontend; npm test

# E2E — 6 flujos reales con Playwright (requiere ambos servidores corriendo)
cd frontend; npx playwright install chromium   # una sola vez
npx playwright test
```

> Los E2E crean sus propios registros («… E2E …»); si querés volver al demo prístino después,
> re-ejecutá el seed.

Calidad estática: `ruff check app tests` (backend) · `npm run lint` y `tsc -b` (frontend).

## Seguridad

Contraseñas con Argon2 · JWT de acceso corto + refresh token rotativo en cookie HttpOnly/SameSite ·
invalidación por `token_version` · rate limiting en auth e IA · RBAC por rol (admin/gerente/vendedor)
con aislamiento total por `organization_id` en cada query · validación Pydantic en el borde ·
uploads restringidos por tipo y tamaño · la API key de IA nunca viaja al navegador (solo `····últimos4`) ·
costos y márgenes invisibles para vendedores · auditoría de acciones sensibles.

## Decisiones de arquitectura (resumen)

- **SQLite→PostgreSQL portable**: PKs uuid4-hex, enums como `String` validados en el borde,
  `JSON` estándar, datetimes naive-UTC serializados con `Z`. Cambiar de motor es una variable de entorno.
- **La IA recomienda, el vendedor decide (§96)**: ninguna automatización envía mensajes a clientes
  ni toca precios; el chat solo escribe seguimientos/tareas y siempre lo informa.
- **Explicabilidad primero (§95)**: cada score, match, insight y next-best-action lleva sus razones.
- **Agregaciones de analytics en Python** tras filtrar por período: portable y suficiente a escala
  de agencia; el punto único de optimización futura está señalado en `services/analytics.py`.
- **Integraciones (§75)**: sin conectores falsos. Los mensajes entran por
  `POST /api/v1/conversations/{id}/messages` desde cualquier canal y el resto (scoring, detección
  de fechas, automatizaciones) corre solo; los eventos de dominio ya existen para colgar webhooks.

## Estructura

```
backend/
  app/
    api/routers/   # 14 routers REST (100 endpoints)
    core/          # config, seguridad, eventos, scheduler, constantes de dominio
    models/        # 30 tablas SQLAlchemy
    schemas/       # contratos Pydantic
    services/      # scoring, matching, NBA, radar, analytics, insights, automatizaciones…
    ai/            # AIProvider (OpenAI-compat + Anthropic), tools del chat, prompts
    seed.py        # demo determinístico
  alembic/         # migraciones
  tests/           # suite de integración
frontend/
  src/
    pages/         # 18 pantallas
    features/      # formularios, hilo de conversación, kanban, comercio
    components/    # ui (shadcn) + shared (ScoreRing, badges, charts…)
    lib/           # api client con refresh, formato por organización, constantes espejo
  e2e/             # Playwright
docs/ARCHITECTURE.md
docker-compose.yml · start.ps1
```

---

**Motor IQ sabe dónde están las oportunidades.**
