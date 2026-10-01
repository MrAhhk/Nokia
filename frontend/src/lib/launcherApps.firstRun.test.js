beforeEach(() => { jest.resetModules(); delete window.Capacitor; });
afterEach(() => { delete window.Capacitor; });

test.each([
  ["getDeviceContacts", "getContacts", "contacts"],
  ["getDeviceConversations", "getConversations", "conversations"],
])("%s retries after a denied first permission instead of caching an empty success", async (facade, method, field) => {
  const query = jest.fn().mockRejectedValueOnce(new Error("permission_denied"))
    .mockResolvedValue({ [field]: [{ id: "real" }] });
  window.Capacitor = { Plugins: { LauncherApps: { [method]: query } } };
  const api = require("./launcherApps");
  await expect(api[facade]()).resolves.toEqual([]);
  await expect(api[facade]()).resolves.toEqual([{ id: "real" }]);
  expect(query).toHaveBeenCalledTimes(2);
});
