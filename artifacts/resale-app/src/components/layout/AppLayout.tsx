import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Package, 
  List, 
  ShoppingCart, 
  Truck, 
  BarChart3, 
  Sparkles,
  Bot
} from 'lucide-react';
import { ReactNode } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/inventory', label: 'Inventory', icon: <Package size={20} /> },
  { path: '/listings', label: 'Listings', icon: <List size={20} /> },
  { path: '/orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
  { path: '/shipping', label: 'Shipping', icon: <Truck size={20} /> },
  { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  { path: '/ai-assistant', label: 'AI Assistant', icon: <Sparkles size={20} /> },
  { path: '/agent', label: 'Agent Hub', icon: <Bot size={20} /> },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 glass-card border-r border-border/50 flex flex-col fixed h-screen z-50">
        {/* Logo */}
        <div className="p-6 border-b border-border/50">
          <h1 
            className="font-pixel text-2xl text-primary text-glow-pink glitch-text" 
            data-text="ListFlow"
          >
            ListFlow
          </h1>
          <p className="text-xs text-muted-foreground mt-2 font-sans">AI Resale Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                  font-sans font-semibold text-sm
                  ${isActive 
                    ? 'bg-primary/20 text-primary neon-glow-pink border border-primary/50' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                  }
                `}
                data-testid={`nav-${item.path.slice(1) || 'dashboard'}`}
              >
                {isActive && <span className="text-primary animate-pulse">♥</span>}
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          <div className="glass-card p-3 rounded-lg">
            <p className="text-xs font-pixel text-accent text-glow-mint">★ Pro Seller ★</p>
            <p className="text-xs text-muted-foreground mt-1 font-sans">Level 47 Reseller</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
