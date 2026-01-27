// Note that you must provide JSDoc comments in below format for each configuration option
// for the argument parser to pick them up.

// https://stackoverflow.com/a/62892482
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// == Logger Settings ==

/** Show the help message and exit. */
export const help = false;

/** Whether to suppress logging to console. */
export const quiet = false;

/** Select the logging level.
 * If not provided, defaults to the LOG_LEVEL environment variable or "info". */
export const logLevel = process.env.LOG_LEVEL || "info";

/** The default time format, in fecha format. */
export const timeFormat = "YYYY-MM-DD HH:mm:ss";

// == Fetcher Settings ==

/** Timeout for HTTP requests, in milliseconds. */
export const requestTimeout = 10 * 1000;

/** Whether to check external links for validity. */
export const checkExternalLinks = true;

/** The user agent to use. */
export const userAgent =
  "Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0";

/** The maximum number of concurrent HTTP requests. */
export const maxSockets = 1;

/** The maximum number of free (idle) sockets to keep open. */
export const maxFreeSockets = 1;

/** Only fetch the URLs provided as seeds, without crawling links. */
export const seedUrlsOnly = false;

// == URL Classification ==

/** The regexes that indicate a URL is internal.
 * If not provided (left empty), will use the domain(s) of provided seed URLs. */
export const internalUrlRegexes = [];

/** Among matched internal links,
 * mark URLs matching below regexes explicitly as external. */
export const externalUrlRegexes = [];

/** Consider URLs matching these regexes as "bad", with reason as key. */
export const badUrlRegexes = {
  "File URI scheme is not allowed": /^file:\/\//,
  "FTP URI scheme is not allowed": /^ftp:\/\//,
  "SSH URI scheme is not allowed": /^ssh:\/\//,
};

/** Ignore URLs matching these regexes entirely. */
export const ignoredUrlRegexes = [
  /^data:/,
  /^about:/,
  /^blob:/,
  /^javascript:/,
  /^tel:/,
  /^mailto:/,
  /^whatsapp:/,
];

// == Report settings ==

/** Which directory to output the report to.
 * `{{host}}` in the path will be replaced with the first seed URL's host. */
export const outputDir = path.resolve(`${__dirname}/../dist/{{host}}`);

/** If the report directory exists, should it be deleted first. */
export const overwrite = true;

/** Whether to open the report automatically after generation. */
export const openReport = true;
