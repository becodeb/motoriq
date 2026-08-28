import { Bell, Settings } from "lucide-react";
import { NavLink } from "react-router";

import { UserAvatar } from "@/components/shared/user-chip";
import { NAV_ITEMS } from "@/layout/nav";
import { ROLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

function SidebarLink({
  to,
  label,
  icon: Icon,
  badge,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-pops px-1.5 py-0.5 text-[10px] font-bold leading-none text-pops-foreground nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export function SidebarContent({
  unreadCount,
  onNavigate,
}: {
  unreadCount: number;
  onNavigate?: () => void;
}) {
  const user = useAuth((s) => s.user);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-4 pt-5">
        <NavLink to="/" onClick={onNavigate} className="flex items-center gap-1 outline-none">
          <span className="font-display text-xl font-extrabold tracking-tight text-foreground">Motor IQ</span>
          <span className="mt-1.5 size-1.5 rounded-full bg-pops" />
        </NavLink>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin px-2.5" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-2.5 py-2.5">
        <SidebarLink to="/notificaciones" label="Notificaciones" icon={Bell} badge={unreadCount} onNavigate={onNavigate} />
        <SidebarLink to="/configuracion" label="Configuración" icon={Settings} onNavigate={onNavigate} />
        {user ? (
          <NavLink
            to="/configuracion/perfil"
            onClick={onNavigate}
            className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <UserAvatar user={user} className="size-7 text-[10px]" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">{user.full_name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{ROLES[user.role]}</span>
            </span>
          </NavLink>
        ) : null}
      </div>
    </div>
  );
}

export function Sidebar({ unreadCount }: { unreadCount: number }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-sidebar-border bg-sidebar lg:block">
      <SidebarContent unreadCount={unreadCount} />
    </aside>
  );
}
