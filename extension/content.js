// Auto-capture on supported job boards. A job is saved only after you submit an application:
// clicking a Submit button (or submitting a form) arms the tab, and a confirmation message that
// appears afterwards, on the same page or the next one, triggers the save. Job pages often
// contain "Thank you for applying" or "Thank you for your interest" already, so the phrase alone
// is never enough.

(() => {
  if (globalThis.jobTrackerContentLoaded) return;
  globalThis.jobTrackerContentLoaded = true;

  const CONFIRMATION =
    /thank(s| you)\b[^.!]{0,40}\bfor (applying|your application|submitting)|application (was |has been )?(successfully |now )?(submitted|received|sent|complete)|successfully (submitted|applied)|we('ve| have) (successfully )?received your application|your application (was|has been) (sent|submitted|received)|you('ve| have) (successfully )?applied/gi;
  const SUBMIT_BUTTON = /\b(submit|send application|finish application|complete application)\b/i;
  const ARM_WINDOW_MS = 5 * 60 * 1000;
  const isLinkedIn = location.hostname.endsWith("linkedin.com");

  let captured = false;
  let lastJob = null;
  let lastUrl = location.href;
  let scanTimer = null;
  // Confirmation phrases already on the page when the tab was armed on this page.
  let armedHere = null;
  let armedPoll = null;

  function send(message) {
    return chrome.runtime.sendMessage(message).catch(() => null);
  }

  function isUsable(job) {
    return job && job.company && job.role && !new RegExp(CONFIRMATION.source, "i").test(job.role);
  }

  // LinkedIn job pages say "Application submitted" for jobs applied to earlier,
  // so only the Easy Apply dialog counts there.
  function confirmationText() {
    if (isLinkedIn) {
      return [...document.querySelectorAll('[role="dialog"]')].map((dialog) => dialog.innerText).join("\n");
    }
    // The whole page: confirmations on long Greenhouse pages appear below the description and form.
    return document.body?.innerText || "";
  }

  function confirmationCount() {
    return (confirmationText().match(CONFIRMATION) || []).length;
  }

  function rememberJob() {
    const job = globalThis.jobTrackerExtract();
    if (!isUsable(job)) return;
    lastJob = job;
    void send({ type: "remember-job", job });
  }

  function arm() {
    if (captured) return;
    rememberJob();
    armedHere = { count: confirmationCount(), at: Date.now() };
    void send({ type: "arm", url: location.href, job: lastJob });
    scheduleScan();
    // Some boards replace the whole page when submitting, which can leave the mutation
    // observer watching detached nodes, so also check every second while armed.
    clearInterval(armedPoll);
    armedPoll = setInterval(() => {
      if (captured || !armedHere || Date.now() - armedHere.at > ARM_WINDOW_MS) {
        clearInterval(armedPoll);
        return;
      }
      scheduleScan();
    }, 1000);
  }

  async function capture() {
    if (captured) return;
    captured = true;
    armedHere = null;

    // Confirmation pages often drop the job details, so prefer what was seen before submitting.
    const armed = await send({ type: "take-armed" });
    const remembered = await send({ type: "get-remembered-job" });
    const job = [lastJob, armed?.job, remembered, globalThis.jobTrackerExtract()].find(isUsable);

    if (!job) {
      showToast({ status: "error", error: "Couldn't read the company and role. Use the extension button to save it." });
      return;
    }

    const result = await send({ type: "capture", job, auto: true });
    if (result?.status !== "disabled") showToast(result ?? { status: "error" }, job);
  }

  async function scan() {
    scanTimer = null;

    if (location.href !== lastUrl) {
      // Single-page boards (Workday, Ashby, LinkedIn) change jobs without reloading.
      lastUrl = location.href;
      captured = false;
    }
    if (captured) return;

    // Same page: a new confirmation appeared after the submit click.
    if (armedHere && Date.now() - armedHere.at < ARM_WINDOW_MS && confirmationCount() > armedHere.count) {
      void capture();
      return;
    }
    if (!armedHere) rememberJob();
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
      await send({ type: "undo", id: result.item.id });
      shadow.querySelector(".message").textContent = "Removed from Job Tracker.";
      shadow.querySelector(".undo")?.remove();
    });
    shadow.querySelector(".close").addEventListener("click", () => host.remove());

    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 10000);
  }

  // Arm on the actual submission: a form submit, or a click on a Submit-style button
  // (many boards submit with JavaScript rather than a real form).
  document.addEventListener("submit", arm, true);
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('button, input[type="submit"], [role="button"]')
        : null;
      const label = button ? (button.innerText || button.value || button.getAttribute("aria-label") || "") : "";
      if (label && SUBMIT_BUTTON.test(label)) arm();
    },
    true
  );

  // Observe the document itself so a replaced <html> or <body> is still covered.
  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Next page: if this tab was armed on the previous page (Greenhouse and Lever navigate to a
  // confirmation page after submitting), a confirmation here means the application went through.
  (async () => {
    const armed = await send({ type: "peek-armed" });
    if (armed && armed.url !== location.href) {
      // Give client-rendered confirmation pages a moment to show their message.
      for (let attempt = 0; attempt < 10 && !captured; attempt += 1) {
        if (confirmationCount() > 0) {
          void capture();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      // Not a confirmation page, so the submission didn't complete; don't carry the arm further.
      void send({ type: "take-armed" });
    }
    scan();
  })();
})();
