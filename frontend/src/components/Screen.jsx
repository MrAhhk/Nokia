import * as Icons from "lucide-react";

const Screen = ({ currentView, menuItems, selectedIndex, currentTime }) => {
  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  };

  const getIcon = (iconName) => {
    const Icon = Icons[iconName];
    return Icon ? <Icon size={20} /> : <Icons.Square size={20} />;
  };

  if (currentView === "home") {
    return (
      <div className="flex-1 overflow-hidden relative flex flex-col" data-testid="screen-home">
        {/* Large Clock Display */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="text-5xl md:text-6xl font-mono font-light tracking-tighter" data-testid="home-time">
            {formatTime(currentTime)}
          </div>
          <div className="text-sm md:text-base font-mono text-white/60 uppercase tracking-wider" data-testid="home-date">
            {formatDate(currentTime)}
          </div>
        </div>

        {/* Menu Options */}
        <div className="flex flex-col gap-1 mt-4" data-testid="home-menu">
          {menuItems.map((item, index) => (
            <div
              key={item.id}
              data-testid={`home-menu-item-${item.id}`}
              className={`
                flex items-center gap-3 p-3 border-b border-white/10 transition-none
                ${selectedIndex === index ? "bg-white text-black font-bold" : "text-white/70"}
              `}
            >
              <span className="text-lg uppercase tracking-tight">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (currentView === "menu") {
    // Separate important and unimportant apps
    const importantApps = menuItems.filter((app) => app.category === "important");
    const unimportantApps = menuItems.filter((app) => app.category === "unimportant");
    const allApps = [...importantApps, ...unimportantApps];

    return (
      <div className="flex-1 overflow-y-auto relative flex flex-col gap-4 mt-4" data-testid="screen-menu">
        <div className="text-xl uppercase tracking-tight font-bold mb-2" data-testid="menu-title">
          ALL APPS
        </div>

        <div className="flex flex-col">
          {allApps.map((app, index) => {
            const isImportant = app.category === "important";
            const isSelected = selectedIndex === index;

            return (
              <div
                key={app.id}
                data-testid={`app-list-item-${app.id}`}
                className={`
                  flex items-center gap-3 p-3 border-b border-white/10 transition-none
                  ${isSelected ? "bg-white text-black font-bold scale-100" : ""}
                  ${!isSelected && isImportant ? "text-white font-medium" : ""}
                  ${!isSelected && !isImportant ? "text-white/40 text-sm" : ""}
                `}
              >
                <div className={isSelected ? "text-black" : isImportant ? "text-white" : "text-white/40"}>
                  {getIcon(app.icon)}
                </div>
                <span className="text-lg uppercase tracking-tight">{app.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};

export default Screen;