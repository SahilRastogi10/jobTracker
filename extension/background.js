// Talks to the Job Tracker app. Captures that fail because the app isn't running are
// queued in extension storage and retried every minute.

const DEFAULT_SETTINGS = {
  serverUrl: "http://localhost:3000",
  token: "",
  autoCapture: true,
  followUpDays: 7,
};
const RECENT_LIMIT = 10;

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
}

function localDate() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function api(method, path, body) {
  const settings = await getSettings();
  if (!settings.token) {
    throw new HttpError("Add your extension token in the Job Tracker extension options.", 401);
  }

  // fetch throws a TypeError when the app isn't reachable; callers treat that as "offline".
  const res = await fetch(`${settings.serverUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Tracker-Token": settings.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(data.error || `Request failed (${res.status}).`, res.status);
  return data;
}

async function addRecent(entry) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  await chrome.storage.local.set({ recent: [entry, ...recent].slice(0, RECENT_LIMIT) });
}

async function updateBadge() {
  const { queue = [] } = await chrome.storage.local.get("queue");
  await chrome.action.setBadgeBackgroundColor({ color: "#c2410c" });
  await chrome.action.setBadgeText({ text: queue.length ? String(queue.length) : "" });
}

async function send(payload) {
  const data = await api("POST", "/api/extension/applications", payload);
  const status = data.duplicate ? "duplicate" : "saved";
  await addRecent({
    id: data.item.id,
    company: payload.company,
    role: payload.role,
    status,
    at: Date.now(),
  });
  return { status, item: data.item };
}

async function capture(job, auto) {
  const settings = await getSettings();
  if (auto && !settings.autoCapture) return { status: "disabled" };

  const company = String(job?.company || "").trim();
  const role = String(job?.role || "").trim();
  if (!company || !role) {
    return { status: "error", error: "Couldn't find the company and role on this page." };
  }

  const payload = {
    company,
    role,
    link: job.link || null,
    source: job.source || null,
    dateApplied: localDate(),
    followUpInDays: Number(settings.followUpDays) || 0,
  };

  try {
    return await send(payload);
  } catch (error) {
    if (error instanceof HttpError) return { status: "error", error: error.message };

    const { queue = [] } = await chrome.storage.local.get("queue");
    await chrome.storage.local.set({ queue: [...queue, payload] });
    await updateBadge();
    return { status: "queued" };
  }
}

async function flushQueue() {
  const { queue = [] } = await chrome.storage.local.get("queue");
  const remaining = [];

  for (let index = 0; index < queue.length; index += 1) {
    try {
      await send(queue[index]);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status === 401) {
        // Still offline, or the token is wrong: keep this and everything after it.
        remaining.push(...queue.slice(index));
        break;
      }
      // Anything else (e.g. a 400 for bad data) would fail forever, so drop it.
    }
  }

  await chrome.storage.local.set({ queue: remaining });
  await updateBadge();
  return remaining.length;
}

// A submit click arms the frame it happened in; the confirmation may show up on the next page
// that frame loads (frame ids stay the same across navigations), so the state lives here.
const ARM_TTL_MS = 5 * 60 * 1000;

function armKey(sender) {
  return sender.tab?.id === undefined ? null : `armed:${sender.tab.id}:${sender.frameId ?? 0}`;
}

async function readArmed(sender) {
  const key = armKey(sender);
  if (!key) return null;
  const armed = (await chrome.storage.session.get(key))[key];
  if (!armed || Date.now() - armed.at > ARM_TTL_MS) return null;
  return armed;
}

const handlers = {
  arm: async (message, sender) => {
    const key = armKey(sender);
    if (key) {
      await chrome.storage.session.set({
        [key]: { url: message.url, job: message.job ?? null, at: Date.now() },
      });
    }
    return true;
  },
  "peek-armed": (message, sender) => readArmed(sender),
  "take-armed": async (message, sender) => {
    const armed = await readArmed(sender);
    const key = armKey(sender);
    if (key) await chrome.storage.session.remove(key);
    return armed;
  },
  "remember-job": async (message, sender) => {
    if (sender.tab?.id !== undefined) {
      await chrome.storage.session.set({ [`job:${sender.tab.id}`]: message.job });
    }
    return true;
  },
  "get-remembered-job": async (message, sender) => {
    const tabId = message.tabId ?? sender.tab?.id;
    if (tabId === undefined) return null;
    const key = `job:${tabId}`;
    return (await chrome.storage.session.get(key))[key] || null;
  },
  capture: (message) => capture(message.job, Boolean(message.auto)),
  undo: async (message) => {
    await api("DELETE", `/api/extension/applications?id=${encodeURIComponent(message.id)}`);
    const { recent = [] } = await chrome.storage.local.get("recent");
    await chrome.storage.local.set({ recent: recent.filter((entry) => entry.id !== message.id) });
    return { ok: true };
  },
  flush: async () => ({ remaining: await flushQueue() }),
  "test-connection": async () => {
    try {
      await api("GET", "/api/extension/applications");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof HttpError
            ? error.message
            : "Couldn't reach Job Tracker. Is the app running (pnpm dev)?",
      };
    }
  },
  status: async () => {
    const { queue = [], recent = [] } = await chrome.storage.local.get(["queue", "recent"]);
    const settings = await getSettings();
    return { queued: queue.length, recent, serverUrl: settings.serverUrl, hasToken: Boolean(settings.token) };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;

  Promise.resolve(handler(message, sender))
    .then(sendResponse)
    .catch((error) => sendResponse({ status: "error", error: String(error?.message || error) }));
  return true; // keep the channel open for the async response
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.session.get(null);
  const keys = Object.keys(stored).filter(
    (key) => key === `job:${tabId}` || key.startsWith(`armed:${tabId}:`)
  );
  await chrome.storage.session.remove(keys);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flush-queue") void flushQueue();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.alarms.create("flush-queue", { periodInMinutes: 1 });
  await updateBadge();
  if (details.reason === "install") await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create("flush-queue", { periodInMinutes: 1 });
  void flushQueue();
});
