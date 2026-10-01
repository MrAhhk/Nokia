import { CHECK_IN_KEY, ONE_WEEK_MS, claimWeekCheckIn } from "./checkInState";
beforeEach(() => localStorage.clear());
test("starts locally and waits for a full week, then consumes the invitation exactly once", () => {
  expect(claimWeekCheckIn(localStorage, 100)).toBe(false);
  expect(claimWeekCheckIn(localStorage, 100 + ONE_WEEK_MS - 1)).toBe(false);
  expect(claimWeekCheckIn(localStorage, 100 + ONE_WEEK_MS)).toBe(true);
  expect(claimWeekCheckIn(localStorage, 100 + ONE_WEEK_MS * 20)).toBe(false);
});
test("defers while a flow is active and survives a backwards clock", () => {
  claimWeekCheckIn(localStorage, 100);
  expect(claimWeekCheckIn(localStorage, 0)).toBe(false);
  expect(claimWeekCheckIn(localStorage, 100 + ONE_WEEK_MS, false)).toBe(false);
  expect(claimWeekCheckIn(localStorage, 100 + ONE_WEEK_MS, true)).toBe(true);
});
test.each(['null','{}','broken','{"startedAt":0,"shown":true}'])("does not repeat on malformed or consumed state: %s", raw => {
  localStorage.setItem(CHECK_IN_KEY,raw);
  expect(claimWeekCheckIn(localStorage, ONE_WEEK_MS * 2)).toBe(false);
});
test("does not show when persistence cannot guarantee once-only", () => {
  const storage={getItem:()=>JSON.stringify({startedAt:0,shown:false}),setItem:()=>{throw Error('quota');}};
  expect(claimWeekCheckIn(storage,ONE_WEEK_MS)).toBe(false);
});
