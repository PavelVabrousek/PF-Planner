import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconTooltipProps = {
  label: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
};

export function IconTooltip({ label, children, className, align = "right" }: IconTooltipProps) {
  return (
    <div className={cn("group relative flex", className)}>
      {children}
      <span
        className={cn(
          "pointer-events-none invisible absolute top-[calc(100%+0.45rem)] z-[90] whitespace-nowrap rounded-md border border-white/10 bg-surface px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 shadow-panel transition duration-150 md:group-hover:visible md:group-hover:opacity-100 md:group-focus-within:visible md:group-focus-within:opacity-100",
          align === "left" ? "left-0" : "right-0",
        )}
      >
        {label}
      </span>
    </div>
  );
}
