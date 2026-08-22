export const BROWSER_START_URL = "https://www.google.com";

const BLOCKED_SCHEME = /^(?:javascript|file|content|data|intent):/i;
const HTTP_SCHEME = /^https?:\/\//i;
const HOST_LIKE = /^(?:localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/i;

export const resolveBrowserAddress = (input) => {
  const value = String(input || "").trim();
  if (!value) return BROWSER_START_URL;
  if (BLOCKED_SCHEME.test(value)) return null;
  if (HTTP_SCHEME.test(value)) return value;
  if (HOST_LIKE.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
};
