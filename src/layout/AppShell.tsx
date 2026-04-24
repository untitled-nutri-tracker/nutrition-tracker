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
        `flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200 border ${
          isActive
            ? "bg-gradient-to-br from-indigo-500/10 to-cyan-500/5 border-indigo-500/20 text-white"
            : "border-transparent text-white/50 hover:bg-white/5 hover:text-white/90"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl border ${
            isActive ? "border-indigo-500/30 bg-indigo-500/10" : "border-white/5 bg-white/5"
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
        `flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 relative ${
          isActive ? "text-white" : "text-white/40 hover:text-white/70"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="mobileNavIndicator"
              className="absolute inset-0 bg-white/10 rounded-full"
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
    <div className="flex h-[100dvh] w-full bg-[#12121A] text-white/90 overflow-hidden font-sans">
      
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[260px] flex-shrink-0 border-r border-white/5 bg-[#12121A]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 p-5 border-b border-white/5">
          <div className="w-9 h-9 rounded-[14px] bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_8px_16px_rgba(99,102,241,0.2)]" />
          <div className="flex flex-col">
            <strong className="text-base font-semibold tracking-tight leading-none mb-1">NutriLog</strong>
            <span className="text-xs text-white/40 tracking-wide leading-none">Local-first tracker</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
          <DesktopNavItem to="/" end label="Daily Log" icon={<House weight="duotone" size={18} />} />
          <DesktopNavItem to="/log" label="Log Food" icon={<ForkKnife weight="duotone" size={18} />} />
          <DesktopNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="duotone" size={18} />} />
          <DesktopNavItem to="/ai" label="AI Advisor" icon={<Robot weight="duotone" size={18} />} />
          <DesktopNavItem to="/settings" label="Settings" icon={<Gear weight="duotone" size={18} />} />
        </nav>

        <div className="p-4 border-t border-white/5 mt-auto">
          <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">Connected DB</div>
          <div className="text-xs text-white/80 break-all leading-relaxed mb-3 line-clamp-2" title={session.connectedPath ?? ""}>
            {session.connectedPath}
          </div>
          <button 
            className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white/90"
            onClick={closeDatabase} 
            type="button"
          >
            Close database
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ───────────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#12121A]/80 backdrop-blur-xl z-10 sticky top-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
          </div>
          <div className="text-xs text-white/40 py-1.5 px-3 rounded-full bg-white/5 border border-white/5">
            {session.connectedPath?.split("/").pop()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth flex flex-col">
          <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
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
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 25, delay: 0.1 }}
          className="md:hidden fixed bottom-6 left-0 right-0 px-4 z-50 flex justify-center pb-[env(safe-area-inset-bottom)] pointer-events-none"
        >
          <div className="flex items-center p-1.5 rounded-[2rem] bg-[#1C1C22]/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] pointer-events-auto liquid-glass">
            <div className="flex items-center gap-1 px-2">
              <MobileNavItem to="/" end label="Home" icon={<House weight="fill" size={22} />} />
              <MobileNavItem to="/insights" label="Insights" icon={<ChartLineUp weight="fill" size={22} />} />
              <MobileNavItem to="/ai" label="AI" icon={<Robot weight="fill" size={22} />} />
              <MobileNavItem to="/settings" label="Settings" icon={<Gear weight="fill" size={22} />} />
            </div>
            <div className="w-[1px] h-8 bg-white/10 mx-2" />
            <button
              onClick={() => navigate('/log')}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-105 active:scale-95 transition-all mr-1 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity" />
              <Plus weight="bold" size={20} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Global Contextual AI FAB (Desktop Only) */}
      {pathname !== '/ai' && (
        <button 
          className="hidden md:flex fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_8px_24px_rgba(99,102,241,0.4)] items-center justify-center text-2xl z-50 hover:scale-110 active:scale-95 transition-all duration-300"
          onClick={() => navigate('/ai')}
          title="Ask AI"
        >
          <Robot weight="fill" size={24} className="text-white drop-shadow-md" />
        </button>
      )}
    </div>
  );
}
