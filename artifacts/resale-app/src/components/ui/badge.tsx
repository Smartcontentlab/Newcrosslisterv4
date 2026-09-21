import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "accent";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-foreground text-background",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    success: "border-transparent bg-success-tint text-success",
    warning: "border-transparent bg-warning-tint text-warning",
    accent: "border-transparent bg-accent-tint text-accent-text",
    destructive: "border-transparent bg-danger-tint text-destructive",
    outline: "border-border text-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
