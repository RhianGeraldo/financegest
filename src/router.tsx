import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutos de cache válido
        gcTime: 15 * 60 * 1000,    // 15 minutos de retenção em memória
        refetchOnWindowFocus: false, // Evita requisições no Supabase ao alternar abas
        refetchOnReconnect: false,   // Evita disparos em oscilações de conexão
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
