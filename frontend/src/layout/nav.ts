import {
  BarChart3,
  Calendar,
  CarFront,
  CheckSquare,
  Home,
  Inbox,
  Kanban,
  ListChecks,
  MessageSquare,
  Radar,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string; // tecla para "g + <tecla>"
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Ventas",
    items: [
      { to: "/", label: "Inicio", icon: Home, shortcut: "i" },
      { to: "/leads", label: "Leads entrantes", icon: Inbox, shortcut: "l" },
      { to: "/clientes", label: "Clientes", icon: Users, shortcut: "c" },
      { to: "/pipeline", label: "Pipeline", icon: Kanban, shortcut: "p" },
      { to: "/conversaciones", label: "Conversaciones", icon: MessageSquare, shortcut: "m" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/seguimientos", label: "Seguimientos", icon: ListChecks, shortcut: "s" },
      { to: "/tareas", label: "Tareas", icon: CheckSquare, shortcut: "t" },
      { to: "/oportunidades", label: "Oportunidades", icon: Target, shortcut: "o" },
      { to: "/vehiculos", label: "Vehículos", icon: CarFront, shortcut: "v" },
      { to: "/calendario", label: "Calendario", icon: Calendar },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, shortcut: "a" },
      { to: "/inteligencia", label: "Radar IQ", icon: Radar, shortcut: "x" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
