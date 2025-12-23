// When using Winston for logging, avoid calling `process.exit()`,
// else it may cause issues with pending log writes;
// see https://github.com/winstonjs/winston/issues/228

import winston from "winston";
import colors from "@colors/colors/safe.js";
import { LEVEL, MESSAGE } from "triple-beam";

import * as defaultConfig from "./config.js";

// Use singleton pattern for logger instance
let logger = null;
let config = defaultConfig;

// Extended from NPM defaults at
// https://github.com/winstonjs/winston?tab=readme-ov-file#logging-levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  loading: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};
colors.setTheme({
  error: ["red", "bold"],
  warn: ["yellow", "bold"],
  info: ["bold"],
  loading: ["gray", "bold"],
  http: ["gray", "bold"],
  verbose: ["gray", "bold"],
  debug: ["gray", "bold"],
  silly: ["gray", "bold"],
});

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: config.timeFormat }),
  winston.format.padLevels({ levels }),
  winston.format.printf(
    (info) =>
      colors.gray(info.timestamp) +
      " " +
      colors[info.level]("[" + info.level.toUpperCase() + "]") +
      " " +
      info.message +
      (info.stack ? `\n${info.stack}` : ""),
  ),
);

/** Create and configure a Winston logger instance. */
export function createLogger(options = {}) {
  config = { ...config, ...options };
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    levels,
    transports: [
      new winston.transports.File({
        filename: "combined.log",
        format: winston.format.combine(
          winston.format.timestamp({ format: config.timeFormat }),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: "error.log",
        level: "error",
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.timestamp({ format: config.timeFormat }),
          winston.format.json(),
        ),
      }),
    ],
  });

  if (!config.quiet) {
    logger.add(
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || "info",
        format: consoleFormat,
      }),
    );
  }

  return logger;
}

/** Get the logger instance for use. */
export function getLogger() {
  if (!logger) {
    logger = createLogger(defaultConfig);
    logger.warn(
      "Logger not initialized with config. Using default configuration.",
    );
  }
  return logger;
}

/** Log a progress message that overwrites itself on the console. */
export function progress(message) {
  if (
    !config.quiet &&
    levels[process.env.LOG_LEVEL || "info"] >= levels["loading"]
  ) {
    process.stdout.write(
      consoleFormat.transform({
        [LEVEL]: "loading",
        level: "loading",
        message: `\x1b[K${message}\r`,
      })[MESSAGE],
    );
  }
}

/** Add a newline after progress messages,
 * before printing log messages with the logger.
 */
export function progressEnd() {
  if (
    !config.quiet &&
    levels[process.env.LOG_LEVEL || "info"] >= levels["loading"]
  ) {
    process.stdout.write("\n");
  }
}
