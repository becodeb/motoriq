import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, RefreshCw, Radar as RadarIcon, Send, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ScoreRing } from "@/components/shared/score-ring";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { INSIGHT_KINDS } from "@/lib/constants";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import type {
  AIStatus,
  ChatResponse,
  Insight,
  Radar,
  RadarCustomerItem,
  RadarMatchItem,
  RadarVehicleItem,
} from "@/types/api";

export function IntelligencePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          Inteligencia <span className="size-2 rounded-full bg-pops anim-pulse-dot" />
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Motor IQ sabe dónde están las oportunidades: señales, no intuición.
        </p>
      </div>

      <Tabs defaultValue="radar">
        <TabsList>
          <TabsTrigger value="radar">
            <RadarIcon /> Radar
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Sparkles /> Insights
          </TabsTrigger>
          <TabsTrigger value="chat">
            <Bot /> Preguntale a Motor IQ
          </TabsTrigger>
        </TabsList>
        <TabsContent value="radar">
          <RadarTab />
        </TabsContent>
        <TabsContent value="insights">
          <InsightsTab />
        </TabsContent>
        <TabsContent value="chat">
          <ChatTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────── Radar Motor IQ (§78) ─────────── */

function RadarSection({
  emoji,
  title,
  children,
  count,
}: {
  emoji: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-2.5 px-4 py-3.5">
      <p className="flex items-center gap-2 font-semibold">
        <span>{emoji}</span> {title}
        <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground nums">
          {count}
        </span>
      </p>
      {count ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">Nada detectado por ahora — buena señal.</p>
      )}
    </Card>
  );
}

function RadarCustomerRow({ item }: { item: RadarCustomerItem }) {
  const navigate = useNavigate();
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-ring/50"
      onClick={() => navigate(`/clientes/${item.customer.id}`)}
    >
      <ScoreRing score={item.customer.lead_score} label={item.customer.score_label} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.customer.full_name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.subtitle ? `${item.subtitle} · ` : ""}
          {item.detail}
        </span>
      </span>
      {item.metric ? <span className="shrink-0 text-xs font-semibold text-muted-foreground nums">{item.metric}</span> : null}
    </button>
  );
}

function RadarVehicleRow({ item }: { item: RadarVehicleItem }) {
  const navigate = useNavigate();
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-ring/50"
      onClick={() => navigate(`/vehiculos/${item.vehicle.id}`)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.vehicle.title} {item.vehicle.year}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
      {item.metric ? <span className="shrink-0 text-xs font-semibold text-pops nums">{item.metric}</span> : null}
    </button>
  );
}

function RadarMatchRow({ item }: { item: RadarMatchItem }) {
  const navigate = useNavigate();
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-pops/50"
      onClick={() => navigate(`/clientes/${item.customer.id}`)}
    >
      <span className="font-display w-10 shrink-0 text-base font-bold text-pops nums">{item.score}%</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.customer.full_name} ↔ {item.vehicle.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
    </button>
  );
}

