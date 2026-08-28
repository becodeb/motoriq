import { create } from "zustand";

import { api, bindAuthHandlers, setAccessToken } from "@/lib/api";
import type { UserOut } from "@/types/api";

interface AuthState {
  user: UserOut | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setUser: (user: UserOut) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  login: async (email, password) => {
    const data = await api.post<{ access_token: string; user: UserOut }>("/auth/login", { email, password });
    setAccessToken(data.access_token);
    set({ user: data.user, status: "authenticated" });
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* la sesión local se limpia igual */
    }
    setAccessToken(null);
    set({ user: null, status: "anonymous" });
  },

  bootstrap: async () => {
    bindAuthHandlers({
      onSessionExpired: () => {
        setAccessToken(null);
        set({ user: null, status: "anonymous" });
      },
      onTokenRefreshed: (_token, user) => set({ user, status: "authenticated" }),
    });
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("no session");
      const data = (await res.json()) as { access_token: string; user: UserOut };
      setAccessToken(data.access_token);
      set({ user: data.user, status: "authenticated" });
    } catch {
      set({ status: "anonymous" });
    }
  },

  setUser: (user) => set({ user }),
}));

export const isManager = (user: UserOut | null) => user?.role === "admin" || user?.role === "gerente";
