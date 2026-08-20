export const createMultiTapComposer = ({
  cycles,
  delay,
  onPreview,
  onCommit,
}) => {
  let activeKey = null;
  let cycleIndex = 0;
  let timer = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const commitPending = (clearPreview = true) => {
    clearTimer();
    if (activeKey === null) return;
    const character = cycles[activeKey]?.[cycleIndex];
    activeKey = null;
    cycleIndex = 0;
    if (clearPreview) onPreview("");
    if (character) onCommit(character);
  };

  const press = (key) => {
    const cycle = cycles[key];
    if (!cycle) return false;

    clearTimer();
    if (activeKey === key) {
      cycleIndex = (cycleIndex + 1) % cycle.length;
    } else {
      commitPending(false);
      activeKey = key;
      cycleIndex = 0;
    }

    onPreview(cycle[cycleIndex]);
    timer = setTimeout(commitPending, delay);
    return true;
  };

  const cancelPending = () => {
    if (activeKey === null) return false;
    clearTimer();
    activeKey = null;
    cycleIndex = 0;
    onPreview("");
    return true;
  };

  const dispose = () => {
    clearTimer();
    activeKey = null;
    cycleIndex = 0;
  };

  return {
    press,
    commit: commitPending,
    cancelPending,
    reset: cancelPending,
    dispose,
    hasPending: () => activeKey !== null,
  };
};
