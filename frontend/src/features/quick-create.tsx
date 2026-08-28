import { AppointmentFormDialog } from "@/features/forms/appointment-form";
import { CustomerFormDialog } from "@/features/forms/customer-form";
import { FollowupFormDialog } from "@/features/forms/followup-form";
import { OpportunityFormDialog } from "@/features/forms/opportunity-form";
import { TaskFormDialog } from "@/features/forms/task-form";
import { VehicleFormDialog } from "@/features/forms/vehicle-form";
import { useUI } from "@/stores/ui";

/** Diálogos de alta rápida disponibles desde cualquier pantalla (topbar, palette, FAB). */
export function QuickCreateHost() {
  const { quickCreate, setQuickCreate } = useUI();
  const close = () => setQuickCreate(null);

  return (
    <>
      <CustomerFormDialog open={quickCreate === "customer"} onOpenChange={(o) => !o && close()} />
      <VehicleFormDialog open={quickCreate === "vehicle"} onOpenChange={(o) => !o && close()} />
      <FollowupFormDialog open={quickCreate === "followup"} onOpenChange={(o) => !o && close()} />
      <TaskFormDialog open={quickCreate === "task"} onOpenChange={(o) => !o && close()} />
      <OpportunityFormDialog open={quickCreate === "opportunity"} onOpenChange={(o) => !o && close()} />
      <AppointmentFormDialog open={quickCreate === "appointment"} onOpenChange={(o) => !o && close()} />
    </>
  );
}
