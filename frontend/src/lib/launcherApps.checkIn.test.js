import { openAppReview, shareLauncherApp } from "./launcherApps";
afterEach(()=>{delete window.Capacitor;jest.restoreAllMocks();});
test("review and share route through existing bridge without calling or sending messages",async()=>{
  const plugin={openAppReview:jest.fn().mockResolvedValue({}),shareApp:jest.fn().mockResolvedValue({}),makePhoneCall:jest.fn(),sendSms:jest.fn()};
  window.Capacitor={Plugins:{LauncherApps:plugin}};
  await openAppReview();await shareLauncherApp();
  expect(plugin.openAppReview).toHaveBeenCalledTimes(1);expect(plugin.shareApp).toHaveBeenCalledTimes(1);
  expect(plugin.makePhoneCall).not.toHaveBeenCalled();expect(plugin.sendSms).not.toHaveBeenCalled();
});
