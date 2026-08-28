import { CarFront } from "lucide-react";

import { cn } from "@/lib/utils";

export function VehicleThumb({
  url,
  title,
  className,
}: {
  url: string | null | undefined;
  title: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          className,
        )}
        aria-label={title}
      >
        <CarFront className="size-1/2 max-h-5" />
      </div>
    );
  }
  return (
    <img src={url} alt={title} loading="lazy" className={cn("shrink-0 rounded-md object-cover", className)} />
  );
}
