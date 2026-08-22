const getPlayIntegrityPlugin = () =>
  window.Capacitor?.Plugins?.PlayIntegrity ?? null;

let preparedProjectNumber = null;
let prepareRequest = null;

const backendBaseUrl = (override) => {
  if (override) return override.replace(/\/+$/, "");
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8000";
  }
  return (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
};

const readJson = async (response, operation) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.detail || `${operation} failed with HTTP ${response.status}`);
  }
  return body;
};

const ensurePrepared = async (plugin, cloudProjectNumber) => {
  if (preparedProjectNumber === cloudProjectNumber) return;
  if (!prepareRequest) {
    prepareRequest = plugin
      .prepare({ cloudProjectNumber })
      .then(() => {
        preparedProjectNumber = cloudProjectNumber;
      })
      .finally(() => {
        prepareRequest = null;
      });
  }
  await prepareRequest;
};

export const requestPlayIntegrityCheck = async ({
  action = "device-check",
  backendUrl,
} = {}) => {
  const plugin = getPlayIntegrityPlugin();
  if (!plugin) {
    throw new Error("Play Integrity is only available in the Android app");
  }

  const baseUrl = backendBaseUrl(backendUrl);
  const challengeResponse = await fetch(`${baseUrl}/api/integrity/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const challenge = await readJson(challengeResponse, "Integrity challenge");

  await ensurePrepared(plugin, challenge.cloudProjectNumber);
  const tokenResult = await plugin.requestToken({
    requestHash: challenge.requestHash,
  });

  const verifyResponse = await fetch(`${baseUrl}/api/integrity/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      integrityToken: tokenResult.token,
      challenge: challenge.challenge,
    }),
  });
  return readJson(verifyResponse, "Integrity verification");
};
