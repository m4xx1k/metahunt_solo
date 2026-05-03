import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-body font-semibold whitespace-nowrap transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:pointer-events-none border",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-bg border-transparent shadow-[4px_4px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]",
        secondary:
          "bg-bg text-text-primary border-border shadow-[3px_3px_0_0_#000] font-display hover:shadow-[1px_1px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]",
        nav:
          "bg-accent text-bg border-transparent shadow-[3px_3px_0_0_#000] hover:shadow-[1px_1px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] text-[13px]",
      },
      size: {
        md: "px-[22px] py-3 text-sm",
        sm: "px-[18px] py-[10px] text-[13px]",
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
