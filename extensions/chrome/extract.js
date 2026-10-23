(function extractLeadFromPage() {
  const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const SKIP_EMAIL =
    /noreply|no-reply|donotreply|do-not-reply|privacy@|abuse@|postmaster@|support@linkedin|linkedin\.com|example\.com|sentry\.io|wixpress|cloudflare|wordpress@|godaddy|domain\.com$/i;
  const GENERIC_LOCAL =
    /^(hello|hi|info|contact|support|sales|admin|office|mail|team|help|enquiries|inquiry|inquiries|jobs|careers|press|media|billing|accounts|hr)$/i;
  const NOT_A_PERSON =
    /^(home|about|contact|contact us|team|our team|services|products|blog|news|pricing|login|sign in|get started|welcome|privacy|terms|careers|jobs)$/i;

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function cleanPersonName(raw) {
    let name = String(raw || "").trim();
    name = name.replace(/^\(\d+\)\s*/, "");
    name = name
      .replace(/\s*\|\s*LinkedIn\s*$/i, "")
      .replace(/\s*-\s*LinkedIn\s*$/i, "")
      .replace(/\s+on LinkedIn\s*$/i, "")
      .replace(/\s*\|\s*X\s*$/i, "")
      .replace(/\s*\|\s*Twitter\s*$/i, "")
      .trim();
    const dash = name.split(/\s+[-–—]\s+/);
    if (dash.length > 1 && dash[0].trim().split(/\s+/).length <= 4) {
      name = dash[0].trim();
    }
    name = name.replace(/^by\s+/i, "").trim();
    if (
      !name ||
      NOT_A_PERSON.test(name) ||
      /^(linkedin|instagram|facebook|twitter|x)$/i.test(name)
    ) {
      return "";
    }
    // Prefer 2–4 word human names; reject long headlines
    const words = name.split(/\s+/);
    if (words.length < 1 || words.length > 5) return "";
    if (name.length > 60) return "";
    return name.slice(0, 160);
  }

  function looksLikePersonName(value) {
    const name = cleanPersonName(value);
    if (!name) return false;
    const words = name.split(/\s+/);
    if (words.length < 2) return false;
    return words.every((w) => /^[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*$/u.test(w) || /^[A-Z]{1,3}$/.test(w));
  }

  function uniqueEmails(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
      const email = String(value || "").trim().toLowerCase();
      if (!email || !email.includes("@") || SKIP_EMAIL.test(email) || seen.has(email)) {
        continue;
      }
      seen.add(email);
      out.push(email);
    }
    return out;
  }

  function emailScore(email) {
    const local = email.split("@")[0] || "";
    let score = 0;
    if (local.includes(".") || local.includes("_") || local.includes("-")) score += 4;
    if (/[a-z]+\.[a-z]+/i.test(local)) score += 3;
    if (GENERIC_LOCAL.test(local)) score -= 5;
    if (/^\d+$/.test(local)) score -= 3;
    return score;
  }

  function pickBestEmail(emails) {
    if (!emails.length) return null;
    return [...emails].sort((a, b) => emailScore(b) - emailScore(a))[0];
  }

  function nameFromEmail(email) {
    if (!email) return "";
    const local = email.split("@")[0] || "";
    if (GENERIC_LOCAL.test(local) || local.length < 3) return "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return "";
    if (!parts.every((p) => /^[a-z]{2,}$/i.test(p))) return "";
    return parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }

  function companyFromHost() {
    const host = location.hostname.replace(/^www\./i, "");
    const base = host.split(".")[0] || "";
    if (!base || /linkedin|instagram|facebook|twitter|google|youtube/i.test(base)) {
      return "";
    }
    return base
      .split(/[-_]/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  function siteCompany() {
    const siteName =
      document.querySelector('meta[property="og:site_name"]')?.content ||
      document.querySelector('meta[name="application-name"]')?.content ||
      document.querySelector('meta[name="author"]')?.content ||
      "";
    const orgLd = findJsonLd("Organization") || findJsonLd("LocalBusiness");
    const orgName = orgLd?.name || "";
    return (
      String(orgName || siteName || "").trim().slice(0, 160) ||
      companyFromHost() ||
      null
    );
  }

  function findJsonLd(type) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent || "null");
        const items = Array.isArray(raw) ? raw : raw?.["@graph"] ? raw["@graph"] : [raw];
        for (const item of items) {
          if (!item) continue;
          const t = item["@type"];
          const types = Array.isArray(t) ? t : [t];
          if (types.includes(type)) return item;
        }
      } catch {
        /* ignore bad JSON-LD */
      }
    }
    return null;
  }

  function mailtoEntries() {
    const entries = [];
    for (const link of document.querySelectorAll('a[href^="mailto:"]')) {
      const href = link.getAttribute("href") || "";
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (!email || SKIP_EMAIL.test(email)) continue;

      let nearby = cleanPersonName(text(link));
      if (!looksLikePersonName(nearby)) nearby = "";

      let node = link.parentElement;
      for (let i = 0; i < 4 && node; i += 1) {
        const heading = node.querySelector?.("h1,h2,h3,h4,strong,.name,.author");
        const candidate = cleanPersonName(text(heading)) || cleanPersonName(text(node).split(email)[0]);
        if (looksLikePersonName(candidate)) {
          nearby = candidate;
          break;
        }
        node = node.parentElement;
      }

      entries.push({ email, name: nearby || nameFromEmail(email) || "" });
    }
    return entries;
  }

  function emailsFromDocument() {
    const found = [];
    for (const entry of mailtoEntries()) found.push(entry.email);

    const meta = document.querySelector(
      'meta[property="og:email"], meta[name="email"], meta[itemprop="email"]'
    );
    if (meta?.content) found.push(meta.content);

    const personLd = findJsonLd("Person");
    if (personLd?.email) found.push(personLd.email);

    const orgLd = findJsonLd("Organization") || findJsonLd("LocalBusiness");
    if (orgLd?.email) found.push(orgLd.email);

    // Prefer contact/footer/about regions before whole page noise
    const regions = document.querySelectorAll(
      "footer, [class*='contact' i], [id*='contact' i], [class*='footer' i], [class*='team' i], [id*='team' i], main"
    );
    for (const region of regions) {
      const matches = (region.innerText || "").match(EMAIL_RE) || [];
      found.push(...matches);
    }
    if (!found.length) {
      const bodyMatches = (document.body?.innerText || "").match(EMAIL_RE) || [];
      found.push(...bodyMatches.slice(0, 20));
    }
    return uniqueEmails(found);
  }

  function personFromPage(preferredEmail) {
    const personLd = findJsonLd("Person");
    if (personLd?.name && looksLikePersonName(personLd.name)) {
      return cleanPersonName(personLd.name);
    }

    const author =
      document.querySelector('meta[name="author"]')?.content ||
      document.querySelector('meta[property="article:author"]')?.content ||
      text(document.querySelector('[rel="author"], .author-name, .author, [itemprop="author"]'));
    if (looksLikePersonName(author)) return cleanPersonName(author);

    if (preferredEmail) {
      const fromMailto = mailtoEntries().find((e) => e.email === preferredEmail && e.name);
      if (fromMailto?.name) return fromMailto.name;
      const guessed = nameFromEmail(preferredEmail);
      if (guessed) return guessed;
    }

    // Team / contact cards: heading that looks like a person near an email
    for (const el of document.querySelectorAll("h1,h2,h3,h4,.name,[class*='member' i],[class*='team' i]")) {
      const candidate = cleanPersonName(text(el));
      if (!looksLikePersonName(candidate)) continue;
      const block = el.closest("section, article, li, div") || el.parentElement;
      const blockText = text(block);
      if (preferredEmail && blockText.toLowerCase().includes(preferredEmail)) {
        return candidate;
      }
      if ((blockText.match(EMAIL_RE) || []).length) return candidate;
    }

    const h1 = cleanPersonName(text(document.querySelector("h1")));
    if (looksLikePersonName(h1)) return h1;

    return "";
  }

  function linkedInProfile() {
    const host = location.hostname.replace(/^www\./, "");
    if (!/linkedin\.com$/i.test(host)) return null;

    const h1 =
      document.querySelector("h1") ||
      document.querySelector(".text-heading-xlarge") ||
      document.querySelector('[data-anonymize="person-name"]');
    const name = cleanPersonName(text(h1)) || cleanPersonName(document.title);

    let company = "";
    const experienceCompany =
      document.querySelector(
        "#experience ~ div .hoverable-link-text, #experience .inline-show-more-text, [data-field='experience_company_logo'] + div span"
      ) ||
      document.querySelector(".pv-text-details__right-panel .inline-show-more-text");
    const aboutOrg = document.querySelector(
      ".pv-top-card--experience-list-item, .ph5 .text-body-medium a[href*='/company/']"
    );
    company = text(aboutOrg) || text(experienceCompany) || "";

    const headline =
      text(document.querySelector(".text-body-medium.break-words")) ||
      text(document.querySelector(".pv-top-card--list li .text-body-medium"));
    if (!company && headline) {
      const atMatch = headline.match(/\b(?:at|@)\s+([^|•·\n]+)/i);
      if (atMatch?.[1]) company = atMatch[1].trim();
    }
    company = company
      .replace(/\s*\·.*$/, "")
      .replace(/\s*\|.*$/, "")
      .trim()
      .slice(0, 160);

    return {
      name,
      company: company || null,
      email: pickBestEmail(emailsFromDocument()),
      source: "linkedin",
    };
  }

  function genericWebsite() {
    const emails = emailsFromDocument();
    const email = pickBestEmail(emails);
    const name = personFromPage(email);
    const company = siteCompany();

    // If we only found a generic inbox, still save it — name falls back later
    return {
      name: name || null,
      company,
      email,
      source: null,
    };
  }

  return linkedInProfile() || genericWebsite();
})();
