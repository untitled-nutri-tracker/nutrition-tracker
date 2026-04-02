import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./layout/AppShell";
import DailyLog from "./pages/DailyLog";
import LogFood from "./pages/FoodSearch";
import Insights from "./pages/Insights";
import AiAdvisor from "./pages/AiAdvisor";
import Settings from "./pages/Settings";
import { NetworkProvider } from "./lib/NetworkContext";
import {
  DatabaseSessionProvider,
  useDatabaseSession,
} from "./lib/DatabaseSessionContext";
import LandingPage from "./pages/LandingPage";

function RoutedApp() {
  const { session, loading } = useDatabaseSession();

  if (loading) {
    return <div className="appLoading">Loading workspace...</div>;
  }

  if (!session.connectedPath) {
    return <LandingPage />;
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
    <NetworkProvider>
      <DatabaseSessionProvider>
        <RoutedApp />
      </DatabaseSessionProvider>
    </NetworkProvider>
  );
}

export default App;
