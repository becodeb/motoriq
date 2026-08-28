import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  quickCreate: string | null; // "customer" | "vehicle" | "followup" | "task" | "opportunity"
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setQuickCreate: (kind: string | null) => void;
}

const storedTheme = ((): Theme => {
  try {
    const value = localStorage.getItem("pops-theme");
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
})();

export const useUI = create<UIState>((set, get) => ({
  theme: storedTheme,
  sidebarCollapsed: false,
  commandOpen: false,
  quickCreate: null,

  setTheme: (theme) => {
    try {
      if (theme === "system") localStorage.removeItem("pops-theme");
      else localStorage.setItem("pops-theme", theme);
    } catch {
      /* almacenamiento no disponible */
    }
    applyTheme(theme);
    set({ theme });
  },
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setQuickCreate: (quickCreate) => set({ quickCreate }),
}));

// Seguir el sistema cuando cambia
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useUI.getState();
  if (theme === "system") applyTheme("system");
});
