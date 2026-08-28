import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MetricValue } from "@/types/api";

export function StatCard({
  label,
  value,
  metric,
  hint,
  invertDelta = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  metric?: MetricValue;
  hint?: string;
  /** true cuando bajar es bueno (ej: tiempo de respuesta). */
  invertDelta?: boolean;
  className?: string;
}) {
  const delta = metric?.delta_percent ?? null;
  const good = delta !== null && (invertDelta ? delta < 0 : delta > 0);
  const bad = delta !== null && delta !== 0 && !good;

  return (
    <Card className={cn("gap-1.5 px-4 py-3.5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-2xl font-bold nums leading-none">{value}</span>
        {delta !== null && delta !== 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium nums",
              good && "text-score-cierre",
              bad && "text-destructive",
            )}
          >
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
