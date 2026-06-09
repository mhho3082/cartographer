import axios from "axios";
import http from "node:http";
import https from "node:https";

import { getLogger } from "./logger.js";

export class Spider {
  constructor(config, seedUrls) {
    this.config = config;

    const { username, password } = this.#findHttpAuth(seedUrls);
    this.username = username;
    this.password = password;

    this.seedUrls = seedUrls.map((v) => this.normalizeUrl(v));

    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
    });
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
    });
    this.client = axios.create({
      timeout: this.config.requestTimeout,
      httpAgent,
      httpsAgent,
      decompress: true,
      auth: this.username && this.password
        ? { username: this.username, password: this.password }
        : undefined,
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      },
      maxRedirects: 0,
      validateStatus: null,
      responseType: "text",
      transformResponse: [(data) => data], // bypass default JSON parsing heuristics
    });
  }

  // Returns the first HTTP basic auth credentials found in the seed URLs
  #findHttpAuth(seedUrls) {
    const logger = getLogger();
    for (const url of seedUrls) {
      try {
        logger.debug(`Checking seed URL for HTTP auth: ${url}`);
        const parsed = new URL(url);
        if (parsed.username && parsed.password) {
          logger.info(`Using HTTP basic auth from URL: ${url}`);
          return {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
          };
        }
      } catch {
        logger.warn(`Invalid URL encountered while checking for HTTP auth: ${url}`);
      }
    }
    return { username: null, password: null };
  }

  normalizeUrl(url, base = undefined) {
    if (this.config.ignoredUrlRegexes.some((regex) => regex.test(url))) {
      return null;
    }

    try {
      const normalized = base ? new URL(url, base) : new URL(url);
      normalized.username = "";
      normalized.password = "";
      normalized.hash = "";
      return decodeURIComponent(normalized.toString());
    } catch {
      getLogger().warn(`Invalid URL encountered during normalization: ${url}`);
      return null;
    }
  }

  normalizeContentType(contentType) {
    return contentType.split(";")[0].trim().toLowerCase();
  }

  isInternal(url) {
    return (
      this.config.internalUrlRegexes.some((regex) => regex.test(url)) &&
      !this.config.externalUrlRegexes.some((regex) => regex.test(url))
    );
  }

  // Issues a HEAD request, then a GET if the content type is parsable. Returns { res, contentType }.
  async #fetchUrl(url, parsableMimeTypes, isInternal) {
    let res = await this.client.head(url);
    const contentType = this.normalizeContentType(res.headers["content-type"] || "");

    if (
      res.status < 400 &&
      parsableMimeTypes.includes(contentType) &&
      (isInternal || this.config.checkExternalLinks)
    ) {
      res = await this.client.get(url);
    }

    return { res, contentType };
  }

  // Parses links from a successful response and enqueues them. Returns updated attrs.
  #processLinks(url, res, contentType, parsers, isInternal, attrs, enqueue) {
    // Handle redirects
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      attrs = { ...attrs, links: [res.headers.location] };
    }

    // Parse content for links
    if (contentType && parsers[contentType]) {
      const parsed = parsers[contentType].parse(res.data);
      const links = [...new Set([...(attrs.links ?? []), ...(parsed?.links ?? [])])];
      attrs = { ...attrs, ...parsed, links };
    }

    // Normalize discovered links
    const base = attrs.base
      ? this.normalizeUrl(attrs.base, url)
      : this.normalizeUrl(url);
    let links = (attrs.links ?? [])
      .map((v) => this.normalizeUrl(v, base))
      .filter(Boolean);

    // Drop outbound links discovered on external pages
    if (!isInternal) {
      links = links.filter((v) => this.isInternal(v));
    }
    if (!this.config.seedUrlsOnly) {
      links.forEach(enqueue);
    }

    return { ...attrs, base, links };
  }

  async crawl(parsers, scanners) {
    const logger = getLogger();
    const parsableMimeTypes = Object.keys(parsers);
    const result = {};

    const queue = [];
    let qh = 0; // queue head index
    const queued = new Set(); // All URLs ever enqueued
    const visited = new Set(); // All URLs ever accessed
    const enqueue = (u) => {
      if (!u || queued.has(u)) return;
      queued.add(u);
      queue.push(u);
    };

    logger.info("Crawling initialized");
    this.seedUrls.forEach(enqueue);

    while (qh < queue.length) {
      const url = queue[qh++];
      logger.status(`(${qh}/${queued.size}) Crawling ${url}...`);

      if (visited.has(url)) continue;
      visited.add(url);

      const isInternal = this.isInternal(url);
      // Note: Due to graphology, cannot use "type" as it is a reserved attribute
      result[url] = { url, bad: false, linkType: isInternal ? "internal" : "external" };

      let res = null;

      // Check bad URL patterns
      const badPattern = Object.entries(this.config.badUrlRegexes)
        .find(([, regex]) => regex.test(url));
      if (badPattern) {
        const [reason] = badPattern;
        logger.debug(`Marking URL as bad due to pattern match: ${url}`);
        result[url] = { ...result[url], bad: true, error: reason };
      } else {
        // Fetch the URL
        const t0 = performance.now();
        try {
          const { res: fetched, contentType } = await this.#fetchUrl(url, parsableMimeTypes, isInternal);
          res = fetched;
          result[url] = { ...result[url], status: res.status, contentType, responseTime: performance.now() - t0 };
        } catch (error) {
          const errorMsg = axios.isCancel(error)
            ? "Request cancelled"
            : error.response
              ? `Request error: ${error.message}`
              : `Unexpected error: ${error.message}`;
          logger.debug(`Marking URL as bad due to fetch failure: ${url} (${errorMsg})`);
          result[url] = { ...result[url], bad: true, error: errorMsg };
        }

        if (res) {
          if (res.status >= 400) {
            logger.debug(`Marking URL as bad due to HTTP error: ${url}`);
            result[url] = { ...result[url], bad: true, error: `HTTP ${res.status} ${res.statusText}` };
          } else {
            result[url] = this.#processLinks(url, res, result[url].contentType, parsers, isInternal, result[url], enqueue);
          }
        }
      }

      // Run all scanners in parallel, including for bad links
      const updates = await Promise.all(
        scanners.map((s) => s.scan(res || { headers: {} }, url, { ...result[url] })),
      );
      for (const u of updates) result[url] = { ...result[url], ...u };
    }

    logger.info("Crawling completed");
    return result;
  }
}
