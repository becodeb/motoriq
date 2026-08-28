import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { SourceBadge } from "@/components/shared/badges";
import { AXIS_PROPS, CHART, ChartCard, GRID_PROPS, PopsTooltip } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { UserAvatar } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { RANGE_OPTIONS, SOURCES } from "@/lib/constants";
import { money, num } from "@/lib/format";
import { isManager, useAuth } from "@/stores/auth";
import type {
  Forecast,
  Funnel,
  Overview,
  PriceInterestPoint,
  SellerStats,
  SourceStats,
  StockIntel,
  StockRecommendation,
  StockVehicleStat,
} from "@/types/api";

export function AnalyticsPage() {
  const user = useAuth((s) => s.user);
  const manager = isManager(user);
  const [range, setRange] = useState("30d");
  const [tab, setTab] = useState("general");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        subtitle={manager ? "Panel comercial de la agencia" : "Tus métricas comerciales"}
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manager ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  api.download("/analytics/sales/export", "ventas.csv").then(
                    () => toast.success("Ventas exportadas"),
                    () => toast.error("No se pudo exportar"),
                  )
                }
              >
                <Download /> Ventas CSV
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          {manager ? <TabsTrigger value="vendedores">Vendedores</TabsTrigger> : null}
          <TabsTrigger value="fuentes">Fuentes</TabsTrigger>
          <TabsTrigger value="stock">Stock Intelligence</TabsTrigger>
          <TabsTrigger value="precio">Precio vs interés</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <OverviewTab range={range} />
        </TabsContent>
        <TabsContent value="funnel">
          <FunnelTab />
        </TabsContent>
        {manager ? (
          <TabsContent value="vendedores">
            <SellersTab range={range} />
          </TabsContent>
        ) : null}
        <TabsContent value="fuentes">
          <SourcesTab />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab manager={manager} />
        </TabsContent>
        <TabsContent value="precio">
          <PriceInterestTab />
        </TabsContent>
        <TabsContent value="forecast">
          <ForecastTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ range }: { range: string }) {
  const query = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: () => api.get<Overview>("/analytics/overview", { range }),
  });
  const data = query.data;

  if (query.isPending)
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads" value={num(data.leads.value)} metric={data.leads} />
        <StatCard label="Contactados" value={num(data.contacted.value)} metric={data.contacted} />
        <StatCard label="Oportunidades" value={num(data.opportunities.value)} metric={data.opportunities} />
        <StatCard label="Reservas" value={num(data.reservations.value)} metric={data.reservations} />
        <StatCard label="Ventas" value={num(data.sales.value)} metric={data.sales} />
        <StatCard label="Facturación" value={money(data.revenue.value, true)} metric={data.revenue} />
        <StatCard label="Conversión" value={`${data.conversion_rate.value}%`} metric={data.conversion_rate} hint="ventas / leads del período" />
        <StatCard label="Ticket promedio" value={money(data.avg_ticket.value, true)} metric={data.avg_ticket} />
        <StatCard
          label="1.ª respuesta"
          value={`${Math.round(data.avg_first_response_minutes.value)} min`}
          metric={data.avg_first_response_minutes}
          invertDelta
        />
        <StatCard label="Días hasta venta" value={num(data.avg_days_to_sale.value, 1)} metric={data.avg_days_to_sale} invertDelta />
        <StatCard label="Seguimientos completados" value={num(data.followups_completed.value)} metric={data.followups_completed} />
        <StatCard label="Seguimientos vencidos (ahora)" value={num(data.followups_overdue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads por día" subtitle="Altas de clientes en el período">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.leads_by_day} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} />
              <Tooltip content={<PopsTooltip />} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke={CHART.c2}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Facturación por mes" subtitle="Ventas cerradas · últimos 6 meses">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.sales_by_month} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="month"
                {...AXIS_PROPS}
                tickFormatter={(v: string) => {
                  const [, m] = v.split("-");
                  return ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m)] ?? v;
                }}
              />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => money(v, true)} width={78} />
              <Tooltip
                content={
                  <PopsTooltip
                    formatter={(value, name) => (name === "Facturación" ? money(Number(value)) : String(value))}
                  />
                }
                cursor={{ fill: "var(--accent)" }}
              />
              <Bar dataKey="revenue" name="Facturación" fill={CHART.c3} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function FunnelTab() {
  const query = useQuery({
    queryKey: ["analytics-funnel"],
    queryFn: () => api.get<Funnel>("/analytics/funnel", { range: "ano" }),
  });
  const data = query.data;
  if (query.isPending) return <Skeleton className="h-96" />;
  if (!data || !data.total_leads)
    return <EmptyState title="Sin datos para el funnel" description="Cuando haya oportunidades en el período van a aparecer acá." className="py-16" />;

  const max = data.stages[0]?.count || 1;
  return (
    <div className="space-y-4">
      <Card className="gap-4 px-5 py-5">
        <div className="space-y-2.5">
          {data.stages.map((stage, index) => (
            <div key={stage.key}>
              {index > 0 && stage.rate_from_previous !== null ? (
                <p className="mb-1 pl-1 text-[11px] text-muted-foreground nums">↓ {stage.rate_from_previous}% pasa</p>
              ) : null}
              <div className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm font-medium">{stage.name}</span>
                <div className="h-8 flex-1 overflow-hidden rounded-md bg-muted">
                  <div
                    className="flex h-full items-center rounded-md px-2 transition-all"
                    style={{
                      width: `${Math.max(4, (stage.count / max) * 100)}%`,
                      background: CHART.c2,
                    }}
                  >
                    <span className="text-xs font-bold text-white nums">{num(stage.count)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground nums">
          Conversión total: <span className="font-semibold text-foreground">{data.overall_rate}%</span> ·{" "}
          {num(data.won)} ventas sobre {num(data.total_leads)} oportunidades (últimos 12 meses)
        </p>
      </Card>
    </div>
  );
}

function SellersTab({ range }: { range: string }) {
  const query = useQuery({
    queryKey: ["analytics-sellers", range],
    queryFn: () => api.get<SellerStats[]>("/analytics/sellers", { range }),
  });
  if (query.isPending) return <Skeleton className="h-80" />;
  if (!query.data?.length) return <EmptyState title="Sin vendedores activos" className="py-16" />;

  return (
    <Card className="gap-0 p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendedor</TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Contactados</TableHead>
            <TableHead>Oportunidades</TableHead>
            <TableHead>Ventas</TableHead>
            <TableHead>Facturación</TableHead>
            <TableHead>Conversión</TableHead>
            <TableHead>1.ª respuesta</TableHead>
            <TableHead>Seg. completados</TableHead>
            <TableHead>Seg. vencidos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.map((seller) => (
            <TableRow key={seller.user_id}>
              <TableCell>
                <span className="flex items-center gap-2 font-medium">
                  <UserAvatar user={{ full_name: seller.full_name, avatar_color: seller.avatar_color }} className="size-6 text-[9px]" />
                  {seller.full_name}
                </span>
              </TableCell>
              <TableCell className="nums">{seller.leads}</TableCell>
              <TableCell className="nums">{seller.contacted}</TableCell>
              <TableCell className="nums">{seller.opportunities}</TableCell>
              <TableCell className="font-semibold nums">{seller.sales}</TableCell>
              <TableCell className="nums">{money(seller.revenue, true)}</TableCell>
              <TableCell className="nums">{seller.conversion_rate}%</TableCell>
              <TableCell className="nums">
                {seller.avg_first_response_minutes != null ? `${Math.round(seller.avg_first_response_minutes)} min` : "—"}
              </TableCell>
              <TableCell className="nums">{seller.followups_completed}</TableCell>
              <TableCell className={seller.followups_overdue ? "font-semibold text-destructive nums" : "nums"}>
                {seller.followups_overdue}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Pensado para gestión comercial: dónde ayudar, no a quién vigilar (§37).
      </p>
    </Card>
  );
}

function SourcesTab() {
  const query = useQuery({
    queryKey: ["analytics-sources"],
    queryFn: () => api.get<SourceStats[]>("/analytics/sources", { range: "ano" }),
  });
  if (query.isPending) return <Skeleton className="h-80" />;
  if (!query.data?.length) return <EmptyState title="Sin datos de fuentes" className="py-16" />;

  const chartData = query.data.map((s) => ({ ...s, label: SOURCES[s.source] ?? s.source }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <ChartCard title="Leads por fuente" subtitle="Últimos 12 meses">
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
            <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
            <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={100} />
            <Tooltip content={<PopsTooltip />} cursor={{ fill: "var(--accent)" }} />
            <Bar dataKey="leads" name="Leads" fill={CHART.c2} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card className="gap-0 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fuente</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Ventas</TableHead>
              <TableHead>Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((source) => (
              <TableRow key={source.source}>
                <TableCell>
                  <SourceBadge source={source.source} />
                </TableCell>
                <TableCell className="nums">{source.leads}</TableCell>
                <TableCell className="nums">{source.sales}</TableCell>
                <TableCell className="font-medium nums">{source.conversion_rate}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StockList({ title, items, metric }: { title: string; items: StockVehicleStat[]; metric: (s: StockVehicleStat) => string }) {
  return (
    <Card className="gap-2 px-4 py-3.5">
      <p className="font-semibold">{title}</p>
      {items.length ? (
        <div className="space-y-1.5">
          {items.slice(0, 6).map((stat) => (
            <div key={stat.vehicle.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {stat.vehicle.title} {stat.vehicle.year}
              </span>
              <span className="shrink-0 font-medium text-muted-foreground nums">{metric(stat)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
      )}
    </Card>
  );
}

function StockTab({ manager }: { manager: boolean }) {
  const query = useQuery({
    queryKey: ["analytics-stock"],
    queryFn: () => api.get<StockIntel>("/analytics/stock"),
  });
  const recommendations = useQuery({
    queryKey: ["stock-recommendations"],
    queryFn: () => api.get<StockRecommendation[]>("/analytics/stock/recommendations"),
    enabled: manager,
  });
  const data = query.data;
  if (query.isPending) return <Skeleton className="h-96" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {manager && recommendations.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {recommendations.data.map((rec, i) => (
            <Card key={i} className="gap-1.5 border-pops/30 px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-pops">💰 {rec.metric ?? "Oportunidad"}</p>
              <p className="font-semibold leading-snug">{rec.title}</p>
              <p className="text-sm text-muted-foreground">{rec.detail}</p>
              <p className="text-xs text-muted-foreground">{rec.reason}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Días promedio en stock" value={num(data.avg_days_in_stock, 1)} />
        <StatCard label="Días promedio (vendidos)" value={data.avg_days_sold != null ? num(data.avg_days_sold, 1) : "—"} />
        <StatCard label="Modelos con demanda" value={num(data.most_inquired.filter((s) => s.inquiries >= 2).length)} />
        <StatCard label="Vehículos estancados" value={num(data.stale.length)} hint="60+ días y baja demanda" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StockList title="🚗 Más consultados" items={data.most_inquired} metric={(s) => `${s.inquiries} consultas`} />
        <StockList title="⚡ Se vendieron más rápido" items={data.fastest_sold} metric={(s) => `${s.days_in_stock} días`} />
        <StockList
          title="🎯 Mejor conversión"
          items={data.best_conversion}
          metric={(s) => (s.conversion_rate != null ? `${Math.round(s.conversion_rate * 100)}%` : "—")}
        />
        <StockList title="📉 Estancados" items={data.stale} metric={(s) => `${s.days_in_stock} días · ${s.inquiries} consultas`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Consultas por marca">
          <ResponsiveContainer width="100%" height={Math.max(200, data.inquiries_by_brand.length * 34)}>
            <BarChart data={data.inquiries_by_brand} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
              <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={92} />
              <Tooltip content={<PopsTooltip />} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="inquiries" name="Consultas" fill={CHART.c2} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Consultas por rango de precio">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.inquiries_by_price_range} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="range" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} />
              <Tooltip content={<PopsTooltip />} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="inquiries" name="Consultas" fill={CHART.c1} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function PriceInterestTab() {
  const query = useQuery({
    queryKey: ["analytics-price-interest"],
    queryFn: () => api.get<{ points: PriceInterestPoint[]; insight: string | null }>("/analytics/price-interest"),
  });
  const data = query.data;
  if (query.isPending) return <Skeleton className="h-80" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.insight ? (
        <Card className="border-pops/30 px-4 py-3">
          <p className="text-sm">💡 {data.insight}</p>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Consultas por rango de precio">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="range_label" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} />
              <Tooltip content={<PopsTooltip />} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="inquiries" name="Consultas" fill={CHART.c1} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Días promedio en stock por rango" subtitle="Mismos rangos de precio — menor es mejor">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="range_label" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} />
              <Tooltip content={<PopsTooltip />} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="avg_days_in_stock" name="Días en stock" fill={CHART.c2} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card className="gap-0 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rango</TableHead>
              <TableHead>Vehículos</TableHead>
              <TableHead>Consultas</TableHead>
              <TableHead>Ventas</TableHead>
              <TableHead>Días prom.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.points.map((point) => (
              <TableRow key={point.range_label}>
                <TableCell className="font-medium nums">{point.range_label}</TableCell>
                <TableCell className="nums">{point.vehicles}</TableCell>
                <TableCell className="nums">{point.inquiries}</TableCell>
                <TableCell className="nums">{point.sales}</TableCell>
                <TableCell className="nums">{point.avg_days_in_stock ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ForecastTab() {
  const query = useQuery({
    queryKey: ["analytics-forecast"],
    queryFn: () => api.get<Forecast>("/analytics/forecast"),
  });
  const data = query.data;
  if (query.isPending) return <Skeleton className="h-80" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pipeline abierto" value={money(data.pipeline_total, true)} />
        <StatCard label="Forecast ponderado" value={<span className="text-pops">{money(data.weighted_forecast, true)}</span>} />
        <StatCard label="Cierres estimados 30 días" value={num(data.expected_closes_30d)} />
      </div>
      <ChartCard title="Pipeline por etapa" subtitle="Total abierto vs ponderado por probabilidad">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.by_stage} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="name" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => money(v, true)} width={72} />
            <Tooltip
              content={<PopsTooltip formatter={(value) => money(Number(value))} />}
              cursor={{ fill: "var(--accent)" }}
            />
            <Bar dataKey="total" name="Total" fill={CHART.c2} radius={[4, 4, 0, 0]} maxBarSize={34} />
            <Bar dataKey="weighted" name="Ponderado" fill={CHART.c1} radius={[4, 4, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 px-2 pb-1 pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CHART.c2 }} /> Total abierto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CHART.c1 }} /> Ponderado
          </span>
        </div>
      </ChartCard>
      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
    </div>
  );
}
