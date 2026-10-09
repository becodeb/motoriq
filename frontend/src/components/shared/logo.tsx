import { cn } from "@/lib/utils";

/** Isotipo de Motor IQ: tacómetro estilizado sobre el amarillo de marca. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-brand-foreground",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <path d="M4.5 16.5a8 8 0 1 1 15 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 14.5 16 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="14.5" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
  subtitle,
  inverted = false,
}: {
  className?: string;
  markClassName?: string;
  subtitle?: React.ReactNode;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            "block font-display text-[17px] font-extrabold tracking-tight",
            inverted ? "text-white" : "text-foreground",
          )}
        >
          Motor <span className={inverted ? "text-brand" : "text-highlight"}>IQ</span>
        </span>
        {subtitle ? (
          <span
            className={cn(
              "block truncate text-[11px] font-medium",
              inverted ? "text-white/55" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
