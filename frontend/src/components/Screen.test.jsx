import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import Screen, { formatCallDate, formatCallDuration } from "./Screen";

global.IS_REACT_ACT_ENVIRONMENT = true;

const renderHome = (deviceStatus, selectedHomeTarget = "search") => renderToStaticMarkup(
  <Screen
    currentView="home"
    menuItems={[]}
    selectedIndex={0}
    selectedHomeTarget={selectedHomeTarget}
    currentTime={new Date("2026-08-21T12:00:00")}
    searchActive={false}
    searchQuery=""
    dialActive={false}
    dialNumber=""
    deviceStatus={deviceStatus}
  />
);

describe("home status icons", () => {
  test("uses volume icons for active and muted alarm audio", () => {
    expect(renderHome({ sirenMuted: false })).toContain("lucide-volume-2");
    expect(renderHome({ sirenMuted: true })).toContain("lucide-volume-x");
  });

  test("renders the selected home clock as a button without an inverse fill", () => {
    const markup = renderHome({}, "clock");
    expect(markup).toContain('class="lcd-time is-selected"');
    expect(markup).toContain('data-testid="home-time"');
    expect(markup).not.toContain('class="lcd-time is-selected" style="background');
  });

  test("keeps the browser reachable through Go to without the removed search bar", () => {
    expect(renderHome({})).toContain('aria-label="Open built-in browser"');
    expect(renderHome({})).toContain('Go to');
    expect(renderHome({})).not.toContain('class="lcd-search');
  });

  test("renders the live carrier and date, with a fallback when no network is available", () => {
    expect(renderHome({ carrierName: "MobiFone" })).toContain('aria-label="MobiFone"');
    expect(renderHome({})).toContain('aria-label="MobiFone"');
    expect(renderHome({})).toContain('aria-label="Fri, 21 Aug"');
  });
});
describe("contacts screen", () => {
  const sampleContacts = [
    { id: "1", name: "An Na", number: "0915231765" },
    { id: "2", name: "Anh Bình", number: "0796359718" },
  ];

  const renderContacts = (query = "", selectedIndex = 0) => renderToStaticMarkup(
    <Screen
      currentView="contacts"
      menuItems={sampleContacts}
      selectedIndex={selectedIndex}
      currentTime={new Date("2026-08-21T12:00:00")}
      searchActive={Boolean(query)}
      searchQuery={query}
      dialActive={false}
      dialNumber=""
      deviceStatus={{}}
    />
  );

  test("renders contacts inside the standard lcd-screen miniscreen shell", () => {
    const markup = renderContacts();
    expect(markup).toContain('data-testid="screen-contacts"');
    expect(markup).toContain('class="lcd-screen lcd-list-screen lcd-list-screen--contacts"');
    expect(markup).toContain('class="lcd-list-title">Contacts</div>');
    expect(markup).toContain('class="lcd-list-search "');
    expect(markup).toContain('An Na');
    expect(markup).toContain('0915231765');
    expect(markup).toContain('Delete');
    expect(markup).toContain('Call');
    expect(markup).toContain('Exit');
  });

  test("displays search query and active state matching app drawer and settings", () => {
    const markup = renderContacts("an", 0);
    expect(markup).toContain('class="lcd-list-search is-active"');
    expect(markup).toContain('<span>an</span>');
  });
});

