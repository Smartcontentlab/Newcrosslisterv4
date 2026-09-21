import { Link, useLocation } from 'wouter';
import {
  BarChart3,
  Bot,
  CircleHelp,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  Moon,
  Package,
  PlugZap,
  PlusSquare,
  Settings,
  ShoppingCart,
  Sparkles as SparklesIcon,
  Sun,
  Truck,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useHealthCheck } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme';
import { Sparkle } from '@/components/ui/sparkle';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  code: string;
}

const browseItems: NavItem[] = [
  { path: '/', label: 'Overview', icon: <LayoutDashboard size={16} />, code: '01' },
  { path: '/inventory', label: 'Inventory', icon: <Package size={16} />, code: '02' },
  { path: '/listings', label: 'Listings', icon: <List size={16} />, code: '03' },
  { path: '/orders', label: 'Orders', icon: <ShoppingCart size={16} />, code: '04' },
];

const toolItems: NavItem[] = [
  { path: '/listing-studio', label: 'Listing studio', icon: <PlusSquare size={16} />, code: '05' },
  { path: '/shipping', label: 'Shipping', icon: <Truck size={16} />, code: '06' },
  { path: '/connections', label: 'Marketplaces', icon: <PlugZap size={16} />, code: '07' },
  { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={16} />, code: '08' },
  { path: '/ai-assistant', label: 'AI assistant', icon: <SparklesIcon size={16} />, code: '09' },
  { path: '/agent', label: 'Agent hub', icon: <Bot size={16} />, code: '10' },
];

const footerItems: NavItem[] = [
  { path: '/settings', label: 'Settings', icon: <Settings size={16} />, code: '' },
  { path: '/help', label: 'Help', icon: <CircleHelp size={16} />, code: '' },
];

const allItems = [...browseItems, ...toolItems, ...footerItems];

function isActivePath(location: string, path: string): boolean {
  return location === path || (path !== '/' && location.startsWith(path));
}

function NavLink({ item, location, onNavigate }: { item: NavItem; location: string; onNavigate?: () => void }) {
  const active = isActivePath(location, item.path);
  return (
    <Link
      href={item.path}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.path.slice(1) || 'dashboard'}`}
      className={`flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors ${
        active ? 'bg-foreground text-background' : 'text-ink-2 hover:bg-muted hover:text-foreground'
      }`}
    >
      {item.code ? (
        <span className={`w-5 font-mono text-[0.6875rem] ${active ? 'text-accent-alt' : 'text-muted-foreground'}`}>{item.code}</span>
      ) : (
        <span className={active ? 'text-accent-alt' : 'text-muted-foreground'}>{item.icon}</span>
      )}
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const health = useHealthCheck({ query: { refetchInterval: 60_000 } } as never);
  const online = health.isSuccess;
  const operatorName = profile?.displayName || user?.email?.split('@')[0] || 'Seller';
  const operatorPlan = profile?.plan || 'free';
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="flex h-full flex-col px-5 py-6">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-3.5 pb-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-accent-alt"><Sparkle size={16} /></span>
        <span className="font-display text-[1.375rem] font-bold tracking-tight">CrossLinkOS</span>
      </Link>

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto">
        <p className="cx-eyebrow px-3.5 pb-1 pt-1">Browse</p>
        {browseItems.map((item) => <NavLink key={item.path} item={item} location={location} onNavigate={onNavigate} />)}
        <p className="cx-eyebrow px-3.5 pb-1 pt-4">Tools</p>
        {toolItems.map((item) => <NavLink key={item.path} item={item} location={location} onNavigate={onNavigate} />)}
      </nav>

      <div className="mt-3 space-y-0.5">
        {footerItems.map((item) => <NavLink key={item.path} item={item} location={location} onNavigate={onNavigate} />)}
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="cx-eyebrow">Sync</span>
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={online ? 'cx-status-dot' : 'inline-block h-2 w-2 rounded-full border border-dashed border-muted-foreground'} />
          <span>{online ? 'API online' : health.isLoading ? 'Checking…' : 'API offline'}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{operatorName}</p>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground">{operatorPlan} plan</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-danger-tint hover:text-destructive"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeItem = allItems.find((item) => isActivePath(location, item.path)) ?? browseItems[0];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-accent-alt"><Sparkle size={16} /></span>
          <span className="font-display text-lg font-bold tracking-tight">CrossLinkOS</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="min-h-[calc(100dvh-56px)] px-4 py-6 sm:px-6 lg:ml-[248px] lg:min-h-[100dvh] lg:px-10 lg:py-9">
        <div className="mx-auto max-w-7xl pb-20">
          <p className="cx-eyebrow mb-5 hidden lg:block">{activeItem.code ? `${activeItem.code} / ` : ''}{activeItem.label}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
