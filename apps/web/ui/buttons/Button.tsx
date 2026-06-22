import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-body font-semibold whitespace-nowrap transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:pointer-events-none border",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-bg border-transparent shadow-brut hover:shadow-brut-xs hover:translate-x-[2px] hover:translate-y-[2px]",
        secondary:
          "bg-bg text-text-primary border-border shadow-brut-sm font-display hover:shadow-brut-2xs hover:translate-x-[2px] hover:translate-y-[2px]",
        nav:
          "bg-accent text-bg border-transparent shadow-brut-sm hover:shadow-brut-2xs hover:translate-x-[2px] hover:translate-y-[2px] text-xs",
      },
      size: {
        md: "px-5 py-3 text-sm",
        sm: "px-4 py-2.5 text-xs",
        lg: "px-7 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