describe("recent calls screen", () => {
  const sampleCalls = [
    { id: "call_1", number: "0915231765", name: "An Na", type: "missed", date: new Date("2026-08-21T11:30:00").getTime(), duration: 0, sim: "SIM 1" },
    { id: "call_2", number: "0796359718", name: "Anh Bình", type: "outgoing", date: new Date("2026-08-20T10:00:00").getTime(), duration: 125, sim: "SIM 1" },
    { id: "call_3", number: "0918404949", name: "", type: "incoming", date: new Date("2025-05-10T09:15:00").getTime(), duration: 45, sim: "SIM 2" },
  ];

  const renderRecentCalls = (query = "", selectedIndex = 0) => renderToStaticMarkup(
    <Screen
      currentView="recent-calls"
      menuItems={sampleCalls}
      selectedIndex={selectedIndex}
      currentTime={new Date("2026-08-21T12:00:00")}
      searchActive={Boolean(query)}
      searchQuery={query}
      dialActive={false}
      dialNumber=""
      deviceStatus={{}}
    />
  );

  test("renders recent calls inside standard lcd-screen miniscreen shell", () => {
    const markup = renderRecentCalls();
    expect(markup).toContain('data-testid="screen-recent-calls"');
    expect(markup).toContain('class="lcd-screen lcd-list-screen lcd-list-screen--recent-calls"');
    expect(markup).toContain('class="lcd-list-title">Recent Calls</div>');
    expect(markup).toContain('An Na');
    expect(markup).toContain('0915231765');
    expect(markup).toContain('SIM 1');
    expect(markup).toContain('SIM 2');
    expect(markup).toContain('Delete');
    expect(markup).toContain('Call');
    expect(markup).toContain('Exit');
  });

  test("displays call type glyphs and badges for missed, outgoing, and incoming", () => {
    const markup = renderRecentCalls();
    expect(markup).toContain('lcd-call-badge--missed');
    expect(markup).toContain('✕');
    expect(markup).toContain('lcd-call-badge--outgoing');
    expect(markup).toContain('↗');
    expect(markup).toContain('lcd-call-badge--incoming');
    expect(markup).toContain('↙');
  });

  test("formats call duration correctly", () => {
    expect(formatCallDuration(0)).toBe("0s");
    expect(formatCallDuration(45)).toBe("45s");
    expect(formatCallDuration(125)).toBe("2m 5s");
    expect(formatCallDuration(3665)).toBe("1h 1m");
  });

  test("formats call date for today, same year, and past years correctly", () => {
    const now = new Date();
    const todayMs = now.getTime();
    expect(formatCallDate(todayMs)).toContain(":");
    expect(formatCallDate(todayMs)).toContain(String(now.getFullYear()));

    const pastYearDate = new Date("2024-03-15T08:00:00").getTime();
    expect(formatCallDate(pastYearDate)).toContain("2024");
    expect(formatCallDate(pastYearDate)).toContain("08:00");
  });

  test("clicking call row or call softkey invokes callback", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onCallClick = jest.fn();

    act(() => {
      root.render(
        <Screen
          currentView="recent-calls"
          menuItems={sampleCalls}
          selectedIndex={0}
          currentTime={new Date("2026-08-21T12:00:00")}
          onCallClick={onCallClick}
        />
      );
    });

    const callRows = container.querySelectorAll(".lcd-call-row");
    expect(callRows.length).toBe(3);

    act(() => {
      callRows[0].click();
    });
    expect(onCallClick).toHaveBeenCalledWith(sampleCalls[0]);

    act(() => root.unmount());
    container.remove();
  });

  test("clicking Delete softkey invokes onDeleteCall with selected call", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onDeleteCall = jest.fn();

    act(() => {
      root.render(
        <Screen
          currentView="recent-calls"
          menuItems={sampleCalls}
          selectedIndex={1}
          currentTime={new Date("2026-08-21T12:00:00")}
          onDeleteCall={onDeleteCall}
        />
      );
    });

    const deleteBtn = container.querySelector('.lcd-list-softkeys--recent-calls button');
    expect(deleteBtn.textContent).toBe("Delete");

    act(() => {
      deleteBtn.click();
    });
    expect(onDeleteCall).toHaveBeenCalledWith(sampleCalls[1]);

    act(() => root.unmount());
    container.remove();
  });
});

