const sameIds = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
};

export const sameDumbModeSnapshot = (left, right) => {
  if (left === right) return true;
  if (!left || !right || left.revision !== right.revision) return false;
  return left.state === right.state
    && left.active === right.active
    && left.enforcementAvailable === right.enforcementAvailable
    && left.accessibilityAvailable === right.accessibilityAvailable
    && left.defaultLauncherAvailable === right.defaultLauncherAvailable
    && left.error === right.error
    && left.unlockMethod === right.unlockMethod
    && left.cooldownUntil === right.cooldownUntil
    && left.storageUnavailableBlock === right.storageUnavailableBlock
    && sameIds(left.selectedFriendIds || [], right.selectedFriendIds || [])
    && sameIds(left.blockedIds, right.blockedIds)
    && sameIds(left.mandatoryIds, right.mandatoryIds);
};
