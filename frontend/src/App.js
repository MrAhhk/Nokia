import { useState, useEffect } from "react";
import "@/App.css";
import NokiaLauncher from "@/components/NokiaLauncher";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import About from "@/pages/About";
import { getCachedInstalledApps, getInstalledApps } from "@/lib/launcherApps";
import NokiaSystemKeyboard from "@/components/NokiaSystemKeyboard";

function MainApp() {
  const [apps, setApps] = useState(() => getCachedInstalledApps());

  useEffect(() => {
    const loadApps = async () => {
      try {
        setApps(await getInstalledApps());
      } catch (error) {
        console.error("Error loading installed apps:", error);
        setApps([]);
      }
    };

    loadApps();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NokiaLauncher apps={apps} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  // Check if we are running in System Keyboard mode (IME WebView)
  const isKeyboardView = typeof window !== "undefined" && 
    new URLSearchParams(window.location.search).get("view") === "keyboard";

  if (isKeyboardView) {
    return <NokiaSystemKeyboard />;
  }

  return <MainApp />;
}

export default App;
