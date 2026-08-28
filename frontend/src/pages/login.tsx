import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type Mode = "login" | "forgot" | "reset";

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

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

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-[#0a0e14] text-white lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 90% 70% at 30% 20%, black 20%, transparent 75%)",
          }}
        />
        <div className="relative flex items-center gap-1.5">
          <span className="font-display text-2xl font-extrabold tracking-tight">Motor IQ</span>
          <span className="mt-2 size-2 rounded-full bg-pops" />
        </div>
        <div className="relative max-w-lg">
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Convertí conversaciones
            <br />
            en <span className="text-pops">ventas</span>.
          </h1>
          <p className="mt-5 text-lg text-white/60">
            Motor IQ observa la conversación comercial de tu agencia, la convierte en señales y te dice a quién
            contactar hoy.
          </p>
          <div className="mt-8 flex items-center gap-6 text-sm text-white/40">
            <span>Scoring de intención</span>
            <span className="size-1 rounded-full bg-white/25" />
            <span>Matching de stock</span>
            <span className="size-1 rounded-full bg-white/25" />
            <span>Radar comercial</span>
          </div>
        </div>
        <p className="relative text-xs text-white/35">Motor IQ — Sales Intelligence for Automotive</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-1.5 lg:hidden">
            <span className="font-display text-2xl font-extrabold tracking-tight">Motor IQ</span>
            <span className="mt-2 size-2 rounded-full bg-pops" />
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">Iniciar sesión</h2>
                <p className="mt-1 text-sm text-muted-foreground">Entrá a tu centro de comando comercial.</p>
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
                />
              </Field>
              <Field label="Contraseña">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" variant="pops" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>

              <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Cuentas demo (contraseña: demo1234)</p>
                <ul className="space-y-0.5">
                  <li>admin@motoriq.demo — administrador</li>
                  <li>gerente@motoriq.demo — gerente</li>
                  <li>lucas@motoriq.demo · sofia@motoriq.demo · diego@motoriq.demo — vendedores</li>
                </ul>
              </div>
            </form>
          ) : mode === "forgot" ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">Recuperar contraseña</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Te generamos un enlace de recuperación (en esta demo, el código aparece acá mismo).
                </p>
              </div>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Generando…" : "Generar recuperación"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMode("login")}
              >
                Volver a iniciar sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">Nueva contraseña</h2>
                {devToken ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Código de recuperación cargado automáticamente (modo demo).
                  </p>
                ) : null}
              </div>
              <Field label="Código de recuperación">
                <Input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
              </Field>
              <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoFocus
                />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Guardando…" : "Restablecer contraseña"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMode("login")}
              >
                Volver a iniciar sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
