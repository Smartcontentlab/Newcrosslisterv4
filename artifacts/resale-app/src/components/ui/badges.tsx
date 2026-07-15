import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MARKETPLACE_COLORS: Record<string, string> = {
  ebay: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  poshmark: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  depop: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  mercari: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  facebook: "bg-blue-600/10 text-blue-700 dark:text-blue-500 border-blue-600/20",
  etsy: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  grailed: "bg-gray-800 text-gray-100 border-gray-700 dark:bg-gray-200 dark:text-gray-900",
  whatnot: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  shopify: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

export function MarketplaceBadge({ marketplace, className }: { marketplace: string, className?: string }) {
  const colorClass = MARKETPLACE_COLORS[marketplace.toLowerCase()] || "bg-secondary text-secondary-foreground";
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-medium border uppercase tracking-wider", colorClass, className)}>
      {marketplace}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const s = status.toLowerCase();
  let color = "bg-secondary text-secondary-foreground";
  
  if (["active", "shipped", "delivered"].includes(s)) {
    color = "bg-green-500/10 text-green-500 border-green-500/20 border";
  } else if (["draft", "pending"].includes(s)) {
    color = "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 border";
  } else if (["awaiting_shipment"].includes(s)) {
    color = "bg-blue-500/10 text-blue-500 border-blue-500/20 border";
  } else if (["sold", "ended", "archived"].includes(s)) {
    color = "bg-gray-500/10 text-gray-400 border-gray-500/20 border";
  } else if (["returned", "refunded"].includes(s)) {
    color = "bg-red-500/10 text-red-500 border-red-500/20 border";
  }

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider", color, className)}>
      {status.replace('_', ' ')}
    </span>
  );
}
