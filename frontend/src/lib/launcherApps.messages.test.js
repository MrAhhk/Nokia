import {
  STATIC_FALLBACK_CONVERSATIONS,
  STATIC_FALLBACK_THREADS,
  getDeviceConversations,
  getDeviceThread,
  sendDeviceSms,
  subscribeToSmsUpdates,
  clearSmsCaches,
  getDeviceNotificationConversations,
  replyDeviceNotification,
  subscribeToNotificationMessages,
} from "./launcherApps";

describe("Messages data bridge", () => {
  test("late native listener registration is removed after unsubscribe", async () => {
    let resolve;
    let listener;
    const remove = jest.fn().mockResolvedValue(undefined);
    window.Capacitor = { Plugins: { LauncherApps: { addListener: (_name, callback) => {
      listener = callback;
      return new Promise((done) => { resolve = done; });
    } } } };
    const callback = jest.fn();
    const stop = subscribeToNotificationMessages(callback);
    stop();
    resolve({ remove });
    await Promise.resolve();
    listener({ body: "late" });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });

  test("empty native inbox never displays preview messages", async () => {
    window.Capacitor = { Plugins: { LauncherApps: { getConversations: jest.fn().mockResolvedValue({ conversations: [] }) } } };
    expect(await getDeviceConversations(true)).toEqual([]);
  });
  test("invalidation during a query refreshes before returning stale records", async () => {
    let resolveOld;
    const fresh = [{ id: "new" }];
    const getConversations = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue({ conversations: fresh });
    window.Capacitor = { Plugins: { LauncherApps: { getConversations } } };
    const pending = getDeviceConversations(true);
    await Promise.resolve();
    clearSmsCaches();
    resolveOld({ conversations: [{ id: "old" }] });
    expect(await pending).toEqual(fresh);
    expect(await getDeviceConversations()).toEqual(fresh);
    expect(getConversations).toHaveBeenCalledTimes(2);
  });

  test("native thread failure does not fabricate preview messages", async () => {
    window.Capacitor = { Plugins: { LauncherApps: {
      getThreadMessages: jest.fn().mockRejectedValue(new Error("provider unavailable")),
    } } };
    expect(await getDeviceThread("1", "", true)).toEqual([]);
  });

  beforeEach(() => {
    delete window.Capacitor;
    clearSmsCaches();
  });

  test("returns static fallback conversations when Capacitor plugin is unavailable", async () => {
    const conversations = await getDeviceConversations(true);
    expect(Array.isArray(conversations)).toBe(true);
    expect(conversations.length).toBeGreaterThanOrEqual(1);
    expect(conversations[0].contactName).toBe("An Na");
    expect(conversations[0].snippet).toContain("Alo");
  });

  test("returns thread messages fallback when Capacitor plugin is unavailable", async () => {
    const messages = await getDeviceThread("1", "0915231765", true);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].body).toBe("Chào bạn");
  });

  test("uses in-memory caching on subsequent calls", async () => {
    const first = await getDeviceConversations();
    const second = await getDeviceConversations();
    expect(first).toBe(second);
  });

  test("forced conversation and thread refreshes join matching requests already in flight", async () => {
    let resolveConversations;
    let resolveThread;
    const getConversations = jest.fn(() => new Promise((resolve) => { resolveConversations = resolve; }));
    const getThreadMessages = jest.fn(() => new Promise((resolve) => { resolveThread = resolve; }));
    window.Capacitor = { Plugins: { LauncherApps: { getConversations, getThreadMessages } } };

    const conversations = getDeviceConversations();
    const forcedConversations = getDeviceConversations(true);
    const thread = getDeviceThread("thread-1", "+100", false);
    const forcedThread = getDeviceThread("thread-1", "+100", true);

    await Promise.resolve();
    expect(getConversations).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).toHaveBeenCalledTimes(1);
    resolveConversations({ conversations: [{ id: "conversation-1" }] });
    resolveThread({ messages: [{ id: "message-1" }] });
    await expect(Promise.all([conversations, forcedConversations])).resolves.toEqual([
      [{ id: "conversation-1" }],
      [{ id: "conversation-1" }],
    ]);
    await expect(Promise.all([thread, forcedThread])).resolves.toEqual([
      [{ id: "message-1" }],
      [{ id: "message-1" }],
    ]);
  });

  test("delegates sendSms to plugin when available and returns result", async () => {
    const mockSend = jest.fn().mockResolvedValue({ sent: true, fallback: false });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          sendSms: mockSend,
        },
      },
    };

    const result = await sendDeviceSms("0915231765", "Test SMS");
    expect(mockSend).toHaveBeenCalledWith({ address: "0915231765", body: "Test SMS" });
    expect(result.sent).toBe(true);
  });

  test("subscribes to real-time SMS updates and calls callback on event", async () => {
    let registeredCallback = null;
    const mockAddListener = jest.fn().mockImplementation((eventName, cb) => {
      registeredCallback = cb;
      return Promise.resolve({ remove: jest.fn() });
    });

    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          addListener: mockAddListener,
        },
      },
    };

    const onUpdate = jest.fn();
    const unsubscribe = subscribeToSmsUpdates(onUpdate);

    expect(mockAddListener).toHaveBeenCalledWith("smsReceived", expect.any(Function));

    // Simulate native SMS received event
    registeredCallback({ type: "received", address: "0915231765" });
    expect(onUpdate).toHaveBeenCalledWith({ type: "received", address: "0915231765" });

    unsubscribe();
  });

  test("returns empty array when getDeviceNotificationConversations has no plugin", async () => {
    const notifs = await getDeviceNotificationConversations();
    expect(Array.isArray(notifs)).toBe(true);
  });

  test("calls plugin getNotificationConversations when available", async () => {
    const mockList = [{ id: "n1", appTag: "[WA]", contactName: "Sarah", snippet: "Hello" }];
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          getNotificationConversations: jest.fn().mockResolvedValue({ conversations: mockList }),
        },
      },
    };

    const notifs = await getDeviceNotificationConversations();
    expect(notifs).toEqual(mockList);
  });

  test("calls plugin replyNotificationMessage when available", async () => {
    const mockReply = jest.fn().mockResolvedValue({ success: true });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          replyNotificationMessage: mockReply,
        },
      },
    };

    const result = await replyDeviceNotification("key_123", "Hello from Nokia");
    expect(mockReply).toHaveBeenCalledWith({ notificationKey: "key_123", body: "Hello from Nokia" });
    expect(result.success).toBe(true);
  });

  test("subscribes to real-time notification messages", async () => {
    let notifCallback = null;
    const mockAddListener = jest.fn().mockImplementation((eventName, cb) => {
      notifCallback = cb;
      return Promise.resolve({ remove: jest.fn() });
    });

    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          addListener: mockAddListener,
        },
      },
    };

    const onNotif = jest.fn();
    const unsub = subscribeToNotificationMessages(onNotif);

    expect(mockAddListener).toHaveBeenCalledWith("notificationMessageReceived", expect.any(Function));
    notifCallback({ id: "n1", appTag: "[TG]", body: "Hello Telegram" });
    expect(onNotif).toHaveBeenCalledWith({ id: "n1", appTag: "[TG]", body: "Hello Telegram" });

    unsub();
  });
});
