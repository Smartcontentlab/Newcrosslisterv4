import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "accent";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-foreground bg-primary text-primary-foreground",
    secondary: "border-foreground bg-secondary text-secondary-foreground",
    success: "border-foreground bg-success text-success-foreground",
    warning: "border-warning bg-warning-tint text-warning",
    accent: "border-foreground bg-accent-tint text-foreground",
    destructive: "border-destructive bg-danger-tint text-destructive",
    outline: "border-border text-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-none border px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-[0.06em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
