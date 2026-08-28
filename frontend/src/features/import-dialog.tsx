import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { ImportPreview, ImportResult } from "@/types/api";

const CUSTOMER_FIELDS: Record<string, string> = {
  "": "— Ignorar —",
  first_name: "Nombre",
  last_name: "Apellido",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  email: "Email",
  source: "Origen",
  budget: "Presupuesto",
  interest_brand: "Marca de interés",
  interest_model: "Modelo de interés",
  notes: "Notas",
};

const VEHICLE_FIELDS: Record<string, string> = {
  "": "— Ignorar —",
  brand: "Marca",
  model: "Modelo",
  version: "Versión",
  year: "Año",
  km: "Kilometraje",
  price: "Precio",
  cost: "Costo",
  plate: "Patente",
  fuel: "Combustible",
  transmission: "Transmisión",
  color: "Color",
  body_type: "Carrocería",
  description: "Descripción",
};

export function ImportDialog({
  entity,
  open,
  onOpenChange,
}: {
  entity: "customers" | "vehicles";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const fields = entity === "customers" ? CUSTOMER_FIELDS : VEHICLE_FIELDS;

  useEffect(() => {
    if (open) {
      setPreview(null);
      setMapping({});
      setResult(null);
    }
  }, [open]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.upload<ImportPreview>(`/import/${entity}/preview`, file),
    onSuccess: (data) => {
      setPreview(data);
      setMapping(data.suggested_mapping);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<ImportResult>(`/import/${entity}/commit`, { token: preview!.token, mapping }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: [entity === "customers" ? "customers" : "vehicles"] });
      toast.success(`${data.created} registros importados`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Importar {entity === "customers" ? "clientes" : "vehículos"} desde CSV</DialogTitle>
          <DialogDescription>
            Subí el archivo, revisá el mapeo de columnas y confirmá. Los duplicados se saltean y quedan reportados.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <button
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-14 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
            onClick={() => fileInput.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="size-6" />
            <span className="text-sm font-medium">
              {uploadMutation.isPending ? "Procesando…" : "Elegí un archivo CSV"}
            </span>
            <span className="text-xs">Separado por comas o punto y coma · máx. 5 MB</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </button>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
              <FileSpreadsheet className="size-8 text-score-cierre" />
              <div>
                <p className="font-semibold">
                  {result.created} creados · {result.skipped} salteados
                </p>
                <p className="text-sm text-muted-foreground">La importación terminó.</p>
              </div>
            </div>
            {result.errors.length ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs scrollbar-thin">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-muted-foreground">
                    {err}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {preview.total_rows} filas detectadas. Asigná cada columna del archivo a un campo de Motor IQ:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {preview.columns.map((column) => (
                <div key={column} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{column}</span>
                  <Select
                    value={mapping[column] ?? ""}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [column]: v === "__skip" ? "" : v }))}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(fields).map(([value, label]) => (
                        <SelectItem key={value || "__skip"} value={value || "__skip"}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.columns.slice(0, 6).map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sample_rows.map((row, i) => (
                    <TableRow key={i}>
                      {preview.columns.slice(0, 6).map((column) => (
                        <TableCell key={column} className="max-w-40 truncate text-xs">
                          {row[column]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          {preview && !result ? (
            <Button onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
              {commitMutation.isPending ? "Importando…" : `Importar ${preview.total_rows} filas`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
