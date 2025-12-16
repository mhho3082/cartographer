// The regexes that indicate a URL is internal.
// If not provided (left empty), will use the domain(s) of provided seed URLs.
export const internal_url_regexes = [];

// Among matched internal links,
// mark URLs matching below regexes explicitly as external.
export const external_url_regexes = [];

// Consider URLs matching these regexes as "bad", with reason as key.
export const bad_url_regexes = {
  "File URI scheme is not allowed": /^file:\/\//,
  "FTP URI scheme is not allowed": /^ftp:\/\//,
  "SSH URI scheme is not allowed": /^ssh:\/\//,
};

// For ignored URLs
export const ignored_url_regexes = [
  /^data:/,
  /^tel:/,
  /^mailto:/,
  /^javascript:/,
];

// Maximum axios redirect count
export const maximum_redirects = 5;
