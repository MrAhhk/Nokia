import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import NokiaLauncher from "@/components/NokiaLauncher";
import { getCachedInstalledApps, getInstalledApps } from "@/lib/launcherApps";
import About from "@/pages/About";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

const LauncherApp = () => {
  const [apps, setApps] = useState(() => getCachedInstalledApps());

  useEffect(() => {
    let active = true;
    getInstalledApps()
      .then((installedApps) => active && setApps(installedApps))
      .catch((error) => {
        console.error("Error loading installed apps:", error);
        if (active) setApps([]);
      });
    return () => {
      active = false;
    };
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
};

export default LauncherApp;
