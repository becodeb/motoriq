/** Formateo según la configuración de la organización (§73, §88). */

let orgLocale = "es-AR";
let orgCurrency = "USD";
let orgTimeZone = "America/Argentina/Buenos_Aires";

export function configureFormat(settings: { locale?: string; currency?: string; timezone?: string }) {
  if (settings.locale) orgLocale = settings.locale;
  if (settings.currency) orgCurrency = settings.currency;
  if (settings.timezone) orgTimeZone = settings.timezone;
}

export function money(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(orgLocale, {
    style: "currency",
    currency: orgCurrency,
    maximumFractionDigits: 0,
    notation: compact && Math.abs(value) >= 100_000 ? "compact" : "standard",
  }).format(value);
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(orgLocale, { maximumFractionDigits: digits }).format(value);
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(orgLocale, { day: "2-digit", month: "2-digit", timeZone: orgTimeZone }).format(
    parseUTC(iso),
  );
}

export function dateFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(orgLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: orgTimeZone,
  }).format(parseUTC(iso));
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(orgLocale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: orgTimeZone,
  }).format(parseUTC(iso));
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(orgLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: orgTimeZone,
  }).format(parseUTC(iso));
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = parseUTC(iso);
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (minutes < 1) text = "ahora";
  else if (minutes < 60) text = `${minutes} min`;
  else if (hours < 48) text = `${hours} h`;
  else if (days < 60) text = `${days} días`;
  else text = dateFull(iso);

  if (text === "ahora" || text === dateFull(iso)) return text;
  return future ? `en ${text}` : `hace ${text}`;
}

/** "hoy 10:31", "ayer 15:02", "22 ago" — estilo timeline (§9). */
export function timelineDate(iso: string): string {
  const date = parseUTC(iso);
  const fmtDay = (d: Date) =>
    new Intl.DateTimeFormat(orgLocale, { day: "numeric", month: "short", timeZone: orgTimeZone }).format(d);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: orgTimeZone }).format(new Date());
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: orgTimeZone }).format(date);
  const yesterdayKey = new Intl.DateTimeFormat("en-CA", { timeZone: orgTimeZone }).format(
    new Date(Date.now() - 86_400_000),
  );
  if (dateKey === todayKey) return `hoy ${timeOnly(iso)}`;
  if (dateKey === yesterdayKey) return `ayer ${timeOnly(iso)}`;
  return `${fmtDay(date)} ${timeOnly(iso)}`;
}

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: orgTimeZone }).format(parseUTC(iso));
}

export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: orgTimeZone }).format(new Date());
}

export function currentHourInOrgTz(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: orgTimeZone }).format(new Date()),
  );
}

export function longDate(date: Date = new Date()): string {
  const text = new Intl.DateTimeFormat(orgLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: orgTimeZone,
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fecha local (org) → ISO UTC para la API, desde un input datetime-local. */
export function localInputToISO(value: string): string {
  // datetime-local no tiene zona: interpretamos en la zona del navegador del usuario.
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = parseUTC(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
