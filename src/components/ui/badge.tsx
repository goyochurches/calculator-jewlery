import * as React from "react"
import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-slate-950 text-white",
        secondary: "bg-slate-100 text-slate-700",
        destructive: "bg-rose-100 text-rose-700",
        outline: "border border-slate-200 bg-white text-slate-700",
        ghost: "bg-transparent text-slate-700",
        link: "bg-transparent p-0 text-slate-900 underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
