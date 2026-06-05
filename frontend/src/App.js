import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import NokiaLauncher from "@/components/NokiaLauncher";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await axios.get(`${API}/apps`);
        setApps(response.data.apps);
      } catch (error) {
        console.error("Error fetching apps:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, [API]);

  if (loading) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-black text-white font-mono">
        <div data-testid="loading-indicator">LOADING...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NokiaLauncher apps={apps} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;