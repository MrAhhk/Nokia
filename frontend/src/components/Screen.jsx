import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
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
  return date.toLocaleDateString([], { year: "numeric", month: "numeric", day: "numeric" });
};

const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (date.toDateString() === now.toDateString()) {
    return timeStr;
  }
  const dateStr = date.toLocaleDateString([], { year: "numeric", month: "numeric", day: "numeric" });
  return `${dateStr} ${timeStr}`;
};

export const formatCallDate = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const timeStr = `${hours}:${mins}`;
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${timeStr} ${day}/${month}/${year}`;
};

export const formatCallDuration = (durationInSeconds) => {
  if (!durationInSeconds || durationInSeconds <= 0) return "0s";
  const sec = Math.floor(durationInSeconds);
  const mins = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${remainingSec}s`;
  }
  return `${sec}s`;
};

const formatSmsCounter = (text = "") => {
  const len = text.length;
  const maxChars = 160;
  const segment = Math.floor(len / maxChars) + 1;
  const remaining = maxChars - (len % maxChars);
  return `${remaining}(${segment})`;
};

const extractImageUrl = (body) => {
  if (!body || typeof body !== "string") return null;
  if (body.startsWith("data:image/")) return body;
  const dataUriMatch = body.match(/(data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+)/);
  if (dataUriMatch) return dataUriMatch[1];
  const match = body.match(/(https?:\/\/[^\s]+?\.(?:gif|png|jpe?g|webp)(?:\?[^\s]*)?)/i);
  if (match) return match[1];
  const gifMatch = body.match(/(https?:\/\/(?:media\.tenor\.com|c\.tenor\.com|media\.giphy\.com|i\.giphy\.com|i\.imgur\.com)[^\s]+)/i);
  if (gifMatch) return gifMatch[1];
  return null;
};

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

