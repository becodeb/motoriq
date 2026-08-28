import { cn } from "@/lib/utils";
import {
  COLOR_BADGE,
  CUSTOMER_STATUS,
  HEALTH,
  PRIORITIES,
  QUOTE_STATUS,
  SOURCES,
  VEHICLE_STATUS,
} from "@/lib/constants";
import type { Stage } from "@/types/api";

export function ColorBadge({
  color,
  children,
  className,
}: {
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        COLOR_BADGE[color] ?? COLOR_BADGE.zinc,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <ColorBadge color={stage.color} className={className}>
      {stage.name}
    </ColorBadge>
  );
}

export function CustomerStatusBadge({ status }: { status: string }) {
  const meta = CUSTOMER_STATUS[status] ?? { label: status, color: "zinc" };
  return <ColorBadge color={meta.color}>{meta.label}</ColorBadge>;
}

export function VehicleStatusBadge({ status }: { status: string }) {
  const meta = VEHICLE_STATUS[status] ?? { label: status, color: "zinc" };
  return <ColorBadge color={meta.color}>{meta.label}</ColorBadge>;
}

export function QuoteStatusBadge({ status }: { status: string }) {
  const meta = QUOTE_STATUS[status] ?? { label: status, color: "zinc" };
  return <ColorBadge color={meta.color}>{meta.label}</ColorBadge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITIES[priority] ?? { label: priority, color: "zinc" };
  return <ColorBadge color={meta.color}>{meta.label}</ColorBadge>;
}

export function SourceBadge({ source }: { source: string }) {
  return <ColorBadge color="zinc">{SOURCES[source] ?? source}</ColorBadge>;
}

export function HealthDot({ health, withLabel = false }: { health: string; withLabel?: boolean }) {
  const meta = HEALTH[health] ?? HEALTH.yellow;
  return (
    <span className="inline-flex items-center gap-1.5" title={meta.label}>
      <span className={cn("size-2 shrink-0 rounded-full", meta.className)} />
      {withLabel ? <span className="text-xs text-muted-foreground">{meta.label}</span> : null}
    </span>
  );
}