describe("messages screens", () => {
  const sampleConversations = [
    { id: "new_message", type: "action" },
    { id: "c1", address: "0915231765", contactName: "An Na", snippet: "Alo ban co nha khong?", date: 1690000000000 },
  ];

  test("renders messages list with [+ New Message] and conversations", () => {
    const markup = renderToStaticMarkup(
      <Screen
        currentView="messages"
        menuItems={sampleConversations}
        selectedIndex={0}
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('data-testid="screen-messages"');
    expect(markup).toContain('class="lcd-list-title">Messages</div>');
    expect(markup).toContain('[+ New Message]');
    expect(markup).toContain('An Na');
    expect(markup).toContain('Delete');
    expect(markup).toContain('Open');
    expect(markup).toContain('Exit');
  });

  test("renders message-thread view with sender header and bubbles", () => {
    const sampleThread = [
      { id: "m1", body: "Hello", date: 1690000000000, type: 1 },
      { id: "m2", body: "Hi there", date: 1690000060000, type: 2 },
    ];
    const markup = renderToStaticMarkup(
      <Screen
        currentView="message-thread"
        activeThread={{ address: "0915231765", contactName: "An Na" }}
        threadMessages={sampleThread}
        selectedIndex={0}
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('data-testid="screen-message-thread"');
    expect(markup).toContain('An Na');
    expect(markup).toContain('Hello');
    expect(markup).toContain('» Hi there');
    expect(markup).toContain('[REPLY]');
    expect(markup).toContain('Call');
    expect(markup).toContain('Back');
  });

  test("renders message-thread view with image attachment and inline reply bar", () => {
    const sampleThreadWithMedia = [
      { id: "m1", body: "Check this photo", imageUrl: "https://example.com/cat.gif", date: 1690000000000, type: 1 },
      { id: "m2", body: "Nice cat! https://example.com/dog.png", date: 1690000060000, type: 2 },
    ];
    const markup = renderToStaticMarkup(
      <Screen
        currentView="message-thread"
        activeThread={{ address: "0915231765", contactName: "An Na" }}
        threadMessages={sampleThreadWithMedia}
        composeText="typing a direct reply"
        selectedIndex={1}
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('data-testid="screen-message-thread"');
    expect(markup).toContain('data-testid="thread-reply-bar"');
    expect(markup).toContain('typing a direct reply');
    expect(markup).toContain('class="lcd-thread-media"');
    expect(markup).toContain('https://example.com/cat.gif');
    expect(markup).toContain('https://example.com/dog.png');
    // When reply text is present, softkeys show Delete, Send, Back
    expect(markup).toContain('Delete');
    expect(markup).toContain('Send');
    expect(markup).toContain('Back');
  });

  test("renders message-thread view without conflicting lcd-list-screen class or hidden time", () => {
    const thread = [
      { id: "m1", body: "Hello", date: 1690000000000, type: 1 },
    ];
    const markup = renderToStaticMarkup(
      <Screen
        currentView="message-thread"
        activeThread={{ appTag: "[TG]", address: "0915231765", contactName: "Very Long Name That Might Overflow The Header Completely In Mobile View" }}
        threadMessages={thread}
        selectedIndex={0}
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('class="lcd-screen lcd-thread-screen"');
    expect(markup).not.toContain('lcd-list-screen');
    expect(markup).not.toContain('lcd-list-time');
    expect(markup).toContain('[TG] Very Long Name That Might Overflow');
    expect(markup).toContain('1 msgs');
  });

  test("renders clickable links in message body and invokes onOpenUrl on click", () => {
    const threadWithLinks = [
      { id: "m1", body: "Check this link https://example.com/test and see", date: 1690000000000, type: 1 },
    ];
    const onOpenUrl = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Screen
          currentView="message-thread"
          activeThread={{ address: "0915231765", contactName: "An Na" }}
          threadMessages={threadWithLinks}
          selectedIndex={0}
          currentTime={new Date("2026-08-21T12:00:00")}
          deviceStatus={{}}
          onOpenUrl={onOpenUrl}
        />
      );
    });

    const link = container.querySelector('.lcd-thread-bubble-body a');
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("https://example.com/test");
    expect(link.textContent).toBe("https://example.com/test");

    act(() => {
      link.click();
    });

    expect(onOpenUrl).toHaveBeenCalledWith("https://example.com/test");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders message-compose view with recipient, character counter, and cursor", () => {
    const markup = renderToStaticMarkup(
      <Screen
        currentView="message-compose"
        composeRecipient="An Na"
        composeText="Hello Nokia"
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('data-testid="screen-message-compose"');
    expect(markup).toContain('To: An Na');
    expect(markup).toContain('149(1)');
    expect(markup).toContain('Hello Nokia');
    expect(markup).toContain('Send');
    expect(markup).toContain('Delete');
    expect(markup).toContain('Cancel');
  });

  test("renders message-compose view with recipient field active and mode [123]", () => {
    const markup = renderToStaticMarkup(
      <Screen
        currentView="message-compose"
        composeField="recipient"
        recipientInputMode="digits"
        composeRecipient="0915231765"
        composeText=""
        currentTime={new Date("2026-08-21T12:00:00")}
        deviceStatus={{}}
      />
    );
    expect(markup).toContain('data-testid="screen-message-compose"');
    expect(markup).toContain('To: 0915231765');
    expect(markup).toContain('[123]');
    expect(markup).toContain('lcd-composer-to is-active');
  });
});

describe("homescreen shortcuts long press", () => {
  test("triggers onAppLongPress on contextmenu or long press", () => {
    jest.useFakeTimers();
    const onAppLongPress = jest.fn();
    const onAppClick = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const shortcuts = [
      { id: "messages", label: "Messages" },
      { id: "maps", label: "Maps" },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="home"
          menuItems={shortcuts}
          selectedIndex={0}
          selectedHomeTarget="messages"
          currentTime={new Date("2026-08-21T12:00:00")}
          onAppClick={onAppClick}
          onAppLongPress={onAppLongPress}
          deviceStatus={{}}
        />
      );
    });

    const msgBtn = container.querySelector('[data-testid="home-menu-item-messages"]');
    expect(msgBtn).not.toBeNull();

    // Trigger contextmenu
    act(() => {
      msgBtn.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(onAppLongPress).toHaveBeenCalledWith(shortcuts[0]);

    // Test pointer long-press
    act(() => {
      msgBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(onAppLongPress).toHaveBeenCalledTimes(2);

    // After long press, click should be suppressed
    act(() => {
      msgBtn.click();
    });
    expect(onAppClick).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("renders notification conversations with appTag badge on messages screen", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const items = [
      { id: "new_message" },
      { id: "wa1", appTag: "[WA]", contactName: "Sarah", address: "Sarah", snippet: "Check the doc" },
      { id: "tg1", appTag: "[TG]", contactName: "Nam", address: "Nam", snippet: "Di cafe ko" },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="messages"
          menuItems={items}
          selectedIndex={1}
          currentTime={new Date("2026-09-09T12:00:00")}
          onConversationClick={jest.fn()}
          onDelete={jest.fn()}
          onBack={jest.fn()}
        />
      );
    });

    const rows = container.querySelectorAll(".lcd-conversation-row");
    expect(rows.length).toBe(3);
    expect(rows[1].textContent).toContain("[WA] Sarah");
    expect(rows[2].textContent).toContain("[TG] Nam");

    act(() => root.unmount());
    container.remove();
  });
});

describe("home shortcut notification badges", () => {
  test("renders circular notification badge on home shortcuts with positive badgeCount", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const shortcuts = [
      { id: "phone", label: "Phone", badgeCount: 3 },
      { id: "messages", label: "Messages", badgeCount: 5 },
      { id: "ai", label: "ChatGPT", badgeCount: 1 },
      { id: "maps", label: "Maps", badgeCount: 12 },
      { id: "camera", label: "Camera", badgeCount: 9 }, // Camera must NEVER show badge
    ];

    act(() => {
      root.render(
        <Screen
          currentView="home"
          menuItems={shortcuts}
          selectedIndex={0}
          selectedHomeTarget="phone"
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    const phoneItem = container.querySelector('[data-shortcut-id="phone"]');
    expect(phoneItem.querySelector("b")?.textContent).toBe("3");

    const messagesItem = container.querySelector('[data-shortcut-id="messages"]');
    expect(messagesItem.querySelector("b")?.textContent).toBe("5");

    const aiItem = container.querySelector('[data-shortcut-id="ai"]');
    expect(aiItem.querySelector("b")?.textContent).toBe("1");

    const mapsItem = container.querySelector('[data-shortcut-id="maps"]');
    expect(mapsItem.querySelector("b")?.textContent).toBe("12");

    // Camera is strictly excluded from badge display
    const cameraItem = container.querySelector('[data-shortcut-id="camera"]');
    expect(cameraItem.querySelector("b")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  test("caps badgeCount at 99 and does not render when badgeCount is 0", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const shortcuts = [
      { id: "phone", label: "Phone", badgeCount: 150 },
      { id: "messages", label: "Messages", badgeCount: 0 },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="home"
          menuItems={shortcuts}
          selectedIndex={0}
          selectedHomeTarget="phone"
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    const phoneItem = container.querySelector('[data-shortcut-id="phone"]');
    expect(phoneItem.querySelector("b")?.textContent).toBe("99");

    const messagesItem = container.querySelector('[data-shortcut-id="messages"]');
    expect(messagesItem.querySelector("b")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

describe("message deletion and inbox long-press safeguards", () => {
  test("inbox delete requires long press (>=400ms) and single click shows toast", () => {
    jest.useFakeTimers();
    const onDeleteConversation = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const conversations = [
      { id: "c1", address: "0915231765", contactName: "An Na", snippet: "Alo" },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="messages"
          menuItems={conversations}
          selectedIndex={0}
          currentTime={new Date("2026-09-09T12:00:00")}
          onDeleteConversation={onDeleteConversation}
        />
      );
    });

    const softkeys = container.querySelector(".lcd-list-softkeys--messages");
    const deleteBtn = softkeys.querySelectorAll("button")[0];
    expect(deleteBtn.textContent).toBe("Delete");

    // Quick click without holding
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      deleteBtn.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      deleteBtn.click();
    });
    expect(onDeleteConversation).not.toHaveBeenCalled();
    expect(container.querySelector(".lcd-nokia-toast")?.textContent).toBe("Hold to delete");

    // Long press for 400ms
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      jest.advanceTimersByTime(400);
      deleteBtn.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    expect(onDeleteConversation).toHaveBeenCalledWith(conversations[0]);
    expect(container.querySelector(".lcd-nokia-toast")?.textContent).toBe("Deleted");

    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("message-thread delete key deletes selected message when reply bar is empty", () => {
    const onDeleteMessage = jest.fn();
    const onDeleteConversation = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const thread = [
      { id: "m1", body: "Hello", date: 1690000000000, type: 1 },
      { id: "m2", body: "Hi there", date: 1690000060000, type: 2 },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="message-thread"
          activeThread={{ address: "0915231765", contactName: "An Na" }}
          threadMessages={thread}
          selectedIndex={1}
          composeText=""
          currentTime={new Date("2026-09-09T12:00:00")}
          onDeleteMessage={onDeleteMessage}
          onDeleteConversation={onDeleteConversation}
        />
      );
    });

    const softkeys = container.querySelector(".lcd-list-softkeys--thread");
    const deleteBtn = softkeys.querySelectorAll("button")[0];
    expect(deleteBtn.textContent).toBe("Delete");

    act(() => {
      deleteBtn.click();
    });

    expect(onDeleteMessage).toHaveBeenCalledWith(thread[1]);
    expect(onDeleteConversation).not.toHaveBeenCalled();
    expect(container.querySelector(".lcd-nokia-toast")?.textContent).toBe("Message deleted");

    act(() => root.unmount());
    container.remove();
  });

  test("message-thread re-renders when composeText changes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const thread = [
      { id: "m1", body: "Hello", date: 1690000000000, type: 1 },
    ];

    act(() => {
      root.render(
        <Screen
          currentView="message-thread"
          activeThread={{ address: "0915231765", contactName: "An Na" }}
          threadMessages={thread}
          selectedIndex={0}
          composeText=""
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    expect(container.textContent).toContain("Press 0-9 to reply...");

    // Update composeText
    act(() => {
      root.render(
        <Screen
          currentView="message-thread"
          activeThread={{ address: "0915231765", contactName: "An Na" }}
          threadMessages={thread}
          selectedIndex={0}
          composeText="Hello back"
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    expect(container.textContent).toContain("Hello back");
    expect(container.textContent).not.toContain("Press 0-9 to reply...");

    act(() => root.unmount());
    container.remove();
  });

  test("tapping conversation row triggers onConversationClick", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const onConversationClick = jest.fn();
    const conv = { id: "c1", address: "0915231765", contactName: "An Na", snippet: "Hey there" };

    act(() => {
      root.render(
        <Screen
          currentView="messages"
          menuItems={[
            { id: "new_message", address: "" },
            conv,
          ]}
          selectedIndex={1}
          onConversationClick={onConversationClick}
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    const rows = container.querySelectorAll(".lcd-conversation-row");
    expect(rows.length).toBe(2);

    // Simulate touchstart and touchend tap
    const row = rows[1];
    act(() => {
      const touchStart = new Event("touchstart", { bubbles: true });
      Object.defineProperty(touchStart, "touches", { value: [{ clientX: 100, clientY: 100 }] });
      row.dispatchEvent(touchStart);

      const touchEnd = new Event("touchend", { bubbles: true });
      Object.defineProperty(touchEnd, "changedTouches", { value: [{ clientX: 102, clientY: 103 }] });
      row.dispatchEvent(touchEnd);
    });

    expect(onConversationClick).toHaveBeenCalledWith(conv);

    act(() => root.unmount());
    container.remove();
  });

  test("thread navigation uses container scrollTop without calling scrollIntoView", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const scrollIntoViewSpy = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const manyMessages = Array.from({ length: 20 }, (_, i) => ({
      id: `m_${i}`,
      body: `Message content ${i} ${"x".repeat(30)}`,
      date: 1690000000000 + i * 1000,
      type: i % 2 === 0 ? 1 : 2,
    }));

    act(() => {
      root.render(
        <Screen
          currentView="message-thread"
          activeThread={{ address: "0915231765", contactName: "An Na" }}
          threadMessages={manyMessages}
          selectedIndex={19}
          currentTime={new Date("2026-09-09T12:00:00")}
        />
      );
    });

    // scrollIntoView should NEVER be called on bubbles or ancestors
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  test("thread bubble styling enforces flex-shrink 0 and overflow visible to prevent collapsing on 200 msgs", () => {
    const cssPath = path.resolve(__dirname, "NokiaLauncher.css");
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toContain("flex-shrink: 0 !important");
    expect(css).toContain("overflow: visible !important");
    expect(css).toContain(".lcd-thread-bubble.is-selected");
  });
});
