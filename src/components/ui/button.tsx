import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("vc-button", {
  variants: {
    variant: {
      default: "vc-button-primary",
      outline: "vc-button-outline",
      ghost: "vc-button-ghost",
      contrast: "vc-button-contrast",
    },
    size: {
      default: "vc-button-md",
      sm: "vc-button-sm",
      lg: "vc-button-lg",
      icon: "vc-button-icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
