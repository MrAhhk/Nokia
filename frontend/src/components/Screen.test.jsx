import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import Screen from "./Screen";

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
    expect(markup).toContain('Reply');
    expect(markup).toContain('Call');
    expect(markup).toContain('Back');
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
});
