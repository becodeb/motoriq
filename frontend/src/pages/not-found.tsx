import { Compass } from "lucide-react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={Compass}
      title="Esta página no existe"
      description="El enlace puede estar vencido o mal escrito."
      action={<Button onClick={() => navigate("/")}>Ir al inicio</Button>}
      className="py-24"
    />
  );
}
