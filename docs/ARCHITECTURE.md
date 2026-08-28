# Motor IQ — Arquitectura y contrato de dominio

> Este documento es la fuente de verdad del vocabulario de dominio, convenciones de API y
> reglas de los motores (scoring, matching, NBA, salud, radar). El código importa estas
> constantes desde `backend/app/core/constants.py` y `frontend/src/lib/constants.ts`.

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLAlchemy 2 (sync) · Alembic · Pydantic v2
- **DB**: SQLite por defecto (`backend/pops.db`) — `DATABASE_URL` permite PostgreSQL (docker-compose incluido). Schema portable: PKs uuid4-hex (String 32), enums como String validados en API, `sa.JSON`, datetimes **naive-UTC** en DB serializados con sufijo `Z`.
- **Frontend**: React 19 · TypeScript strict · Vite 7 · Tailwind CSS v4 · shadcn/ui · TanStack Query v5 · TanStack Table v8 · React Hook Form + Zod · Zustand · Recharts · dnd-kit
- **IA**: capa `AIProvider` desacoplada — `OpenAICompatProvider` (OpenAI, Gemini vía endpoint compatible, Ollama, etc.) y `AnthropicProvider`, vía httpx. Keys por org (Settings) o env. Sin key: los motores determinísticos funcionan igual; las features LLM muestran estado de configuración.
- **Eventos**: bus in-process (`app/core/events.py`) — dispara automatizaciones, matching, notificaciones, insights, auditoría.
- **Scheduler**: loop asyncio cada 60s (vencimientos, detección de olvidados, insights de stock). Desactivado en tests (`TESTING=1`).

## Puertos / URLs

- Backend: `http://localhost:8000` — OpenAPI en `/docs`, health en `/health` y `/ready`.
- Frontend: `http://localhost:5180` (`strictPort`; 5173 suele estar ocupado en esta máquina) — proxy Vite de `/api` y `/uploads` → 8000.

## Convenciones de API

- Base: `/api/v1`. REST consistente.
- Errores: `{"error": {"code": "CUSTOMER_NOT_FOUND", "message": "..."}}` (códigos SNAKE_UPPER).
- Paginación (tablas): `?page=1&page_size=25` → `{"items": [], "total": n, "page": p, "page_size": s}`.
- Auth: `Authorization: Bearer <access>` (TTL 30 min). Refresh token en cookie HttpOnly `pops_refresh` (path `/api/v1/auth`, SameSite=Lax, 14 días, rotación). Logout invalida vía `token_version`.
- Todas las entidades llevan `organization_id`; cada query filtra por la org del usuario autenticado.
- RBAC: `admin` (todo) · `gerente` (todo menos gestión de organización/usuarios avanzada) · `vendedor` (sin settings de org, sin usuarios, sin automatizaciones, sin costos/márgenes de vehículos, sin analytics de equipo).

## Vocabulario congelado (keys en código / labels en UI)

### Etapas de pipeline (tabla `pipeline_stages`, seed por org, personalizables)
| key | nombre | prob. | color | flags |
|---|---|---|---|---|
| nuevo | Nuevo lead | 5 | sky | |
| contactado | Contactado | 10 | blue | |
| interesado | Interesado | 25 | indigo | |
| calificado | Calificado | 40 | violet | |
| visita | Visita agendada | 55 | purple | |
| negociacion | Negociación | 70 | amber | |
| reserva | Reserva | 90 | orange | |
| vendido | Vendido | 100 | emerald | is_won |
| perdido | Perdido | 0 | zinc | is_lost |

