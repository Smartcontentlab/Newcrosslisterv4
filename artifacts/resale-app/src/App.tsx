import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Listings from "@/pages/listings";
import Orders from "@/pages/orders";
import Shipping from "@/pages/shipping";
import Analytics from "@/pages/analytics";
import AiAssistant from "@/pages/ai-assistant";
import AgentHub from "@/pages/agent";
import ListingStudio from "@/pages/listing-studio";
import Connections from "@/pages/connections";
import SettingsPage from "@/pages/settings";
import Help from "@/pages/help";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

function WorkspaceRoutes() {
  return (
    <Switch>
      <Route path="/"><AppLayout><Dashboard /></AppLayout></Route>
      <Route path="/inventory"><AppLayout><Inventory /></AppLayout></Route>
      <Route path="/listing-studio"><AppLayout><ListingStudio /></AppLayout></Route>
      <Route path="/listings"><AppLayout><Listings /></AppLayout></Route>
      <Route path="/orders"><AppLayout><Orders /></AppLayout></Route>
      <Route path="/shipping"><AppLayout><Shipping /></AppLayout></Route>
      <Route path="/analytics"><AppLayout><Analytics /></AppLayout></Route>
      <Route path="/ai-assistant"><AppLayout><AiAssistant /></AppLayout></Route>
      <Route path="/agent"><AppLayout><AgentHub /></AppLayout></Route>
      <Route path="/connections"><AppLayout><Connections /></AppLayout></Route>
      <Route path="/settings"><AppLayout><SettingsPage /></AppLayout></Route>
      <Route path="/help"><AppLayout><Help /></AppLayout></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApplication() {
  const { ready, user } = useAuth();
  useEffect(() => { queryClient.clear(); }, [user?.id]);

  if (!ready) {
    return <main className="flex min-h-[100dvh] items-center justify-center bg-background font-mono text-sm text-muted-foreground" role="status"><span className="cx-status-dot mr-3" />Initializing secure workspace…</main>;
  }
  return user ? <WorkspaceRoutes /> : <AuthPage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
        <AuthProvider><AuthenticatedApplication /></AuthProvider>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
