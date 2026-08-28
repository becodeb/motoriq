import { cloneElement, isValidElement, useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  error,
  required,
  hint,
  children,
  className,
}: {
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const generatedId = useId();

  // Asociar label ↔ control (§86): si el hijo es un único elemento, le inyectamos el id.
  let control = children;
  let controlId: string | undefined;
  if (isValidElement(children)) {
    const props = children.props as { id?: string; "aria-invalid"?: boolean };
    controlId = props.id ?? generatedId;
    control = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      id: controlId,
      "aria-invalid": error ? true : props["aria-invalid"],
      "aria-describedby": error ? `${controlId}-error` : undefined,
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={controlId}>
          {label}
          {required ? <span className="text-pops">*</span> : null}
        </Label>
      ) : null}
      {control}
      {error ? (
        <p id={controlId ? `${controlId}-error` : undefined} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
