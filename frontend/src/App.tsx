import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { CamerasPage } from "./pages/Cameras";
import { EventsPage } from "./pages/Events";
import { LivePage } from "./pages/Live";
import { SettingsPage } from "./pages/Settings";
import { StatsPage } from "./pages/Stats";

export function App() {
  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1500px] mx-auto px-7 py-7">
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/cameras" element={<CamerasPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
