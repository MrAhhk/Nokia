import { requestPlayIntegrityCheck } from "./launcherApps";

describe("Play Integrity adapter", () => {
  const prepare = jest.fn();
  const requestToken = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    window.Capacitor = {
      Plugins: { PlayIntegrity: { prepare, requestToken } },
    };
    prepare.mockResolvedValue({ prepared: true });
    requestToken.mockResolvedValue({ token: "encrypted-integrity-token" });
  });

  afterEach(() => {
    delete window.Capacitor;
    delete global.fetch;
  });

  test("prepares the native provider and sends the token to the backend", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cloudProjectNumber: "123456789",
          challenge: "signed-challenge",
          requestHash: "bound-request-hash",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deviceIntegrity: { meetsDeviceIntegrity: true } }),
      });

    const result = await requestPlayIntegrityCheck({ action: "device-check" });

    expect(prepare).toHaveBeenCalledWith({ cloudProjectNumber: "123456789" });
    expect(requestToken).toHaveBeenCalledWith({ requestHash: "bound-request-hash" });
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/integrity\/verify$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          integrityToken: "encrypted-integrity-token",
          challenge: "signed-challenge",
        }),
      })
    );
    expect(result.deviceIntegrity.meetsDeviceIntegrity).toBe(true);
  });

  test("reports unsupported when the native plugin is unavailable", async () => {
    window.Capacitor = { Plugins: {} };

    await expect(requestPlayIntegrityCheck()).rejects.toThrow(
      "Play Integrity is only available in the Android app"
    );
  });
});
