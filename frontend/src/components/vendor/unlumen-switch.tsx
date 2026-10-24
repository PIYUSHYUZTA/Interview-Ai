// Adapted from Unlumen UI free Switch; application-use license official registry. See frontend/UI_LIBRARIES.md and vendor-sources for provenance and license.
"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "motion/react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "./utils";

const TRACK_W = 44;
const TRACK_H = 26;
const THUMB_SIZE = 20;
const THUMB_TRAVEL = TRACK_W - THUMB_SIZE - 4; // px from left to right (margin 2px each side)

const spring = { type: "spring" as const, duration: 0.35, bounce: 0.3 };
const springFast = { type: "spring" as const, duration: 0.15, bounce: 0 };
const springSnap = { type: "spring" as const, duration: 0.4, bounce: 0.5 };

interface SwitchProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
    "asChild"
  > {
  label?: string;
  /** @default "right" */
  labelSide?: "left" | "right";
}

const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(
  (
    {
      checked,
      defaultChecked = false,
      onCheckedChange,
      label,
      labelSide = "right",
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const reduced = useReducedMotion();
    const [localChecked, setLocalChecked] = useState(defaultChecked);
    const isControlled = checked !== undefined;
    const internalChecked = isControlled ? checked : localChecked;

    const thumbX = useMotionValue(internalChecked ? THUMB_TRAVEL : 0);
    const thumbScaleX = useMotionValue(1);
    const thumbScaleY = useMotionValue(1);

    const fillOpacity = useTransform(thumbX, [0, THUMB_TRAVEL], [0, 1]);

    const prevChecked = useRef(internalChecked);
    const directionRef = useRef<1 | -1>(1);

    useEffect(() => {
      if (prevChecked.current === internalChecked) return;
      prevChecked.current = internalChecked;
      animate(thumbX, internalChecked ? THUMB_TRAVEL : 0, reduced ? { duration: 0 } : spring);
    }, [internalChecked, thumbX, reduced]);

    const handlePointerDown = () => {
      if (reduced || disabled) return;
      // Flatten thumb on press (squeeze effect)
      animate(thumbScaleX, 0.82, springFast);
      animate(thumbScaleY, 1.1, springFast);
    };

    const handlePointerUp = () => {
      if (reduced || disabled) return;
      // Snap back with bounce
      animate(thumbScaleX, 1, springSnap);
      animate(thumbScaleY, 1, springSnap);
    };

    const handleCheckedChange = (next: boolean) => {
      if (!isControlled) setLocalChecked(next);
      if (reduced) { thumbX.set(next ? THUMB_TRAVEL : 0); onCheckedChange?.(next); return; }
      directionRef.current = next ? 1 : -1;

      // Squeeze in direction of travel on release
      animate(thumbScaleX, 1.15, springFast).then(() => {
        animate(thumbScaleX, 1, springSnap);
      });
      animate(thumbScaleY, 0.88, springFast).then(() => {
        animate(thumbScaleY, 1, springSnap);
      });

      animate(thumbX, next ? THUMB_TRAVEL : 0, reduced ? { duration: 0 } : spring);
      onCheckedChange?.(next);
    };

    const switchEl = (
      <SwitchPrimitive.Root
        ref={ref}
        checked={internalChecked}
        onCheckedChange={handleCheckedChange}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={cn(
          "unlumen-switch",
          
          
          className,
        )}
        style={{ width: TRACK_W, height: TRACK_H }}
        {...props}
      >
        <span
          className="unlumen-switch-track"
          style={{ backgroundColor: "var(--switch-track)" }}
        />

        <motion.span
          className="unlumen-switch-track"
          style={{
            backgroundColor: "var(--switch-on)",
            opacity: fillOpacity,
          }}
        />

        <SwitchPrimitive.Thumb asChild>
          <motion.span
            className="unlumen-switch-thumb"
            style={{
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              x: thumbX,
              scaleX: thumbScaleX,
              scaleY: thumbScaleY,
              marginLeft: 2,
              backgroundColor: "white",
              boxShadow:
                "0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
            }}
          />
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    );

    if (!label) return switchEl;

    return (
      <label
        className={cn(
          "unlumen-switch-label",
          disabled && "is-disabled",
        )}
      >
        {labelSide === "left" && (
          <span className="unlumen-switch-text">{label}</span>
        )}
        {switchEl}
        {labelSide === "right" && (
          <span className="unlumen-switch-text">{label}</span>
        )}
      </label>
    );
  },
);

Switch.displayName = "Switch";

export { Switch, type SwitchProps };
