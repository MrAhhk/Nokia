import { memo, useEffect, useMemo, useRef } from "react";
import { Search, Phone, MessageSquare, MapPin, Camera } from "lucide-react";

const HOME_ICONS = {
  phone: Phone,
  messages: MessageSquare,
  maps: MapPin,
  camera: Camera,
};

const getAppDisplayName = (app) =>
  app?.displayName ||
  app?.name ||
  app?.label ||
  app?.title ||
  app?.packageName ||
  "";

const Screen = ({
  currentView,
  menuItems,
  selectedIndex,
  selectedHomeTarget,
  currentTime,
  searchActive,
  searchQuery,
  onSearchFocus,
  onAppClick,
  onOpenMenu,
  onOpenSettings,
  onSettingClick,
  onBack,
  dialActive,
  dialNumber,
}) => {
  const menuScrollRef = useRef(null);

  useEffect(() => {
    if (currentView !== "menu" && currentView !== "settings") {
      return;
    }

    const container = menuScrollRef.current;
    const selectedRow = container?.querySelector('[data-selected-app-row="true"]');
    if (!container || !selectedRow) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const rowTop = selectedRow.offsetTop - container.offsetTop;
      const targetTop =
        rowTop -
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
      <div className="lcd-screen" data-testid="screen-home">
        <div className="lcd-status" aria-label="Signal strong, battery full">
          <span className="lcd-signal" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <span className="lcd-battery" aria-hidden="true"><i /><i /><i /></span>
        </div>

        <div className="lcd-time" data-testid="home-time">
            {formattedTime}
        </div>

        <button
          type="button"
          className={`lcd-search ${selectedHomeTarget === "search" ? "is-selected" : ""}`}
          data-testid="home-search"
          aria-label="Search Google"
          onClick={onSearchFocus}
        >
          <Search aria-hidden="true" />
        </button>

        <div className="lcd-shortcuts" data-testid="home-menu">
          {menuItems.map((item, index) => (
            <HomeShortcut
              key={item.id}
              item={item}
              isSelected={selectedHomeTarget === item.id}
              onClick={() => onAppClick(item.action ? item : item.app)}
            />
          ))}
        </div>

        <div className="lcd-softkeys" aria-label="Home screen actions">
          <button
            type="button"
            onClick={onOpenMenu}
          >
            Menu
          </button>
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={onOpenSettings}
          >
            Settings
          </button>
        </div>
      </div>
    );
  }

  if (currentView === "menu" || currentView === "settings") {
    const isSettings = currentView === "settings";

    return (
      <div className="lcd-screen lcd-list-screen" data-testid={isSettings ? "screen-settings" : "screen-menu"}>
        <LcdStatus />
        <div className="lcd-list-time">{formattedTime}</div>
        <div className="lcd-list-title">{isSettings ? "Settings" : "Menu"}</div>

        <div
          ref={menuScrollRef}
          className="lcd-list"
          data-search-active={!isSettings && searchActive ? "true" : undefined}
          data-search-query={!isSettings && searchQuery ? searchQuery : undefined}
        >
          {menuItems.length === 0 && (
            <div className="lcd-list-empty" data-testid="app-search-empty">
              No matches
            </div>
          )}

          {menuItems.map((item, index) => {
            const isSelected = selectedIndex === index;

            return (
              <ListRow
                key={item.id}
                item={item}
                isSelected={isSelected}
                testId={isSettings ? `settings-item-${item.id}` : `app-list-item-${item.id}`}
                onClick={() => isSettings ? onSettingClick(item) : onAppClick(item)}
              />
            );
          })}
        </div>

        {isSettings ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--settings">
            <span aria-hidden="true" />
            <button type="button" onClick={() => onSettingClick(menuItems[selectedIndex])}>Select</button>
            <button type="button" onClick={onBack}>Back</button>
          </div>
        ) : (
          <div className="lcd-list-softkeys lcd-list-softkeys--menu">
            <span aria-hidden="true" />
            <button type="button" onClick={() => onAppClick(menuItems[selectedIndex])}>Select</button>
            <button type="button" onClick={onBack}>Back</button>
          </div>
        )}
      </div>
    );
  }

  return null;
};

const LcdStatus = memo(() => (
  <div className="lcd-status" aria-label="Signal strong, battery full">
    <span className="lcd-signal" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    <span className="lcd-battery" aria-hidden="true"><i /><i /><i /></span>
  </div>
));

LcdStatus.displayName = "LcdStatus";

const HomeShortcut = memo(({ item, isSelected, onClick }) => {
  const Icon = HOME_ICONS[item.id] || Phone;

  return (
    <button
      type="button"
      data-testid={`home-menu-item-${item.id}`}
      className={`lcd-shortcut ${isSelected ? "is-selected" : ""}`}
      onClick={onClick}
      aria-label={`Open ${item.label}`}
    >
      <span className="lcd-shortcut__icon"><Icon aria-hidden="true" /></span>
      <span>{item.label}</span>
    </button>
  );
});

HomeShortcut.displayName = "HomeShortcut";

const ListRow = memo(({ item, isSelected, onClick, testId }) => {
  const itemName = getAppDisplayName(item) || "Unknown item";

  return (
    <button
      type="button"
      data-selected-app-row={isSelected ? "true" : undefined}
      data-testid={testId}
      onClick={onClick}
      className={`lcd-list-row ${isSelected ? "is-selected" : ""}`}
    >
      <span>{itemName}</span>
    </button>
  );
});

ListRow.displayName = "ListRow";

const areScreenPropsEqual = (previous, next) => {
  if (previous.currentView !== next.currentView) {
    return false;
  }

  if (previous.dialActive !== next.dialActive || previous.dialNumber !== next.dialNumber) {
    return false;
  }

  if (next.currentView === "menu" || next.currentView === "settings") {
    return (
      previous.menuItems === next.menuItems &&
      previous.selectedIndex === next.selectedIndex &&
      previous.searchActive === next.searchActive &&
      previous.searchQuery === next.searchQuery
    );
  }

  return (
    previous.menuItems === next.menuItems &&
    previous.selectedIndex === next.selectedIndex &&
    previous.selectedHomeTarget === next.selectedHomeTarget &&
    previous.currentTime === next.currentTime
  );
};

export default memo(Screen, areScreenPropsEqual);
