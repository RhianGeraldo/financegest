import { Check, ChevronsUpDown, Building2, User } from "lucide-react";
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
  
  const getSelectedLabel = () => {
    if (selectedCompanyId === "all_clinica") return { name: "Consolidado Comercial", color: "var(--primary)" };
    if (selectedCompanyId === "all_pessoal") return { name: "Consolidado Pessoal", color: "#ec4899" };
    return companies.find((c) => c.id === selectedCompanyId) ?? { name: "Selecione…", color: "var(--muted-foreground)" };
  };
  const current = getSelectedLabel();

  const clinicas = companies.filter(c => c.kind === "clinica");
  const pessoais = companies.filter(c => c.kind === "pessoal");

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
      <DropdownMenuContent align="start" className="w-56 max-h-[80vh] overflow-y-auto">
        
        {clinicas.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <Building2 className="size-3"/> Comercial
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedCompanyId("all_clinica")} className="font-medium">
              Consolidado Comercial
              {selectedCompanyId === "all_clinica" && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {clinicas.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => setSelectedCompanyId(c.id)} className="pl-6">
                <span className="mr-2 size-2.5 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
                {selectedCompanyId === c.id && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
            {pessoais.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {pessoais.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <User className="size-3"/> Pessoal
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedCompanyId("all_pessoal")} className="font-medium">
              Consolidado Pessoal
              {selectedCompanyId === "all_pessoal" && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {pessoais.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => setSelectedCompanyId(c.id)} className="pl-6">
                <span className="mr-2 size-2.5 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
                {selectedCompanyId === c.id && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {companies.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma empresa cadastrada</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
