import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QuickCreateHost } from "@/features/quick-create";
import { CommandPalette } from "@/layout/command-palette";
import { NAV_ITEMS } from "@/layout/nav";
import { useUnreadCount } from "@/layout/notifications-popover";
import { Sidebar, SidebarContent } from "@/layout/sidebar";
import { Topbar } from "@/layout/topbar";
import { useOrg } from "@/hooks/use-org";
import { useUI } from "@/stores/ui";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function AppLayout() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { setCommandOpen, setQuickCreate } = useUI();
  const unread = useUnreadCount();
  useOrg(); // configura moneda/locale/timezone apenas hay sesión

  // Atajos globales (§91): Ctrl+K, "/", "n", "g + letra".
  const pendingG = useRef(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (pendingG.current) {
        pendingG.current = false;
        const item = NAV_ITEMS.find((i) => i.shortcut === key);
        if (item) {
          event.preventDefault();
          navigate(item.to);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = true;
        setTimeout(() => (pendingG.current = false), 1200);
        return;
      }
      if (key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (key === "n") {
        event.preventDefault();
        setQuickCreate("customer");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, setCommandOpen, setQuickCreate]);

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar unreadCount={unread.data?.count ?? 0} />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navegación</SheetTitle>
            <SheetDescription>Menú principal de Motor IQ</SheetDescription>
          </SheetHeader>
          <SidebarContent unreadCount={unread.data?.count ?? 0} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[232px]">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-6">
          <Outlet />
        </main>
      </div>

      {/* FAB mobile (§90) */}
      <div className="fixed bottom-5 right-5 z-30 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="pops" size="icon" className="size-13 rounded-full shadow-xl" aria-label="Crear">
              <Plus className="size-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-44">
            <DropdownMenuItem onClick={() => setQuickCreate("customer")}>Cliente</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("vehicle")}>Vehículo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("followup")}>Seguimiento</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("task")}>Tarea</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickCreate("opportunity")}>Oportunidad</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette />
      <QuickCreateHost />
    </div>
  );
}
