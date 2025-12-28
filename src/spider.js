import axios from "axios";
import http from "node:http";
import https from "node:https";

import { getLogger } from "./logger.js";

export class Spider {
  constructor(config, seedUrls) {
    this.config = config;
    const logger = getLogger();

    // Check if any seed URL have HTTP basic auth; if yes, pick the first one
    this.username = null;
    this.password = null;
    for (const i in seedUrls) {
      try {
        logger.debug(`Checking seed URL for HTTP auth: ${seedUrls[i]}`);
        const url = seedUrls[i];
        const parsed = new URL(url);
        if (parsed.username && parsed.password) {
          if (!this.username && !this.password) {
            logger.info(`Using HTTP basic auth from URL: ${url}`);
            this.username = decodeURIComponent(parsed.username);
            this.password = decodeURIComponent(parsed.password);
          }
        }
      } catch (error) {
        logger.warn(
          `Invalid URL encountered while checking for HTTP auth: ${url}`,
        );
      }
    }
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
      auth:
        this.username && this.password
          ? {
            username: this.username,
            password: this.password,
          }
          : undefined,
      headers: {
        "User-Agent": this.config.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
    } catch (error) {
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

  async crawl(parsers, scanners) {
    // Output is a key-value store for report data (key is URL)
    const logger = getLogger();
    const getContentTypes = Object.keys(parsers);
    let res, isInternal, contentType, t0;
    const result = {};

    const queue = [];
    let qh = 0; // queue head index
    const queued = new Set(); // All URLs ever enqueued
    const visited = new Set(); // All URLs ever accessed
    const enqueue = (u) => {
      if (!u || queued.has(u)) {
        return;
      }
      queued.add(u);
      queue.push(u);
    };

    logger.info("Crawling initialized");
    this.seedUrls.forEach(enqueue);

    // Main loop
    main: while (qh < queue.length) {
      const url = queue[qh++];
      logger.status(`(${qh}/${queued.size}) Crawling ${url}...`);

      if (visited.has(url)) {
        // Something slipped through the cracks
        continue main;
      }
      visited.add(url);
      result[url] = { url, bad: false };

      // Decide which type of URL this is
      isInternal = this.isInternal(url);
      result[url].type = isInternal ? "internal" : "external";

      // If the URL matches any bad URL patterns, mark it as bad with reason
      for (const [reason, regex] of Object.entries(this.config.badUrlRegexes)) {
        if (regex.test(url)) {
          logger.debug(`Marking URL as bad due to pattern match: ${url}`);
          result[url].bad = true;
          result[url].error = reason;
          continue main;
        }
      }

      t0 = performance.now();
      try {
        // If the URL clearly points to an image, use HEAD request to save bandwidth
        res = await this.client.head(url);
        contentType = this.normalizeContentType(
          res.headers["content-type"] || "",
        );
        if (
          res &&
          res.status < 400 &&
          getContentTypes.includes(contentType) &&
          (isInternal || this.config.checkExternalLinks)
        ) {
          res = await this.client.get(url);
        }

        result[url].status = res.status;
        result[url].contentType = contentType;
      } catch (error) {
        if (axios.isCancel(error)) {
          logger.debug(`Request cancelled for URL: ${url}`);
          result[url].error = "Request cancelled";
        } else if (error.response) {
          logger.debug(
            `Marking URL as bad due to request error: ${url} (${error.message})`,
          );
          result[url].error = `Request error: ${error.message}`;
        } else {
          logger.debug(
            `Marking URL as bad due to unexpected error: ${url} (${error.message})`,
          );
          result[url].error = `Unexpected error: ${error.message}`;
        }
        result[url].bad = true;
        continue main;
      }
      result[url].responseTime = performance.now() - t0;

      if (res.status >= 400) {
        logger.debug(`Marking URL as bad due to HTTP error: ${url}`);
        result[url].bad = true;
        result[url].error = `HTTP ${res.status} ${res.statusText}`;
        continue main;
      }

      // Handle redirects
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        result[url].links = [res.headers.location];
      }

      // Send the result to parser based on MIME type (if any parsers match)
      // This will return extracted links to enqueue later
      if (res && contentType && getContentTypes.includes(contentType)) {
        const parsed = parsers[contentType].parse(res.data);
        const links = [...(result[url].links ?? []), ...(parsed?.links ?? [])];
        result[url] = { ...result[url], ...parsed, links };
      }

      // Normalize and enqueue discovered links
      result[url].base = result[url].base
        ? this.normalizeUrl(result[url].base, url)
        : this.normalizeUrl(url);
      result[url].links =
        result[url].links
          ?.map((v) => this.normalizeUrl(v, result[url].base))
          .filter(Boolean) ?? [];
      if (!isInternal) {
        // Filter out external links from non-internal URLs
        result[url].links = result[url].links.filter((v) => this.isInternal(v));
      }
      if (!this.config.seedUrlsOnly) {
        result[url].links.forEach(enqueue);
      }

      // Send the whole response to all scanners in parallel
      const updates = await Promise.all(
        scanners.map((s) => s.scan(res, url, { ...result[url] })),
      );
      for (const u of updates) result[url] = { ...result[url], ...u };
    }

    logger.info("Crawling completed");
    return result;
  }
}
