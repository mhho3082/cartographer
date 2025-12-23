// When using Winston for logging, avoid calling `process.exit()`,
// else it may cause issues with pending log writes

import winston from "winston";
import colors from "@colors/colors/safe.js";

import * as defaultConfig from "./config.js";

// Uses singleton pattern for logger instance
let logger = null;

export function createLogger(config = {}) {
  const timeFormat = config.timeFormat || "YYYY-MM-DD HH:mm:ss";
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    transports: [
      new winston.transports.File({
        filename: "combined.log",
        format: winston.format.combine(
          winston.format.timestamp({ format: timeFormat }),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: "error.log",
        level: "error",
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.timestamp({ format: timeFormat }),
          winston.format.json(),
        ),
      }),
    ],
  });

  if (!config.quiet) {
    colors.setTheme({
      error: ["red", "bold"],
      warn: ["yellow", "bold"],
      info: ["bold"],
      debug: ["gray", "bold"],
    });
    logger.add(
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || "info",
        format: winston.format.combine(
          winston.format.timestamp({ format: timeFormat }),
          winston.format.padLevels(),
          winston.format.printf(
            (info) =>
              colors.gray(info.timestamp) +
              " " +
              colors[info.level]("[" + info.level.toUpperCase() + "]") +
              " " +
              info.message +
              (info.stack ? `\n${info.stack}` : ""),
          ),
        ),
      }),
    );
  }

  return logger;
}

export function getLogger() {
  if (!logger) {
    logger = createLogger(defaultConfig);
    logger.warn(
      "Logger not initialized with config. Using default configuration.",
    );
  }
  return logger;
}
