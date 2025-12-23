// https://stackoverflow.com/a/62892482
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// == Fetcher Settings ==

// Timeout for HTTP requests, in milliseconds.
export const requestTimeout = 10 * 1000;

// Maximum redirects to follow for a single URL.
export const maxRedirects = 5;

// Whether to check external links for validity.
// This is state of the --external option.
export const checkExternalLinks = true;

// == URL Classification ==

// The regexes that indicate a URL is internal.
// If not provided (left empty), will use the domain(s) of provided seed URLs.
export const internalUrlRegexes = [];

// Among matched internal links,
// mark URLs matching below regexes explicitly as external.
export const externalUrlRegexes = [];

// Consider URLs matching these regexes as "bad", with reason as key.
export const badUrlRegexes = {
  "File URI scheme is not allowed": /^file:\/\//,
  "FTP URI scheme is not allowed": /^ftp:\/\//,
  "SSH URI scheme is not allowed": /^ssh:\/\//,
};

// For ignored URLs
export const ignoredUrlRegexes = [
  /^data:/,
  /^tel:/,
  /^mailto:/,
  /^javascript:/,
];

// == Report settings ==

// Which directory to output the report to.
// `{{host}}` in the path will be replaced with the first seed URL's host.
export const outputDir = `${__dirname}/dist/{{host}}`;

// If the report directory exists, should it be deleted first.
export const overwrite = false;

// == Logger Settings ==

// Whether to print help message and exit.
export const help = false;

// Error logging level: debug, info, warn, error, none.
export const logLevel = "info";

// Time format for logs, using dayjs format.
export const timeFormat = "YYYY-MM-DD HH:mm:ss";

// Whether to run in quiet mode (no console output), same as --log_level none.
export const quiet = false;
