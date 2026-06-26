"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Database,
  Landmark,
  LineChart,
  Repeat2,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

type ModeId = "stocks" | "banks" | "real-estate" | "recurring" | "debug";

const modes = [
  {
    id: "stocks",
    label: "Stock portfolio",
    title: "Portfolio Command Center",
    description: "MVP screen",
    icon: LineChart,
  },
  {
    id: "banks",
    label: "Banks and Accounts",
    title: "Banks and Accounts",
    description: "Cash, cards, and account balances",
    icon: Landmark,
  },
  {
    id: "real-estate",
    label: "Immobilities",
    title: "Immobilities",
    description: "Property and mortgage view",
    icon: Building2,
  },
  {
    id: "recurring",
    label: "Recurring income and spend",
    title: "Recurring Income and Spend",
    description: "Subscriptions, salary, and bills",
    icon: Repeat2,
  },
  {
    id: "debug",
    label: "Debug DB mode",
    title: "Debug DB Mode",
    description: "Database diagnostics",
    icon: Database,
  },
] satisfies Array<{
  id: ModeId;
  label: string;
  title: string;
  description: string;
  icon: typeof LineChart;
  href?: string;
}>;

export function ModeSwitcher({ activeModeId: currentModeId = "stocks" }: { activeModeId?: ModeId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModeId, setActiveModeId] = useState<ModeId>(currentModeId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const activeMode = modes.find((mode) => mode.id === activeModeId) ?? modes[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setActiveModeId(currentModeId);
  }, [currentModeId]);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Switch PF Planner mode"
        title="Switch PF Planner mode"
        onClick={() => setIsOpen((value) => !value)}
        className="group -ml-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-neutral/50 sm:gap-2"
      >
        <BrandMark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-[11px] sm:tracking-[0.18em]">
            PF Planner
          </span>
          <span className="block truncate text-sm font-semibold text-slate-50 sm:text-lg">
            {activeMode.title}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "hidden shrink-0 text-slate-500 transition group-hover:text-slate-300 sm:block",
            isOpen && "rotate-180 text-blue-300",
          )}
        />
        <span className="pointer-events-none invisible absolute left-0 top-[calc(100%+0.45rem)] z-[90] whitespace-nowrap rounded-md border border-white/10 bg-surface px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 shadow-panel transition duration-150 md:group-hover:visible md:group-hover:opacity-100 md:group-focus-within:visible md:group-focus-within:opacity-100">
          Switch PF Planner mode
        </span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Switch PF Planner mode"
          className="absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-white/10 bg-panel shadow-panel"
        >
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isActive = mode.id === activeModeId;

            return (
              <button
                key={mode.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setActiveModeId(mode.id);
                  setIsOpen(false);
                  if (mode.id === "stocks") {
                    router.push("/");
                  }
                  if (mode.id === "banks") {
                    router.push("/banks");
                  }
                  if (mode.id === "debug") {
                    router.push("/debug-db");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left last:border-b-0 hover:bg-surface",
                  isActive && "bg-neutral/10",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-background text-slate-400",
                    isActive && "border-neutral/40 text-blue-200",
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-100">{mode.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{mode.description}</span>
                </span>
                {isActive ? (
                  <span className="shrink-0 rounded bg-neutral/15 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                    Active
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
