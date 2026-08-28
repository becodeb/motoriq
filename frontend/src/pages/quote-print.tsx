import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrg } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { dateFull, money } from "@/lib/format";
import type { Quote } from "@/types/api";

/** Vista imprimible de cotización (§28). Ctrl+P o el botón → PDF del navegador. */
export function QuotePrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const org = useOrg();
  const query = useQuery({
    queryKey: ["quote", id],
    queryFn: () => api.get<Quote>(`/quotes/${id}`),
  });
  const quote = query.data;

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!quote) return <p className="p-8 text-center text-muted-foreground">Cotización no encontrada.</p>;

  const rows: [string, number][] = [
    [`${quote.vehicle.title} ${quote.vehicle.year}`, quote.price],
    ...(quote.discount ? ([["Descuento", -quote.discount]] as [string, number][]) : []),
    ...(quote.trade_in_value ? ([["Vehículo en parte de pago", -quote.trade_in_value]] as [string, number][]) : []),
    ...(quote.expenses ? ([["Gastos (gestoría y verificación)", quote.expenses]] as [string, number][]) : []),
  ];

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <div className="no-print mx-auto flex max-w-2xl items-center justify-between px-8 pt-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> Volver
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Imprimir / PDF
        </Button>
      </div>

      <div className="mx-auto max-w-2xl p-8">
        <header className="flex items-start justify-between border-b-2 border-zinc-900 pb-6">
          <div>
            <p className="font-display text-2xl font-extrabold tracking-tight">
              {org.data?.name ?? "Motor IQ"}
              <span className="text-[#e85d2c]">.</span>
            </p>
            <p className="mt-1 text-sm text-zinc-500">Cotización de vehículo</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-display text-xl font-bold">N.º {String(quote.number).padStart(4, "0")}</p>
            <p className="text-zinc-500">{dateFull(quote.created_at)}</p>
            {quote.valid_until ? <p className="text-zinc-500">Válida hasta {dateFull(quote.valid_until)}</p> : null}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Cliente</p>
            <p className="mt-1 font-semibold">{quote.customer.full_name}</p>
            {quote.customer.phone ? <p className="text-zinc-600">{quote.customer.phone}</p> : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Vendedor</p>
            <p className="mt-1 font-semibold">{quote.user?.full_name ?? "—"}</p>
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Concepto</th>
              <th className="py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i} className="border-b border-zinc-100">
                <td className="py-2.5">{label}</td>
                <td className="py-2.5 text-right tabular-nums">{money(value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 font-display text-lg font-bold">Total</td>
              <td className="py-3 text-right font-display text-lg font-bold tabular-nums">{money(quote.total)}</td>
            </tr>
          </tfoot>
        </table>

        {quote.financing ? (
          <section className="mt-6 rounded-lg border border-zinc-200 p-4 text-sm">
            <p className="font-semibold">Financiación propuesta</p>
            <p className="mt-1 text-zinc-600 tabular-nums">
              Anticipo {money(quote.financing.down_payment)} · {quote.financing.installments} cuotas de{" "}
              {money(quote.financing.monthly_payment)} (tasa {quote.financing.annual_rate}% anual)
            </p>
            <p className="mt-1 text-xs text-zinc-400">Simulación estimativa, sujeta a aprobación crediticia.</p>
          </section>
        ) : null}

        {quote.notes ? <p className="mt-6 text-sm text-zinc-600">{quote.notes}</p> : null}

        <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
          Cotización no vinculante. Precios sujetos a cambio sin previo aviso una vez vencida la validez.
        </footer>
      </div>
    </div>
  );
}
