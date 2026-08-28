import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  Kanban,
  Plug,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { toast } from "sonner";

import { ColorBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { UserAvatar } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrg, useStages } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { AI_PROVIDERS, AVATAR_BG, COLOR_BADGE, ROLES } from "@/lib/constants";
import { dateTime, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import type {
  AIUsageSummary,
  AuditLog,
  Automation,
  AutomationRun,
  Organization,
  Page,
  Stage,
  UserOut,
} from "@/types/api";

const TRIGGER_LABELS: Record<string, string> = {
  "lead.created": "Lead creado",
  "message.received": "Mensaje recibido",
  "vehicle.created": "Vehículo ingresado",
  "inactivity.72h": "72 h sin actividad",
  "followup.overdue": "Seguimiento vencido",
  "opportunity.stage_changed": "Cambio de etapa",
};

export function SettingsPage() {
  const user = useAuth((s) => s.user);
  const role = user?.role ?? "vendedor";
  const admin = role === "admin";
  const manager = admin || role === "gerente";

  const sections = [
    { path: "perfil", label: "Mi perfil", icon: UserRound, show: true },
    { path: "agencia", label: "Agencia", icon: Building2, show: admin },
    { path: "usuarios", label: "Usuarios", icon: Users, show: manager },
    { path: "pipeline", label: "Pipeline", icon: Kanban, show: manager },
    { path: "automatizaciones", label: "Automatizaciones", icon: Zap, show: manager },
    { path: "ia", label: "IA", icon: Sparkles, show: admin },
    { path: "integraciones", label: "Integraciones", icon: Plug, show: manager },
    { path: "auditoria", label: "Auditoría", icon: ShieldCheck, show: admin },
  ].filter((s) => s.show);

  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" />
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col" aria-label="Secciones de configuración">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={`/configuracion/${section.path}`}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <section.icon className="size-4" /> {section.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="perfil" replace />} />
            <Route path="perfil" element={<ProfileSection />} />
            {admin ? <Route path="agencia" element={<AgencySection />} /> : null}
            {manager ? <Route path="usuarios" element={<UsersSection admin={admin} />} /> : null}
            {manager ? <Route path="pipeline" element={<PipelineSection />} /> : null}
            {manager ? <Route path="automatizaciones" element={<AutomationsSection />} /> : null}
            {admin ? <Route path="ia" element={<AISection />} /> : null}
            {manager ? <Route path="integraciones" element={<IntegrationsSection />} /> : null}
            {admin ? <Route path="auditoria" element={<AuditSection />} /> : null}
            <Route path="*" element={<Navigate to="perfil" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

/* ── Perfil ── */

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [color, setColor] = useState(user?.avatar_color ?? "indigo");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.patch<UserOut>("/auth/me", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        avatar_color: color,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success("Perfil actualizado");
    },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      toast.success("Contraseña actualizada. Iniciá sesión de nuevo.");
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  if (!user) return null;
  return (
    <div className="max-w-xl space-y-4">
      <Card className="gap-4 px-4 py-4">
        <CardTitle className="text-sm">Datos personales</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Apellido">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Color de avatar">
            <div className="flex items-center gap-1.5 pt-1">
              {Object.keys(AVATAR_BG).map((name) => (
                <button
                  key={name}
                  aria-label={`Color ${name}`}
                  className={cn(
                    "size-7 rounded-full transition-transform",
                    AVATAR_BG[name],
                    color === name ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-110",
                  )}
                  onClick={() => setColor(name)}
                />
              ))}
            </div>
          </Field>
        </div>
        <div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !firstName.trim()}>
            {save.isPending ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </Card>

      <Card className="gap-4 px-4 py-4">
        <CardTitle className="text-sm">Cambiar contraseña</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contraseña actual">
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
        </div>
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => changePassword.mutate()}
            disabled={changePassword.isPending || !currentPassword || newPassword.length < 8}
          >
            Actualizar contraseña
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Agencia ── */

function AgencySection() {
  const queryClient = useQueryClient();
  const org = useOrg();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [locale, setLocale] = useState("es-AR");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [distribution, setDistribution] = useState("round_robin");

  useEffect(() => {
    if (org.data) {
      setName(org.data.name);
      setCurrency(org.data.currency);
      setLocale(org.data.locale);
      setTimezone(org.data.timezone);
      setDistribution(org.data.lead_distribution);
    }
  }, [org.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<Organization>("/organization", {
        name: name.trim(),
        currency,
        locale,
        timezone,
        lead_distribution: distribution,
      }),
    onSuccess: () => {
      toast.success("Agencia actualizada");
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });

  if (org.isPending) return <Skeleton className="h-72 max-w-xl" />;

  return (
    <Card className="max-w-xl gap-4 px-4 py-4">
      <CardTitle className="text-sm">Datos de la agencia</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Moneda">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["USD", "ARS", "EUR", "UYU", "CLP"].map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Idioma / región">
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["es-AR", "es-UY", "es-CL", "es-MX", "es-ES"].map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Zona horaria" className="sm:col-span-2">
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "America/Argentina/Buenos_Aires",
                "America/Montevideo",
                "America/Santiago",
                "America/Mexico_City",
                "Europe/Madrid",
              ].map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Distribución de leads (§34)" className="sm:col-span-2" hint="Cómo se asignan los leads que entran sin vendedor">
          <Select value={distribution} onValueChange={setDistribution}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round-robin (rotativo)</SelectItem>
              <SelectItem value="menos_leads">Al vendedor con menos leads</SelectItem>
              <SelectItem value="manual">Manual (sin asignación automática)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </Card>
  );
}

/* ── Usuarios ── */

function UsersSection({ admin }: { admin: boolean }) {
  const queryClient = useQueryClient();
  const currentUser = useAuth((s) => s.user);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "", role: "vendedor" });

  const team = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserOut[]>("/users") });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => api.post<UserOut>("/users", form),
    onSuccess: () => {
      toast.success("Usuario creado");
      setCreateOpen(false);
      setForm({ email: "", password: "", first_name: "", last_name: "", role: "vendedor" });
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; role?: string; is_active?: boolean }) =>
      api.patch<UserOut>(`/users/${id}`, payload),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      invalidate();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
          <Plus /> Nuevo usuario
        </Button>
      </div>
      <Card className="gap-0 p-0">
        {team.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead>Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(team.data ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <UserAvatar user={member} className="size-7 text-[10px]" />
                      {member.full_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(role) => update.mutate({ id: member.id, role })}
                      disabled={!admin || member.id === currentUser?.id}
                    >
                      <SelectTrigger size="sm" className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dateTime(member.last_login_at)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={member.is_active}
                      disabled={member.id === currentUser?.id}
                      onCheckedChange={(is_active) => update.mutate({ id: member.id, is_active })}
                      aria-label={`Activar/desactivar ${member.full_name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>Se le pedirá cambiar la contraseña al ingresar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Apellido" required>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
            <Field label="Email" required className="sm:col-span-2">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Contraseña inicial" required hint="Mínimo 8 caracteres">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLES)
                    .filter(([value]) => admin || value !== "admin")
                    .map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.email || form.password.length < 8 || !form.first_name || !form.last_name}
            >
              {create.isPending ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Pipeline ── */

function PipelineSection() {
  const queryClient = useQueryClient();
  const stages = useStages();
  const [newStage, setNewStage] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });

  const create = useMutation({
    mutationFn: () => api.post<Stage>("/pipeline-stages", { name: newStage.trim(), color: "indigo", probability: 30 }),
    onSuccess: () => {
      toast.success("Etapa creada");
      setNewStage("");
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; probability?: number; is_active?: boolean }) =>
      api.patch<Stage>(`/pipeline-stages/${id}`, payload),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (stage_ids: string[]) => api.post<Stage[]>("/pipeline-stages/reorder", { stage_ids }),
    onSuccess: invalidate,
  });

  if (stages.isPending) return <Skeleton className="h-80 max-w-2xl" />;
  const list = stages.data ?? [];

  const move = (index: number, delta: number) => {
    const ids = list.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <div className="max-w-2xl space-y-3">
      <Card className="gap-3 px-4 py-4">
        <CardTitle className="text-sm">Etapas del pipeline</CardTitle>
        <p className="text-xs text-muted-foreground">
          Las etapas de cierre (Vendido / Perdido) son fijas: sostienen las métricas de conversión.
        </p>
        <div className="space-y-1.5">
          {list.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", COLOR_BADGE[stage.color] ?? COLOR_BADGE.zinc)}>
                {stage.name}
              </span>
              <span className="text-xs text-muted-foreground nums">prob. {stage.probability}%</span>
              <div className="ml-auto flex items-center gap-1">
                {!stage.is_won && !stage.is_lost ? (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Bajar"
                      disabled={index >= list.length - 1 || list[index + 1]?.is_won || list[index + 1]?.is_lost}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const name = window.prompt("Nuevo nombre:", stage.name);
                        if (name?.trim()) update.mutate({ id: stage.id, name: name.trim() });
                      }}
                    >
                      Renombrar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const prob = window.prompt("Probabilidad (0-100):", String(stage.probability));
                        const parsed = Number(prob);
                        if (prob !== null && Number.isFinite(parsed)) update.mutate({ id: stage.id, probability: Math.max(0, Math.min(100, parsed)) });
                      }}
                    >
                      Prob.
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => update.mutate({ id: stage.id, is_active: false })}
                    >
                      Quitar
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{stage.is_won ? "cierre ganado" : "cierre perdido"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            placeholder="Nombre de la nueva etapa…"
            onKeyDown={(e) => e.key === "Enter" && newStage.trim() && create.mutate()}
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={!newStage.trim() || create.isPending}>
            <Plus /> Agregar
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Automatizaciones ── */

function AutomationsSection() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const automations = useQuery({
    queryKey: ["automations"],
    queryFn: () => api.get<Automation[]>("/automations"),
  });
  const runs = useQuery({
    queryKey: ["automation-runs", expanded],
    queryFn: () => api.get<AutomationRun[]>(`/automations/${expanded}/runs`),
    enabled: Boolean(expanded),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/automations/${id}`, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  if (automations.isPending) return <Skeleton className="h-72 max-w-2xl" />;

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">
        Trigger → Condiciones → Acciones (§39). Las acciones disponibles son seguras: asignar, crear tareas o
        seguimientos, notificar y correr matching. Nada se envía a clientes automáticamente (§96).
      </p>
      {(automations.data ?? []).map((automation) => (
        <Card key={automation.id} className="gap-2 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{automation.name}</p>
              <p className="text-sm text-muted-foreground">{automation.description}</p>
            </div>
            <ColorBadge color="violet">{TRIGGER_LABELS[automation.trigger] ?? automation.trigger}</ColorBadge>
            <Switch
              checked={automation.enabled}
              onCheckedChange={(enabled) => toggle.mutate({ id: automation.id, enabled })}
              aria-label={`Activar ${automation.name}`}
            />
          </div>
          <button
            className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(expanded === automation.id ? null : automation.id)}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", expanded === automation.id && "rotate-180")} />
            Ejecuciones recientes
          </button>
          {expanded === automation.id ? (
            <div className="space-y-1 rounded-lg bg-muted/50 p-2.5 text-xs">
              {runs.isPending ? (
                <Skeleton className="h-10" />
              ) : runs.data?.length ? (
                runs.data.slice(0, 8).map((run) => (
                  <div key={run.id} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        run.status === "success" ? "bg-health-green" : run.status === "skipped" ? "bg-health-yellow" : "bg-health-red",
                      )}
                    />
                    <span className="capitalize">{run.status}</span>
                    <span className="text-muted-foreground">{dateTime(run.created_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{JSON.stringify(run.result)}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Todavía no se ejecutó.</p>
              )}
            </div>
          ) : null}
        </Card>
      ))}
      {!automations.data?.length ? (
        <EmptyState icon={Zap} title="Sin automatizaciones" description="El seed demo incluye tres listas para activar." />
      ) : null}
    </div>
  );
}

/* ── IA ── */

function AISection() {
  const queryClient = useQueryClient();
  const org = useOrg();
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [allow, setAllow] = useState(true);
  const [limit, setLimit] = useState("");

  const usage = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<AIUsageSummary>("/ai/usage"),
  });

  useEffect(() => {
    if (org.data) {
      setProvider(org.data.ai_provider ?? "openai");
      setModel(org.data.ai_model ?? "");
      setBaseUrl(org.data.ai_base_url ?? "");
      setAllow(org.data.allow_ai_processing);
      setLimit(org.data.ai_monthly_limit_usd != null ? String(org.data.ai_monthly_limit_usd) : "");
    }
  }, [org.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<Organization>("/organization/ai", {
        ai_provider: provider,
        ai_model: model.trim() || null,
        ...(apiKey.trim() ? { ai_api_key: apiKey.trim() } : {}),
        ai_base_url: baseUrl.trim() || null,
        allow_ai_processing: allow,
        ai_monthly_limit_usd: limit ? Number(limit) : null,
      }),
    onSuccess: () => {
      toast.success("Configuración de IA guardada");
      setApiKey("");
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    },
  });

  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; latency_ms: number; model: string }>("/ai/test"),
    meta: { silent: true },
    onSuccess: (res) => toast.success(`Conexión OK — ${res.model} respondió en ${res.latency_ms} ms`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falló la conexión"),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="gap-4 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-pops" /> Proveedor de IA
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proveedor">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AI_PROVIDERS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Modelo" hint="Vacío = default del proveedor">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini · claude-haiku-4-5…" />
          </Field>
          <Field
            label="API key"
            className="sm:col-span-2"
            hint={org.data?.ai_api_key_set ? `Configurada (${org.data.ai_api_key_hint}). Escribí una nueva para reemplazarla.` : "Se guarda en tu servidor; nunca llega al navegador."}
          >
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
          </Field>
          {provider === "openai_compat" ? (
            <Field label="Base URL" className="sm:col-span-2">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://mi-endpoint/v1" />
            </Field>
          ) : null}
          <Field label="Límite mensual (USD)" hint="Corta el uso de IA al alcanzarlo (§56)">
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="20" />
          </Field>
          <div className="flex items-center gap-2 self-end pb-1.5">
            <Switch checked={allow} onCheckedChange={setAllow} aria-label="Permitir procesamiento con IA" />
            <span className="text-sm">Permitir procesamiento con IA (§55)</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <Activity className={cn(test.isPending && "animate-pulse")} /> Probar conexión
          </Button>
        </div>
      </Card>

      <Card className="gap-3 px-4 py-4">
        <CardHeader className="flex-row items-center justify-between p-0">
          <CardTitle className="text-sm">Consumo de IA — mes actual (§56)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {usage.isPending ? (
            <Skeleton className="h-24" />
          ) : usage.data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Costo estimado</p>
                  <p className="font-display font-bold nums">US$ {usage.data.total_cost.toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Llamadas</p>
                  <p className="font-display font-bold nums">{num(usage.data.total_calls)}</p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="font-display font-bold nums">
                    {num(usage.data.total_input_tokens + usage.data.total_output_tokens)}
                  </p>
                </div>
              </div>
              {usage.data.by_feature.length ? (
                <div className="space-y-1">
                  {usage.data.by_feature.map((feature) => (
                    <div key={feature.feature} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{feature.feature.replace("_", " ")}</span>
                      <span className="nums">
                        {feature.calls} llamadas · US$ {feature.cost.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no se usó IA este mes.</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Integraciones ── */

function IntegrationsSection() {
  const events = [
    "lead.created",
    "customer.updated",
    "message.received",
    "followup.overdue",
    "vehicle.created",
    "vehicle.sold",
    "opportunity.stage_changed",
  ];
  return (
    <div className="max-w-2xl space-y-3">
      <Card className="gap-3 px-4 py-4">
        <CardTitle className="text-sm">Integraciones</CardTitle>
        <p className="text-sm text-muted-foreground">
          Todavía no hay integraciones externas conectadas. La arquitectura ya está preparada (§75–§77): cada
          acción del sistema publica eventos de dominio internos, y los mensajes aceptan cualquier canal
          (WhatsApp, Instagram, Mercado Libre, web) vía la API REST.
        </p>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Eventos de dominio activos</p>
          <div className="flex flex-wrap gap-1.5">
            {events.map((event) => (
              <code key={event} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {event}
              </code>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Para conectar un canal real: enviá los mensajes entrantes a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">POST /api/v1/conversations/&#123;id&#125;/messages</code>{" "}
          — el scoring, la detección de fechas y las automatizaciones corren solos. La documentación completa está
          en <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/docs</code> (OpenAPI).
        </p>
      </Card>
    </div>
  );
}

/* ── Auditoría ── */

function AuditSection() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["audit", page],
    queryFn: () => api.get<Page<AuditLog>>("/audit", { page, page_size: 30 }),
    placeholderData: (prev) => prev,
  });

  if (query.isPending) return <Skeleton className="h-80" />;

  return (
    <Card className="gap-0 p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data?.items ?? []).map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground nums">{dateTime(log.created_at)}</TableCell>
              <TableCell>{log.actor_name ?? "Sistema"}</TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{log.action}</code>
              </TableCell>
              <TableCell className="text-muted-foreground">{log.entity_type}</TableCell>
              <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                {JSON.stringify(log.meta)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-3 pb-3">
        <Pager page={page} pageSize={30} total={query.data?.total ?? 0} onPageChange={setPage} />
      </div>
    </Card>
  );
}
