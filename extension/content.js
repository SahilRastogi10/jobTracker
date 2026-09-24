// Auto-capture on supported job boards: remember the job while you read it, then save it
// when the page shows an application confirmation.

(() => {
  if (globalThis.jobTrackerContentLoaded) return;
  globalThis.jobTrackerContentLoaded = true;

  const CONFIRMATION =
    /thank(s| you)\b[^.]{0,40}\b(for applying|for your application|for your interest)|application (was |has been )?(submitted|received|sent)|we('ve| have) received your application|your application (was|has been) sent/i;
  const isLinkedIn = location.hostname.endsWith("linkedin.com");

  let captured = false;
  let lastJob = null;
  let lastUrl = location.href;
  let scanTimer = null;

  function isUsable(job) {
    return job && job.company && job.role && !CONFIRMATION.test(job.role);
  }

  function rememberJob() {
    const job = globalThis.jobTrackerExtract();
    if (!isUsable(job)) return;
    lastJob = job;
    chrome.runtime.sendMessage({ type: "remember-job", job }).catch(() => {});
  }

  // LinkedIn job pages say "Application submitted" for jobs applied to earlier,
  // so only the Easy Apply dialog counts there.
  function confirmationText() {
    if (isLinkedIn) {
      return [...document.querySelectorAll('[role="dialog"]')]
        .map((dialog) => dialog.innerText)
        .join("\n");
    }
    return (document.body?.innerText || "").slice(0, 20000);
  }

  async function capture() {
    if (captured) return;
    captured = true;

    // Confirmation pages often drop the job details, so prefer what was seen earlier.
    const remembered = await chrome.runtime
      .sendMessage({ type: "get-remembered-job" })
      .catch(() => null);
    const current = globalThis.jobTrackerExtract();
    const job = [lastJob, remembered, current].find(isUsable);

    if (!job) {
      showToast({ status: "error", error: "Couldn't read the company and role. Use the extension button to save it." });
      return;
    }

    const result = await chrome.runtime
      .sendMessage({ type: "capture", job, auto: true })
      .catch((error) => ({ status: "error", error: String(error) }));

    if (result?.status !== "disabled") showToast(result, job);
  }

  function scan() {
    scanTimer = null;

    if (location.href !== lastUrl) {
      // Single-page boards (Workday, Ashby, LinkedIn) change jobs without reloading.
      lastUrl = location.href;
      captured = false;
    }

    if (!captured && CONFIRMATION.test(confirmationText())) {
      void capture();
    } else if (!captured) {
      rememberJob();
    }
  }

  function scheduleScan() {
    if (scanTimer === null) scanTimer = setTimeout(scan, 600);
  }

  function showToast(result, job) {
    document.getElementById("job-tracker-toast")?.remove();

    const host = document.createElement("div");
    host.id = "job-tracker-toast";
    const shadow = host.attachShadow({ mode: "open" });

    const messages = {
      saved: `Saved to Job Tracker: ${job?.company} | ${job?.role}`,
      duplicate: `Already in Job Tracker: ${job?.company}`,
      queued: "Job Tracker isn't running. Saved to send later.",
      error: result?.error || "Couldn't save this application.",
    };

    shadow.innerHTML = `
      <style>
        .toast { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
          display: flex; align-items: center; gap: 12px; max-width: 380px;
          padding: 12px 14px; border-radius: 12px; background: #1c1b18; color: #fbf8f1;
          font: 500 14px/1.4 system-ui, sans-serif; box-shadow: 0 12px 32px rgba(0,0,0,.25); }
        .dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: #c2410c; }
        .toast[data-status="saved"] .dot, .toast[data-status="duplicate"] .dot { background: #7fc49a; }
        button { border: 0; background: none; color: #f7a77f; font: 700 13px system-ui, sans-serif;
          cursor: pointer; padding: 2px 4px; }
        .close { color: #a9a294; }
      </style>
      <div class="toast" data-status="${result?.status || "error"}">
        <span class="dot"></span>
        <span class="message"></span>
        ${result?.status === "saved" ? '<button class="undo">Undo</button>' : ""}
        <button class="close" aria-label="Close">x</button>
      </div>`;
    shadow.querySelector(".message").textContent = messages[result?.status] || messages.error;

    shadow.querySelector(".undo")?.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "undo", id: result.item.id }).catch(() => {});
      shadow.querySelector(".message").textContent = "Removed from Job Tracker.";
      shadow.querySelector(".undo")?.remove();
    });
    shadow.querySelector(".close").addEventListener("click", () => host.remove());

    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 10000);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scan();
})();
