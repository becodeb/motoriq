import { useQuery } from "@tanstack/react-query";
import { CarFront, Plus, Target, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/use-debounce";
import { NAV_ITEMS } from "@/layout/nav";
import { api } from "@/lib/api";
import { useUI } from "@/stores/ui";
import type { GlobalSearchOut } from "@/types/search";

const KIND_ICON = { customer: UserRound, vehicle: CarFront, opportunity: Target } as const;
const KIND_ROUTE = { customer: "/clientes", vehicle: "/vehiculos", opportunity: "/oportunidades" } as const;

export function CommandPalette() {
  const navigate = useNavigate();
  const { commandOpen, setCommandOpen, setQuickCreate } = useUI();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);

  const results = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => api.get<GlobalSearchOut>("/search", { q: debounced }),
    enabled: commandOpen && debounced.trim().length >= 2,
    meta: { silent: true },
  });

  const close = () => {
    setCommandOpen(false);
    setSearch("");
  };

  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={(open) => (open ? setCommandOpen(true) : close())}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Buscar clientes, vehículos, patentes, teléfonos…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {debounced.trim().length >= 2 && !results.isFetching && !results.data?.results.length ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No encontramos clientes ni vehículos con esa búsqueda.</p>
        ) : null}

        {results.data?.results.length ? (
          <CommandGroup heading="Resultados">
            {results.data.results.map((result) => {
              const Icon = KIND_ICON[result.kind];
              return (
                <CommandItem
                  key={`${result.kind}-${result.id}`}
                  value={`${result.kind}-${result.id}`}
                  onSelect={() =>
                    run(() =>
                      navigate(
                        result.kind === "opportunity" ? KIND_ROUTE[result.kind] : `${KIND_ROUTE[result.kind]}/${result.id}`,
                      ),
                    )
                  }
                >
                  <Icon />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{result.title}</p>
                    {result.subtitle ? <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p> : null}
                  </div>
                  {result.extra ? <span className="text-xs text-muted-foreground nums">{result.extra}</span> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Acciones">
          <CommandItem onSelect={() => run(() => setQuickCreate("customer"))}>
            <Plus /> Nuevo cliente
          </CommandItem>
          <CommandItem onSelect={() => run(() => setQuickCreate("vehicle"))}>
            <Plus /> Nuevo vehículo
          </CommandItem>
          <CommandItem onSelect={() => run(() => setQuickCreate("followup"))}>
            <Plus /> Nuevo seguimiento
          </CommandItem>
          <CommandItem onSelect={() => run(() => setQuickCreate("task"))}>
            <Plus /> Nueva tarea
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/pipeline"))}>
            <Target /> Registrar venta (pipeline)
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Ir a">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.to} onSelect={() => run(() => navigate(item.to))}>
              <item.icon /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
