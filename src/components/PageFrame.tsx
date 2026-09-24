import type { ReactNode } from "react";

type PageFrameProps = {
  title: ReactNode;
  subtitle: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageFrame({ title, subtitle, eyebrow, actions, children }: PageFrameProps) {
  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      <div className="space-y-5">{children}</div>
    </main>
  );
}