### Enums (String)
- `customer.status`: `lead · activo · cliente · perdido · inactivo`
- `customer.source` / `message.channel`: `whatsapp · instagram · facebook · mercadolibre · web · recomendacion · presencial · google · email · manual · otro`
- `score_label`: `frio` (<40) · `tibio` (40–64) · `caliente` (65–84) · `cierre` (≥85)
- `vehicle.status`: `disponible · reservado · vendido · preparacion · pausado`
- `vehicle.body_type`: `sedan · hatchback · suv · pickup · coupe · furgon · otro`
- `vehicle.fuel`: `nafta · diesel · hibrido · electrico · gnc`
- `vehicle.transmission`: `manual · automatica`
- `opportunity.status`: `abierta · ganada · perdida` — `health`: `green · yellow · red`
- `followup.type`: `whatsapp · llamada · email · visita · recordatorio · tarea`
- `followup.status`: `sugerido · pendiente · completado · cancelado · descartado` (**vencido** = pendiente con `due_at < now`, calculado)
- `priority`: `baja · media · alta`
- `task.type`: `llamada · mensaje · reunion · seguimiento · administrativo` — `task.status`: `pendiente · completada · cancelada`
- `appointment.type`: `visita · llamada · reunion · test_drive · entrega · otro` — `status`: `agendada · completada · cancelada · no_asistio`
- `message.direction`: `entrante · saliente`
- `conversation.status`: `abierta · cerrada`
- `quote.status`: `borrador · enviada · aceptada · rechazada · vencida`
- `trade_in.status`: `pendiente · tasado · aceptado · rechazado`
- `match.status`: `sugerido · enviado · descartado · convertido`
- `notification.type`: `lead_nuevo · seguimiento_vencido · seguimiento_hoy · lead_caliente · sin_respuesta · match_nuevo · oportunidad_stock · tarea_vencida · sistema`
- `insight.kind`: `lead_caliente · riesgo · recuperar · demanda_vehiculo · stock_estancado · match · oportunidad_stock · precio · forecast`
- `insight.status`: `nueva · vista · descartada · accionada`
- `user.role`: `admin · gerente · vendedor`
- `ai_usage.feature`: `resumen_cliente · sugerencia_respuesta · chat · insight`

### Eventos de dominio
`lead.created · customer.created · customer.updated · message.received · message.sent · vehicle.created · vehicle.updated · vehicle.sold · opportunity.created · opportunity.stage_changed · opportunity.won · opportunity.lost · followup.overdue · quote.created`

### Triggers de automatización
`lead.created · message.received · vehicle.created · inactivity.72h · followup.overdue · opportunity.stage_changed`
Acciones permitidas: `assign_round_robin · create_task · create_followup · notify · run_matching` (nunca acciones destructivas ni envíos externos).
**Idempotencia**: los triggers de escaneo (`inactivity.72h`, `followup.overdue`) los re-emite el scheduler cada minuto; una automatización no vuelve a actuar sobre la misma entidad dentro de 24 h (chequeo contra `automation_runs`).

## Motor de scoring (`app/services/scoring.py`)

Base 25 (+10 si hay vehículo de interés). Señales regex sobre texto **normalizado** (minúsculas sin acentos) de mensajes entrantes de los últimos 30 días — cada señal suma una sola vez:

| señal | puntos | motivo |
|---|---|---|
| financiacion `financi\|cuota\|credito\|prestamo` | +15 | Preguntó por financiación |
| visita `verlo\|puedo ver\|pasar a ver\|visita\|ir a ver\|conocerlo` | +20 | Pidió ver el vehículo |
| reserva `reserv\|senar\|sena de\|adelanto` | +18 | Habló de reservar |
| documentacion `documento\|transferencia\|papeles\|titulo\|verificacion` | +12 | Consultó documentación |
| cotizacion `cotiza\|precio final\|mejor precio\|contado` | +10 | Pidió cotización |
| entrega `entrega\|puedo tener\|retirar` | +10 | Habló de la entrega |
| permuta `permuta\|entrego mi\|toman mi\|tomar mi` | +9 | Consultó permuta |
| disponibilidad `disponible\|disponibilidad\|sigue en venta\|lo tenes` | +8 | Consultó disponibilidad |
| ubicacion `ubicacion\|donde estan\|direccion\|zona` | +6 | Consultó ubicación |

