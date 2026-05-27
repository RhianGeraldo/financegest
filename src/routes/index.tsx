import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, session } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" />;
  return <Navigate to={session ? "/dashboard" : "/login"} />;
}
