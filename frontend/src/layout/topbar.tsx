import { LogOut, Menu, Plus, Search, Settings, UserRound } from "lucide-react";
import { useNavigate } from "react-router";

import { UserAvatar } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsBell } from "@/layout/notifications-popover";
import { ThemeToggle } from "@/layout/theme-toggle";
import { useAuth } from "@/stores/auth";
import { useUI } from "@/stores/ui";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setCommandOpen = useUI((s) => s.setCommandOpen);
  const setQuickCreate = useUI((s) => s.setQuickCreate);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Abrir menú">
        <Menu />
      </Button>

      <button
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Search className="size-4" />
        <span className="truncate">Buscar clientes, vehículos, teléfonos…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="pops" size="sm" className="hidden sm:inline-flex">
              <Plus /> Nuevo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setQuickCreate("customer")}>
              Cliente <DropdownMenuShortcut>N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("vehicle")}>Vehículo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("followup")}>Seguimiento</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("task")}>Tarea</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("opportunity")}>Oportunidad</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("appointment")}>Cita</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
        <NotificationsBell />

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <UserAvatar user={user} className="size-8 text-[11px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block text-sm font-medium text-foreground">{user.full_name}</span>
                <span className="block text-xs font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/configuracion/perfil")}>
                <UserRound /> Mi perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/configuracion")}>
                <Settings /> Configuración
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
              >
                <LogOut /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
