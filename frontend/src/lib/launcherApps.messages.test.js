import {
  STATIC_FALLBACK_CONVERSATIONS,
  STATIC_FALLBACK_THREADS,
  getDeviceConversations,
  getDeviceThread,
  sendDeviceSms,
} from "./launcherApps";

describe("Messages data bridge", () => {
  beforeEach(() => {
    delete window.Capacitor;
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
});
