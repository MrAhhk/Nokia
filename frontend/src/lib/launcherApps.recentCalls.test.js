import {
  STATIC_FALLBACK_RECENT_CALLS,
  getDeviceRecentCalls,
  deleteDeviceRecentCall,
  clearRecentCallsCache,
  subscribeToRecentCallsUpdates,
} from "./launcherApps";

describe("Recent Calls data bridge", () => {
  beforeEach(() => {
    delete window.Capacitor;
    clearRecentCallsCache();
  });

  test("returns static fallback recent calls when Capacitor plugin is unavailable", async () => {
    const calls = await getDeviceRecentCalls(true);
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].number).toBe("0915231765");
    expect(calls[0].name).toBe("An Na");
    expect(calls[0].type).toBe("missed");
    expect(calls[0].sim).toBe("SIM 1");
  });

  test("uses in-memory caching on subsequent calls", async () => {
    const first = await getDeviceRecentCalls();
    const second = await getDeviceRecentCalls();
    expect(first).toBe(second);
  });

  test("forceRefresh bypasses cache and re-queries", async () => {
    const first = await getDeviceRecentCalls();
    clearRecentCallsCache();
    const second = await getDeviceRecentCalls(true);
    expect(first).toEqual(second);
  });

  test("delegates to Capacitor plugin when available", async () => {
    const mockCalls = [
      { id: "c1", number: "0123456789", name: "Alice", type: "incoming", date: 1000, duration: 60, sim: "SIM 1" },
    ];
    const mockGetRecentCalls = jest.fn().mockResolvedValue({ calls: mockCalls });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          getRecentCalls: mockGetRecentCalls,
        },
      },
    };

    const calls = await getDeviceRecentCalls(true);
    expect(mockGetRecentCalls).toHaveBeenCalled();
    expect(calls).toEqual(mockCalls);
  });

  test("deleteDeviceRecentCall invalidates cache only after confirmed deletion", async () => {
    const mockDelete = jest.fn().mockResolvedValue({ success: true });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          deleteRecentCall: mockDelete,
          getRecentCalls: jest.fn().mockResolvedValue({ calls: [] }),
        },
      },
    };

    await getDeviceRecentCalls(true);
    const res = await deleteDeviceRecentCall("call_1");
    expect(mockDelete).toHaveBeenCalledWith({ id: "call_1" });
    expect(res.success).toBe(true);

    const after = await getDeviceRecentCalls();
    expect(after.find((c) => c.id === "call_1")).toBeUndefined();
  });

  test("an invalidation during a query retries without joining its own promise", async () => {
    let finish;
    const latest = [{ id: "latest" }];
    const query = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ calls: latest });
    window.Capacitor = { Plugins: { LauncherApps: { getRecentCalls: query } } };
    const pending = getDeviceRecentCalls(true);
    clearRecentCallsCache();
    finish({ calls: [{ id: "stale" }] });
    await expect(pending).resolves.toEqual(latest);
    expect(query).toHaveBeenCalledTimes(2);
    await expect(getDeviceRecentCalls()).resolves.toEqual(latest);
  });

  test("failed deletion preserves the cached row", async () => {
    const calls = [{ id: "keep" }];
    window.Capacitor = { Plugins: { LauncherApps: {
      getRecentCalls: jest.fn().mockResolvedValue({ calls }),
      deleteRecentCall: jest.fn().mockResolvedValue({ success: false }),
    } } };
    await getDeviceRecentCalls(true);
    await expect(deleteDeviceRecentCall("keep")).resolves.toEqual({ success: false });
    await expect(getDeviceRecentCalls()).resolves.toEqual(calls);
  });

  test("different limits share a bounded complete snapshot without poisoning the cache", async () => {
    const calls = [{ id: "1" }, { id: "2" }];
    const query = jest.fn().mockResolvedValue({ calls });
    window.Capacitor = { Plugins: { LauncherApps: { getRecentCalls: query } } };
    await expect(getDeviceRecentCalls(false, 1)).resolves.toEqual(calls.slice(0, 1));
    await expect(getDeviceRecentCalls()).resolves.toEqual(calls);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ limit: 100 });
  });

  test("retains empty array when plugin returns empty calls without falling back to mock", async () => {
    const mockGetRecentCalls = jest.fn().mockResolvedValue({ calls: [] });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          getRecentCalls: mockGetRecentCalls,
        },
      },
    };

    const calls = await getDeviceRecentCalls(true);
    expect(mockGetRecentCalls).toHaveBeenCalled();
    expect(calls).toEqual([]);

    const cachedCalls = await getDeviceRecentCalls();
    expect(cachedCalls).toEqual([]);
  });

  test("a forced refresh joins a recent-calls request already in flight", async () => {
    let resolveRequest;
    const mockGetRecentCalls = jest.fn(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    window.Capacitor = { Plugins: { LauncherApps: { getRecentCalls: mockGetRecentCalls } } };

    const first = getDeviceRecentCalls();
    const forced = getDeviceRecentCalls(true);
    expect(mockGetRecentCalls).toHaveBeenCalledTimes(1);

    resolveRequest({ calls: [] });
    await expect(Promise.all([first, forced])).resolves.toEqual([[], []]);
  });

  test("subscribeToRecentCallsUpdates listens to recentCallsChanged and clears cache", async () => {
    let listenerCallback;
    const mockAddListener = jest.fn().mockImplementation((event, cb) => {
      listenerCallback = cb;
      return Promise.resolve({ remove: jest.fn() });
    });
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          addListener: mockAddListener,
          getRecentCalls: jest.fn().mockResolvedValue({ calls: [] }),
        },
      },
    };

    const onUpdate = jest.fn();
    const unsubscribe = subscribeToRecentCallsUpdates(onUpdate);
    expect(mockAddListener).toHaveBeenCalledWith("recentCallsChanged", expect.any(Function));

    listenerCallback({ timestamp: 12345 });
    expect(onUpdate).toHaveBeenCalledWith({ timestamp: 12345 });

    unsubscribe();
  });
});
