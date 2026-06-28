import { memo, useEffect, useMemo, useRef } from "react";

const getAppDisplayName = (app) =>
  app?.name ||
  app?.label ||
  app?.title ||
  app?.packageName ||
  "";

const Screen = ({
  currentView,
  menuItems,
  selectedIndex,
  currentTime,
  searchActive,
  searchQuery,
  searchPreviewText,
  onSearchFocus,
  onAppClick,
  dialActive,
  dialNumber,
}) => {
  const menuScrollRef = useRef(null);

  useEffect(() => {
    if (currentView !== "menu") {
      return;
    }

    const container = menuScrollRef.current;
    const selectedRow = container?.querySelector('[data-selected-app-row="true"]');
    if (!container || !selectedRow) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const targetTop =
        selectedRow.offsetTop -
        container.clientHeight / 2 +
        selectedRow.clientHeight / 2;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextScrollTop = Math.min(Math.max(0, targetTop), maxScrollTop);

      container.scrollTo({
        top: nextScrollTop,
        behavior: "auto",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [currentView, selectedIndex, menuItems.length]);

  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  }, [currentTime]);

  const resolvedSearchLabel = useMemo(() => {
    if (!searchActive && !searchQuery) {
      return "SEARCH APPS";
    }

    if (!searchQuery) {
      return "TYPE APP NAME";
    }

    return searchPreviewText || searchQuery;
  }, [searchActive, searchQuery, searchPreviewText]);

  // Render Direct Dialing Screen
  if (dialActive) {
    return (
      <div className="flex-1 overflow-hidden relative flex flex-col justify-between p-2" data-testid="screen-dial">
        <div className="text-xs text-white/50 font-mono tracking-wider text-center uppercase">
          Dialing
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-4xl md:text-5xl font-mono font-bold tracking-tight text-center break-all w-full select-text text-green-400">
            {dialNumber}
          </div>
        </div>

        <div className="flex justify-between text-[10px] md:text-xs font-bold tracking-wider font-mono opacity-80 border-t border-white/10 pt-2 px-1">
          <span className="text-green-500 uppercase">📞 CALL (SEND)</span>
          <span className="text-red-500 uppercase">⌫ CLEAR (END)</span>
        </div>
      </div>
    );
  }

  if (currentView === "home") {
    return (
      <div className="flex-1 overflow-hidden relative flex flex-col" data-testid="screen-home">
        {/* Large Clock Display */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="text-5xl md:text-6xl font-mono font-light tracking-tighter" data-testid="home-time">
            {formattedTime}
          </div>
          <div className="text-sm md:text-base font-mono text-white/60 uppercase tracking-wider" data-testid="home-date">
            {formattedDate}
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
    return (
      <div
        ref={menuScrollRef}
        className="flex-1 overflow-y-auto relative flex flex-col gap-4 mt-4"
        data-testid="screen-menu"
      >
        <button
          type="button"
          className={`
            flex h-10 w-full items-center border px-3 text-left font-mono text-lg font-bold uppercase tracking-tight
            ${searchActive ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"}
          `}
          data-testid="app-search-box"
          onClick={onSearchFocus}
        >
          <span className="block min-w-0 flex-1 truncate">
            {resolvedSearchLabel}
          </span>
        </button>

        <div className="flex flex-col">
          {menuItems.length === 0 && (
            <div className="p-3 text-lg uppercase tracking-tight text-white/50" data-testid="app-search-empty">
              NO MATCHES
            </div>
          )}

          {menuItems.map((app, index) => {
            const isSelected = selectedIndex === index;

            return (
              <AppRow
                key={app.id}
                app={app}
                isSelected={isSelected}
                onClick={() => onAppClick(app)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};

const AppRow = memo(({ app, isSelected, onClick }) => {
  const appName = getAppDisplayName(app) || "Unknown app";

  return (
    <button
      type="button"
      data-selected-app-row={isSelected ? "true" : undefined}
      data-testid={`app-list-item-${app.id}`}
      onClick={onClick}
      className={`
        flex h-12 min-h-12 w-full items-center p-3 border-b border-white/10 text-left transition-none
        ${isSelected ? "border-l-4 border-white bg-white/15 text-white font-bold scale-100" : "text-white font-medium"}
      `}
    >
      <span className="text-lg uppercase tracking-tight truncate">{appName}</span>
    </button>
  );
});

AppRow.displayName = "AppRow";

const areScreenPropsEqual = (previous, next) => {
  if (previous.currentView !== next.currentView) {
    return false;
  }

  if (previous.dialActive !== next.dialActive || previous.dialNumber !== next.dialNumber) {
    return false;
  }

  if (next.currentView === "menu") {
    return (
      previous.menuItems === next.menuItems &&
      previous.selectedIndex === next.selectedIndex &&
      previous.searchActive === next.searchActive &&
      previous.searchQuery === next.searchQuery &&
      previous.searchPreviewText === next.searchPreviewText
    );
  }

  return (
    previous.menuItems === next.menuItems &&
    previous.selectedIndex === next.selectedIndex &&
    previous.currentTime === next.currentTime
  );
};

export default memo(Screen, areScreenPropsEqual);
