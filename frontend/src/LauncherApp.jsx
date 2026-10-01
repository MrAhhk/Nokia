import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import NokiaLauncher from "@/components/NokiaLauncher";
import { getCachedInstalledApps, getInstalledApps, subscribeToInstalledAppsUpdates } from "@/lib/launcherApps";
import About from "@/pages/About";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

const LauncherApp = () => {
  const [apps, setApps] = useState(() => getCachedInstalledApps());
  const activeRef = useRef(false);
  const refreshApps = useCallback(() => {
    // The facade coalesces requests; native package events invalidate the cache.
    getInstalledApps().then((next) => {
      if (activeRef.current) setApps(next);
    }).catch((error) => console.error("Error refreshing installed apps:", error));
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const unsubscribe = subscribeToInstalledAppsUpdates(refreshApps);
    let active = true;
    getInstalledApps()
      .then((installedApps) => active && setApps(installedApps))
      .catch((error) => {
        console.error("Error loading installed apps:", error);
        if (active) setApps([]);
      });
    return () => {
      active = false;
      activeRef.current = false;
      unsubscribe();
    };
  }, [refreshApps]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NokiaLauncher apps={apps} onDrawerOpen={refreshApps} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
};

export default LauncherApp;