function RadarTab() {
  const query = useQuery({
    queryKey: ["radar"],
    queryFn: () => api.get<Radar>("/intelligence/radar"),
    refetchInterval: 120_000,
  });
  const data = query.data;

  if (query.isPending)
    return (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    );
  if (!data) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <RadarSection emoji="🔥" title="Clientes calientes" count={data.hot_customers.length}>
        {data.hot_customers.map((item) => (
          <RadarCustomerRow key={item.customer.id} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="⏰" title="Seguimientos urgentes" count={data.urgent_followups.length}>
        {data.urgent_followups.map((item, i) => (
          <RadarCustomerRow key={`${item.customer.id}-${i}`} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="👻" title="Clientes que desaparecieron" count={data.ghosted_customers.length}>
        {data.ghosted_customers.map((item) => (
          <RadarCustomerRow key={item.customer.id} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="🚗" title="Vehículos con alta demanda" count={data.high_demand_vehicles.length}>
        {data.high_demand_vehicles.map((item) => (
          <RadarVehicleRow key={item.vehicle.id} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="📉" title="Stock estancado" count={data.stale_vehicles.length}>
        {data.stale_vehicles.map((item) => (
          <RadarVehicleRow key={item.vehicle.id} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="🎯" title="Matches nuevos" count={data.new_matches.length}>
        {data.new_matches.map((item, i) => (
          <RadarMatchRow key={i} item={item} />
        ))}
      </RadarSection>
      <RadarSection emoji="💰" title="Posibles cierres" count={data.probable_closes.length}>
        {data.probable_closes.map((item, i) => (
          <RadarCustomerRow key={`${item.customer.id}-close-${i}`} item={item} />
        ))}
      </RadarSection>
    </div>
  );
}

/* ─────────── Insights (§40) ─────────── */

function InsightsTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState("nueva");
  const query = useQuery({
    queryKey: ["insights", status],
    queryFn: () => api.get<Insight[]>("/insights", { status }),
  });

  const generate = useMutation({
    mutationFn: () => api.post<{ message: string }>("/insights/generate"),
    onSuccess: (res) => {
      toast.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      api.post(`/insights/${id}/status?status=${newStatus}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["insights"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {[
            ["nueva", "Nuevos"],
            ["accionada", "Accionados"],
            ["descartada", "Descartados"],
            ["todas", "Todos"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatus(value!)}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                status === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          <RefreshCw className={cn(generate.isPending && "animate-spin")} /> Analizar ahora
        </Button>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : query.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data.map((insight) => {
            const kind = INSIGHT_KINDS[insight.kind] ?? { label: insight.kind, emoji: "✨" };
            const target =
              insight.entity_type === "customer" && insight.entity_id
                ? `/clientes/${insight.entity_id}`
                : insight.entity_type === "vehicle" && insight.entity_id
                  ? `/vehiculos/${insight.entity_id}`
                  : null;
            return (
              <Card key={insight.id} className="gap-2.5 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-pops">
                    {kind.emoji} {kind.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{relative(insight.created_at)}</span>
                </div>
                <p className="font-semibold leading-snug">{insight.title}</p>
                <div className="space-y-1.5 text-sm">
                  <p>
                    <span className="font-medium text-muted-foreground">Qué detectamos: </span>
                    {insight.detail}
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Por qué: </span>
                    {insight.reason}
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Qué hacer: </span>
                    {insight.recommendation}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {target ? (
                    <Button size="sm" variant="pops" onClick={() => navigate(target)}>
                      Ver {insight.entity_type === "customer" ? "cliente" : "vehículo"}
                    </Button>
                  ) : null}
                  {insight.status === "nueva" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateStatus.mutate({ id: insight.id, newStatus: "accionada" })}
                      >
                        <Check /> Lo hice
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus.mutate({ id: insight.id, newStatus: "descartada" })}
                      >
                        <X /> Descartar
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs capitalize text-muted-foreground">{insight.status}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title={status === "nueva" ? "Sin insights nuevos" : "Nada por acá"}
          description="Motor IQ analiza la actividad comercial cada 30 minutos. También podés pedir un análisis ahora."
          action={
            <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <RefreshCw /> Analizar ahora
            </Button>
          }
          className="py-16"
        />
      )}
    </div>
  );
}

/* ─────────── Preguntale a Motor IQ (§41) ─────────── */

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; summary: string }[];
}

const SUGGESTED_QUESTIONS = [
  "¿Qué clientes tengo que llamar hoy?",
  "¿Qué autos se están consultando más?",
  "¿Qué vendedor tiene seguimientos atrasados?",
  "¿Qué clientes preguntaron por financiación?",
  "¿Qué autos llevan más de 60 días en stock?",
];

function ChatTab() {
  const user = useAuth((s) => s.user);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const aiStatus = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AIStatus>("/ai/status"),
  });

  const chat = useMutation({
    mutationFn: (history: ChatEntry[]) =>
      api.post<ChatResponse>("/ai/chat", {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    onSuccess: (response) => {
      setMessages((prev) => [...prev, { role: "assistant", content: response.reply, toolCalls: response.tool_calls }]);
    },
    onError: (error) => {
      setMessages((prev) => prev.slice(0, -1));
      toast.error(error instanceof Error ? error.message : "No se pudo responder");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, chat.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;
    const next: ChatEntry[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    chat.mutate(next);
  };

  if (aiStatus.data && !aiStatus.data.configured) {
    return (
      <Card>
        <EmptyState
          icon={Settings2}
          title="Configurá un proveedor de IA para chatear con tus datos"
          description="Motor IQ responde con datos reales de la agencia: nunca inventa. Necesita una API key de OpenAI, Anthropic o Gemini."
          action={
            isManager(user) ? (
              <Button variant="pops" asChild>
                <Link to="/configuracion/ia">Ir a Configuración → IA</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Pedile a un administrador que la configure.</p>
            )
          }
          className="py-16"
        />
      </Card>
    );
  }

  return (
    <Card className="flex h-[calc(100dvh-16rem)] min-h-[420px] flex-col gap-0 overflow-hidden p-0">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-pops-soft">
              <Bot className="size-6 text-pops" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Preguntale a Motor IQ sobre clientes, stock, seguimientos y métricas.
              <br />
              Responde con datos reales de la agencia — no inventa.
            </p>
            <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  className="rounded-full border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-pops/50 hover:text-foreground"
                  onClick={() => send(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] space-y-1.5", message.role === "user" && "text-right")}>
                {message.toolCalls?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {message.toolCalls.map((call, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <Sparkles className="size-2.5 text-pops" /> {call.summary}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div
                  className={cn(
                    "inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-sm",
                    message.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border bg-card",
                  )}
                >
                  {message.content}
                </div>
              </div>
            </div>
          ))
        )}
        {chat.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="size-4 animate-pulse text-pops" /> Motor IQ está consultando los datos…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="¿Qué clientes buscaban una SUV de menos de 30.000?"
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          disabled={chat.isPending}
        />
        <Button variant="pops" size="icon" onClick={() => send(input)} disabled={!input.trim() || chat.isPending} aria-label="Enviar">
          <Send />
        </Button>
      </div>
    </Card>
  );
}
