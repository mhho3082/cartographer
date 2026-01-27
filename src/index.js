import fs from "node:fs";
import childProcess from "node:child_process";
import { parseArgsConfig } from "./parse-args-config.js";
import { createLogger } from "./logger.js";
import { Spider } from "./spider.js";
import { HTMLParser } from "./parsers/html.js";
import { CSSParser } from "./parsers/css.js";

// https://stackoverflow.com/a/62892482
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const main = async () => {
  // == Setup ==

  const { config, positionals: seedUrls } = parseArgsConfig({
    desc: "Generate an interactive network graph report",
    positionalSpec: "[seedUrls...]",
    substitutions: ["{{host}}"]
  });

  // Setup logger
  const logger = createLogger(config);

  // Check that there is at least one seed URL
  if (seedUrls.length === 0) {
    logger.error("At least one seed URL must be provided.");
    return;
  }

  // Make non-regex values in config arrays into regexes
  // array-based
  for (const key of [
    "internalUrlRegexes",
    "externalUrlRegexes",
    "ignoredUrlRegexes",
  ]) {
    config[key] = config[key].map((item) =>
      item instanceof RegExp ? item : new RegExp(item),
    );
  }
  // object-based
  for (const key of ["badUrlRegexes"]) {
    for (const k of Object.keys(config[key])) {
      const v = config[key][k];
      config[key][k] = v instanceof RegExp ? v : new RegExp(v);
    }
  }

  // Substitute {{host}} in outputDir with the host of the first seed URL
  config.outputDir = config.outputDir.replace(
    "{{host}}",
    new URL(seedUrls[0]).host,
  );

  // Check and create the output directory
  if (fs.existsSync(config.outputDir)) {
    if (!config.overwrite) {
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

  // == Crawling ==

  // Initialize and start the spider
  // TODO: Add scanners
  const spider = new Spider(config, seedUrls);
  const result = await spider.crawl(
    {
      "text/html": new HTMLParser(config),
      "text/css": new CSSParser(config),
    },
    [],
  );

  // == Output ==

  // Clear everything in the output directory
  fs.readdirSync(config.outputDir).forEach((file) => {
    fs.rmSync(path.join(config.outputDir, file), {
      recursive: true,
      force: true,
    });
  });

  // Write the result to outputDir/result.js
  fs.writeFileSync(
    `${config.outputDir}/result.js`,
    `window.__RESULT__ = ${JSON.stringify(result, null, 0)};`,
  );

  // Copy files from template to outputDir
  fs.cpSync(path.resolve(__dirname, "template"), config.outputDir, {
    recursive: true,
  });

  if (config.openReport) {
    // Open the report in the default browser
    logger.info("Opening report in default browser...");
    const indexPath = path.resolve(config.outputDir, "index.html");
    switch (process.platform) {
      case "linux":
        childProcess.exec(`xdg-open "${indexPath}"`);
        break;
      case "darwin":
        childProcess.exec(`open "${indexPath}"`);
        break;
      case "win32":
        childProcess.exec(`start "" "${indexPath}"`);
        break;
      default:
        logger.warn(
          `Cannot open report automatically on platform "${process.platform}".`,
        );
    }
  }
};

await main();
