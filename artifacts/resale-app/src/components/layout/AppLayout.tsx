import { Link, useLocation } from 'wouter';
import {
  Activity,
  BarChart3,
  Bot,
  ChevronRight,
  LayoutDashboard,
  List,
  Package,
  Settings2,
  ShoppingCart,
  Sparkles,
  Truck,
  Zap,
} from 'lucide-react';
import { ReactNode } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  code: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} />, code: '00' },
  { path: '/inventory', label: 'Inventory', icon: <Package size={17} />, code: '01' },
  { path: '/listings', label: 'Listings', icon: <List size={17} />, code: '02' },
  { path: '/orders', label: 'Orders', icon: <ShoppingCart size={17} />, code: '03' },
  { path: '/shipping', label: 'Fulfillment', icon: <Truck size={17} />, code: '04' },
  { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={17} />, code: '05' },
  { path: '/ai-assistant', label: 'AI Assistant', icon: <Sparkles size={17} />, code: '06' },
  { path: '/agent', label: 'Agent Hub', icon: <Bot size={17} />, code: '07' },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const activeItem = navItems.find((item) => location === item.path || (item.path !== '/' && location.startsWith(item.path))) ?? navItems[0];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl lg:flex">
        <div className="border-b border-sidebar-border/80 px-6 pb-5 pt-6">
          <Link href="/" className="group block">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/50 bg-primary/10 text-primary shadow-[0_0_24px_hsl(var(--primary)/0.18)] transition group-hover:bg-primary/20">
                <Zap size={19} />
              </div>
              <div>
                <h1 className="font-pixel text-sm tracking-wide text-foreground transition group-hover:text-primary">CrossLinkOS</h1>
                <p className="cx-eyebrow mt-2 text-[0.56rem]">resale mission control</p>
              </div>
            </div>
          </Link>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="cx-status-dot" />
              <span className="font-mono text-[0.64rem] text-muted-foreground">SYSTEM ONLINE</span>
            </div>
            <Activity size={13} className="text-accent" />
          </div>
        </div>

        <div className="px-6 pb-2 pt-6">
          <p className="cx-eyebrow">Operations / {activeItem.code}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-6">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all duration-200 ${
                  isActive
                    ? 'border-primary/45 bg-primary/10 text-foreground shadow-[inset_3px_0_0_hsl(var(--primary)),0_8px_24px_hsl(var(--primary)/0.08)]'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-sidebar-accent/70 hover:text-foreground'
                }`}
                data-testid={`nav-${item.path.slice(1) || 'dashboard'}`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${isActive ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border/70 bg-background/30 group-hover:border-primary/30 group-hover:text-primary'}`}>
                  {item.icon}
                </span>
                <span className="flex-1 text-sm font-semibold tracking-wide">{item.label}</span>
                <span className={`font-mono text-[0.58rem] ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>{item.code}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border/80 p-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="cx-eyebrow">Operator profile</span>
            <Settings2 size={14} className="text-muted-foreground" />
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/35 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary via-secondary to-accent text-[0.6rem] font-bold text-background shadow-[0_0_18px_hsl(var(--primary)/0.24)]">US</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-foreground">Pro Seller</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[0.58rem] text-accent"><span className="cx-status-dot" /> active</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 text-primary"><Zap size={16} /></span>
          <span className="font-pixel text-[0.62rem] text-foreground">CrossLinkOS</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="cx-status-dot" />
          <span className="font-mono text-[0.58rem] text-muted-foreground">ONLINE</span>
        </div>
      </header>

      <main className="min-h-[calc(100dvh-57px)] px-4 py-5 sm:px-6 sm:py-7 lg:ml-72 lg:min-h-[100dvh] lg:px-10 lg:py-9">
        <div className="mx-auto max-w-7xl pb-20">
          <div className="mb-6 hidden items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground lg:flex">
            <span>CrossLinkOS</span><ChevronRight size={12} className="text-primary" /><span className="text-primary">{activeItem.label}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
