import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Package, 
  Tags, 
  ShoppingCart, 
  Truck, 
  LineChart, 
  BotMessageSquare,
  Search,
  Bell,
  Menu
} from "lucide-react";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/listings", label: "Listings", icon: Tags },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/shipping", label: "Shipping", icon: Truck },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/ai-assistant", label: "AI Assistant", icon: BotMessageSquare },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Set dark mode default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 font-bold text-lg">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Package size={18} />
          </div>
          ListFlow
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-muted-foreground">
          <Menu size={24} />
        </button>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "w-64 bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300 z-50",
        "fixed inset-y-0 left-0 md:relative md:flex",
        isMobileMenuOpen ? "flex" : "hidden"
      )}>
        <div className="h-16 flex items-center gap-3 px-6 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Package size={18} />
          </div>
          <span className="font-bold text-xl tracking-tight text-sidebar-foreground">ListFlow</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon size={18} className={cn(isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-bold">
              SJ
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Seller Jane</p>
              <p className="text-xs text-muted-foreground truncate">Pro Reseller</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur hidden md:flex items-center justify-between px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input 
                type="text" 
                placeholder="Search inventory, orders, listings..." 
                className="w-full pl-9 pr-4 py-2 bg-accent/50 border-transparent focus:border-primary focus:bg-background rounded-full text-sm outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
