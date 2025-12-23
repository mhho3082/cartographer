import { parseArgs } from "node:util";
import fs from "node:fs";

import * as defaultConfig from "./config.js";
import { createLogger } from "./logger.js";
import { Spider } from "./spider.js";
import { HTMLParser } from "./parsers/html.js";
import { CSSParser } from "./parsers/css.js";

const main = async () => {
  // == Setup ==

  let config = defaultConfig;

  // If ../config.js exists, load it and override defaultConfig
  const customConfigPath = new URL("../.config.js", import.meta.url);
  if (fs.existsSync(customConfigPath)) {
    const customConfig = await import(customConfigPath.href);
    config = { ...config, ...customConfig };
  }

  // Positionals are seed URLs
  // https://nodejs.org/api/util.html#utilparseargsconfig
  const { values, positionals: seedUrls } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      quiet: { type: "boolean" },
      seedUrlsOnly: { type: "boolean" },
      external: { type: "boolean" },
      outputDir: { type: "string" },
      overwrite: { type: "boolean" },
    },
    allowPositionals: true,
    allowNegative: true,
  });
  config = { ...config, ...values };

  if (config.help) {
    console.log(
      `
Usage: node src/index.js [options] [seed_url1 seed_url2 ...]
Generates a network graph report starting from the provided seed URLs

Options:
  -h, --help         Show this help message and exit
  --quiet            Run in quiet mode (no console output, only log files)
  --seedUrlsOnly     Only fetch the seed URLs without crawling links
  --no-external      Do not check external links for validity
  --outputDir <dir>  Directory to output the report to
  --no-overwrite     Do not overwrite the output directory if it exists

To change the log level, modify the LOG_LEVEL environment variable.
`.trim(),
    );
    return;
  }

  // Setup logger
  const logger = createLogger(config);

  if (seedUrls.length === 0) {
    logger.error("At least one seed URL must be provided.");
    return;
  }

  // Check and create the output directory
  config.outputDir = config.outputDir.replace(
    "{{host}}",
    new URL(seedUrls[0]).host,
  );
  if (fs.existsSync(config.outputDir)) {
    if (config.overwrite) {
      fs.rmSync(config.outputDir, { recursive: true, force: true });
    } else {
      logger.error(
        `Output directory "${config.outputDir}" already exists. Use --overwrite to overwrite.`,
      );
      return;
    }
  }
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Check if internalUrlRegexes is empty; if so, set it to seed URL domains
  if (config.internalUrlRegexes.length === 0) {
    config.internalUrlRegexes = seedUrls.map((url) => {
      const host = new URL(url).host.replace(/\./g, "\\.");
      return new RegExp(`^https?://(${host})(:\\d+)?/`);
    });
  }

  // == Begin crawling ==

  // TEMP: Run spider and output report as JSON
  const spider = new Spider(config, seedUrls);
  const result = await spider.crawl(
    {
      "text/html": new HTMLParser(config),
      "text/css": new CSSParser(config),
    },
    [],
  );

  fs.writeFileSync(
    `${config.outputDir}/report.json`,
    JSON.stringify(result, null, 2),
  );
};

await main();
