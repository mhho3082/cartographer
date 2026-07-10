/**
 * Customized Winston Logger
 *
 * Last updated: 2026-06-08
 *
 * A Winston logger with customized logging formats and ephemeral status logging
 *
 * When using Winston for logging, avoid calling `process.exit()`,
 * else it may cause issues with pending log writes;
 * see https://github.com/winstonjs/winston/issues/228
 *
 * Copyright (c) 2025 Max Ho
 *
 * Usage of the works is permitted provided that this instrument is retained with the works,
 * so that any entity that uses the works is notified of this instrument.
 *
 * DISCLAIMER: THE WORKS ARE WITHOUT WARRANTY.
 */

import winston from "winston";
import colors from "@colors/colors/safe.js";
import { LEVEL, MESSAGE } from "triple-beam";

// Use singleton pattern for logger instance
let logger = null;
let config = {
  quiet: false,
  logLevel: process.env.LOG_LEVEL || "info",
  timeFormat: "YYYY-MM-DD HH:mm:ss",
};

/** Create and configure a Winston logger instance. */
export function createLogger(options = {}) {
  config = { ...config, ...options };
  const level = config.logLevel || process.env.LOG_LEVEL || "info";
  logger = winston.createLogger({
    level,
    levels,
    transports: [
      new FileBasic({
        filename: "combined.log",
        format: fileFormat,
      }),
      new FileBasic({
        filename: "error.log",
        level: "error",
        format: fileFormat,
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
  });

  // The status logger must go first to add the newline for other loggers
  if (!config.quiet) {
    logger.add(new ConsoleStatus({ level }));
    logger.add(
      new ConsoleBasic({
        level,
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true,
      }),
    );
  }

  return logger;
}

/** Get the logger instance for use. */
export function getLogger() {
  if (!logger) {
    logger = createLogger();
    logger.warn(
      "Logger not initialized with config. Using default configuration.",
    );
  }
  return logger;
}

// Extended from NPM defaults at
// https://github.com/winstonjs/winston?tab=readme-ov-file#logging-levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  status: 2, // Special level for progress statuses, not logged to files
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};
colors.setTheme({
  error: ["red", "bold"],
  warn: ["yellow", "bold"],
  info: ["bold"],
  status: ["gray", "bold"],
  http: ["gray", "bold"],
  verbose: ["gray", "bold"],
  debug: ["gray", "bold"],
  silly: ["gray", "bold"],
});

// Spinner frames based on https://github.com/sindresorhus/yocto-spinner
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 100;

// The status line prefixes its message with a spinner frame and a space.
// Non-status console logs are indented by the same width so their messages
// line up with the status message despite the spinner.
const CONSOLE_INDENT = " ".repeat(SPINNER_FRAMES[0].length + 1);

/** Custom file logging format */
const fileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: config.timeFormat }),
  winston.format.json(),
);

/** Custom console logging format */
const consoleFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: config.timeFormat }),
  winston.format.padLevels({ levels }),
  winston.format.printf((info) => {
    const indent = info[LEVEL] === "status" ? "" : CONSOLE_INDENT;
    return (
      colors.gray(info.timestamp) +
      " " +
      colors[info.level]("[" + info.level.toUpperCase() + "]") +
      " " +
      indent +
      (info.stack ? `${info.stack}` : info.message)
    );
  }),
);

// Status logs are handled solely by `ConsoleStatus`; every other transport
// drops them (and never writes them to files) while passing the rest through.
function logIgnoringStatus(superLog, info, callback) {
  if (info[LEVEL] === "status") {
    callback(); // eslint-disable-line callback-return
    return true;
  }
  return superLog(info, callback);
}
class FileBasic extends winston.transports.File {
  log(info, callback) {
    return logIgnoringStatus(super.log.bind(this), info, callback);
  }
}
class ConsoleBasic extends winston.transports.Console {
  log(info, callback) {
    return logIgnoringStatus(super.log.bind(this), info, callback);
  }
}

// Based on `winston.transports.Console`
class ConsoleStatus extends winston.transports.Console {
  constructor(options = {}) {
    super(options);

    // Node.JS maps `process.stdout` to `console._stdout`.
    this._log = console._stdout ? console._stdout : process.stdout;
    this.recentLevel = "";
    this.spinnerIndex = 0;
    this.spinnerTimer = null;
    this.statusInfo = null;

    // Add newline on exit if needed
    // https://stackoverflow.com/a/14032965
    this.handleExit = () => {
      this.stopSpinner();
      if (this.recentLevel === "status") {
        this._log.write("\n");
      }
    };
    process.on("exit", this.handleExit);
  }

  startSpinner() {
    if (!this.spinnerTimer) {
      this.spinnerTimer = setInterval(
        () => this.renderStatus(),
        SPINNER_INTERVAL_MS,
      );
      if (typeof this.spinnerTimer.unref === "function") {
        this.spinnerTimer.unref();
      }
    }
  }

  stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.statusInfo = null;
    this.spinnerIndex = 0;
  }

  renderStatus() {
    if (!this.statusInfo) {
      return;
    }

    const spinner = colors[this.statusInfo.level](SPINNER_FRAMES[this.spinnerIndex]);
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
    // `structuredClone` drops symbol keys, so re-tag the level for formatting.
    const temp_info = structuredClone(this.statusInfo);
    temp_info[LEVEL] = "status";
    // Spinner frame + space; `CONSOLE_INDENT` matches this width so non-status
    // logs align with the status message text.
    temp_info.message = `${spinner} ${temp_info.message}`;
    this._log.write(`\x1b[K${consoleFormat.transform(temp_info)[MESSAGE]}\r`);
  }

  log(info, callback) {
    setImmediate(() => this.emit("logged", info));

    if (info[LEVEL] === "status") {
      this.statusInfo = info;
      this.renderStatus();
      this.startSpinner();
    } else if (this.recentLevel === "status") {
      this.stopSpinner();
      // Add newline for a clean line for other logs
      this._log.write("\n");
    }

    if (callback) {
      callback(); // eslint-disable-line callback-return
    }

    this.recentLevel = info[LEVEL];
    return true;
  }

  close() {
    // Add newline for a clean line for other logs
    // Called only on unpipe event
    this.handleExit();
    process.off("exit", this.handleExit);
  }
}
