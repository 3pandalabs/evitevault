import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-slate-900 text-white",
        outline: "border-slate-300 text-slate-700",
        attending: "border-transparent bg-emerald-100 text-emerald-800",
        declined: "border-transparent bg-rose-100 text-rose-800",
        maybe: "border-transparent bg-amber-100 text-amber-800",
        pending: "border-transparent bg-slate-100 text-slate-600",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Maps an RSVP status straight to its badge variant so the four states look the
// same everywhere they appear (dashboard list, event detail, CSV preview).
export const rsvpVariant = {
  attending: "attending",
  declined: "declined",
  maybe: "maybe",
  pending: "pending",
} as const;
