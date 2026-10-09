import { Bell, Settings } from "lucide-react";
import { NavLink } from "react-router";

import { Logo } from "@/components/shared/logo";
import { UserAvatar } from "@/components/shared/user-chip";
import { useOrg } from "@/hooks/use-org";
import { NAV_GROUPS } from "@/layout/nav";
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
          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              isActive
                ? "bg-brand text-brand-foreground"
                : "text-sidebar-foreground/80 group-hover:text-foreground",
            )}
          >
            <Icon className="size-[17px]" />
          </span>
          <span className="truncate">{label}</span>
          {badge ? (
            <span className="ml-auto rounded-full bg-pops px-1.5 py-0.5 text-[10px] font-bold leading-none text-pops-foreground nums">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </>
      )}
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
  const org = useOrg();

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <NavLink to="/" onClick={onNavigate} className="flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <Logo subtitle={org.data?.name ?? "Sales Intelligence"} />
        </NavLink>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3" aria-label="Navegación principal">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 px-3 pb-3 pt-3">
        <SidebarLink to="/notificaciones" label="Notificaciones" icon={Bell} badge={unreadCount} onNavigate={onNavigate} />
        <SidebarLink to="/configuracion" label="Configuración" icon={Settings} onNavigate={onNavigate} />
        {user ? (
          <NavLink
            to="/configuracion/perfil"
            onClick={onNavigate}
            className="mt-2 flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-background/60 px-2.5 py-2 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <UserAvatar user={user} className="size-8 text-[11px]" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground">{user.full_name}</span>
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
    <aside className="dark fixed inset-y-0 left-0 z-30 hidden w-[256px] border-r border-sidebar-border bg-sidebar text-foreground lg:block">
      <SidebarContent unreadCount={unreadCount} />
    </aside>
  );
}
