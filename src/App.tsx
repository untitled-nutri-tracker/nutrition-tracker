import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./layout/AppShell";
import DailyLog from "./pages/DailyLog";
import Insights from "./pages/Insights";
import AiAdvisor from "./pages/AiAdvisor";
import Settings from "./pages/Settings";

function App() {
  return (
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
  );
}

export default App;