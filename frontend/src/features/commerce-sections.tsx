import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, FileText, Plus, Printer, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QuoteStatusBadge, ColorBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
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
import { Textarea } from "@/components/ui/textarea";
import { VehiclePicker } from "@/features/pickers";
import { api } from "@/lib/api";
import { TRADE_IN_STATUS } from "@/lib/constants";
import { dateShort, money } from "@/lib/format";
import type { Customer, Financing, FinancingSimulation, Quote, TradeIn } from "@/types/api";

const parseNumber = (value: string): number => {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ─────────────────────────── Cotizaciones (§28) ─────────────────────────── */

export function QuotesSection({ customer }: { customer: Customer }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(customer.interested_vehicle?.id ?? null);
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tradeInValue, setTradeInValue] = useState("0");
  const [expenses, setExpenses] = useState("350");
  const [validDays, setValidDays] = useState("7");
  const [notes, setNotes] = useState("");

  const quotes = useQuery({
    queryKey: ["quotes", customer.id],
    queryFn: () => api.get<Quote[]>("/quotes", { customer_id: customer.id }),
  });

  useEffect(() => {
    if (open) {
      setVehicleId(customer.interested_vehicle?.id ?? null);
      setPrice(customer.interested_vehicle ? String(customer.interested_vehicle.price) : "");
    }
  }, [open, customer]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Quote>("/quotes", {
        customer_id: customer.id,
        vehicle_id: vehicleId,
        price: parseNumber(price),
        discount: parseNumber(discount),
        trade_in_value: parseNumber(tradeInValue),
        expenses: parseNumber(expenses),
        notes: notes.trim() || null,
        valid_until: new Date(Date.now() + Number(validDays || 7) * 86_400_000).toISOString(),
      }),
    onSuccess: () => {
      toast.success("Cotización creada");
      setOpen(false);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["quotes", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-timeline", customer.id] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/quotes/${id}`, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["quotes", customer.id] }),
  });

  const total = parseNumber(price) - parseNumber(discount) - parseNumber(tradeInValue) + parseNumber(expenses);

  return (
    <Card className="gap-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" /> Cotizaciones
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> Nueva
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {quotes.data?.length ? (
          quotes.data.map((quote) => (
            <div key={quote.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  #{quote.number} · {quote.vehicle.title}
                </p>
                <p className="text-xs text-muted-foreground nums">
                  {money(quote.total)} · {dateShort(quote.created_at)}
                  {quote.valid_until ? ` · válida hasta ${dateShort(quote.valid_until)}` : ""}
                </p>
              </div>
              <QuoteStatusBadge status={quote.status} />
              <Select value={quote.status} onValueChange={(status) => updateStatus.mutate({ id: quote.id, status })}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["borrador", "enviada", "aceptada", "rechazada", "vencida"].map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Imprimir"
                onClick={() => window.open(`/cotizaciones/${quote.id}/imprimir`, "_blank")}
              >
                <Printer />
              </Button>
            </div>
          ))
        ) : (
          <EmptyState title="Sin cotizaciones" description="Generá la primera propuesta formal para este cliente." className="py-6" />
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
            <DialogDescription>El total se calcula automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Vehículo" required>
              <VehiclePicker
                value={vehicleId}
                onChange={(v) => {
                  setVehicleId(v);
                }}
                initialLabel={
                  customer.interested_vehicle
                    ? `${customer.interested_vehicle.title} ${customer.interested_vehicle.year}`
                    : undefined
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio" required>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Descuento">
                <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Valor permuta">
                <Input value={tradeInValue} onChange={(e) => setTradeInValue(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Gastos">
                <Input value={expenses} onChange={(e) => setExpenses(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Vigencia (días)">
                <Input value={validDays} onChange={(e) => setValidDays(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm font-medium">Total</span>
              <span className="font-display text-xl font-bold nums">{money(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} disabled={!vehicleId || !parseNumber(price) || create.isPending}>
              {create.isPending ? "Creando…" : "Crear cotización"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─────────────────────────── Financiación (§30) ─────────────────────────── */

export function FinancingSection({ customer }: { customer: Customer }) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(customer.interested_vehicle ? String(customer.interested_vehicle.price) : "");
  const [down, setDown] = useState("");
  const [installments, setInstallments] = useState("24");
  const [rate, setRate] = useState("38");
  const [simulation, setSimulation] = useState<FinancingSimulation | null>(null);

  const scenarios = useQuery({
    queryKey: ["financing", customer.id],
    queryFn: () => api.get<Financing[]>("/financing", { customer_id: customer.id }),
  });

  const simulate = useMutation({
    mutationFn: () =>
      api.post<FinancingSimulation>("/financing/simulate", {
        vehicle_price: parseNumber(price),
        down_payment: parseNumber(down),
        installments: Number(installments),
        annual_rate: Number(rate),
      }),
    onSuccess: setSimulation,
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<Financing>("/financing", {
        customer_id: customer.id,
        vehicle_id: customer.interested_vehicle?.id ?? null,
        vehicle_price: parseNumber(price),
        down_payment: parseNumber(down),
        installments: Number(installments),
        annual_rate: Number(rate),
      }),
    onSuccess: () => {
      toast.success("Escenario de financiación guardado");
      setSimulation(null);
      void queryClient.invalidateQueries({ queryKey: ["financing", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
    },
  });

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" /> Simulador de financiación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Precio">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Anticipo">
            <Input value={down} onChange={(e) => setDown(e.target.value)} inputMode="numeric" placeholder="40%" />
          </Field>
          <Field label="Cuotas">
            <Input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Tasa anual %">
            <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => simulate.mutate()}
            disabled={!parseNumber(price) || simulate.isPending}
          >
            {simulate.isPending ? "Calculando…" : "Simular"}
          </Button>
          {simulation ? (
            <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
              Guardar escenario
            </Button>
          ) : null}
        </div>
        {simulation ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted px-4 py-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Monto financiado</p>
              <p className="font-semibold nums">{money(simulation.financed_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cuota aprox.</p>
              <p className="font-display font-bold text-pops nums">{money(simulation.monthly_payment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total a pagar</p>
              <p className="font-semibold nums">{money(simulation.total_paid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Interés total</p>
              <p className="font-semibold nums">{money(simulation.total_interest)}</p>
            </div>
            <p className="col-span-full text-[11px] text-muted-foreground">{simulation.disclaimer}</p>
          </div>
        ) : null}

        {scenarios.data?.length ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Escenarios guardados</p>
            {scenarios.data.map((scenario) => (
              <div key={scenario.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {scenario.installments} cuotas · anticipo {money(scenario.down_payment)} · tasa {scenario.annual_rate}%
                </span>
                <span className="font-semibold nums">{money(scenario.monthly_payment)}/mes</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Permutas (§29) ─────────────────────────── */

export function TradeInSection({ customer }: { customer: Customer }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    brand: "", model: "", version: "", year: "", km: "", plate: "", condition: "",
    estimated_value: "", offered_value: "", notes: "",
  });

  const tradeIns = useQuery({
    queryKey: ["trade-ins", customer.id],
    queryFn: () => api.get<TradeIn[]>("/trade-ins", { customer_id: customer.id }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<TradeIn>("/trade-ins", {
        customer_id: customer.id,
        brand: form.brand.trim(),
        model: form.model.trim(),
        version: form.version.trim() || null,
        year: form.year ? Number(form.year) : null,
        km: form.km ? parseNumber(form.km) : null,
        plate: form.plate.trim() || null,
        condition: form.condition.trim() || null,
        estimated_value: form.estimated_value ? parseNumber(form.estimated_value) : null,
        offered_value: form.offered_value ? parseNumber(form.offered_value) : null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Permuta registrada");
      setOpen(false);
      setForm({ brand: "", model: "", version: "", year: "", km: "", plate: "", condition: "", estimated_value: "", offered_value: "", notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["trade-ins", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/trade-ins/${id}`, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["trade-ins", customer.id] }),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Card className="gap-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-muted-foreground" /> Vehículo en parte de pago
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> Registrar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {tradeIns.data?.length ? (
          tradeIns.data.map((tradeIn) => (
            <div key={tradeIn.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {tradeIn.brand} {tradeIn.model} {tradeIn.version ?? ""} {tradeIn.year ?? ""}
                </p>
                <p className="text-xs text-muted-foreground nums">
                  {tradeIn.km ? `${tradeIn.km.toLocaleString("es-AR")} km · ` : ""}
                  {tradeIn.offered_value
                    ? `Ofrecido: ${money(tradeIn.offered_value)}`
                    : tradeIn.estimated_value
                      ? `Estimado: ${money(tradeIn.estimated_value)}`
                      : "Sin tasación"}
                </p>
              </div>
              <ColorBadge color={TRADE_IN_STATUS[tradeIn.status]?.color ?? "zinc"}>
                {TRADE_IN_STATUS[tradeIn.status]?.label ?? tradeIn.status}
              </ColorBadge>
              <Select value={tradeIn.status} onValueChange={(status) => updateStatus.mutate({ id: tradeIn.id, status })}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRADE_IN_STATUS).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))
        ) : (
          <EmptyState
            title={customer.has_trade_in ? "Permuta mencionada pero sin tasar" : "Sin permuta registrada"}
            description={
              customer.has_trade_in
                ? "El cliente dijo que entrega su vehículo: registralo para tasarlo."
                : "Si el cliente entrega su usado, registralo acá."
            }
            className="py-6"
          />
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar permuta</DialogTitle>
            <DialogDescription>El vehículo que entrega {customer.first_name}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" required>
              <Input value={form.brand} onChange={set("brand")} />
            </Field>
            <Field label="Modelo" required>
              <Input value={form.model} onChange={set("model")} />
            </Field>
            <Field label="Versión">
              <Input value={form.version} onChange={set("version")} />
            </Field>
            <Field label="Año">
              <Input value={form.year} onChange={set("year")} inputMode="numeric" />
            </Field>
            <Field label="Kilómetros">
              <Input value={form.km} onChange={set("km")} inputMode="numeric" />
            </Field>
            <Field label="Patente">
              <Input value={form.plate} onChange={set("plate")} />
            </Field>
            <Field label="Valor estimado">
              <Input value={form.estimated_value} onChange={set("estimated_value")} inputMode="numeric" />
            </Field>
            <Field label="Valor ofrecido">
              <Input value={form.offered_value} onChange={set("offered_value")} inputMode="numeric" />
            </Field>
            <Field label="Estado general" className="col-span-2">
              <Input value={form.condition} onChange={set("condition")} placeholder="Muy bueno, detalles de uso…" />
            </Field>
            <Field label="Notas" className="col-span-2">
              <Textarea value={form.notes} onChange={set("notes")} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!form.brand.trim() || !form.model.trim() || create.isPending}
            >
              {create.isPending ? "Guardando…" : "Registrar permuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
