// Reads company, role, and link from the current page.
// Loaded as a content script on supported sites, and injected by the popup on any other page.
// The final expression is the result the popup receives from chrome.scripting.executeScript.

globalThis.jobTrackerExtract = function jobTrackerExtract() {
  const host = location.hostname.replace(/^www\./, "");
  const pathParts = location.pathname.split("/").filter(Boolean);

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const text = (selector) => clean(document.querySelector(selector)?.textContent);
  const meta = (name) =>
    clean(
      document
        .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
        ?.getAttribute("content")
    );
  const titleCase = (slug) =>
    clean(
      String(slug || "")
        .split(/[-_]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    );

  // Most job boards publish schema.org JobPosting data for search engines.
  function fromJsonLd() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] || [])];
        for (const node of nodes) {
          const types = [].concat(node?.["@type"] || []);
          if (!types.includes("JobPosting")) continue;
          const org = node.hiringOrganization;
          return {
            role: clean(node.title),
            company: clean(typeof org === "string" ? org : org?.name),
          };
        }
      } catch {
        // Malformed JSON-LD is common; fall through to the next strategy.
      }
    }
    return {};
  }

  function fromSite() {
    if (host.endsWith("greenhouse.io")) {
      // boards.greenhouse.io/<company>/jobs/<id>
      return {
        role: text(".app-title") || text("h1.section-header") || text("h1"),
        company: text(".company-name").replace(/^at\s+/i, "") || titleCase(pathParts[0]),
      };
    }
    if (host === "jobs.lever.co") {
      // jobs.lever.co/<company>/<id>
      return {
        role: text(".posting-headline h2") || text("h2"),
        company:
          clean(document.querySelector(".main-header-logo img")?.getAttribute("alt")) ||
          titleCase(pathParts[0]),
      };
    }
    if (host === "jobs.ashbyhq.com") {
      // jobs.ashbyhq.com/<company>/<id>
      return {
        role: text("h1"),
        company: meta("og:site_name") || titleCase(pathParts[0]),
      };
    }
    if (host.endsWith("myworkdayjobs.com")) {
      // <company>.wd5.myworkdayjobs.com/...
      return {
        role: text('[data-automation-id="jobPostingHeader"]') || text("h2") || text("h1"),
        company: titleCase(host.split(".")[0]),
      };
    }
    if (host === "linkedin.com") {
      return {
        role:
          text(".job-details-jobs-unified-top-card__job-title") ||
          text(".top-card-layout__title") ||
          text("h1"),
        company:
          text(".job-details-jobs-unified-top-card__company-name") ||
          text(".topcard__org-name-link") ||
          text(".top-card-layout__second-subline a"),
      };
    }
    return {};
  }

  function fromPageTitle() {
    const title = meta("og:title") || clean(document.title);
    // Common shapes: "Role at Company", "Role - Company", "Role | Company"
    const at = title.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|:\-]\s.*)?$/i);
    if (at) return { role: clean(at[1]), company: clean(at[2]) };
    const [first, second] = title.split(/\s+[|\-]\s+/);
    return {
      role: clean(first),
      company: meta("og:site_name") || clean(second) || titleCase(host.split(".")[0]),
    };
  }

  function canonicalLink() {
    if (host === "linkedin.com") {
      const jobId =
        new URLSearchParams(location.search).get("currentJobId") ||
        location.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
      if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    return canonical || `${location.origin}${location.pathname}`;
  }

  const sources = [fromJsonLd(), fromSite(), fromPageTitle()];
  const pick = (field) => sources.map((source) => source[field]).find(Boolean) || "";
  // Logo alt text reads like "EQ Bank | Canada's Challenger Bank logo".
  const cleanCompany = (value) =>
    clean(value.replace(/\s*logo$/i, "").split(/\s+[|\u2013\u2014-]\s+/)[0]);

  return {
    company: cleanCompany(pick("company")).slice(0, 120),
    role: pick("role").slice(0, 160),
    link: canonicalLink(),
    source: host,
  };
};

globalThis.jobTrackerExtract();