Engagement: entrante <24h → **+12** · ≥3 entrantes en 7 días → **+8**.
Negativas: sin respuesta 4–7 días (con saliente posterior) → **−8** · >7 días → **−15** · negativa explícita (`no por ahora|mas adelante|solo miraba|lo pienso|no me interesa`) → **−12** · presupuesto < 70% del precio de interés → **−10**.
Etapa: visita → **+8** · negociación → **+10** · reserva → **+20**.
Clamp **0–99** (tope 99: la probabilidad nunca se presenta como certeza, §23/§84; la UI muestra `N/100`). Persistir: `lead_score`, `score_label`, `score_reason` (motivo principal), `score_factors` (JSON `[{label, points}]` para explicabilidad §95), historial en `lead_score_history` cuando cambia.

## Motor de matching (`app/services/matching.py`)

Cliente↔vehículo, sobre preferencias estructuradas (`interest_*`) + vehículo de interés:
marca **+25** · modelo **+25** · carrocería **+15** · presupuesto ≥90% del precio **+20** (≥80% **+10**) · año en rango **+10** · transmisión **+5** · combustible **+5**.
Umbral: **≥45** crea `customer_vehicle_match` (score cap 99, `reasons` JSON). Se recalcula en `vehicle.created` y al editar preferencias del cliente.

## Next Best Action (`app/services/nba.py`) — cascada, primera regla que aplica

1. Etapa `reserva` → «Confirmar seña y preparar documentación»
2. Señal financiación sin `financing_scenario` → «Enviar simulación de financiación»
3. `has_trade_in` sin tasación → «Cotizar la permuta»
4. Último mensaje entrante sin respuesta → «Responder ahora (espera hace X)»
5. Score ≥65 y sin contacto ≥4 días → «Retomar conversación hoy»
6. Seguimiento vencido → «Completar el seguimiento vencido»
7. Match nuevo sin enviar → «Ofrecer [vehículo] (N% match)»
8. Score ≥85 y etapa < negociación → «Proponer visita o reserva»
9. Vehículo de interés vendido → «Ofrecer alternativas similares»
10. Score <40 y sin actividad 30 días → «Considerar cerrar como perdido»
11. Default → «Mantener el seguimiento programado»

Siempre con `reason` (señales) — la IA recomienda, el vendedor decide (§96).

## Salud de oportunidad

`red`: sin actividad >7d, o seguimiento vencido >2d, o score cayó >15 en 14d · `green`: actividad <3d y score ≥60 · resto `yellow`.

## Radar Motor IQ (buckets)

calientes (score ≥65, abiertos, activos) · urgentes (followups vencidos/hoy) · fantasmas (sin respuesta 3–21d tras mensaje nuestro, score ≥45) · demanda (consultas ≥1.5× promedio y ≥2) · estancados (≥60 días y consultas ≤ promedio) · matches nuevos (≤14d, vehículo disponible) · cierres probables (negociación/reserva, health ≠ red).
Los **insights persistidos** usan los mismos umbrales (demanda: `max(3, 1.5× promedio)`) con `dedup_key` semanal.

## Búsqueda

La búsqueda global (`/search`) y el matching de señales trabajan sobre texto **normalizado en Python** (minúsculas sin acentos, `core.utils.normalize`): «Sebastian» encuentra «Sebastián». A escala de agencia es instantáneo y portable; con más volumen se migra a columna normalizada indexada o FTS. Los filtros `q` de listas usan `ILIKE` SQL (coinciden con acentos tal como se escriben).

## Estructura

```
backend/app/{core,database,models,schemas,api/routers,services,ai,seed.py}
frontend/src/{lib,types,stores,components/{ui,shared},layout,features,pages}
```

## Seed demo (`python -m app.seed`)

Org **Motor IQ** (USD, es-AR, America/Argentina/Buenos_Aires). Usuarios (pass `demo1234`):
`admin@motoriq.demo` (Martín Ríos, admin) · `gerente@motoriq.demo` (Carla Méndez) · `lucas@motoriq.demo`, `sofia@motoriq.demo`, `diego@motoriq.demo` (vendedores).
50 clientes · 25+ vehículos (mercado AR) · conversaciones con señales reales · followups (hoy/vencidos/futuros) · oportunidades en todas las etapas · ~15 ventas históricas (6 meses) · scores variados con historial · matches · insights · notificaciones · tareas · citas · cotizaciones · permutas. Fechas relativas a `now` — RNG determinístico (`random.Random(42)`).
