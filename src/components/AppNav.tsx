"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/applications", label: "Applications" },
  { href: "/reminders", label: "Reminders" },
  { href: "/calendar", label: "Calendar" },
  { href: "/stats", label: "Stats" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav-shell">
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
