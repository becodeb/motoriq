import { useQuery } from "@tanstack/react-query";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentFormDialog } from "@/features/forms/appointment-form";
import { api } from "@/lib/api";
import { APPOINTMENT_TYPES, FOLLOWUP_TYPES } from "@/lib/constants";
import { dayKey, timeOnly, todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Appointment, Followup, Page, Task } from "@/types/api";

interface CalendarEvent {
  id: string;
  kind: "cita" | "seguimiento" | "tarea";
  time: string;
  title: string;
  subtitle: string | null;
  customerId: string | null;
  type: string;
  status: string;
}

const KIND_STYLE: Record<CalendarEvent["kind"], string> = {
  cita: "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
  seguimiento: "bg-pops-soft text-pops border-pops/30",
  tarea: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [createOpen, setCreateOpen] = useState(false);

  const rangeStart = new Date(Date.UTC(year, month, 1) - 7 * 86_400_000).toISOString();
  const rangeEnd = new Date(Date.UTC(year, month + 1, 7)).toISOString();

  const appointments = useQuery({
    queryKey: ["appointments", year, month],
    queryFn: () => api.get<Appointment[]>("/appointments", { date_from: rangeStart, date_to: rangeEnd }),
  });
  const followups = useQuery({
    queryKey: ["followups", "calendar"],
    queryFn: () => api.get<Page<Followup>>("/followups", { view: "proximos", page_size: 200 }),
  });
  const tasks = useQuery({
    queryKey: ["tasks", "calendar"],
    queryFn: () => api.get<Page<Task>>("/tasks", { view: "proximas", page_size: 200 }),
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const push = (event: CalendarEvent) => {
      const key = dayKey(event.time);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    };
    for (const a of appointments.data ?? []) {
      if (a.status === "cancelada") continue;
      push({
        id: a.id, kind: "cita", time: a.starts_at,
        title: a.title, subtitle: a.location,
        customerId: a.customer?.id ?? null, type: APPOINTMENT_TYPES[a.type] ?? a.type, status: a.status,
      });
    }
    for (const f of followups.data?.items ?? []) {
      push({
        id: f.id, kind: "seguimiento", time: f.due_at,
        title: `${FOLLOWUP_TYPES[f.type] ?? f.type}: ${f.customer.full_name}`, subtitle: f.note,
        customerId: f.customer.id, type: FOLLOWUP_TYPES[f.type] ?? f.type, status: f.status,
      });
    }
    for (const t of tasks.data?.items ?? []) {
      if (!t.due_at) continue;
      push({
        id: t.id, kind: "tarea", time: t.due_at,
        title: t.title, subtitle: t.customer?.full_name ?? null,
        customerId: t.customer?.id ?? null, type: "Tarea", status: t.status,
      });
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [appointments.data, followups.data, tasks.data]);

  // Grilla del mes (semanas empezando lunes)
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const navigateMonth = (delta: number) => {
    const date = new Date(year, month + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  };

  const loading = appointments.isPending || followups.isPending || tasks.isPending;
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const today = todayKey();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendario"
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => navigateMonth(-1)} aria-label="Mes anterior">
                <ChevronLeft />
              </Button>
              <span className="w-40 text-center font-display font-semibold">
                {MONTHS[month]} {year}
              </span>
              <Button variant="outline" size="icon-sm" onClick={() => navigateMonth(1)} aria-label="Mes siguiente">
                <ChevronRight />
              </Button>
            </div>
            <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
              <Plus /> Nueva cita
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="gap-0 overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7 gap-px p-px">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-none" />
              ))}
            </div>
          ) : (
            weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 border-b last:border-0">
                {week.map((day, dayIndex) => {
                  const events = day ? (eventsByDay.get(day) ?? []) : [];
                  return (
                    <button
                      key={dayIndex}
                      disabled={!day}
                      onClick={() => day && setSelectedDay(day)}
                      className={cn(
                        "flex min-h-24 flex-col items-stretch gap-1 border-r p-1.5 text-left align-top transition-colors last:border-r-0",
                        day ? "hover:bg-accent/50" : "bg-muted/20",
                        day === selectedDay && "bg-pops-soft/40",
                      )}
                    >
                      {day ? (
                        <>
                          <span
                            className={cn(
                              "self-start rounded-md px-1.5 text-xs font-semibold nums",
                              day === today ? "bg-pops text-pops-foreground" : "text-muted-foreground",
                            )}
                          >
                            {Number(day.slice(-2))}
                          </span>
                          <span className="flex flex-col gap-0.5 overflow-hidden">
                            {events.slice(0, 3).map((event) => (
                              <span
                                key={`${event.kind}-${event.id}`}
                                className={cn("truncate rounded border px-1 py-px text-[10px] font-medium", KIND_STYLE[event.kind])}
                              >
                                {timeOnly(event.time)} {event.title}
                              </span>
                            ))}
                            {events.length > 3 ? (
                              <span className="text-[10px] text-muted-foreground">+{events.length - 3} más</span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </Card>

        <Card className="gap-2 px-4 py-3.5">
          <p className="font-display font-semibold">
            {selectedDay === today ? "Hoy" : selectedDay.split("-").reverse().join("/")}
          </p>
          {selectedEvents.length ? (
            <div className="space-y-2">
              {selectedEvents.map((event) => (
                <button
                  key={`${event.kind}-${event.id}`}
                  className="flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:border-ring/50"
                  onClick={() => event.customerId && navigate(`/clientes/${event.customerId}`)}
                >
                  <span className="w-10 shrink-0 text-sm font-semibold nums">{timeOnly(event.time)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{event.title}</span>
                    {event.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">{event.subtitle}</span>
                    ) : null}
                    <span
                      className={cn("mt-1 inline-block rounded border px-1.5 py-px text-[10px] font-medium", KIND_STYLE[event.kind])}
                    >
                      {event.type}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarIcon}
              title="Día libre"
              description="Sin citas, seguimientos ni tareas para esta fecha."
              className="py-10"
            />
          )}
        </Card>
      </div>

      <AppointmentFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultDate={selectedDay} />
    </div>
  );
}
