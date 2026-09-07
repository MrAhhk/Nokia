import { memo, useEffect, useMemo, useRef } from "react";
import PixelText from "./PixelText";
import {
  BatteryCharging,
  Bell,
  BellOff,
  Bluetooth,
  Camera,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Vibrate,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";

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
  onClockClick,
  onAppClick,
  onOpenMenu,
  onOpenSettings,
  onSettingClick,
  onListSearchFocus,
  onBack,
  dialActive,
  dialNumber,
  deviceStatus,
  onNotificationStatusClick,
  onNotificationModeCycle,
  onSirenToggle,
  onStatusIconClick,
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
      <div className="lcd-screen lcd-dial-screen" data-testid="screen-dial">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-dial-label">Enter number</div>
        <div className="lcd-dial-number" aria-live="polite">{dialNumber}</div>
        <div className="lcd-dial-rule" aria-hidden="true" />
        <div className="lcd-dial-softkeys">
          <span>Call</span>
          <span>Clear</span>
        </div>
      </div>
    );
  }

  if (currentView === "home") {
    return (
      <div className="lcd-screen lcd-home" data-testid="screen-home">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />

        <div className="lcd-identity">
          <div className="lcd-carrier"><PixelText>{deviceStatus?.carrierName || "MobiFone"}</PixelText></div>
          <div className="lcd-date"><PixelText>{`${currentTime.toLocaleDateString("en-US", { weekday: "short" })}, ${String(currentTime.getDate()).padStart(2, "0")} ${currentTime.toLocaleDateString("en-US", { month: "short" })}`}</PixelText></div>
        </div>

        <button
          type="button"
          className={`lcd-time ${selectedHomeTarget === "clock" ? "is-selected" : ""}`}
          data-testid="home-time"
          aria-label={`Open Clock, current time ${formattedTime}`}
          onClick={onClockClick}
        >
          <span><PixelText>{formattedTime}</PixelText></span>
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
          <button type="button" className={selectedHomeTarget === "search" ? "is-selected" : ""} onClick={onSearchFocus} aria-label="Open built-in browser">Go to</button>
          <button
            type="button"
            onClick={onOpenMenu}
          >
            Menu
          </button>
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
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-list-time">{formattedTime}</div>
        <div className="lcd-list-header">
          <div className="lcd-list-title">{isSettings ? "Settings" : "Menu"}</div>
          <button
            type="button"
            className={`lcd-list-search ${searchActive ? "is-active" : ""}`}
            onClick={onListSearchFocus}
            aria-label={`Search ${isSettings ? "settings" : "apps"}`}
          >
            <Search aria-hidden="true" />
            <span>{searchQuery || "Search"}</span>
            {searchActive && !searchQuery && <i aria-hidden="true" />}
          </button>
        </div>

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

const LcdStatus = memo(({ status, onNotificationsClick, onNotificationsLongPress, onSirenToggle, onStatusClick }) => (
  <div className="lcd-status" aria-label="Live device status">
    <span className="lcd-status__left">
      <StatusButton label="Open network settings" onClick={() => onStatusClick("network")}>
        <span className="lcd-signal" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      </StatusButton>
      {status?.wifi && <StatusButton label="Open Wi-Fi settings" onClick={() => onStatusClick("wifi")}><Wifi /></StatusButton>}
      {status?.bluetooth && <StatusButton label="Open Bluetooth settings" onClick={() => onStatusClick("bluetooth")}><Bluetooth /></StatusButton>}
      {status?.vpn && <StatusButton label="Open VPN settings" onClick={() => onStatusClick("vpn")}><ShieldCheck /></StatusButton>}
      <StatusButton
        label={status?.sirenMuted ? "Alarm audio muted" : "Alarm audio active"}
        onClick={onSirenToggle}
      >
        {status?.sirenMuted
          ? <VolumeX aria-hidden="true" />
          : <Volume2 aria-hidden="true" />}
      </StatusButton>
    </span>
    <span className="lcd-status__right">
      <button
        type="button"
        className="lcd-notifications"
        onClick={onNotificationsClick}
        onContextMenu={(event) => { event.preventDefault(); onNotificationsLongPress(); }}
        aria-label={`Notifications ${status?.notificationMode || "active"}; tap to change mode`}
      >
        {status?.notificationMode === "muted"
          ? <BellOff aria-hidden="true" />
          : status?.notificationMode === "vibrate"
            ? <Vibrate aria-hidden="true" />
            : <Bell aria-hidden="true" />}
        {!!status?.notificationCount && <b>{Math.min(status.notificationCount, 99)}</b>}
      </button>
      {status?.powerSave && <StatusButton label="Open power-saving settings" onClick={() => onStatusClick("battery")}><span className="lcd-power-save">P</span></StatusButton>}
      {status?.charging && <StatusButton label="Open battery settings" onClick={() => onStatusClick("battery")}><BatteryCharging className="lcd-charging" /></StatusButton>}
      <StatusButton label={`Open battery settings, ${status?.batteryLevel ?? 100}% remaining`} onClick={() => onStatusClick("battery")}>
        <span className="lcd-battery" aria-hidden="true"><i style={{ width: `${Math.max(4, status?.batteryLevel ?? 100)}%` }} /></span>
      </StatusButton>
    </span>
  </div>
));

const StatusButton = ({ label, onClick, children }) => (
  <button type="button" className="lcd-status-button" aria-label={label} onClick={onClick}>
    {children}
  </button>
);

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

  if (previous.deviceStatus !== next.deviceStatus) return false;

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
