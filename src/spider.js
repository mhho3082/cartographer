import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

import { getLogger } from "./logger.js";

export class Spider {
  constructor(config, seedUrls) {
    this.config = config;
    this.seedUrls = seedUrls;

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
          this.seedUrls[i] = this.normalizeUrl(url);
        }
      } catch (error) {
        logger.warn(
          `Invalid URL encountered while checking for HTTP auth: ${url}`,
        );
      }
    }

    this.jar = new CookieJar();
    this.client = wrapper(
      axios.create({
        jar: this.jar,
        timeout: this.config.requestTimeout,
        auth:
          this.username && this.password
            ? {
              username: this.username,
              password: this.password,
            }
            : undefined,
        maxRedirects: 0,
        validateStatus: null,
      }),
    );
  }

  normalizeUrl(url, base = undefined) {
    try {
      const normalized = base ? new URL(url, base) : new URL(url);
      normalized.username = "";
      normalized.password = "";
      normalized.hash = "";
      return normalized.toString();
    } catch (error) {
      getLogger().warn(`Invalid URL encountered during normalization: ${url}`);
      return null;
    }
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
    const visited = new Set();
    const queue = [];
    const result = {};
    let res;

    queue.push(...this.seedUrls.map(this.normalizeUrl).filter(Boolean));

    // Main loop
    main: while (queue.length > 0) {
      const url = queue.shift();
      if (visited.has(url)) {
        continue main;
      }
      visited.add(url);

      // Ignore URLs matching ignored patterns
      if (this.config.ignoredUrlRegexes.some((regex) => regex.test(url))) {
        logger.debug(`Ignoring URL due to ignore patterns: ${url}`);
        continue main;
      }
      logger.info(`Crawling URL: ${url}`);

      result[url] = { url, bad: false };

      // Decide which type of URL this is
      let isInternal = this.isInternal(url);
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

      try {
        // If the URL clearly points to an image, use HEAD request to save bandwidth
        if (this.config.headOnlyUrlRegexes.some((regex) => regex.test(url))) {
          res = await this.client.head(url);
        } else {
          res = await this.client.get(url);
        }
        result[url].status = res.status;
      } catch (error) {
        logger.debug(`Marking URL as bad due to request error: ${url}`);
        logger.debug(`Request error details: ${error.message}`);
        result[url].bad = true;
        result[url].error = `Request error: ${error.message}`;
        continue main;
      }

      // Handle redirects, which sometimes do not have response bodies
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        const location = this.normalizeUrl(res.headers.location, url);
        if (location) {
          result[url].title = `Redirected to ${location}`;
          result[url].links = [location];
        }
      }

      if (res.status >= 400) {
        logger.debug(`Marking URL as bad due to HTTP error: ${url}`);
        result[url].bad = true;
        result[url].error = `HTTP ${res.status} ${res.statusText}`;
        continue main;
      }

      // Send the result to parser based on MIME type (if any parsers match)
      // This will return extracted links to enqueue later
      if (res && res.headers["content-type"]) {
        const contentType = res.headers["content-type"].split(";")[0].trim();
        const parsed = parsers[contentType]?.parse(res);
        result[url] = { ...result[url], ...parsed };
      }

      // Normalize and enqueue discovered links
      result[url].links =
        result[url].links
          ?.map((v) => this.normalizeUrl(v, url))
          .filter(
            (v) =>
              v &&
              !this.config.ignoredUrlRegexes.some((regex) => regex.test(v)),
          ) ?? [];
      if (!isInternal) {
        // Filter out external links from non-internal URLs
        result[url].links = result[url].links.filter((v) => this.isInternal(v));
      }
      if (result[url].links.length > 0) {
        queue.push(
          ...result[url].links.filter(
            (link) => link && !visited.has(link) && !queue.includes(link),
          ),
        );
      }

      // Send the whole response to each scanner
      for (const scanner of scanners) {
        result[url] = await scanner.scan(res, url, result[url]);
      }
    }

    return result;
  }
}
