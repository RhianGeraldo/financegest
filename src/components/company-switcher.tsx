import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";

export function CompanySwitcher() {
  const { companies, selectedCompanyId, setSelectedCompanyId } = useAuth();
  const current =
    selectedCompanyId === "all"
      ? { name: "Consolidado", color: "var(--primary)" }
      : companies.find((c) => c.id === selectedCompanyId) ?? { name: "Selecione…", color: "var(--muted-foreground)" };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9">
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: current.color }}
            />
            <span className="truncate text-sm">{current.name}</span>
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Empresa</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setSelectedCompanyId("all")}>
          <Layers className="mr-2 size-4" /> Consolidado
          {selectedCompanyId === "all" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => setSelectedCompanyId(c.id)}>
            <span className="mr-2 size-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            {selectedCompanyId === c.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        {companies.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma empresa cadastrada</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
