import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-body font-semibold whitespace-nowrap transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:pointer-events-none border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-bg border-transparent shadow-brut hover:shadow-brut-xs hover:translate-x-[2px] hover:translate-y-[2px]",
        secondary:
          "bg-bg text-text-primary border-border shadow-brut-sm font-display hover:shadow-brut-2xs hover:translate-x-[2px] hover:translate-y-[2px]",
        nav: "bg-accent text-bg border-transparent shadow-brut-sm hover:shadow-brut-2xs hover:translate-x-[2px] hover:translate-y-[2px] text-xs",
        // A text action that carries no weight of its own — for the escape
        // hatch next to a real choice, not for the choice itself.
        ghost:
          "bg-transparent border-transparent font-mono font-normal text-text-muted underline shadow-none active:translate-x-0 active:translate-y-0 hover:text-text-secondary",
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
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
