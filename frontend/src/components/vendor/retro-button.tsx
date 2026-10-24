// Adapted from Retro UI / NeoBrutalism (MIT); palette and utility classes adapted official registry. See frontend/UI_LIBRARIES.md and vendor-sources for provenance and license.
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "./utils"

const buttonVariants = cva(
  "retro-button",
  {
    variants: {
      variant: {
        default: "retro-button-primary", secondary: "retro-button-secondary", destructive: "retro-button-danger",
        outline: "retro-button-outline", ghost: "retro-button-ghost", link: "retro-button-link",
      },
      size: { default: "retro-size-default", xs: "retro-size-xs", sm: "retro-size-sm", lg: "retro-size-lg", icon: "retro-size-icon", "icon-xs": "retro-size-icon", "icon-sm": "retro-size-icon", "icon-lg": "retro-size-icon" },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function RetroButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { RetroButton, buttonVariants }
