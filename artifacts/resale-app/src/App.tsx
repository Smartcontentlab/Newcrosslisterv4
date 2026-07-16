import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';

import Dashboard from '@/pages/dashboard';
import Inventory from '@/pages/inventory';
import Listings from '@/pages/listings';
import Orders from '@/pages/orders';
import Shipping from '@/pages/shipping';
import Analytics from '@/pages/analytics';
import AiAssistant from '@/pages/ai-assistant';
import AgentHub from '@/pages/agent';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path="/inventory">
        <AppLayout><Inventory /></AppLayout>
      </Route>
      <Route path="/listings">
        <AppLayout><Listings /></AppLayout>
      </Route>
      <Route path="/orders">
        <AppLayout><Orders /></AppLayout>
      </Route>
      <Route path="/shipping">
        <AppLayout><Shipping /></AppLayout>
      </Route>
      <Route path="/analytics">
        <AppLayout><Analytics /></AppLayout>
      </Route>
      <Route path="/ai-assistant">
        <AppLayout><AiAssistant /></AppLayout>
      </Route>
      <Route path="/agent">
        <AppLayout><AgentHub /></AppLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
