import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "@/components/NokiaLauncher";
import * as api from "@/lib/launcherApps";
import { CHECK_IN_KEY, ONE_WEEK_MS } from "./checkInState";
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container;
beforeEach(()=>{
  localStorage.clear();window.Capacitor={isNativePlatform:()=>true};
  localStorage.setItem('nokia-launcher.onboarding',JSON.stringify({completed:true}));
  localStorage.setItem(CHECK_IN_KEY,JSON.stringify({startedAt:Date.now()-ONE_WEEK_MS,shown:false}));
  jest.spyOn(api,'getDeviceStatus').mockResolvedValue({});
  jest.spyOn(api,'getDeviceConversations').mockResolvedValue([]);
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();delete window.Capacitor;jest.restoreAllMocks();});
const mount=()=>act(async()=>{await import('./WeekCheckIn');root.render(<NokiaLauncher apps={[]}/>);});
test("one-week invitation survives remount as consumed and blocks Home dial input",async()=>{
  await mount();
  expect(container.querySelector('[data-testid="week-check-in"]')).not.toBeNull();
  expect(JSON.parse(localStorage.getItem(CHECK_IN_KEY)).shown).toBe(true);
  await act(async()=>container.querySelector('[data-testid="keypad-btn-2"]').click());
  expect(container.querySelector('.lcd-dial-number')).toBeNull();
  await act(async()=>window.dispatchEvent(new Event('nokia-home-request')));
  expect(container.querySelector('[data-testid="week-check-in"]')).toBeNull();
  act(()=>root.unmount());root=createRoot(container);await mount();
  expect(container.querySelector('[data-testid="week-check-in"]')).toBeNull();
});
test("does not consume the invitation while onboarding owns the LCD",async()=>{
  localStorage.removeItem('nokia-launcher.onboarding');
  await mount();
  expect(container.querySelector('[data-testid="onboarding-guide"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="week-check-in"]')).toBeNull();
  expect(JSON.parse(localStorage.getItem(CHECK_IN_KEY)).shown).toBe(false);
});
