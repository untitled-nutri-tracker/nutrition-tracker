import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
import { motion, AnimatePresence } from "framer-motion";
import { House, ForkKnife, ChartLineUp, Robot, Gear, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

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
            ? "border-white/14 bg-white/8 text-white"
            : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/90"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
            isActive ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100" : "border-white/8 bg-white/5"
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
          isActive ? "text-white" : "text-white/40 hover:text-white/70"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="mobileNavIndicator"
              className="absolute inset-0 rounded-full border border-white/12 bg-white/10"
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
  
  // Track if we've mounted to prevent hydration mismatch animations
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#12121A] font-sans text-white/90">
      
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-white/6 bg-[#14141c]/90 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-3 border-b border-white/6 p-5">
          <div className="h-9 w-9 rounded-[14px] border border-white/12 bg-gradient-to-br from-emerald-300/45 to-cyan-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]" />
          <div className="flex flex-col">
            <strong className="text-base font-semibold tracking-tight leading-none mb-1">NutriLog</strong>
            <span className="text-xs leading-none tracking-wide text-white/40">Local-first tracker</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-4">
          <DesktopNavItem to="/" end label="Daily Log" icon={<House weight="duotone" size={18} />} />
          <DesktopNavItem to="/log" label="Log Food" icon={<ForkKnife weight="duotone" size={18} />} />
          <DesktopNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="duotone" size={18} />} />
          <DesktopNavItem to="/ai" label="AI Advisor" icon={<Robot weight="duotone" size={18} />} />
          <DesktopNavItem to="/settings" label="Settings" icon={<Gear weight="duotone" size={18} />} />
        </nav>

        <div className="mt-auto border-t border-white/6 p-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Connected DB</div>
          <div className="mb-3 line-clamp-2 break-all text-xs leading-relaxed text-white/80" title={session.connectedPath ?? ""}>
            {session.connectedPath}
          </div>
          <button 
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            onClick={closeDatabase} 
            type="button"
          >
            Close database
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ───────────────────────────────────────── */}
      <section className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-white/6 bg-[#12121A]/88 px-8 py-5 backdrop-blur-xl md:flex">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
          </div>
          <div className="text-xs text-white/40 py-1.5 px-3 rounded-full bg-white/5 border border-white/5">
            {session.connectedPath?.split("/").pop()}
          </div>
        </header>

        <main className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth">
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
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
          transition={{ type: "spring", stiffness: 210, damping: 28, delay: 0.08 }}
          className="pointer-events-none fixed bottom-2 left-0 right-0 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="pointer-events-auto flex items-center rounded-[2rem] border border-white/12 bg-[#1c1c22]/95 p-1.5 shadow-[0_18px_32px_-16px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
            <div className="flex items-center gap-1 px-2">
              <MobileNavItem to="/" end label="Home" icon={<House weight="fill" size={22} />} />
              <MobileNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="fill" size={22} />} />
              <MobileNavItem to="/ai" label="AI" icon={<Robot weight="fill" size={22} />} />
              <MobileNavItem to="/settings" label="Settings" icon={<Gear weight="fill" size={22} />} />
            </div>
            <div className="w-[1px] h-8 bg-white/10 mx-2" />
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
