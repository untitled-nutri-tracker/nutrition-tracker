import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import { motion, AnimatePresence } from "framer-motion";
import { House, ForkKnife, ChartLineUp, Robot, Gear, Plus } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useState } from "react";

function usePageMeta() {
  const { pathname } = useLocation();

  if (pathname === "/") {
    return { title: "Daily Log", subtitle: "Track meals, macros, hydration and daily intake." };
  }
  if (pathname.startsWith("/log")) {
    return { title: "Log Food", subtitle: "Search and log food directly to your meal diary." };
  }
  if (pathname.startsWith("/insights")) {
    return { title: "Insights", subtitle: "Visualize trends and nutrition analytics." };
  }
  if (pathname.startsWith("/ai")) {
    return { title: "AI Advisor", subtitle: "Smart recommendations powered by AI." };
  }
  if (pathname.startsWith("/settings")) {
    return { title: "Settings", subtitle: "Manage your profile and preferences." };
  }

  return { title: "NutriLog", subtitle: "" };
}

function DesktopNavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-200 ${
          isActive
            ? "border-primary/15 bg-primary/10 text-primary"
            : "border-transparent text-muted2 hover:bg-primary/5 hover:text-primary"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
            isActive ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-600 dark:text-emerald-100" : "border-primary/10 bg-primary/5"
          }`}>
            {icon}
          </div>
          <div className="font-medium text-sm tracking-wide">{label}</div>
        </>
      )}
    </NavLink>
  );
}

function MobileNavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex h-14 w-14 flex-col items-center justify-center rounded-full transition-all duration-300 ${
          isActive ? "text-primary" : "text-muted2 hover:text-muted"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="mobileNavIndicator"
              className="absolute inset-0 rounded-full border border-primary/10 bg-primary/10"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10 mb-0.5">{icon}</span>
          <span className="relative z-10 text-[9px] font-medium tracking-wide">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function AppShell() {
  const { title, subtitle } = usePageMeta();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session, closeDatabase } = useDatabaseSession();
  const isAiRoute = pathname.startsWith("/ai");
  
  // Track if we've mounted to prevent hydration mismatch animations
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shellStyles = {
    "--shell-mobile-nav-offset": "calc(env(safe-area-inset-bottom) + 0.2rem)",
    "--shell-mobile-content-padding": "calc(6rem + env(safe-area-inset-bottom))",
    "--shell-mobile-top-inset": "max(env(safe-area-inset-top), 0.5rem)",
  } as CSSProperties;

  return (
    <div
      className="flex h-[100dvh] w-full overflow-hidden bg-base font-sans text-primary"
      style={shellStyles}
    >
      
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-subtle bg-card/90 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-3 border-b border-subtle p-5">
          <div className="h-9 w-9 rounded-[14px] border border-subtle bg-gradient-to-br from-emerald-300/45 to-cyan-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]" />
          <div className="flex flex-col">
            <strong className="text-base font-semibold tracking-tight leading-none mb-1">NutriLog</strong>
            <span className="text-xs leading-none tracking-wide text-muted">Local-first tracker</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-4">
          <DesktopNavItem to="/" end label="Daily Log" icon={<House weight="duotone" size={18} />} />
          <DesktopNavItem to="/log" label="Log Food" icon={<ForkKnife weight="duotone" size={18} />} />
          <DesktopNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="duotone" size={18} />} />
          <DesktopNavItem to="/ai" label="AI Advisor" icon={<Robot weight="duotone" size={18} />} />
          <DesktopNavItem to="/settings" label="Settings" icon={<Gear weight="duotone" size={18} />} />
        </nav>

        <div className="mt-auto border-t border-subtle p-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted2">Connected DB</div>
          <div className="mb-3 line-clamp-2 break-all text-xs leading-relaxed text-muted" title={session.connectedPath ?? ""}>
            {session.connectedPath}
          </div>
          <button 
            className="w-full rounded-xl border border-subtle bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            onClick={closeDatabase} 
            type="button"
          >
            Close database
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ───────────────────────────────────────── */}
      <section className="relative flex h-full min-w-0 flex-1 flex-col pt-[var(--shell-mobile-top-inset)] md:pt-0">
        <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-subtle bg-base/88 px-8 py-5 backdrop-blur-xl md:flex">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
            {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
          </div>
          <div className="text-xs text-muted py-1.5 px-3 rounded-full bg-primary/5 border border-subtle">
            {session.connectedPath?.split("/").pop()}
          </div>
        </header>

        <main className={`relative flex flex-1 flex-col overflow-x-hidden ${isAiRoute ? "overflow-y-hidden" : "overflow-y-auto"} scroll-smooth pb-[var(--shell-mobile-content-padding)] md:pb-0`}>
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.99 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 flex flex-col min-h-0"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </section>
      
      {/* ── MOBILE BOTTOM PILL NAV ──────────────────────────────────── */}
      {mounted && (
        <motion.div 
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, mass: 1.2, delay: 0.05 }}
          className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center px-4 md:hidden"
          style={{ bottom: "var(--shell-mobile-nav-offset)" }}
        >
          <div className="pointer-events-auto flex items-center rounded-[2rem] border border-subtle bg-card/80 p-1.5 shadow-[var(--shadow-liquid-glass)] backdrop-blur-2xl">
            <div className="flex items-center gap-1 px-2">
              <MobileNavItem to="/" end label="Home" icon={<House weight="fill" size={22} />} />
              <MobileNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="fill" size={22} />} />
              <MobileNavItem to="/ai" label="AI" icon={<Robot weight="fill" size={22} />} />
              <MobileNavItem to="/settings" label="Settings" icon={<Gear weight="fill" size={22} />} />
            </div>
            <div className="w-[1px] h-8 bg-border-card mx-2" />
            <button
              onClick={() => navigate('/log')}
              className="relative mr-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-emerald-200/45 bg-gradient-to-br from-emerald-300/55 to-cyan-300/48 text-[#10131a] shadow-[0_8px_18px_-8px_rgba(16,185,129,0.7)] transition-all hover:scale-105 active:scale-95"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity hover:opacity-100" />
              <Plus weight="bold" size={20} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Global Contextual AI FAB (Desktop Only) */}
      {pathname !== '/ai' && (
        <button 
          className="fixed bottom-8 right-8 z-50 hidden h-14 w-14 items-center justify-center rounded-full border border-emerald-200/35 bg-gradient-to-br from-emerald-300/50 to-cyan-300/42 text-2xl text-[#10131a] shadow-[0_12px_26px_-12px_rgba(16,185,129,0.7)] transition-all duration-300 hover:scale-110 active:scale-95 md:flex"
          onClick={() => navigate('/ai')}
          title="Ask AI"
        >
          <Robot weight="fill" size={24} className="drop-shadow-md" />
        </button>
      )}
    </div>
  );
}
