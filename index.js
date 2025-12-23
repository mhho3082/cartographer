import { parseArgs } from "node:util";
import * as defaultConfig from "./config.js";
import { logLevels, createLogger, error } from "./logger.js";
import fs from "fs";

// == Setup ==

// Positionals are seed URLs
// https://nodejs.org/api/util.html#utilparseargsconfig
const { values, positionals: seedUrls } = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    logLevel: { type: "string" },
    timeFormat: { type: "string" },
    quiet: { type: "boolean" },
    external: { type: "boolean" },
    outputDir: { type: "string" },
    overwrite: { type: "boolean" },
  },
  allowPositionals: true,
  allowNegative: true,
});
const config = { ...defaultConfig, ...values };

if (config.help) {
  console.log(`Usage: node index.js [options] <seed_url1> <seed_url2> ...
Generates a network graph report starting from the provided seed URLs

Options:
  -h, --help              Show this help message and exit
  --logLevel <level>      Set the logging level (debug, info, warn, error, none)
  --timeFormat <format>   Set the time format for logs (dayjs format)
  --quiet                 Run in quiet mode (no console output), same as --logLevel none
  --external              Check external links for validity
  --outputDir <dir>       Directory to output the report to
  --overwrite             Overwrite the output directory if it exists`);
  process.exit(0);
}

// Setup logger
if (!logLevels.includes(config.logLevel)) {
  config.logLevel = "info";
}
if (config.quiet) {
  config.logLevel = "none";
}
createLogger(config);

if (seedUrls.length === 0) {
  error("Error: At least one seed URL must be provided.");
  process.exit(1);
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
    error(
      `Output directory "${config.outputDir}" already exists. Use --overwrite to overwrite.`,
    );
    process.exit(1);
  }
}
fs.mkdirSync(config.outputDir, { recursive: true });
