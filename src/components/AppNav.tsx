"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageToggle, useI18n } from "@/components/LanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

// Pages dispatch this after changing today's goal or logging an application.
export const TODAY_CHANGED_EVENT = "tracker:today-changed";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const items: Array<{ href: string; label: MessageKey; icon: React.ReactNode }> = [
  {
    href: "/",
    label: "nav.today",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    ),
  },
  {
    href: "/applications",
    label: "nav.pipeline",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="10" y="4" width="5" height="11" rx="1.5" />
        <rect x="17" y="4" width="4" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/reminders",
    label: "nav.reminders",
    icon: (
      <svg {...iconProps}>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "nav.calendar",
    icon: (
      <svg {...iconProps}>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/stats",
    label: "nav.stats",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
];

function NavLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="app-nav">
      {items.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`app-nav-link ${isActive ? "is-active" : ""}`}
          >
            {item.icon}
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarGoal() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [goal, setGoal] = useState<{ done: number; target: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/today");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setGoal({
            done: data.todaysApps?.length ?? 0,
            target: data.goal?.targetCount ?? 0,
          });
        }
      } catch {
        // The sidebar is a convenience; the pages surface real errors.
      }
    }

    void load();
    window.addEventListener(TODAY_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TODAY_CHANGED_EVENT, load);
    };
  }, [pathname]);

  if (!goal) return null;

  const dots = Math.min(Math.max(goal.target, 1), 10);
  const filled = goal.target > 0 ? Math.round((Math.min(goal.done, goal.target) / goal.target) * dots) : 0;

  return (
    <div className="sidebar-goal space-y-3">
      <div className="mini-stat-label">{t("nav.goalLabel")}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="sidebar-goal-count">{goal.done}</span>
        <span className="section-subtitle">{t("nav.goalOf", { target: goal.target })}</span>
      </div>
      <div className="goal-meter">
        {Array.from({ length: dots }, (_, index) => (
          <div key={index} className={`goal-meter-dot ${index < filled ? "is-filled" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <Link href="/" className="app-brand">
      <span className="app-brand-mark">j</span>
      <span className="app-brand-name">{t("nav.brand")}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <NavLinks />
        <div className="px-2">
          <LanguageToggle />
        </div>
        <div className="mt-auto">
          <SidebarGoal />
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <Brand />
          <NavLinks />
          <LanguageToggle />
        </header>
        {children}
      </div>
    </div>
  );
}
