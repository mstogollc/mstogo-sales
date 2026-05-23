import type { FC, ReactNode } from "react";

export const BrandedShell: FC<{ title: string; subtitle?: string; children: ReactNode }> = ({
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="branded-shell">
      <header className="branded-topbar">
        <a href="https://portal.mstogo.com/" className="branded-brand" aria-label="MS2GO home">
          <span className="branded-logo">M2</span>
          <span className="branded-wordmark">
            <span className="branded-wordmark-main">MS2GO</span>
            <span className="branded-wordmark-sub">Sales Command Center</span>
          </span>
        </a>
      </header>

      <main className="branded-main">
        <section className="branded-card">
          <h1 className="branded-title">{title}</h1>
          {subtitle && <p className="branded-subtitle">{subtitle}</p>}
          {children}
        </section>
      </main>

      <footer className="branded-footer">
        <div className="branded-footer-inner">
          <span>© {new Date().getFullYear()} MS to Go, LLC</span>
          <nav className="branded-footer-nav">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:mstogollc@gmail.com">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
};
