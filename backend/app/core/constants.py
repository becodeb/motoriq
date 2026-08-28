"""Vocabulario de dominio congelado. Fuente de verdad: docs/ARCHITECTURE.md.

El frontend espeja estos valores en src/lib/constants.ts — mantener sincronizados.
"""

ROLES = ("admin", "gerente", "vendedor")

CUSTOMER_STATUSES = ("lead", "activo", "cliente", "perdido", "inactivo")

SOURCES = (
    "whatsapp",
    "instagram",
    "facebook",
    "mercadolibre",
    "web",
    "recomendacion",
    "presencial",
    "google",
    "email",
    "manual",
    "otro",
)
CHANNELS = SOURCES

SCORE_LABELS = ("frio", "tibio", "caliente", "cierre")

VEHICLE_STATUSES = ("disponible", "reservado", "vendido", "preparacion", "pausado")
BODY_TYPES = ("sedan", "hatchback", "suv", "pickup", "coupe", "furgon", "otro")
FUELS = ("nafta", "diesel", "hibrido", "electrico", "gnc")
TRANSMISSIONS = ("manual", "automatica")

OPPORTUNITY_STATUSES = ("abierta", "ganada", "perdida")
HEALTH_VALUES = ("green", "yellow", "red")

FOLLOWUP_TYPES = ("whatsapp", "llamada", "email", "visita", "recordatorio", "tarea")
FOLLOWUP_STATUSES = ("sugerido", "pendiente", "completado", "cancelado", "descartado")
PRIORITIES = ("baja", "media", "alta")
ORIGINS = ("manual", "ia", "automatizacion")

TASK_TYPES = ("llamada", "mensaje", "reunion", "seguimiento", "administrativo")
TASK_STATUSES = ("pendiente", "completada", "cancelada")

APPOINTMENT_TYPES = ("visita", "llamada", "reunion", "test_drive", "entrega", "otro")
APPOINTMENT_STATUSES = ("agendada", "completada", "cancelada", "no_asistio")

MESSAGE_DIRECTIONS = ("entrante", "saliente")
CONVERSATION_STATUSES = ("abierta", "cerrada")

QUOTE_STATUSES = ("borrador", "enviada", "aceptada", "rechazada", "vencida")
TRADE_IN_STATUSES = ("pendiente", "tasado", "aceptado", "rechazado")
MATCH_STATUSES = ("sugerido", "enviado", "descartado", "convertido")

NOTIFICATION_TYPES = (
    "lead_nuevo",
    "seguimiento_vencido",
    "seguimiento_hoy",
    "lead_caliente",
    "sin_respuesta",
    "match_nuevo",
    "oportunidad_stock",
    "tarea_vencida",
    "sistema",
)

INSIGHT_KINDS = (
    "lead_caliente",
    "riesgo",
    "recuperar",
    "demanda_vehiculo",
    "stock_estancado",
    "match",
    "oportunidad_stock",
    "precio",
    "forecast",
)
INSIGHT_STATUSES = ("nueva", "vista", "descartada", "accionada")

AI_FEATURES = ("resumen_cliente", "sugerencia_respuesta", "chat", "insight")
AI_PROVIDERS = ("openai", "anthropic", "gemini", "openai_compat")

AUTOMATION_TRIGGERS = (
    "lead.created",
    "message.received",
    "vehicle.created",
    "inactivity.72h",
    "followup.overdue",
    "opportunity.stage_changed",
)
AUTOMATION_ACTIONS = (
    "assign_round_robin",
    "create_task",
    "create_followup",
    "notify",
    "run_matching",
)

LEAD_DISTRIBUTION_MODES = ("manual", "round_robin", "menos_leads")

# Etapas por defecto: se insertan por organización en el seed / registro y son editables.
DEFAULT_PIPELINE_STAGES = (
    {"key": "nuevo", "name": "Nuevo lead", "probability": 5, "color": "sky"},
    {"key": "contactado", "name": "Contactado", "probability": 10, "color": "blue"},
    {"key": "interesado", "name": "Interesado", "probability": 25, "color": "indigo"},
    {"key": "calificado", "name": "Calificado", "probability": 40, "color": "violet"},
    {"key": "visita", "name": "Visita agendada", "probability": 55, "color": "purple"},
    {"key": "negociacion", "name": "Negociación", "probability": 70, "color": "amber"},
    {"key": "reserva", "name": "Reserva", "probability": 90, "color": "orange"},
    {"key": "vendido", "name": "Vendido", "probability": 100, "color": "emerald", "is_won": True},
    {"key": "perdido", "name": "Perdido", "probability": 0, "color": "zinc", "is_lost": True},
)

# Umbrales de score → etiqueta
SCORE_LABEL_THRESHOLDS = ((85, "cierre"), (65, "caliente"), (40, "tibio"), (0, "frio"))


def score_label_for(score: int) -> str:
    for threshold, label in SCORE_LABEL_THRESHOLDS:
        if score >= threshold:
            return label
    return "frio"
