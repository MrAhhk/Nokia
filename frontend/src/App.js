import LauncherApp from "@/LauncherApp";
import "@/App.css";
import NokiaSystemKeyboard from "@/components/NokiaSystemKeyboard";
import BillingBootstrap from "@/features/billing/BillingBootstrap";
import About from "@/pages/About";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

function App() {
  const isKeyboardView = typeof window !== "undefined" && 
    new URLSearchParams(window.location.search).get("view") === "keyboard";

  // The IME must paint from the first local bundle. A lazy keyboard chunk can
  // leave the InputMethodService showing only its empty fallback when WebView
  // is detached, restored, or the file:// chunk is late to resolve.
  if (isKeyboardView) {
    return <NokiaSystemKeyboard />;
  }

  // These static documents must not mount the launcher's app-cache writers.
  const path = window.location.pathname;
  if (path === '/privacy') return <PrivacyPolicy />;
  if (path === '/terms') return <TermsOfService />;
  if (path === '/about') return <About />;
  if (path !== '/') return <main className="app-loading-shell">Page unavailable.</main>;

  // Home is the launcher critical path. Loading it eagerly avoids a blank
  // fallback during the first resume after Android has reclaimed WebView.
  return <BillingBootstrap><LauncherApp /></BillingBootstrap>;
}

export default App;
