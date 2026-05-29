import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ArrowLeftRight, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Transações", url: "/transacoes", icon: ArrowLeftRight },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Ajustes", url: "/configuracoes", icon: Settings },
];

export function MobileNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t pb-2 pt-1">
      <nav className="flex justify-around items-center h-14 px-2">
        {navItems.map((item) => {
          const isActive = path === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "relative flex flex-col items-center justify-center w-full h-full space-y-1",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground transition-colors"
              )}
            >
              <div className="relative">
                <item.icon className={cn("size-5 transition-transform duration-200", isActive && "scale-110")} />
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute -inset-2 bg-primary/10 rounded-full -z-10"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </div>
              <span className={cn("text-[10px] font-medium transition-all duration-200", isActive ? "opacity-100" : "opacity-80")}>
                {item.title}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
