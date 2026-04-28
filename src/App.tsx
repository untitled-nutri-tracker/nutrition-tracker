import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./layout/AppShell";
import DailyLog from "./pages/DailyLog";
import LogFood from "./pages/FoodSearch";
import Insights from "./pages/Insights";
import AiAdvisor from "./pages/AiAdvisor";
import Settings from "./pages/Settings";
import { NetworkProvider } from "./lib/NetworkContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { ToastProvider } from "./lib/ToastContext";
import {
  DatabaseSessionProvider,
  useDatabaseSession,
} from "./lib/DatabaseSessionContext";
import WorkspaceSetupPage from "./pages/WorkspaceSetupPage";

function RoutedApp() {
  const { session, loading } = useDatabaseSession();

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#0d0d12] text-muted text-sm">
        Loading workspace…
      </div>
    );
  }

  if (!session.connectedPath) {
    return <WorkspaceSetupPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell key={session.connectedPath} />}>
          <Route path="/" element={<DailyLog />} />
          <Route path="/log" element={<LogFood />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/ai" element={<AiAdvisor />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NetworkProvider>
          <DatabaseSessionProvider>
            <RoutedApp />
          </DatabaseSessionProvider>
        </NetworkProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
