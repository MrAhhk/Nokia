import { memo, useCallback, useEffect, useMemo, useRef } from "react";
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

const ChatGptIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 8.737a4.485 4.485 0 0 1 2.338-1.972V12.3a.76.76 0 0 0 .392.68l5.844 3.37-2.02 1.168a.075.075 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 8.737zm16.597 3.855l-5.833-3.387L15.119 8a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 10.07V7.734a.08.08 0 0 1 .033-.061l4.839-2.795a4.5 4.5 0 0 1 6.61 4.743v.005zm-11.455 3.528l2.516-1.452 2.515 1.452v2.905l-2.515 1.452-2.516-1.452z" fillRule="evenodd" />
  </svg>
);

const HOME_ICONS = {
  phone: Phone,
  messages: MessageSquare,
  ai: ChatGptIcon,
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

const formatMessageDate = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
};

const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

const formatSmsCounter = (text = "") => {
  const len = text.length;
  const maxChars = 160;
  const segment = Math.floor(len / maxChars) + 1;
  const remaining = maxChars - (len % maxChars);
  return `${remaining}(${segment})`;
};

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
  onAppLongPress,
  onOpenMenu,
  onOpenSettings,
  onSettingClick,
  onContactClick,
  onConversationClick,
  activeThread,
  threadMessages,
  onReplyClick,
  composeRecipient,
  composeText,
  onSendSms,
  onListSearchFocus,
  onBack,
  dialActive,
  dialNumber,
  isCalling = false,
  onCall,
  onDelete,
  deviceStatus,
  onNotificationStatusClick,
  onNotificationModeCycle,
  onSirenToggle,
  onStatusIconClick,
}) => {
  const menuScrollRef = useRef(null);

  useEffect(() => {
    if (
      currentView !== "menu" &&
      currentView !== "settings" &&
      currentView !== "contacts" &&
      currentView !== "messages" &&
      currentView !== "ai" &&
      currentView !== "maps" &&
      currentView !== "message-thread"
    ) {
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
  }, [currentView, selectedIndex, menuItems?.length, threadMessages?.length]);

  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    const weekday = currentTime.toLocaleDateString("en-US", { weekday: "short" });
    const day = String(currentTime.getDate()).padStart(2, "0");
    const month = currentTime.toLocaleDateString("en-US", { month: "short" });
    return `${weekday}, ${day} ${month}`;
  }, [currentTime]);

  // Render Direct Dialing Screen
  if (dialActive) {
    return (
      <div className="lcd-screen lcd-dial-screen" data-testid="screen-dial">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-dial-label">{isCalling ? "Calling..." : "Enter number"}</div>
        <div className="lcd-dial-number" aria-live="polite">{dialNumber}</div>
        <div className="lcd-dial-rule" aria-hidden="true" />
        <div className="lcd-dial-softkeys">
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onCall?.(dialNumber); }}
            onClick={(e) => { e.preventDefault(); }}
          >
            Call
          </button>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onDelete?.(); }}
            onClick={(e) => { e.preventDefault(); }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  if (currentView === "home") {
    return (
      <div className="lcd-screen lcd-home" data-testid="screen-home">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />

        <div className="lcd-identity">
          <div className="lcd-carrier" aria-label={deviceStatus?.carrierName || "MobiFone"}>
            {deviceStatus?.carrierName || "MobiFone"}
          </div>
          <div className="lcd-date" aria-label={formattedDate}>
            {formattedDate}
          </div>
        </div>

        <button
          type="button"
          className={`lcd-time ${selectedHomeTarget === "clock" ? "is-selected" : ""}`}
          data-testid="home-time"
          aria-label={`Open Clock, current time ${formattedTime}`}
          onClick={onClockClick}
        >
          <span>{formattedTime}</span>
        </button>

        <div className="lcd-shortcuts" data-testid="home-menu">
          {menuItems.map((item, index) => (
            <HomeShortcut
              key={item.id}
              item={item}
              isSelected={selectedHomeTarget === item.id}
              onClick={() => onAppClick(item.id === "messages" ? item : (item.action ? item : (item.app || item)))}
              onLongPress={() => onAppLongPress?.(item)}
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

  if (currentView === "menu" || currentView === "settings" || currentView === "contacts" || currentView === "messages" || currentView === "ai" || currentView === "maps") {
    const isSettings = currentView === "settings";
    const isContacts = currentView === "contacts";
    const isMessages = currentView === "messages";
    const isAi = currentView === "ai";
    const isMaps = currentView === "maps";
    const screenTitle = isSettings ? "Settings" : isContacts ? "Contacts" : isMessages ? "Messages" : isAi ? "AI" : isMaps ? "Maps" : "Menu";

    return (
      <div className={`lcd-screen lcd-list-screen ${isContacts ? "lcd-list-screen--contacts" : ""}`} data-testid={isContacts ? "screen-contacts" : isSettings ? "screen-settings" : isMessages ? "screen-messages" : isAi ? "screen-ai" : isMaps ? "screen-maps" : "screen-menu"}>
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-list-time">{formattedTime}</div>
        <div className="lcd-list-header">
          <div className="lcd-list-title">{screenTitle}</div>
          <button
            type="button"
            className={`lcd-list-search ${searchActive ? "is-active" : ""}`}
            onClick={onListSearchFocus}
            aria-label={`Search ${screenTitle.toLowerCase()}`}
          >
            <Search aria-hidden="true" />
            <span>{searchQuery || "Search"}</span>
            {searchActive && !searchQuery && <i aria-hidden="true" />}
          </button>
        </div>

        <div
          ref={menuScrollRef}
          className={`lcd-list ${isContacts ? "lcd-list--contacts" : ""}`}
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

            if (isContacts) {
              return (
                <div
                  key={item.id || `${item.name}-${item.number}-${index}`}
                  className={`lcd-contact-row ${isSelected ? "is-selected" : ""}`}
                  data-selected-app-row={isSelected ? "true" : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => onContactClick ? onContactClick(item) : onAppClick(item)}
                >
                  <div className="lcd-contact-name">{item.name}</div>
                  <div className="lcd-contact-number">{item.number}</div>
                </div>
              );
            }

            if (isMessages && (item.id === "new_message" || item.address || item.snippet)) {
              if (item.id === "new_message") {
                return (
                  <div
                    key="new_message"
                    className={`lcd-conversation-row lcd-conversation-new ${isSelected ? "is-selected" : ""}`}
                    data-selected-app-row={isSelected ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => onConversationClick ? onConversationClick(item) : onAppClick(item)}
                  >
                    <span>[+ New Message]</span>
                  </div>
                );
              }

              return (
                <div
                  key={item.id || `${item.address}-${index}`}
                  className={`lcd-conversation-row ${isSelected ? "is-selected" : ""}`}
                  data-selected-app-row={isSelected ? "true" : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => onConversationClick ? onConversationClick(item) : onAppClick(item)}
                >
                  <div className="lcd-conversation-top">
                    <span className="lcd-conversation-name">{item.contactName || item.address || "Unknown"}</span>
                    <span className="lcd-conversation-date">{formatMessageDate(item.date)}</span>
                  </div>
                  <div className="lcd-conversation-snippet">{item.snippet || ""}</div>
                </div>
              );
            }

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

        {isContacts ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--contacts">
            <button type="button" onClick={onDelete}>Delete</button>
            <button type="button" onClick={() => onContactClick ? onContactClick(menuItems[selectedIndex]) : onAppClick(menuItems[selectedIndex])}>Call</button>
            <button type="button" onClick={onBack}>Exit</button>
          </div>
        ) : isMessages ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--messages">
            <button type="button" onClick={onDelete}>Delete</button>
            <button type="button" onClick={() => onConversationClick ? onConversationClick(menuItems[selectedIndex]) : onAppClick(menuItems[selectedIndex])}>Open</button>
            <button type="button" onClick={onBack}>Exit</button>
          </div>
        ) : isSettings ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--settings">
            <button type="button" onClick={onDelete}>Delete</button>
            <button type="button" onClick={() => onSettingClick(menuItems[selectedIndex])}>Select</button>
            <button type="button" onClick={onBack}>Exit</button>
          </div>
        ) : (
          <div className="lcd-list-softkeys lcd-list-softkeys--menu">
            <button type="button" onClick={onDelete}>Delete</button>
            <button type="button" onClick={() => onAppClick(menuItems[selectedIndex])}>Select</button>
            <button type="button" onClick={onBack}>Exit</button>
          </div>
        )}
      </div>
    );
  }

  if (currentView === "message-thread") {
    const threadRecipient = activeThread?.contactName || activeThread?.address || "Unknown";
    const threadList = threadMessages || [];

    return (
      <div className="lcd-screen lcd-list-screen lcd-thread-screen" data-testid="screen-message-thread">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-list-time">{formattedTime}</div>
        <div className="lcd-list-header">
          <div className="lcd-list-title">{threadRecipient}</div>
          <div className="lcd-composer-counter">{threadList.length} msgs</div>
        </div>

        <div ref={menuScrollRef} className="lcd-list lcd-thread-container">
          {threadList.length === 0 && (
            <div className="lcd-list-empty">No messages</div>
          )}
          {threadList.map((msg, index) => {
            const isOut = msg.type === 2;
            const isSelected = selectedIndex === index;
            return (
              <div
                key={msg.id || `${msg.date}-${index}`}
                className={`lcd-thread-bubble ${isOut ? "lcd-thread-bubble--out" : "lcd-thread-bubble--in"} ${isSelected ? "is-selected" : ""}`}
                data-selected-app-row={isSelected ? "true" : undefined}
              >
                <div className="lcd-thread-bubble-body">
                  {isOut ? `» ${msg.body}` : msg.body}
                </div>
                <div className="lcd-thread-bubble-time">
                  {formatMessageTime(msg.date)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lcd-list-softkeys lcd-list-softkeys--thread">
          <button type="button" onClick={onReplyClick}>Reply</button>
          <button type="button" onClick={() => onCall ? onCall(activeThread?.address) : null}>Call</button>
          <button type="button" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  if (currentView === "message-compose") {
    return (
      <div className="lcd-screen lcd-list-screen lcd-composer-screen" data-testid="screen-message-compose">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-list-time">{formattedTime}</div>
        <div className="lcd-composer-to">
          <span>To: {composeRecipient || "Recipient"}</span>
          <span className="lcd-composer-counter">{formatSmsCounter(composeText)}</span>
        </div>

        <div className="lcd-composer-body">
          {composeText || ""}
          <span className="lcd-composer-cursor" />
        </div>

        <div className="lcd-list-softkeys lcd-list-softkeys--composer">
          <button type="button" onClick={onSendSms}>Send</button>
          <button type="button" onClick={onDelete}>Delete</button>
          <button type="button" onClick={onBack}>Cancel</button>
        </div>
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

const HomeShortcut = memo(({ item, isSelected, onClick, onLongPress }) => {
  const Icon = HOME_ICONS[item.id] || Phone;
  const timerRef = useRef(null);
  const longPressFiredRef = useRef(false);

  const startPress = useCallback(() => {
    if (!onLongPress) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    longPressFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      timerRef.current = null;
      onLongPress();
    }, 400);
  }, [onLongPress]);

  const endPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleClick = useCallback((e) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      e?.preventDefault?.();
      return;
    }
    onClick?.();
  }, [onClick]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (onLongPress) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      longPressFiredRef.current = true;
      onLongPress();
    }
  }, [onLongPress]);

  return (
    <button
      type="button"
      data-testid={`home-menu-item-${item.id}`}
      data-shortcut-id={item.id}
      className={`lcd-shortcut ${isSelected ? "is-selected" : ""}`}
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={handleContextMenu}
      aria-label={`Open ${item.label}`}
    >
      <span className="lcd-shortcut__icon"><Icon aria-hidden="true" /></span>
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

  if (
    previous.dialActive !== next.dialActive ||
    previous.dialNumber !== next.dialNumber ||
    previous.isCalling !== next.isCalling
  ) {
    return false;
  }

  if (previous.deviceStatus !== next.deviceStatus) return false;

  if (next.currentView === "message-thread") {
    return (
      previous.threadMessages === next.threadMessages &&
      previous.selectedIndex === next.selectedIndex &&
      previous.activeThread === next.activeThread
    );
  }

  if (next.currentView === "message-compose") {
    return (
      previous.composeRecipient === next.composeRecipient &&
      previous.composeText === next.composeText
    );
  }

  if (next.currentView === "menu" || next.currentView === "settings" || next.currentView === "contacts" || next.currentView === "messages" || next.currentView === "ai" || next.currentView === "maps") {
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
