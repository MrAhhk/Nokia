import { useState, useEffect, useCallback } from "react";
import StatusBar from "./StatusBar";
import Screen from "./Screen";
import Keypad from "./Keypad";

const NokiaLauncher = ({ apps }) => {
  const [currentView, setCurrentView] = useState("home"); // 'home', 'menu', 'app'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [menuItems, setMenuItems] = useState([]);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Prepare menu items based on current view
  useEffect(() => {
    if (currentView === "home") {
      setMenuItems([
        { id: "menu", label: "Menu", action: () => setCurrentView("menu") },
        { id: "contacts", label: "Contacts", action: () => console.log("Contacts") },
        { id: "messages", label: "Messages", action: () => console.log("Messages") },
      ]);
      setSelectedIndex(0);
    } else if (currentView === "menu") {
      setMenuItems(apps);
      setSelectedIndex(0);
    }
  }, [currentView, apps]);

  // Handle navigation
  const handleNavigation = useCallback(
    (direction) => {
      setSelectedIndex((prev) => {
        const currentLength = menuItems.length;
        if (direction === "up") {
          return prev > 0 ? prev - 1 : currentLength - 1;
        } else if (direction === "down") {
          return prev < currentLength - 1 ? prev + 1 : 0;
        }
        return prev;
      });
    },
    [menuItems.length]
  );

  // Handle selection
  const handleSelect = useCallback(() => {
    if (currentView === "home" && menuItems[selectedIndex]) {
      menuItems[selectedIndex].action();
    } else if (currentView === "menu" && menuItems[selectedIndex]) {
      console.log(`Opening app: ${menuItems[selectedIndex].name}`);
      // Here you could open the app or show app details
    }
  }, [currentView, selectedIndex, menuItems]);

  // Handle back
  const handleBack = useCallback(() => {
    if (currentView === "menu") {
      setCurrentView("home");
    }
  }, [currentView]);

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-black text-white select-none" data-testid="nokia-launcher">
      {/* Top Screen - 50% */}
      <div className="h-[50dvh] w-full p-4 relative flex flex-col bg-black border-b border-white/20">
        <StatusBar currentTime={currentTime} />
        <Screen
          currentView={currentView}
          menuItems={menuItems}
          selectedIndex={selectedIndex}
          currentTime={currentTime}
        />
      </div>

      {/* Bottom Keypad - 50% */}
      <div className="h-[50dvh] w-full p-4 md:p-6 bg-[#050505] flex items-center justify-center">
        <Keypad
          onNavigation={handleNavigation}
          onSelect={handleSelect}
          onBack={handleBack}
        />
      </div>
    </div>
  );
};

export default NokiaLauncher;