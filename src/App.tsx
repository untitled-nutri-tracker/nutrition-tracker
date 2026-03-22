import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./layout/AppShell";
import DailyLog from "./pages/DailyLog";
import Insights from "./pages/Insights";
import AiAdvisor from "./pages/AiAdvisor";
import Settings from "./pages/Settings";
import { NetworkProvider } from "./lib/NetworkContext";

function App() {
  return (
    <NetworkProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DailyLog />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/ai" element={<AiAdvisor />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </NetworkProvider>
  );
}

export default App;