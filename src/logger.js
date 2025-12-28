/** Winston logger with customized logging formats and ephemeral status logging */

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

/** Create and configure a Winston logger instance. */
export function createLogger(options = {}) {
  config = { ...config, ...options };
  const level = process.env.LOG_LEVEL || "info";
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
    logger.add(new ConsoleStatus({ level, format: consoleFormat }));
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
    logger = createLogger(defaultConfig);
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

/** Custom file logging format */
const fileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: config.timeFormat }),
  winston.format.json(),
);

/** Custom console logging format */
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
      // For exceptions, the message also contain the stacktrace
      (info.stack && `${info.stack}` !== info.message.replace(/^.*?\n/g, "")
        ? `\n${info.stack}`
        : ""),
  ),
);

// Basic transports to ignore status logs
class FileBasic extends winston.transports.File {
  log(info, callback) {
    if (info[LEVEL] !== "status") {
      return super.log(info, callback);
    } else {
      callback(); // eslint-disable-line callback-return
      return true;
    }
  }
}
class ConsoleBasic extends winston.transports.Console {
  log(info, callback) {
    if (info[LEVEL] !== "status") {
      return super.log(info, callback);
    } else {
      callback(); // eslint-disable-line callback-return
      return true;
    }
  }
}

// Based on `winston.transports.Console`
class ConsoleStatus extends winston.transports.Console {
  constructor(options = {}) {
    super(options);

    // Node.JS maps `process.stdout` to `console._stdout`.
    this._log = console._stdout ? console._stdout : process.stdout;
    this.recentLevel = "";

    // Add newline on exit if needed
    // https://stackoverflow.com/a/14032965
    this.handleExit = () => {
      if (this.recentLevel === "status") {
        this._log.write("\n");
      }
    };
    process.on("exit", this.handleExit);
  }

  log(info, callback) {
    setImmediate(() => this.emit("logged", info));

    if (info[LEVEL] === "status") {
      this._log.write(`\x1b[K${info[MESSAGE]}\r`);
    } else if (this.recentLevel === "status") {
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
