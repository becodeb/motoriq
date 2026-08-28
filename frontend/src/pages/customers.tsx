import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Bookmark, Download, Plus, Upload, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { CustomerStatusBadge, SourceBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { ScoreRingExplained } from "@/components/shared/score-ring";
import { UserChip } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerFormDialog } from "@/features/forms/customer-form";
import { ImportDialog } from "@/features/import-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { CUSTOMER_STATUS, SCORE_LABELS, SOURCES } from "@/lib/constants";
import { dateShort, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import type { Customer, Page, Segment } from "@/types/api";

const SMART_LISTS = [
  { label: "Todos", params: {} },
  { label: "🔥 Calientes", params: { score_label: "caliente" } },
  { label: "🚀 Cierre probable", params: { score_label: "cierre" } },
  { label: "Esperando respuesta", params: { awaiting_reply: "1" } },
  { label: "Seguimiento vencido", params: { followup: "vencido" } },
  { label: "Sin seguimiento", params: { followup: "sin" } },
] as const;

const FILTER_KEYS = ["q", "status", "source", "assigned_user_id", "score_label", "awaiting_reply", "followup", "order_by"];

export function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const team = useTeam();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebounce(searchInput, 300);

  const setFilter = (key: string, value: string | null) => {
    setPage(1);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const filters = {
    q: debouncedSearch || undefined,
    status: params.get("status") ?? undefined,
    source: params.get("source") ?? undefined,
    assigned_user_id: params.get("assigned_user_id") ?? undefined,
    score_label: params.get("score_label") ?? undefined,
    awaiting_reply: params.get("awaiting_reply") ? true : undefined,
    followup: params.get("followup") ?? undefined,
    order_by: params.get("order_by") ?? "-created_at",
  };

  const query = useQuery({
    queryKey: ["customers", filters, page],
    queryFn: () => api.get<Page<Customer>>("/customers", { ...filters, page, page_size: 25 }),
    placeholderData: (prev) => prev,
  });

  const segments = useQuery({
    queryKey: ["segments"],
    queryFn: () => api.get<Segment[]>("/segments"),
  });

  const saveSegment = useMutation({
    mutationFn: (name: string) => {
      const activeFilters: Record<string, string> = {};
      for (const key of FILTER_KEYS) {
        const value = params.get(key);
        if (value) activeFilters[key] = value;
      }
      if (debouncedSearch) activeFilters.q = debouncedSearch;
      return api.post("/segments", { name, filters: activeFilters });
    },
    onSuccess: () => {
      toast.success("Segmento guardado");
      void queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
  });

  const deleteSegment = useMutation({
    mutationFn: (id: string) => api.delete(`/segments/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["segments"] }),
  });

  const applySegment = (segment: Segment) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(segment.filters)) {
      if (typeof value === "string" && value) next.set(key, value);
      if (typeof value === "boolean" && value) next.set(key, "1");
    }
    setSearchInput((segment.filters.q as string) ?? "");
    setPage(1);
    setParams(next, { replace: true });
  };

  const orderBy = filters.order_by;
  const toggleSort = (column: string) => {
    const current = orderBy === `-${column}` ? column : orderBy === column ? `-${column}` : `-${column}`;
    setFilter("order_by", current);
  };
  const SortHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => toggleSort(column)}>
      {children}
      {orderBy === `-${column}` ? <ArrowDown className="size-3" /> : orderBy === column ? <ArrowUp className="size-3" /> : null}
    </button>
  );

  const columnHelper = createColumnHelper<Customer>();
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "cliente",
        header: () => <SortHeader column="first_name">Cliente</SortHeader>,
        cell: ({ row }) => (
          <div className="min-w-44">
            <p className="font-medium">{row.original.full_name}</p>
            <p className="text-xs text-muted-foreground">{row.original.phone ?? row.original.email ?? "—"}</p>
          </div>
        ),
      }),
      columnHelper.display({
        id: "score",
        header: () => <SortHeader column="lead_score">Score</SortHeader>,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ScoreRingExplained
              score={row.original.lead_score}
              label={row.original.score_label}
              reason={row.original.score_reason}
              factors={row.original.score_factors}
              size="sm"
            />
            <span className="hidden text-xs text-muted-foreground xl:inline">
              {SCORE_LABELS[row.original.score_label]?.emoji}
            </span>
          </div>
        ),
      }),
      columnHelper.display({
        id: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <CustomerStatusBadge status={row.original.status} />
            {row.original.awaiting_reply ? (
              <span className="text-[11px] font-medium text-pops">● espera respuesta</span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.display({
        id: "interes",
        header: "Interés",
        cell: ({ row }) => {
          const c = row.original;
          const interest =
            c.interested_vehicle?.title ?? [c.interest_brand, c.interest_model].filter(Boolean).join(" ");
          return <span className="line-clamp-1 max-w-44 text-sm">{interest || "—"}</span>;
        },
      }),
      columnHelper.display({
        id: "vendedor",
        header: "Vendedor",
        cell: ({ row }) => <UserChip user={row.original.assigned_user} />,
      }),
      columnHelper.display({
        id: "origen",
        header: "Origen",
        cell: ({ row }) => <SourceBadge source={row.original.source} />,
      }),
      columnHelper.display({
        id: "ultimo",
        header: () => <SortHeader column="last_contact_at">Últ. contacto</SortHeader>,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">{relative(row.original.last_contact_at)}</span>
        ),
      }),
      columnHelper.display({
        id: "seguimiento",
        header: () => <SortHeader column="next_followup_at">Próx. seguimiento</SortHeader>,
        cell: ({ row }) => {
          const next = row.original.next_followup_at;
          if (!next) return <span className="text-sm text-muted-foreground">—</span>;
          const overdue = new Date(next.endsWith("Z") ? next : next + "Z").getTime() < Date.now();
          return (
            <span className={cn("whitespace-nowrap text-sm nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
              {dateShort(next)} {overdue ? "· vencido" : ""}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "creado",
        header: () => <SortHeader column="created_at">Creado</SortHeader>,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground nums">{dateShort(row.original.created_at)}</span>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderBy],
  );

  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const activeSmartIndex = SMART_LISTS.findIndex((list) => {
    const keys = ["score_label", "awaiting_reply", "followup"] as const;
    return keys.every((key) => (params.get(key) ?? "") === ((list.params as Record<string, string>)[key] ?? ""));
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        subtitle={query.data ? `${query.data.total} registros` : undefined}
        actions={
          <>
            {isManager(user) ? (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload /> Importar
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                api.download("/customers/export", "clientes.csv").then(
                  () => toast.success("Exportación descargada"),
                  () => toast.error("No se pudo exportar"),
                )
              }
            >
              <Download /> Exportar
            </Button>
            <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
              <Plus /> Nuevo cliente
            </Button>
          </>
        }
      />

      {/* Smart lists (§83) + segmentos guardados (§82) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SMART_LISTS.map((list, index) => (
          <button
            key={list.label}
            onClick={() => {
              const next = new URLSearchParams();
              for (const [key, value] of Object.entries(list.params)) next.set(key, value);
              if (debouncedSearch) next.set("q", debouncedSearch);
              setPage(1);
              setParams(next, { replace: true });
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
              index === activeSmartIndex
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-ring/50 hover:text-foreground",
            )}
          >
            {list.label}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Bookmark /> Segmentos
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Filtros guardados</p>
            {segments.data?.length ? (
              segments.data.map((segment) => (
                <div key={segment.id} className="group flex items-center rounded-md hover:bg-accent">
                  <button className="flex-1 px-2 py-1.5 text-left text-sm" onClick={() => applySegment(segment)}>
                    {segment.name}
                  </button>
                  <button
                    className="px-2 text-xs text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={() => deleteSegment.mutate(segment.id)}
                  >
                    Borrar
                  </button>
                </div>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Todavía no guardaste segmentos.</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                const name = window.prompt("Nombre del segmento:");
                if (name?.trim()) saveSegment.mutate(name.trim());
              }}
            >
              Guardar filtros actuales
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre, teléfono o email…"
            className="w-64"
          />
          <Select value={params.get("status") ?? "all"} onValueChange={(v) => setFilter("status", v === "all" ? null : v)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(CUSTOMER_STATUS).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={params.get("source") ?? "all"} onValueChange={(v) => setFilter("source", v === "all" ? null : v)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los orígenes</SelectItem>
              {Object.entries(SOURCES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.get("assigned_user_id") ?? "all"}
            onValueChange={(v) => setFilter("assigned_user_id", v === "all" ? null : v)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el equipo</SelectItem>
              {(team.data ?? [])
                .filter((u) => u.is_active)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {query.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : query.data?.items.length ? (
          <>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clientes/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-3 pb-3">
              <Pager page={page} pageSize={25} total={query.data.total} onPageChange={setPage} />
            </div>
          </>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No hay clientes con estos filtros"
            description="Probá limpiar los filtros o creá el primer cliente."
            action={
              <Button variant="pops" onClick={() => setCreateOpen(true)}>
                <Plus /> Nuevo cliente
              </Button>
            }
          />
        )}
      </Card>

      <CustomerFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog entity="customers" open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
