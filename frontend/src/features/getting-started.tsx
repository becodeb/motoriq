import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CarFront, Check, Sparkles, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

const DISMISS_KEY = "motoriq-getting-started-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

interface Step {
  key: string;
  icon: typeof Users;
  title: string;
  text: string;
  cta: string;
  done: boolean;
  onClick: () => void;
}

/** Guía de arranque para una agencia nueva: desaparece sola cuando ya hay equipo, stock y clientes. */
export function GettingStarted() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const setQuickCreate = useUI((s) => s.setQuickCreate);
  const [dismissed, setDismissed] = useState(readDismissed);
  const manager = isManager(user);

  const customers = useQuery({
    queryKey: ["customers", "count"],
    queryFn: () => api.get<{ total: number }>("/customers", { page_size: 1 }),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", "count"],
    queryFn: () => api.get<{ total: number }>("/vehicles", { page_size: 1 }),
  });
  const team = useTeam();

  if (dismissed || customers.isPending || vehicles.isPending || team.isPending) return null;

  const steps: Step[] = [
    ...(user?.role === "admin"
      ? [
          {
            key: "agencia",
            icon: Building2,
            title: "Personalizá tu agencia",
            text: "Nombre, moneda, zona horaria y logo.",
            cta: "Configurar",
            done: false,
            onClick: () => navigate("/configuracion/agencia"),
          },
        ]
      : []),
    ...(manager
      ? [
          {
            key: "equipo",
            icon: UserPlus,
            title: "Sumá a tu equipo",
            text: "Creá usuarios para gerentes y vendedores.",
            cta: "Invitar",
            done: (team.data?.length ?? 0) > 1,
            onClick: () => navigate("/configuracion/usuarios"),
          },
        ]
      : []),
    {
      key: "stock",
      icon: CarFront,
      title: "Cargá tu stock",
      text: "Cada vehículo nuevo se cruza solo con los clientes interesados.",
      cta: "Agregar vehículo",
      done: (vehicles.data?.total ?? 0) > 0,
      onClick: () => setQuickCreate("vehicle"),
    },
    {
      key: "clientes",
      icon: Users,
      title: "Registrá tus clientes",
      text: "Uno por uno o importando un CSV desde Clientes.",
      cta: "Agregar cliente",
      done: (customers.data?.total ?? 0) > 0,
      onClick: () => setQuickCreate("customer"),
    },
  ];

  const trackable = steps.filter((s) => s.key !== "agencia");
  if (trackable.every((s) => s.done)) return null;
  const completed = steps.filter((s) => s.done).length;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* almacenamiento no disponible */
    }
    setDismissed(true);
  };

  return (
    <Card className="relative gap-5 overflow-hidden px-5 py-5 sm:px-6">
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-pops">
            <Sparkles className="size-3.5" /> Primeros pasos
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Dejá tu agencia lista para vender</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {completed} de {steps.length} completados — Motor IQ empieza a recomendar en cuanto haya datos reales.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Ocultar primeros pasos">
          <X />
        </Button>
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand transition-all dark:bg-brand"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      <div className={cn("relative grid gap-3 sm:grid-cols-2", steps.length >= 4 && "xl:grid-cols-4")}>
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-background/60 p-4 transition-colors",
              step.done ? "border-score-cierre/30" : "hover:border-pops/30",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-xl",
                step.done ? "bg-score-cierre/12 text-score-cierre" : "bg-pops-soft text-pops",
              )}
            >
              {step.done ? <Check className="size-[18px]" /> : <step.icon className="size-[18px]" />}
            </span>
            <div className="flex-1">
              <p className={cn("text-sm font-semibold", step.done && "text-muted-foreground line-through")}>{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
            {!step.done ? (
              <Button size="sm" variant="outline" className="w-fit" onClick={step.onClick}>
                {step.cta} <ArrowRight />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
