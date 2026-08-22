import { lazy, Suspense } from "react";
import "@/App.css";

const LauncherApp = lazy(() => import("@/LauncherApp"));
const NokiaSystemKeyboard = lazy(() => import("@/components/NokiaSystemKeyboard"));

const LoadingShell = () => (
  <div className="app-loading-shell" role="presentation" />
);

function App() {
  const isKeyboardView = typeof window !== "undefined" && 
    new URLSearchParams(window.location.search).get("view") === "keyboard";

  return (
    <Suspense fallback={<LoadingShell />}>
      {isKeyboardView ? <NokiaSystemKeyboard /> : <LauncherApp />}
    </Suspense>
  );
}

export default App;
