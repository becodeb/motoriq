import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreRing } from "@/components/shared/score-ring";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationThread } from "@/features/conversations/thread";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import { SOURCES } from "@/lib/constants";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conversation, Page } from "@/types/api";
import { Link } from "react-router";

/** Inbox unificado (§17): lista de conversaciones + hilo. */
export function ConversationsPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const [onlyAwaiting, setOnlyAwaiting] = useState(params.get("esperando") === "1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const preselectCustomer = params.get("cliente");

  const query = useQuery({
    queryKey: ["conversations", debounced, onlyAwaiting],
    queryFn: () =>
      api.get<Page<Conversation>>("/conversations", {
        q: debounced || undefined,
        awaiting_reply: onlyAwaiting ? true : undefined,
        page_size: 60,
      }),
    refetchInterval: 30_000,
  });

  // Si llega ?cliente=<id>, seleccionamos (o creamos) su conversación.
  const preselect = useQuery({
    queryKey: ["conversation-for-customer", preselectCustomer],
    queryFn: () => api.post<Conversation>("/conversations", { customer_id: preselectCustomer, channel: "whatsapp" }),
    enabled: Boolean(preselectCustomer),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (preselect.data) setSelectedId(preselect.data.id);
  }, [preselect.data]);

  const selected = useMemo(() => {
    const items = query.data?.items ?? [];
    return items.find((c) => c.id === selectedId) ?? preselect.data ?? null;
  }, [query.data, selectedId, preselect.data]);

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[480px] flex-col space-y-3">
      <PageHeader
        title="Conversaciones"
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyAwaiting}
              onChange={(e) => setOnlyAwaiting(e.target.checked)}
              className="size-4 accent-[var(--pops)]"
            />
            Solo esperando respuesta
          </label>
        }
      />

      <Card className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-[320px_1fr]">
        {/* Lista */}
        <div className={cn("flex min-h-0 flex-col border-r", selected && "hidden md:flex")}>
          <div className="border-b p-2.5">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversación…" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {query.isPending ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : query.data?.items.length ? (
              query.data.items.map((conversation) => (
                <button
                  key={conversation.id}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors last:border-0 hover:bg-accent/60",
                    selected?.id === conversation.id && "bg-accent",
                  )}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <ScoreRing score={conversation.customer.lead_score} label={conversation.customer.score_label} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{conversation.customer.full_name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relative(conversation.last_message_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {conversation.awaiting_reply ? <span className="size-1.5 shrink-0 rounded-full bg-pops" /> : null}
                      <span
                        className={cn(
                          "truncate text-xs",
                          conversation.awaiting_reply ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {conversation.last_message_direction === "saliente" ? "Vos: " : ""}
                        {conversation.last_message_preview ?? "Sin mensajes"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {SOURCES[conversation.channel] ?? conversation.channel}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Sin conversaciones"
                description="Registrá mensajes desde el perfil de un cliente y van a aparecer acá."
                className="py-14"
              />
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className={cn("min-h-0", !selected && "hidden md:block")}>
          {selected ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center gap-3 border-b px-4 py-2.5">
                <button className="text-sm text-muted-foreground md:hidden" onClick={() => setSelectedId(null)}>
                  ← Volver
                </button>
                <div className="min-w-0 flex-1">
                  <Link to={`/clientes/${selected.customer.id}`} className="truncate font-semibold hover:underline">
                    {selected.customer.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {SOURCES[selected.channel] ?? selected.channel} · score {selected.customer.lead_score}/100
                  </p>
                </div>
                <Link to={`/clientes/${selected.customer.id}`} className="text-sm text-pops hover:underline">
                  Ver perfil
                </Link>
              </div>
              <div className="min-h-0 flex-1">
                <ConversationThread conversationId={selected.id} channel={selected.channel} />
              </div>
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Elegí una conversación"
              description="Seleccioná un chat de la lista para leerlo y responder con ayuda de Motor IQ."
              className="h-full justify-center"
            />
          )}
        </div>
      </Card>
    </div>
  );
}
