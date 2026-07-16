import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Package, 
  List, 
  ShoppingCart, 
  Truck, 
  BarChart3, 
  Sparkles,
  Bot,
  Zap
} from 'lucide-react';
import { ReactNode } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { path: '/inventory', label: 'Inventory', icon: <Package size={18} /> },
  { path: '/listings', label: 'Listings', icon: <List size={18} /> },
  { path: '/orders', label: 'Orders', icon: <ShoppingCart size={18} /> },
  { path: '/shipping', label: 'Fulfillment', icon: <Truck size={18} /> },
  { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { path: '/ai-assistant', label: 'AI Assistant', icon: <Sparkles size={18} /> },
  { path: '/agent', label: 'Agent Hub', icon: <Bot size={18} /> },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 glass-card border-r border-border flex flex-col fixed h-screen z-50">
        {/* Logo */}
        <div className="p-6 border-b border-border/50 bg-background/50">
          <Link href="/">
            <h1 
              className="font-pixel text-xl text-foreground flex items-center gap-2 cursor-pointer group" 
            >
              <Zap className="text-primary group-hover:text-accent transition-colors" size={20} />
              <span className="group-hover:text-glow-pink transition-all">ListFlow</span>
            </h1>
          </Link>
          <p className="text-xs text-muted-foreground mt-2 font-sans tracking-wide">COMMAND CENTER</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200
                  font-sans font-semibold text-sm group
                  ${isActive 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
                  }
                `}
                data-testid={`nav-${item.path.slice(1) || 'dashboard'}`}
              >
                <div className={`transition-transform duration-300 ${isActive ? 'scale-110 text-primary' : 'group-hover:text-foreground'}`}>
                  {item.icon}
                </div>
                <span>{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-glow-pulse" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-background/30">
          <div className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center border border-white/10 shadow-[0_0_10px_rgba(255,45,120,0.3)]">
              <span className="font-pixel text-[10px] text-white">US</span>
            </div>
            <div>
              <p className="text-xs font-bold font-sans text-foreground">Pro Seller</p>
              <p className="text-[10px] font-sans text-accent">Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 p-8 min-w-0">
        <div className="max-w-6xl mx-auto pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
