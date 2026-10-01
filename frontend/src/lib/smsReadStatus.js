const READ_STORAGE_KEY = "nokia_read_conversations_v1";

export const getReadMap = () => {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_e) {
    return {};
  }
};

export const markAddressAsRead = (address, threadId) => {
  try {
    const map = getReadMap();
    const now = Date.now();
    if (address) {
      const clean = String(address).replace(/[^0-9+]/g, "");
      if (clean) map[clean] = now;
      map[String(address)] = now;
    }
    if (threadId) {
      map[String(threadId)] = now;
    }
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
  } catch (_e) {}
};

export const isConversationUnread = (conv, readMap) => {
  if (!conv) return false;
  if (conv.unread === false) return false;

  const addr = conv.address ? String(conv.address) : "";
  const clean = addr.replace(/[^0-9+]/g, "");
  const threadId = conv.threadId ? String(conv.threadId) : "";

  const lastRead = Math.max(
    (clean && readMap[clean]) || 0,
    (addr && readMap[addr]) || 0,
    (threadId && readMap[threadId]) || 0
  );

  if (lastRead === 0) {
    return Boolean(conv.unread);
  }

  const msgDate = conv.date || 0;
  return msgDate > lastRead + 1000;
};
