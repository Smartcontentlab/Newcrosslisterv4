import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-none border-2 border-transparent text-xs font-extrabold uppercase tracking-[0.05em] ring-offset-background transition-[background-color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-muted-foreground disabled:bg-muted disabled:text-muted-foreground [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-foreground bg-primary text-primary-foreground hover:bg-accent-hover",
        accent: "border-foreground bg-primary text-primary-foreground hover:bg-accent-hover",
        send: "border-foreground bg-success text-success-foreground hover:brightness-95",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-foreground bg-background text-foreground hover:bg-muted",
        secondary:
          "border-foreground bg-secondary text-secondary-foreground hover:bg-card",
        ghost: "hover:bg-muted",
        link: "border-transparent text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[42px] px-[18px]",
        sm: "h-9 px-3.5",
        lg: "h-12 px-6",
        icon: "h-[42px] w-[42px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
