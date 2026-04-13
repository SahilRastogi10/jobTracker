import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";

type PageFrameProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageFrame({
  title,
  subtitle,
  eyebrow = "Job Search Tracker",
  actions,
  children,
}: PageFrameProps) {
  return (
    <main className="app-page">
      <section className="hero-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="hero-kicker">{eyebrow}</div>
            <div className="space-y-2">
              <h1 className="hero-title">{title}</h1>
              <p className="hero-subtitle">{subtitle}</p>
            </div>
          </div>

          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </section>

      <AppNav />

      <div className="space-y-5">{children}</div>
    </main>
  );
}
