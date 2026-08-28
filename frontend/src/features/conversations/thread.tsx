import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Bot, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { SOURCES } from "@/lib/constants";
import { timelineDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conversation, Message, SuggestedReply } from "@/types/api";

interface SendMessageResponse {
  message: Message;
  suggested_followup?: { id: string; due_at: string; reason: string | null };
}

const TONE_LABEL: Record<string, string> = { directa: "Directa", cercana: "Cercana", formal: "Formal" };

export function ConversationThread({
  conversationId,
  customerId,
  channel,
  compact = false,
}: {
  conversationId?: string;
  customerId?: string;
  channel?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [resolvedId, setResolvedId] = useState<string | null>(conversationId ?? null);
  const [body, setBody] = useState("");
  const [direction, setDirection] = useState<"saliente" | "entrante">("saliente");
  const [suggestions, setSuggestions] = useState<SuggestedReply[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResolvedId(conversationId ?? null);
    setSuggestions(null);
  }, [conversationId, customerId]);

  // Si llega customerId sin conversación: busca la abierta o crea una.
  const ensure = useQuery({
    queryKey: ["ensure-conversation", customerId, channel],
    queryFn: () =>
      api.post<Conversation>("/conversations", { customer_id: customerId, channel: channel ?? "whatsapp" }),
    enabled: Boolean(customerId) && !conversationId,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (ensure.data) setResolvedId(ensure.data.id);
  }, [ensure.data]);

  const messages = useQuery({
    queryKey: ["messages", resolvedId],
    queryFn: () => api.get<Message[]>(`/conversations/${resolvedId}/messages`),
    enabled: Boolean(resolvedId),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["messages", resolvedId] });
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["customer"] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: ["customer-timeline"] });
    void queryClient.invalidateQueries({ queryKey: ["customer-nba"] });
    void queryClient.invalidateQueries({ queryKey: ["score-history"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const sendMutation = useMutation({
    mutationFn: (payload: { direction: string; body: string; ai_generated?: boolean }) =>
      api.post<SendMessageResponse>(`/conversations/${resolvedId}/messages`, payload),
    onSuccess: (data) => {
      setBody("");
      setSuggestions(null);
      invalidate();
      const suggested = data.suggested_followup;
      if (suggested) {
        toast(`Motor IQ detectó una fecha: ${suggested.reason ?? ""}`, {
          description: "Se sugirió un seguimiento automático.",
          action: {
            label: "Aceptar",
            onClick: () =>
              api.post(`/followups/${suggested.id}/accept`).then(() => {
                toast.success("Seguimiento agendado");
                void queryClient.invalidateQueries({ queryKey: ["followups"] });
              }),
          },
          duration: 8000,
        });
      }
    },
  });

  const suggestMutation = useMutation({
    mutationFn: () => api.post<{ suggestions: SuggestedReply[] }>(`/conversations/${resolvedId}/suggest-reply`),
    meta: { silent: true },
    onSuccess: (data) => setSuggestions(data.suggestions),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "AI_NOT_CONFIGURED") {
        toast.error("Configurá un proveedor de IA en Configuración → IA para usar el asistente.");
      } else {
        toast.error(error instanceof Error ? error.message : "No se pudieron generar sugerencias");
      }
    },
  });

  if (!resolvedId && (ensure.isPending || conversationId === undefined) && customerId) {
    return <Skeleton className="h-64" />;
  }
  if (!resolvedId) {
    return <EmptyState title="Elegí una conversación" className="py-16" />;
  }

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-[430px]" : "h-full")}>
      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {messages.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="ml-auto h-14 w-2/3" />
            <Skeleton className="h-14 w-1/2" />
          </div>
        ) : messages.data?.length ? (
          messages.data.map((message) => {
            const inbound = message.direction === "entrante";
            return (
              <div key={message.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm",
                    inbound
                      ? "rounded-bl-sm border bg-card"
                      : "rounded-br-sm bg-primary text-primary-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-[10px]",
                      inbound ? "text-muted-foreground" : "text-primary-foreground/60",
                    )}
                  >
                    {inbound ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                    {timelineDate(message.created_at)}
                    {message.sent_by ? ` · ${message.sent_by.full_name}` : ""}
                    {message.ai_generated ? <Bot className="size-3" /> : null}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            title="Sin mensajes todavía"
            description="Registrá el primer mensaje del cliente o tu primera respuesta."
            className="py-10"
          />
        )}
        <div ref={bottomRef} />
      </div>

      {suggestions ? (
        <div className="space-y-2 border-t bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-pops" /> Sugerencias de Motor IQ — elegí una y ajustala antes de enviar
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className="rounded-lg border bg-card p-2.5 text-left text-xs transition-colors hover:border-pops"
                onClick={() => {
                  setBody(suggestion.text);
                  setDirection("saliente");
                  setSuggestions(null);
                }}
              >
                <span className="mb-1 block font-semibold text-pops">{TONE_LABEL[suggestion.tone] ?? suggestion.tone}</span>
                <span className="line-clamp-4 text-muted-foreground">{suggestion.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex rounded-lg bg-muted p-0.5 text-xs">
            <button
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                direction === "saliente" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => setDirection("saliente")}
            >
              Responder
            </button>
            <button
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                direction === "entrante" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => setDirection("entrante")}
            >
              Mensaje del cliente
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => suggestMutation.mutate()}
            disabled={suggestMutation.isPending || !messages.data?.length}
          >
            <Sparkles className={cn("text-pops", suggestMutation.isPending && "animate-pulse")} />
            {suggestMutation.isPending ? "Pensando…" : "Responder con Motor IQ"}
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              direction === "saliente"
                ? "Escribí tu respuesta… (se registra en la conversación)"
                : "Pegá acá lo que escribió el cliente…"
            }
            rows={2}
            className="min-h-10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
                sendMutation.mutate({ direction, body: body.trim() });
              }
            }}
          />
          <Button
            variant={direction === "saliente" ? "pops" : "secondary"}
            size="icon"
            aria-label="Registrar mensaje"
            disabled={!body.trim() || sendMutation.isPending}
            onClick={() => sendMutation.mutate({ direction, body: body.trim() })}
          >
            <Send />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Canal: {SOURCES[channel ?? "whatsapp"] ?? channel} · Ctrl+Enter para registrar. Motor IQ recalcula el score
          con cada mensaje.
        </p>
      </div>
    </div>
  );
}
