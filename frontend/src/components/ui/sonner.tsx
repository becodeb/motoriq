import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useUI } from "@/stores/ui";

function Toaster(props: ToasterProps) {
  const theme = useUI((s) => s.theme);
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          border: "1px solid var(--border)",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
