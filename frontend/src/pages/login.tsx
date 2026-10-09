import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CarFront, Gauge, Radar, Sparkles } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type Mode = "login" | "register" | "forgot" | "reset";

interface PublicConfig {
  app_name: string;
  demo_mode: boolean;
  allow_signup: boolean;
}

const DEMO_ACCOUNTS = [
  { email: "admin@motoriq.demo", role: "Administrador" },
  { email: "gerente@motoriq.demo", role: "Gerente" },
  { email: "lucas@motoriq.demo", role: "Vendedor" },
  { email: "sofia@motoriq.demo", role: "Vendedora" },
  { email: "diego@motoriq.demo", role: "Vendedor" },
];
const DEMO_PASSWORD = "demo1234";

const CURRENCIES = [
  { value: "USD", label: "Dólar (USD)" },
  { value: "ARS", label: "Peso argentino (ARS)" },
  { value: "UYU", label: "Peso uruguayo (UYU)" },
  { value: "CLP", label: "Peso chileno (CLP)" },
  { value: "MXN", label: "Peso mexicano (MXN)" },
  { value: "COP", label: "Peso colombiano (COP)" },
  { value: "PEN", label: "Sol (PEN)" },
  { value: "EUR", label: "Euro (EUR)" },
];

const FEATURES = [
  { icon: Gauge, title: "Scoring de intención", text: "Sabé quién está listo para comprar." },
  { icon: CarFront, title: "Matching de stock", text: "Cada auto encuentra a su cliente." },
  { icon: Radar, title: "Radar comercial", text: "Qué hacer hoy para vender más." },
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Argentina/Buenos_Aires";
  } catch {
    return "America/Argentina/Buenos_Aires";
  }
}

