import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDatabaseSession } from "../lib/DatabaseSessionContext";
function usePageMeta() {
  const { pathname } = useLocation();

  if (pathname === "/") {
    return {
      title: "Daily Log",
      subtitle: "Track meals, macros, hydration and daily intake.",
    };
  }

  if (pathname.startsWith("/log")) {
    return {
      title: "Log Food",
      subtitle: "Search and log food directly to your meal diary.",
    };
  }

  if (pathname.startsWith("/insights")) {
    return {
      title: "Insights",
      subtitle: "Visualize trends and nutrition analytics.",
    };
  }

  if (pathname.startsWith("/ai")) {
    return {
      title: "AI Advisor",
      subtitle: "Smart recommendations powered by AI.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "Settings",
      subtitle: "Manage your profile and preferences.",
    };
  }

  return {
    title: "NutriLog",
    subtitle: "",
  };
}

function NavItem({
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
        `navItem ${isActive ? "navItemActive" : ""}`
      }
    >
      <div className="navIcon">{icon}</div>
      <div className="navLabel">{label}</div>
    </NavLink>
  );
}

export default function AppShell() {
  const { title, subtitle } = usePageMeta();
  const { session, closeDatabase } = useDatabaseSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();


  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon" />
          <div className="brandText">
            <strong>NutriLog</strong>
            <span>Local-first tracker</span>
          </div>
        </div>

        <nav className="nav">
          <NavItem to="/" end label="Daily Log" icon="🗓️" />
          <NavItem to="/log" label="Log Food" icon="🍽️" />
          <NavItem to="/insights" label="Insights" icon="📈" />
          <NavItem to="/ai" label="AI Advisor" icon="🤖" />
          <NavItem to="/settings" label="Settings" icon="⚙️" />
        </nav>

        <div className="footerHint">
          <div className="dbStatusLabel">Connected database</div>
          <div className="dbStatusPath" title={session.connectedPath ?? ""}>
            {session.connectedPath}
          </div>
          <button className="disconnectButton" onClick={closeDatabase} type="button">
            Close database
          </button>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 13, color: "var(--muted2)", marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: "var(--muted2)" }}>
            {session.connectedPath?.split("/").pop()}
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </section>
      
      {/* Global Contextual AI FAB */}
      {pathname !== '/ai' && (
        <button 
          className="global-ai-fab pop-in"
          onClick={() => navigate('/ai')}
          title="Ask AI"
        >
          🤖
        </button>
      )}
    </div>
  );
}
