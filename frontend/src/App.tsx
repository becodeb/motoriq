import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/layout/app-layout";
import { queryClient } from "@/lib/query";
import { AnalyticsPage } from "@/pages/analytics";
import { CalendarPage } from "@/pages/calendar";
import { ConversationsPage } from "@/pages/conversations";
import { CustomerDetailPage } from "@/pages/customer-detail";
import { CustomersPage } from "@/pages/customers";
import { DashboardPage } from "@/pages/dashboard";
import { FollowupsPage } from "@/pages/followups";
import { IntelligencePage } from "@/pages/intelligence";
import { LeadsPage } from "@/pages/leads";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { NotificationsPage } from "@/pages/notifications";
import { OpportunitiesPage } from "@/pages/opportunities";
import { PipelinePage } from "@/pages/pipeline";
import { QuotePrintPage } from "@/pages/quote-print";
import { SettingsPage } from "@/pages/settings";
import { TasksPage } from "@/pages/tasks";
import { VehicleDetailPage } from "@/pages/vehicle-detail";
import { VehiclesPage } from "@/pages/vehicles";
import { useAuth } from "@/stores/auth";

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        Motor IQ
        <span className="size-2 rounded-full bg-pops anim-pulse-dot" />
      </div>
    </div>
  );
}

function RequireAuth() {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "anonymous") return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/cotizaciones/:id/imprimir" element={<QuotePrintPage />} />
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="leads" element={<LeadsPage />} />
                <Route path="clientes" element={<CustomersPage />} />
                <Route path="clientes/:id" element={<CustomerDetailPage />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="conversaciones" element={<ConversationsPage />} />
                <Route path="seguimientos" element={<FollowupsPage />} />
                <Route path="tareas" element={<TasksPage />} />
                <Route path="oportunidades" element={<OpportunitiesPage />} />
                <Route path="vehiculos" element={<VehiclesPage />} />
                <Route path="vehiculos/:id" element={<VehicleDetailPage />} />
                <Route path="calendario" element={<CalendarPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="inteligencia" element={<IntelligencePage />} />
                <Route path="notificaciones" element={<NotificationsPage />} />
                <Route path="configuracion/*" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