export function LoginPage() {
  const { status, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [signup, setSignup] = useState({
    company_name: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone: "",
    currency: "USD",
  });

  const config = useQuery({
    queryKey: ["public-config"],
    queryFn: () => api.get<PublicConfig>("/auth/config"),
    staleTime: Infinity,
    retry: 1,
  });
  const demoMode = config.data?.demo_mode ?? false;
  const allowSignup = config.data?.allow_signup ?? false;

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos iniciar sesión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        ...signup,
        company_name: signup.company_name.trim(),
        email: signup.email.trim(),
        phone: signup.phone.trim() || undefined,
        timezone: browserTimezone(),
      });
      toast.success(`¡Bienvenido a Motor IQ! ${signup.company_name.trim()} ya está lista.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la cuenta. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string; dev_reset_token: string | null }>("/auth/forgot-password", {
        email: email.trim(),
      });
      toast.success(res.message);
      if (res.dev_reset_token) {
        setDevToken(res.dev_reset_token);
        setResetToken(res.dev_reset_token);
        setMode("reset");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la recuperación");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>("/auth/reset-password", {
        token: resetToken.trim(),
        new_password: newPassword,
      });
      toast.success(res.message);
      setMode("login");
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo restablecer la contraseña");
    } finally {
      setBusy(false);
    }
  };

  const setField = (field: keyof typeof signup) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSignup((prev) => ({ ...prev, [field]: e.target.value }));

  const errorBox = error ? (
    <p className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</p>
  ) : null;

  const linkButton = "font-medium text-pops hover:underline underline-offset-4";

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-[#242426] text-[#fcfffd] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 80% 60% at 40% 30%, black 10%, transparent 75%)",
          }}
        />

        <Logo inverted markClassName="size-10" className="relative" />

        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles className="size-3.5" /> CRM con inteligencia comercial para agencias
          </span>
          <h1 className="mt-6 font-display text-[52px] font-extrabold leading-[1.04] tracking-tight">
            Convertí conversaciones en{" "}
            <span className="text-brand">
              ventas
            </span>
            .
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/65">
            Clientes, stock, pipeline y seguimientos en un solo lugar — y una inteligencia que te dice a quién
            contactar hoy.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground">
                  <Icon className="size-[18px]" />
                </span>
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/55">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Motor IQ — Sales Intelligence</p>
      </div>

      {/* Formularios */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] anim-fade-up" key={mode}>
          <div className="mb-10 lg:hidden">
            <Logo markClassName="size-10" />
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="font-display text-[28px] font-bold tracking-tight">Hola de nuevo 👋</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Ingresá para ver qué hacer hoy para vender más.</p>
              </div>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@agencia.com"
                  autoComplete="email"
                  autoFocus
                  required
                  className="h-11"
                />
              </Field>
              <Field label="Contraseña">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11"
                />
              </Field>
              <div className="-mt-2 flex justify-end">
                <button type="button" className="text-[13px] text-muted-foreground hover:text-foreground" onClick={() => switchMode("forgot")}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {errorBox}
              <Button type="submit" size="lg" className="w-full" variant="pops" disabled={busy}>
                {busy ? "Entrando…" : "Ingresar"} {!busy ? <ArrowRight /> : null}
              </Button>

              {allowSignup ? (
                <p className="text-center text-sm text-muted-foreground">
                  ¿Tu agencia todavía no usa Motor IQ?{" "}
                  <button type="button" className={linkButton} onClick={() => switchMode("register")}>
                    Creá tu cuenta gratis
                  </button>
                </p>
              ) : null}

              {demoMode ? (
                <div className="rounded-2xl border border-dashed border-pops/30 bg-pops-soft/40 p-4">
                  <p className="text-xs font-semibold text-foreground">
                    Cuentas de prueba <span className="font-normal text-muted-foreground">· contraseña {DEMO_PASSWORD}</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {DEMO_ACCOUNTS.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => {
                          setEmail(account.email);
                          setPassword(DEMO_PASSWORD);
                          setError(null);
                        }}
                        className="rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-pops/40 hover:text-pops"
                        title={account.email}
                      >
                        {account.role} · {account.email.split("@")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>
          ) : mode === "register" ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-pops-soft text-pops">
                  <Building2 className="size-5" />
                </span>
                <h2 className="font-display text-[28px] font-bold tracking-tight">Creá tu agencia</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Arrancás con un espacio vacío y privado. Después sumás a tu equipo, tu stock y tus clientes.
                </p>
              </div>
              <Field label="Nombre de la agencia" required>
                <Input value={signup.company_name} onChange={setField("company_name")} placeholder="Ej: Autos del Sur" required minLength={2} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tu nombre" required>
                  <Input value={signup.first_name} onChange={setField("first_name")} autoComplete="given-name" required />
                </Field>
                <Field label="Apellido" required>
                  <Input value={signup.last_name} onChange={setField("last_name")} autoComplete="family-name" required />
                </Field>
              </div>
              <Field label="Email" required>
                <Input type="email" value={signup.email} onChange={setField("email")} placeholder="vos@tuagencia.com" autoComplete="email" required />
              </Field>
              <Field label="Contraseña" required hint="Mínimo 8 caracteres">
                <Input type="password" value={signup.password} onChange={setField("password")} autoComplete="new-password" minLength={8} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <Input value={signup.phone} onChange={setField("phone")} autoComplete="tel" />
                </Field>
                <Field label="Moneda">
                  <Select value={signup.currency} onValueChange={(currency) => setSignup((prev) => ({ ...prev, currency }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {errorBox}
              <Button type="submit" size="lg" className="w-full" variant="pops" disabled={busy}>
                {busy ? "Creando tu agencia…" : "Crear cuenta"} {!busy ? <ArrowRight /> : null}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tenés cuenta?{" "}
                <button type="button" className={linkButton} onClick={() => switchMode("login")}>
                  Iniciá sesión
                </button>
              </p>
            </form>
          ) : mode === "forgot" ? (
            <form onSubmit={handleForgot} className="space-y-5">
              <div>
                <h2 className="font-display text-[28px] font-bold tracking-tight">Recuperar contraseña</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {demoMode
                    ? "Te generamos un código de recuperación (en modo demo aparece acá mismo)."
                    : "Te generamos un enlace de recuperación válido por 2 horas."}
                </p>
              </div>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-11" />
              </Field>
              {errorBox}
              <Button type="submit" size="lg" className="w-full" variant="pops" disabled={busy}>
                {busy ? "Generando…" : "Generar recuperación"}
              </Button>
              <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => switchMode("login")}>
                Volver a iniciar sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="font-display text-[28px] font-bold tracking-tight">Nueva contraseña</h2>
                {devToken ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">Código de recuperación cargado automáticamente (modo demo).</p>
                ) : null}
              </div>
              <Field label="Código de recuperación">
                <Input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
              </Field>
              <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required autoFocus />
              </Field>
              {errorBox}
              <Button type="submit" size="lg" className="w-full" variant="pops" disabled={busy}>
                {busy ? "Guardando…" : "Restablecer contraseña"}
              </Button>
              <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => switchMode("login")}>
                Volver a iniciar sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
