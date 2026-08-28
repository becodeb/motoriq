import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SCORE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ScoreFactor } from "@/types/api";

const SIZES = {
  sm: { box: 30, stroke: 3, text: "text-[10px]" },
  md: { box: 42, stroke: 3.5, text: "text-[13px]" },
  lg: { box: 72, stroke: 5, text: "text-[22px]" },
} as const;

/** Firma visual de Motor IQ: tacómetro de intención 0–99 (§11, §12, §95). */
export function ScoreRing({
  score,
  label,
  size = "md",
  className,
}: {
  score: number;
  label: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { box, stroke, text } = SIZES[size];
  const radius = (box - stroke) / 2;
  // Arco estilo tacómetro: 270° de barrido, abierto abajo.
  const sweep = 0.75;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * sweep;
  const filled = arc * (Math.min(score, 99) / 99);
  const color = SCORE_LABELS[label]?.color ?? "var(--score-frio)";

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={`Score ${score} de 99 — ${SCORE_LABELS[label]?.label ?? label}`}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-[225deg]">
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <span className={cn("absolute font-display font-bold nums leading-none", text)} style={{ color }}>
        {score}
      </span>
    </div>
  );
}

/** Score con desglose al click: "¿Por qué 82?" (§95). */
export function ScoreRingExplained({
  score,
  label,
  reason,
  factors,
  size = "md",
}: {
  score: number;
  label: string;
  reason?: string | null;
  factors?: ScoreFactor[];
  size?: keyof typeof SIZES;
}) {
  const meta = SCORE_LABELS[label];
  return (
    <Popover>
      <PopoverTrigger
        className="cursor-pointer rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={(e) => e.stopPropagation()}
        aria-label={`¿Por qué ${score}?`}
      >
        <ScoreRing score={score} label={label} size={size} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {meta?.emoji} {meta?.label}
          </p>
          <span className="font-display text-sm font-bold nums">{score}/100</span>
        </div>
        {reason ? <p className="mt-1 text-xs text-muted-foreground">{reason}</p> : null}
        {factors && factors.length > 0 ? (
          <>
            <Separator className="my-2" />
            <ul className="space-y-1">
              {factors.map((factor, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{factor.label}</span>
                  <span
                    className={cn(
                      "font-medium nums",
                      factor.points > 0 ? "text-score-cierre" : "text-destructive",
                    )}
                  >
                    {factor.points > 0 ? "+" : ""}
                    {factor.points}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
