(function extractJobFromPage() {
  function cleanBlock(raw) {
    return String(raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function pickText(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        const value = cleanBlock(el?.innerText || "");
        if (value.length > 40) return value;
      } catch {
        /* invalid selector in some docs */
      }
    }
    return "";
  }

  function hostInfo() {
    const host = location.hostname.replace(/^www\./i, "").toLowerCase();
    if (host.includes("upwork.com")) {
      return { context: "marketplace", platform: "upwork" };
    }
    if (host.includes("freelancer.com")) {
      return { context: "marketplace", platform: "freelancer" };
    }
    if (host.includes("mail.google.com") || host.includes("gmail.com")) {
      return { context: "email", platform: "gmail" };
    }
    if (
      host.includes("outlook.live.com") ||
      host.includes("outlook.office.com") ||
      host.includes("outlook.office365.com") ||
      host.includes("mail.yahoo.com") ||
      host.includes("proton.me")
    ) {
      return { context: "email", platform: "outlook" };
    }
    return { context: "web", platform: "other" };
  }

  function firstEmailIn(raw) {
    const match = String(raw || "").match(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
    );
    return match ? match[0].toLowerCase() : null;
  }

  function upworkJob() {
    const title =
      cleanBlock(
        document.querySelector("h1")?.innerText ||
          document.querySelector('[data-test="job-title"]')?.innerText ||
          ""
      ) || cleanBlock(document.title.replace(/\s*-\s*Upwork.*$/i, ""));

    const description =
      pickText([
        '[data-test="Description"]',
        '[data-test="job-description"]',
        '[data-test="JobDescription"]',
        "section[data-test='Description']",
        ".job-description",
        "#job-posting article",
        "article",
        "main",
      ]) || cleanBlock(document.querySelector("main")?.innerText || "");

    const metaBits = [];
    for (const sel of [
      '[data-test="budget"]',
      '[data-test="JobInfo"]',
      '[data-test="features"]',
      '[data-test="Skills"]',
      '[data-test="client-location"]',
    ]) {
      const chunk = cleanBlock(document.querySelector(sel)?.innerText || "");
      if (chunk && chunk.length < 800) metaBits.push(chunk);
    }

    const body = [title && `Title: ${title}`, metaBits.join("\n"), description]
      .filter(Boolean)
      .join("\n\n");

    return {
      title: title || null,
      text: body.slice(0, 35000),
      context: "marketplace",
      platform: "upwork",
      contactEmail: null,
      contactName: null,
      source: "page",
    };
  }

  function freelancerJob() {
    const title =
      cleanBlock(
        document.querySelector("h1")?.innerText ||
          document.querySelector(".PageProjectViewLogout-header-title")
            ?.innerText ||
          ""
      ) || cleanBlock(document.title.replace(/\s*\|\s*Freelancer.*$/i, ""));

    const description =
      pickText([
        ".Project-description",
        "#description",
        '[data-id="project-description"]',
        ".PageProjectViewLogout-detail",
        "article",
        "main",
      ]) || cleanBlock(document.querySelector("main")?.innerText || "");

    const body = [title && `Title: ${title}`, description]
      .filter(Boolean)
      .join("\n\n");

    return {
      title: title || null,
      text: body.slice(0, 35000),
      context: "marketplace",
      platform: "freelancer",
      contactEmail: null,
      contactName: null,
      source: "page",
    };
  }

  function gmailEmail() {
    const subject =
      cleanBlock(
        document.querySelector("h2[data-thread-perm-id]")?.innerText ||
          document.querySelector("h2.hP")?.innerText ||
          document.querySelector("[data-legacy-thread-id] h2")?.innerText ||
          ""
      ) || cleanBlock(document.title.replace(/\s*-\s*Gmail.*$/i, ""));

    const senderEl =
      document.querySelector("span.gD[email]") ||
      document.querySelector("span[email].gD") ||
      document.querySelector("[data-hovercard-id]") ||
      document.querySelector(".gD");

    const contactEmail =
      senderEl?.getAttribute("email") ||
      senderEl?.getAttribute("data-hovercard-id") ||
      firstEmailIn(senderEl?.getAttribute("name") || "") ||
      firstEmailIn(document.body?.innerText?.slice(0, 4000) || "");

    const contactName = cleanBlock(
      senderEl?.getAttribute("name") || senderEl?.innerText || ""
    ).slice(0, 160);

    const bodyText =
      pickText([
        ".a3s.aiL",
        ".a3s",
        ".ii.gt",
        "[data-message-content]",
        "[role='listitem'] .a3s",
      ]) || cleanBlock(document.body?.innerText || "").slice(0, 20000);

    return {
      title: subject || null,
      text: bodyText.slice(0, 35000),
      context: "email",
      platform: "gmail",
      contactEmail: contactEmail || null,
      contactName: contactName || null,
      source: "page",
    };
  }

  function outlookEmail() {
    const subject = cleanBlock(
      document.querySelector('[role="heading"]')?.innerText ||
        document.querySelector("h1")?.innerText ||
        document.title ||
        ""
    );

    const bodyText =
      pickText([
        '[aria-label="Message body"]',
        '[aria-label*="Message body" i]',
        ".allowTextSelection",
        "[role='document']",
        "[role='main']",
      ]) || cleanBlock(document.body?.innerText || "").slice(0, 20000);

    const fromChunk =
      cleanBlock(
        document.querySelector('[aria-label*="From" i]')?.innerText || ""
      ) || bodyText.slice(0, 500);

    return {
      title: subject || null,
      text: bodyText.slice(0, 35000),
      context: "email",
      platform: "outlook",
      contactEmail: firstEmailIn(fromChunk),
      contactName: cleanBlock(fromChunk.split("<")[0] || "").slice(0, 160) || null,
      source: "page",
    };
  }

  function genericPage(info) {
    const title = cleanBlock(
      document.querySelector("h1")?.innerText ||
        document.querySelector('[role="heading"]')?.innerText ||
        document.title ||
        ""
    );
    const main =
      pickText([
        ".a3s.aiL",
        ".a3s",
        ".ii.gt",
        "[data-message-content]",
        "[aria-label='Message Body']",
        "[aria-label*='Message body' i]",
        ".allowTextSelection",
        "[role='document']",
        "[role='main']",
        "article",
        "main",
        ".job-description",
        "#content",
      ]) || cleanBlock(document.body?.innerText || "").slice(0, 20000);

    if (main.length < 40 && title.length < 20) {
      return {
        title: null,
        text: "",
        context: info.context,
        platform: info.platform,
        contactEmail: null,
        contactName: null,
        source: "page",
      };
    }

    const body = [title && `Title: ${title}`, main].filter(Boolean).join("\n\n");
    return {
      title: title || null,
      text: body.slice(0, 35000),
      context: info.context,
      platform: info.platform,
      contactEmail: firstEmailIn(body.slice(0, 3000)),
      contactName: null,
      source: "page",
    };
  }

  const info = hostInfo();
  if (info.platform === "upwork") return upworkJob();
  if (info.platform === "freelancer") return freelancerJob();
  if (info.platform === "gmail") return gmailEmail();
  if (info.platform === "outlook") return outlookEmail();
  return genericPage(info);
})();
