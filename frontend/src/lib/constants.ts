/** Espejo del vocabulario de dominio del backend (app/core/constants.py · docs/ARCHITECTURE.md). */

export const COLOR_BADGE: Record<string, string> = {
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/30",
  blue: "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/30",
  purple: "bg-purple-500/12 text-purple-700 dark:text-purple-400 border-purple-500/30",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-400 border-orange-500/30",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/30",
  red: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
  cyan: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  zinc: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

export const AVATAR_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-600",
  emerald: "bg-emerald-600",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
};

export const SCORE_LABELS: Record<string, { label: string; emoji: string; color: string; text: string }> = {
  frio: { label: "Frío", emoji: "🧊", color: "var(--score-frio)", text: "text-score-frio" },
  tibio: { label: "Tibio", emoji: "🌤", color: "var(--score-tibio)", text: "text-score-tibio" },
  caliente: { label: "Caliente", emoji: "🔥", color: "var(--score-caliente)", text: "text-score-caliente" },
  cierre: { label: "Cierre probable", emoji: "🚀", color: "var(--score-cierre)", text: "text-score-cierre" },
};

export const CUSTOMER_STATUS: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "sky" },
  activo: { label: "Activo", color: "indigo" },
  cliente: { label: "Cliente", color: "emerald" },
  perdido: { label: "Perdido", color: "zinc" },
  inactivo: { label: "Inactivo", color: "zinc" },
};

export const SOURCES: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  mercadolibre: "Mercado Libre",
  web: "Web",
  recomendacion: "Recomendación",
  presencial: "Presencial",
  google: "Google",
  email: "Email",
  manual: "Manual",
  otro: "Otro",
};

export const VEHICLE_STATUS: Record<string, { label: string; color: string }> = {
  disponible: { label: "Disponible", color: "emerald" },
  reservado: { label: "Reservado", color: "amber" },
  vendido: { label: "Vendido", color: "blue" },
  preparacion: { label: "En preparación", color: "violet" },
  pausado: { label: "Pausado", color: "zinc" },
};

export const BODY_TYPES: Record<string, string> = {
  sedan: "Sedán",
  hatchback: "Hatchback",
  suv: "SUV",
  pickup: "Pick-up",
  coupe: "Coupé",
  furgon: "Furgón",
  otro: "Otro",
};

export const FUELS: Record<string, string> = {
  nafta: "Nafta",
  diesel: "Diésel",
  hibrido: "Híbrido",
  electrico: "Eléctrico",
  gnc: "GNC",
};

export const TRANSMISSIONS: Record<string, string> = {
  manual: "Manual",
  automatica: "Automática",
};

export const FOLLOWUP_TYPES: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  email: "Email",
  visita: "Visita",
  recordatorio: "Recordatorio",
  tarea: "Tarea",
};

export const TASK_TYPES: Record<string, string> = {
  llamada: "Llamada",
  mensaje: "Mensaje",
  reunion: "Reunión",
  seguimiento: "Seguimiento",
  administrativo: "Administrativo",
};

export const APPOINTMENT_TYPES: Record<string, string> = {
  visita: "Visita",
  llamada: "Llamada",
  reunion: "Reunión",
  test_drive: "Test drive",
  entrega: "Entrega",
  otro: "Otro",
};

export const PRIORITIES: Record<string, { label: string; color: string }> = {
  baja: { label: "Baja", color: "zinc" },
  media: { label: "Media", color: "blue" },
  alta: { label: "Alta", color: "red" },
};

export const HEALTH: Record<string, { label: string; className: string }> = {
  green: { label: "Saludable", className: "bg-health-green" },
  yellow: { label: "Atención", className: "bg-health-yellow" },
  red: { label: "En riesgo", className: "bg-health-red" },
};

export const QUOTE_STATUS: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "zinc" },
  enviada: { label: "Enviada", color: "blue" },
  aceptada: { label: "Aceptada", color: "emerald" },
  rechazada: { label: "Rechazada", color: "red" },
  vencida: { label: "Vencida", color: "amber" },
};

export const TRADE_IN_STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente de tasación", color: "amber" },
  tasado: { label: "Tasado", color: "blue" },
  aceptado: { label: "Aceptado", color: "emerald" },
  rechazado: { label: "Rechazado", color: "zinc" },
};

export const INSIGHT_KINDS: Record<string, { label: string; emoji: string }> = {
  lead_caliente: { label: "Lead caliente", emoji: "🔥" },
  riesgo: { label: "En riesgo", emoji: "⚠️" },
  recuperar: { label: "Para recuperar", emoji: "👻" },
  demanda_vehiculo: { label: "Alta demanda", emoji: "🚗" },
  stock_estancado: { label: "Stock estancado", emoji: "📉" },
  match: { label: "Match", emoji: "🎯" },
  oportunidad_stock: { label: "Oportunidad de stock", emoji: "💰" },
  precio: { label: "Precio", emoji: "🏷" },
  forecast: { label: "Forecast", emoji: "📈" },
};

export const ROLES: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
};

export const AI_PROVIDERS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openai_compat: "Compatible OpenAI (custom)",
};

export const RANGE_OPTIONS = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Año" },
] as const;