const renderBodyWithLinks = (text, isOut, onOpenUrl) => {
  if (!text) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(URL_REGEX);

  while ((match = regex.exec(text)) !== null) {
    const url = match[0];
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }
    parts.push(
      <a
        key={`link_${matchIndex}`}
        href={url}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenUrl?.(url);
        }}
        rel="noopener noreferrer"
      >
        {url}
      </a>
    );
    lastIndex = matchIndex + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {isOut ? "» " : ""}
      {parts}
    </>
  );
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
  onCallClick,
  onConversationClick,
  activeThread,
  threadMessages,
  onReplyClick,
  composeRecipient,
  composeRecipientNumber,
  composeField = "body",
  recipientInputMode = "digits",
  caseMode = "abc",
  onSelectComposeField,
  composeText,
  onSendSms,
  messageSendStatus = "",
  onListSearchFocus,
  onBack,
  dialActive,
  dialNumber,
  isCalling = false,
  onCall,
  onDelete,
  onDeleteCall,
  onDeleteConversation,
  onDeleteMessage,
  onOpenUrl,
  deviceStatus,
  onNotificationStatusClick,
  onNotificationModeCycle,
  onSirenToggle,
  onStatusIconClick,
}) => {
  const menuScrollRef = useRef(null);
  const composerInputRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const [toastMessage, setToastMessage] = useState("");
  const prevThreadLenRef = useRef(0);
  const prevViewForScrollRef = useRef(currentView);
  const deleteLongPressTimerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const toastTimerRef = useRef(null);
  useLayoutEffect(() => {
    setToastMessage("");
    return () => {
    clearTimeout(toastTimerRef.current);
    clearTimeout(deleteLongPressTimerRef.current);
    deleteLongPressTimerRef.current = null;
    isLongPressRef.current = false;
    };
  }, [currentView]);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 800);
  }, []);

  const handleTouchStart = useCallback((e) => {
    const touch = (e.touches && e.touches[0]) || (e.nativeEvent?.touches && e.nativeEvent.touches[0]);
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }
  }, []);

  const handleTouchEnd = useCallback((e, item, type = "conversation") => {
    const touch = (e.changedTouches && e.changedTouches[0]) || (e.nativeEvent?.changedTouches && e.nativeEvent.changedTouches[0]);
    if (touch) {
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        if (type === "message") {
          showToast("Message deleted");
          onDeleteMessage?.(item);
        } else {
          showToast("Deleted");
          onDeleteConversation?.(item);
        }
        return;
      }

      if (type === "conversation") {
        const startTime = touchStartRef.current.time || Date.now();
        const elapsed = Date.now() - startTime;
        if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && elapsed < 400) {
          if (onConversationClick) {
            onConversationClick(item);
          } else if (onAppClick) {
            onAppClick(item);
          }
        }
      }
    }
  }, [onConversationClick, onAppClick, onDeleteConversation, onDeleteMessage, showToast]);

  const handleInboxDeleteDown = useCallback(() => {
    isLongPressRef.current = false;
    deleteLongPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      showToast("Deleted");
      const item = menuItems[selectedIndex];
      if (item && item.id !== "new_message" && !item.isNotificationAccessPrompt) {
        onDeleteConversation?.(item);
      }
    }, 400);
  }, [menuItems, selectedIndex, onDeleteConversation, showToast]);

  const handleInboxDeleteUp = useCallback((e) => {
    e?.preventDefault?.();
    if (deleteLongPressTimerRef.current) {
      clearTimeout(deleteLongPressTimerRef.current);
      deleteLongPressTimerRef.current = null;
    }
    if (!isLongPressRef.current) {
      showToast("Hold to delete");
    }
    isLongPressRef.current = false;
  }, [showToast]);

  const handleInboxDeleteCancel = useCallback(() => {
    if (deleteLongPressTimerRef.current) {
      clearTimeout(deleteLongPressTimerRef.current);
      deleteLongPressTimerRef.current = null;
    }
    isLongPressRef.current = false;
  }, []);

  // Thread scroll: auto-scroll to bottom only when entering thread or when a new message arrives
  useEffect(() => {
    if (currentView === "message-thread") {
      const currentLen = threadMessages?.length || 0;
      const enteredView = prevViewForScrollRef.current !== "message-thread";
      const hasNewMessage = currentLen > prevThreadLenRef.current;
      prevViewForScrollRef.current = currentView;
      prevThreadLenRef.current = currentLen;

      if (enteredView || hasNewMessage) {
        const scrollToBottom = () => {
          if (menuScrollRef.current) {
            menuScrollRef.current.scrollTop = menuScrollRef.current.scrollHeight;
          }
        };
        scrollToBottom();
        const r1 = requestAnimationFrame(scrollToBottom);
        return () => cancelAnimationFrame(r1);
      }
    } else {
      prevViewForScrollRef.current = currentView;
    }
  }, [currentView, threadMessages?.length]);

  // Thread D-Pad scroll: scroll selected message bubble into view using strictly internal container scrollTop.
  // NEVER use scrollIntoView, which causes Chromium to scroll ancestor containers and break the launcher UI!
  useEffect(() => {
    if (currentView === "message-thread") {
      const container = menuScrollRef.current;
      if (!container) return;
      const selectedBubble = container.querySelector('[data-selected-app-row="true"]');
      if (selectedBubble) {
        const containerRect = container.getBoundingClientRect();
        const bubbleRect = selectedBubble.getBoundingClientRect();
        const bubbleTop = (bubbleRect.top - containerRect.top) + container.scrollTop;
        const bubbleBottom = bubbleTop + bubbleRect.height;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;

        if (bubbleTop < viewTop) {
          container.scrollTop = bubbleTop;
        } else if (bubbleBottom > viewBottom) {
          container.scrollTop = bubbleBottom - container.clientHeight;
        }
      }
    }
  }, [currentView, selectedIndex]);

  // Auto-scroll composer input to bottom as user types so active cursor is visible,
  // and keep message history anchored to bottom when composer expands.
  useEffect(() => {
    if (currentView === "message-thread") {
      const frame = requestAnimationFrame(() => {
        if (composerInputRef.current) {
          composerInputRef.current.scrollTop = composerInputRef.current.scrollHeight;
        }
        if (menuScrollRef.current) {
          const container = menuScrollRef.current;
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
          if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
          }
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [currentView, composeText]);

  // List scroll for other views
  useEffect(() => {
    if (
      currentView !== "menu" &&
      currentView !== "settings" &&
      currentView !== "contacts" &&
      currentView !== "recent-calls" &&
      currentView !== "messages" &&
      currentView !== "ai" &&
      currentView !== "maps" &&
      currentView !== "phone" &&
      currentView !== "cameras" &&
      currentView !== "messages-picker"
    ) {
      return;
    }

    const container = menuScrollRef.current;
    if (!container) return;

    const selectedRow = container.querySelector('[data-selected-app-row="true"]');
    if (!selectedRow) {
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

      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          top: nextScrollTop,
          behavior: "auto",
        });
      } else {
        container.scrollTop = nextScrollTop;
      }
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
              onClick={() => onAppClick(item.action ? item : (item.app || item))}
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

  if (currentView === "menu" || currentView === "settings" || currentView === "contacts" || currentView === "recent-calls" || currentView === "messages" || currentView === "ai" || currentView === "maps" || currentView === "phone" || currentView === "cameras" || currentView === "messages-picker") {
    const isSettings = currentView === "settings";
    const isContacts = currentView === "contacts";
    const isRecentCalls = currentView === "recent-calls";
    const isMessages = currentView === "messages";
    const isAi = currentView === "ai";
    const isMaps = currentView === "maps";
    const isPhone = currentView === "phone";
    const isCameras = currentView === "cameras";
    const isMessagesPicker = currentView === "messages-picker";
    const screenTitle = isSettings ? "Settings" : isContacts ? "Contacts" : isRecentCalls ? "Recent Calls" : (isMessages || isMessagesPicker) ? "Messages" : isAi ? "AI" : isMaps ? "Maps" : isPhone ? "Phone" : isCameras ? "Camera" : "Menu";

    return (
      <div className={`lcd-screen lcd-list-screen ${isContacts ? "lcd-list-screen--contacts" : isRecentCalls ? "lcd-list-screen--recent-calls" : ""}`} data-testid={isContacts ? "screen-contacts" : isRecentCalls ? "screen-recent-calls" : isSettings ? "screen-settings" : isMessages ? "screen-messages" : isMessagesPicker ? "screen-messages-picker" : isAi ? "screen-ai" : isMaps ? "screen-maps" : isPhone ? "screen-phone" : isCameras ? "screen-cameras" : "screen-menu"}>
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
          className={`lcd-list ${isContacts ? "lcd-list--contacts" : isRecentCalls ? "lcd-list--recent-calls" : ""}`}
          data-search-active={!isSettings && searchActive ? "true" : undefined}
          data-search-query={!isSettings && searchQuery ? searchQuery : undefined}
        >
          {menuItems.length === 0 && (
            <div className="lcd-list-empty" data-testid="app-search-empty">
              {isRecentCalls ? "No recent calls" : "No matches"}
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

            if (isRecentCalls) {
              const isMissed = item.type === "missed";
              const isOutgoing = item.type === "outgoing";
              const typeGlyph = isMissed ? "✕" : isOutgoing ? "↗" : "↙";
              const typeLabel = isMissed ? "Missed" : isOutgoing ? "Outgoing" : "Incoming";

              return (
                <div
                  key={item.id || `${item.number}-${item.date}-${index}`}
                  className={`lcd-call-row ${isSelected ? "is-selected" : ""} ${isMissed ? "is-missed" : ""}`}
                  data-selected-app-row={isSelected ? "true" : undefined}
                  data-testid={`call-row-${item.id || index}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onCallClick ? onCallClick(item) : onContactClick ? onContactClick(item) : onAppClick(item)}
                >
                  <div className="lcd-call-top">
                    <div className="lcd-call-caller">
                      <span className={`lcd-call-badge lcd-call-badge--${item.type || "incoming"}`} title={typeLabel}>
                        {typeGlyph}
                      </span>
                      <span className="lcd-call-name">
                        {item.name || item.number || "Unknown"}
                      </span>
                    </div>
                    <div className="lcd-call-time">
                      {formatCallDate(item.date)}
                    </div>
                  </div>
                  <div className="lcd-call-bottom">
                    <span className="lcd-call-number">
                      {item.name ? item.number : ""}
                    </span>
                    <div className="lcd-call-meta">
                      <span className="lcd-call-sim">{item.sim || "SIM 1"}</span>
                      <span className="lcd-call-duration">
                        {isMissed ? "Missed" : formatCallDuration(item.duration)}
                      </span>
                    </div>
                  </div>
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

              if (item.isNotificationAccessPrompt) {
                return (
                  <div
                    key={item.id}
                    className={`lcd-conversation-row is-access-prompt ${isSelected ? "is-selected" : ""}`}
                    data-selected-app-row={isSelected ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => onConversationClick ? onConversationClick(item) : onAppClick(item)}
                  >
                    <div className="lcd-conversation-top">
                      <span className="lcd-conversation-name">⚠️ Enable Notif Sync</span>
                    </div>
                    <div className="lcd-conversation-snippet">Select to allow in Settings</div>
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
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleTouchEnd(e, item)}
                >
                  <div className="lcd-conversation-top">
                    <span className="lcd-conversation-name">{item.unread ? "● " : ""}{item.appTag ? `${item.appTag} ` : ""}{item.contactName || item.address || "Unknown"}</span>
                    <span className="lcd-conversation-date">{formatMessageDate(item.date)}</span>
                  </div>
                  <div className="lcd-conversation-snippet">
                    {item.snippet?.startsWith("data:image/") ? "[Hình ảnh]" : (item.snippet || (item.imageUrl ? "[Hình ảnh]" : ""))}
                  </div>
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
        ) : isRecentCalls ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--recent-calls">
            <button type="button" onClick={() => onDeleteCall ? onDeleteCall(menuItems[selectedIndex]) : onDelete?.()}>Delete</button>
            <button type="button" onClick={() => onCallClick ? onCallClick(menuItems[selectedIndex]) : onContactClick ? onContactClick(menuItems[selectedIndex]) : onAppClick(menuItems[selectedIndex])}>Call</button>
            <button type="button" onClick={onBack}>Exit</button>
          </div>
        ) : isMessages ? (
          <div className="lcd-list-softkeys lcd-list-softkeys--messages">
            <button
              type="button"
              onPointerDown={handleInboxDeleteDown}
              onPointerUp={handleInboxDeleteUp}
              onPointerLeave={handleInboxDeleteCancel}
              onClick={() => {
                if (!isLongPressRef.current) {
                  showToast("Hold to delete");
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              Delete
            </button>
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

        {toastMessage && <div className="lcd-nokia-toast">{toastMessage}</div>}
      </div>
    );
  }

  if (currentView === "message-thread") {
    const threadRecipient = `${activeThread?.appTag ? `${activeThread.appTag} ` : ""}${activeThread?.contactName || activeThread?.address || "Unknown"}`;
    const threadList = threadMessages || [];

    return (
      <div className="lcd-screen lcd-thread-screen" data-testid="screen-message-thread">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
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
            const mediaSrc = msg.imageUrl || extractImageUrl(msg.body);
            let displayBody = msg.body || "";
            if (displayBody.startsWith("data:image/")) {
              displayBody = "";
            } else if (mediaSrc && displayBody.trim() === mediaSrc.trim()) {
              displayBody = "";
            }
            return (
              <div
                key={`msg_${msg.id || msg.date || index}_${index}`}
                className={`lcd-thread-bubble ${isOut ? "lcd-thread-bubble--out" : "lcd-thread-bubble--in"} ${isSelected ? "is-selected" : ""}`}
                data-selected-app-row={isSelected ? "true" : undefined}
                onTouchStart={handleTouchStart}
                onTouchEnd={(e) => handleTouchEnd(e, msg, "message")}
              >
                {mediaSrc && (
                  <div className="lcd-thread-media-wrapper">
                    <img
                      src={mediaSrc}
                      alt="attachment"
                      className="lcd-thread-media"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                )}
                {displayBody ? (
                  <div className="lcd-thread-bubble-body">
                    {renderBodyWithLinks(displayBody, isOut, onOpenUrl)}
                  </div>
                ) : null}
                <div className="lcd-thread-bubble-time">
                  {formatMessageTime(msg.date)}
                </div>
              </div>
            );
          })}
        </div>

        {toastMessage && <div className="lcd-nokia-toast">{toastMessage}</div>}

        {messageSendStatus && <div role="status" className="lcd-nokia-toast">{messageSendStatus}</div>}

        {/* Direct inline reply composer */}
        <div className="lcd-thread-composer" data-testid="thread-reply-bar">
          <div className="lcd-thread-composer-header">
            <span className="lcd-thread-composer-badge">[REPLY]</span>
            <span className="lcd-thread-composer-counter">{formatSmsCounter(composeText)}</span>
            <span className="lcd-thread-composer-mode">{(caseMode || "abc").toUpperCase()}</span>
          </div>
          <div ref={composerInputRef} className="lcd-thread-composer-input">
            {composeText ? (
              <span className="lcd-thread-composer-text">{composeText}</span>
            ) : (
              <span className="lcd-thread-composer-placeholder">Press 0-9 to reply...</span>
            )}
            <span className="lcd-composer-cursor" />
          </div>
        </div>

        <div className="lcd-list-softkeys lcd-list-softkeys--thread">
          {composeText ? (
            <>
              <button type="button" onClick={onDelete}>Delete</button>
              <button type="button" onClick={onSendSms}>Send</button>
              <button type="button" onClick={onBack}>Back</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => {
                const selectedMsg = threadList[selectedIndex];
                if (selectedMsg) {
                  showToast("Message deleted");
                  if (onDeleteMessage) onDeleteMessage(selectedMsg);
                  else if (onDeleteConversation) onDeleteConversation(activeThread);
                  else onDelete?.();
                }
              }}>Delete</button>
              <button type="button" onClick={() => onCall ? onCall(activeThread?.address) : null}>Call</button>
              <button type="button" onClick={onBack}>Back</button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (currentView === "message-compose") {
    const isRecipientActive = composeField === "recipient";
    const isBodyActive = composeField === "body";

    return (
      <div className="lcd-screen lcd-list-screen lcd-composer-screen" data-testid="screen-message-compose">
        <LcdStatus status={deviceStatus} onNotificationsClick={onNotificationModeCycle} onNotificationsLongPress={onNotificationStatusClick} onSirenToggle={onSirenToggle} onStatusClick={onStatusIconClick} />
        <div className="lcd-list-time">{formattedTime}</div>
        <div
          className={`lcd-composer-to ${isRecipientActive ? "is-active" : ""}`}
          onClick={() => onSelectComposeField?.("recipient")}
        >
          <div className="lcd-composer-to-content">
            <span>To: {composeRecipient || (isRecipientActive ? "" : "Recipient")}</span>
            {isRecipientActive && <span className="lcd-composer-cursor" />}
          </div>
          <div className="lcd-composer-to-meta">
            {isRecipientActive && (
              <span className="lcd-composer-mode">
                [{recipientInputMode === "digits" ? "123" : (caseMode || "abc")}]
              </span>
            )}
            <span className="lcd-composer-counter">{formatSmsCounter(composeText)}</span>
          </div>
        </div>

        <div
          className={`lcd-composer-body ${isBodyActive ? "is-active" : ""}`}
          onClick={() => onSelectComposeField?.("body")}
        >
          {composeText || ""}
          {isBodyActive && <span className="lcd-composer-cursor" />}
        </div>

        {messageSendStatus && <div role="status" className="lcd-nokia-toast">{messageSendStatus}</div>}
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

  useEffect(() => endPress, [endPress]);

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

  const badgeCount = item.id === "camera" ? 0 : (item.badgeCount || 0);

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
      onPointerLeave={endPress}
      onContextMenu={handleContextMenu}
      aria-label={`Open ${item.label}`}
    >
      <span className="lcd-shortcut__icon">
        <Icon aria-hidden="true" />
        {badgeCount > 0 && <b>{Math.min(badgeCount, 99)}</b>}
      </span>
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
      role={typeof item.switchOn === "boolean" ? "switch" : undefined}
      aria-checked={typeof item.switchOn === "boolean" ? item.switchOn : undefined}
      aria-label={typeof item.switchOn === "boolean" ? item.switchLabel : undefined}
      className={`lcd-list-row ${isSelected ? "is-selected" : ""} ${item.id === "customization" ? "is-customization" : ""} ${item.id === "dumb-mode" && item.switchOn ? "is-dumb-mode-active" : ""}`}
    >
      <span>{itemName}</span>
      {typeof item.switchOn === "boolean" && <span className={`lcd-setting-switch ${item.switchOn ? "is-on" : ""}`} aria-hidden="true"><span /></span>}
    </button>
  );
});

ListRow.displayName = "ListRow";

const areScreenPropsEqual = (previous, next) => {
  // A callback closes over navigation/default-app state even if the visible
  // rows are unchanged. Keeping an older callback can send taps to stale state.
  if (Object.keys({ ...previous, ...next }).some((key) =>
    (typeof previous[key] === "function" || typeof next[key] === "function") &&
    previous[key] !== next[key]
  )) return false;
  if (previous.messageSendStatus !== next.messageSendStatus) return false;
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

  const prevDs = previous.deviceStatus;
  const nextDs = next.deviceStatus;
  if (prevDs !== nextDs) {
    if (
      !prevDs ||
      !nextDs ||
      prevDs.notificationCount !== nextDs.notificationCount ||
      prevDs.notificationMode !== nextDs.notificationMode ||
      prevDs.batteryLevel !== nextDs.batteryLevel ||
      prevDs.charging !== nextDs.charging ||
      prevDs.powerSave !== nextDs.powerSave ||
      prevDs.wifi !== nextDs.wifi ||
      prevDs.bluetooth !== nextDs.bluetooth ||
      prevDs.vpn !== nextDs.vpn ||
      prevDs.sirenMuted !== nextDs.sirenMuted ||
      prevDs.carrierName !== nextDs.carrierName
    ) {
      return false;
    }
  }

  if (next.currentView === "message-thread") {
    return (
      previous.threadMessages === next.threadMessages &&
      previous.selectedIndex === next.selectedIndex &&
      previous.activeThread === next.activeThread &&
      previous.composeText === next.composeText &&
      previous.caseMode === next.caseMode &&
      previous.onOpenUrl === next.onOpenUrl
    );
  }

  if (next.currentView === "message-compose") {
    return (
      previous.composeRecipient === next.composeRecipient &&
      previous.composeRecipientNumber === next.composeRecipientNumber &&
      previous.composeField === next.composeField &&
      previous.recipientInputMode === next.recipientInputMode &&
      previous.caseMode === next.caseMode &&
      previous.composeText === next.composeText
    );
  }

  if (next.currentView === "menu" || next.currentView === "settings" || next.currentView === "contacts" || next.currentView === "recent-calls" || next.currentView === "messages" || next.currentView === "ai" || next.currentView === "maps" || next.currentView === "phone" || next.currentView === "cameras" || next.currentView === "messages-picker") {
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
