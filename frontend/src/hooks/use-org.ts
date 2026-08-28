import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "@/lib/api";
import { configureFormat } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import type { Organization, Stage, UserOut } from "@/types/api";

export function useOrg() {
  const status = useAuth((s) => s.status);
  const query = useQuery({
    queryKey: ["organization"],
    queryFn: () => api.get<Organization>("/organization"),
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (query.data) configureFormat(query.data);
  }, [query.data]);

  return query;
}

export function useStages() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: () => api.get<Stage[]>("/pipeline-stages"),
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
  });
}

export function useTeam() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserOut[]>("/users"),
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
  });
}
