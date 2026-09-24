const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  serverUrl: "http://localhost:3000",
  token: "",
  autoCapture: true,
  followUpDays: 7,
};

function showResult(kind, text) {
  const result = $("result");
  result.hidden = false;
  result.className = `notice ${kind}`;
  result.textContent = text;
}

async function save() {
  const followUpDays = Math.min(60, Math.max(0, Math.round(Number($("follow-up-days").value) || 0)));
  await chrome.storage.sync.set({
    serverUrl: $("server-url").value.trim() || DEFAULT_SETTINGS.serverUrl,
    token: $("token").value.trim(),
    autoCapture: $("auto-capture").checked,
    followUpDays,
  });
}

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  $("server-url").value = settings.serverUrl;
  $("token").value = settings.token;
  $("auto-capture").checked = settings.autoCapture;
  $("follow-up-days").value = settings.followUpDays;

  $("save").addEventListener("click", async () => {
    await save();
    showResult("ok", "Settings saved.");
  });

  $("test").addEventListener("click", async () => {
    await save();
    const result = await chrome.runtime.sendMessage({ type: "test-connection" });
    if (result.ok) {
      showResult("ok", "Connected to Job Tracker.");
      await chrome.runtime.sendMessage({ type: "flush" });
    } else {
      showResult("bad", result.error);
    }
  });
}

void init();
