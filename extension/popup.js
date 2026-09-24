const $ = (id) => document.getElementById(id);
let source = null;

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function showResult(kind, text) {
  const result = $("result");
  result.hidden = false;
  result.className = `notice ${kind}`;
  result.textContent = text;
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  // Supported boards remember the job while you read it; confirmation pages may not show it.
  const remembered = await send({ type: "get-remembered-job", tabId: tab.id }).catch(() => null);

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["extract.js"],
    });
    const current = injection?.result;
    if (current?.company && current?.role) return current;
    return remembered || current || null;
  } catch {
    // Browser pages (chrome://, the Web Store) can't be scripted.
    return remembered;
  }
}

async function renderStatus() {
  const status = await send({ type: "status" });
  $("setup").hidden = status.hasToken;
  $("open-app").href = status.serverUrl;

  const list = $("recent");
  list.replaceChildren(
    ...status.recent.slice(0, 5).map((entry) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${entry.company} | ${entry.role}`;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = entry.status === "duplicate" ? "already saved" : "saved";
      item.append(label, tag);
      return item;
    })
  );
  $("no-recent").hidden = status.recent.length > 0;

  const retry = $("retry");
  retry.hidden = status.queued === 0;
  retry.textContent = `Send ${status.queued} waiting`;
}

async function init() {
  $("open-options").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const job = await readActiveTab();
  if (job) {
    $("company").value = job.company || "";
    $("role").value = job.role || "";
    $("link").value = job.link || "";
    source = job.source || null;
    $("hint").textContent = job.company && job.role ? "Check the details, then save." : "Fill in what's missing.";
  } else {
    $("hint").textContent = "Enter the details to save.";
  }

  $("save").addEventListener("click", async () => {
    $("save").disabled = true;
    const result = await send({
      type: "capture",
      auto: false,
      job: {
        company: $("company").value,
        role: $("role").value,
        link: $("link").value || null,
        source,
      },
    });
    $("save").disabled = false;

    const messages = {
      saved: ["ok", "Saved to Job Tracker."],
      duplicate: ["ok", "Already in Job Tracker."],
      queued: ["bad", "Job Tracker isn't running. It will be sent when the app is back."],
    };
    const [kind, text] = messages[result?.status] || ["bad", result?.error || "Couldn't save."];
    showResult(kind, text);
    await renderStatus();
  });

  $("retry").addEventListener("click", async () => {
    $("retry").disabled = true;
    const { remaining } = await send({ type: "flush" });
    $("retry").disabled = false;
    if (remaining > 0) showResult("bad", "Still can't reach Job Tracker. Is the app running?");
    await renderStatus();
  });

  await renderStatus();
}

void init();
