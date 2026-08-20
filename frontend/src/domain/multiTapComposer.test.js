import { createMultiTapComposer } from "./multiTapComposer";

describe("createMultiTapComposer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("cycles a repeated key and commits the visible character after the delay", () => {
    const previews = [];
    const commits = [];
    const composer = createMultiTapComposer({
      cycles: { "2": ["a", "b", "c", "2"] },
      delay: 250,
      onPreview: (character) => previews.push(character),
      onCommit: (character) => commits.push(character),
    });

    expect(composer.press("2")).toBe(true);
    expect(composer.press("2")).toBe(true);
    expect(previews).toEqual(["a", "b"]);
    expect(commits).toEqual([]);

    jest.advanceTimersByTime(250);

    expect(commits).toEqual(["b"]);
    expect(previews).toEqual(["a", "b", ""]);
    expect(composer.hasPending()).toBe(false);
  });

  test("commits the previous key before previewing a different key", () => {
    const events = [];
    const composer = createMultiTapComposer({
      cycles: {
        "2": ["a", "b", "c", "2"],
        "3": ["d", "e", "f", "3"],
      },
      delay: 250,
      onPreview: (character) => events.push(`preview:${character}`),
      onCommit: (character) => events.push(`commit:${character}`),
    });

    composer.press("2");
    composer.press("3");

    expect(events).toEqual(["preview:a", "commit:a", "preview:d"]);
  });

  test("cancels a pending character without committing it", () => {
    const previews = [];
    const commits = [];
    const composer = createMultiTapComposer({
      cycles: { "2": ["a", "b", "c", "2"] },
      delay: 250,
      onPreview: (character) => previews.push(character),
      onCommit: (character) => commits.push(character),
    });

    composer.press("2");

    expect(composer.cancelPending()).toBe(true);
    expect(previews).toEqual(["a", ""]);
    jest.advanceTimersByTime(250);
    expect(commits).toEqual([]);
    expect(composer.cancelPending()).toBe(false);
  });

  test("supports explicit commit and lifecycle reset", () => {
    const commits = [];
    const composer = createMultiTapComposer({
      cycles: { "2": ["a", "b", "c", "2"] },
      delay: 250,
      onPreview: () => {},
      onCommit: (character) => commits.push(character),
    });

    composer.press("2");
    composer.commit();
    jest.advanceTimersByTime(250);
    expect(commits).toEqual(["a"]);

    composer.press("2");
    composer.reset();
    jest.advanceTimersByTime(250);
    expect(commits).toEqual(["a"]);
  });

  test("disposes without invoking callbacks after teardown", () => {
    const commits = [];
    const composer = createMultiTapComposer({
      cycles: { "2": ["a", "b", "c", "2"] },
      delay: 250,
      onPreview: () => {},
      onCommit: (character) => commits.push(character),
    });

    composer.press("2");
    composer.dispose();
    jest.advanceTimersByTime(250);

    expect(commits).toEqual([]);
    expect(composer.hasPending()).toBe(false);
  });
});
