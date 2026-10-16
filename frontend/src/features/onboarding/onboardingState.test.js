import { loadOnboarding, saveOnboarding, ONBOARDING_KEY, TOUR_STEPS } from "./onboardingState";

beforeEach(() => localStorage.clear());
test("completion survives reload and version-independent storage", () => {
  expect(loadOnboarding(localStorage).completed).toBe(false);
  saveOnboarding(localStorage, { completed: true, index: 0 });
  expect(loadOnboarding(localStorage).completed).toBe(true);
});
test.each(["broken", "null", '{"index":-1}', '{"index":9999}'])("malformed progress %s starts safely", value => {
  localStorage.setItem(ONBOARDING_KEY, value);
  expect(loadOnboarding(localStorage)).toEqual({ completed: false, index: 0 });
});
test("unfinished progress resumes within the finite guide", () => {
  saveOnboarding(localStorage, { completed: false, index: TOUR_STEPS.length - 1 });
  expect(loadOnboarding(localStorage).index).toBe(TOUR_STEPS.length - 1);
});
test("unavailable storage never crashes startup", () => {
  const storage = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
  expect(loadOnboarding(storage)).toEqual({ completed: false, index: 0 });
  expect(saveOnboarding(storage, { completed: true })).toBe(false);
});

test.each([0, 1, 2, 3, 4])("legacy unfinished page %s migrates without losing progress", index => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ index }));
  expect(TOUR_STEPS[loadOnboarding(localStorage).index].id).toBe(index < 2 ? 'navigation' : 'setup');
});
test("stable IDs win over stale numeric indexes and completed legacy locks stay completed", () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ schema: 2, index: 99, stepId: 'dumb-mode' }));
  expect(TOUR_STEPS[loadOnboarding(localStorage).index].id).toBe('dumb-mode');
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true, index: 4 }));
  expect(loadOnboarding(localStorage).completed).toBe(true);
});
