import LauncherApp from "@/LauncherApp";
import "@/App.css";
import NokiaSystemKeyboard from "@/components/NokiaSystemKeyboard";

function App() {
  const isKeyboardView = typeof window !== "undefined" && 
    new URLSearchParams(window.location.search).get("view") === "keyboard";

  // The IME must paint from the first local bundle. A lazy keyboard chunk can
  // leave the InputMethodService showing only its empty fallback when WebView
  // is detached, restored, or the file:// chunk is late to resolve.
  if (isKeyboardView) {
    return <NokiaSystemKeyboard />;
  }

  // Home is the launcher critical path. Loading it eagerly avoids a blank
  // fallback during the first resume after Android has reclaimed WebView.
  return <LauncherApp />;
}

export default App;
