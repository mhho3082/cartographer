import dayjs from "dayjs";

let logger = null;
export const logLevels = ["debug", "info", "warn", "error", "none"];
let tags = {
  debug: "\x1b[0;90m[DEBUG]", // Gray
  info: "\x1b[0;0m [INFO]", // Reset
  warn: "\x1b[1;33m [WARN]", // Yellow
  error: "\x1b[1;31m[ERROR]", // Red
};
let textColors = {
  debug: "\x1b[0;0m", // Reset
  info: "\x1b[0;0m", // Reset
  warn: "\x1b[0;33m", // Yellow
  error: "\x1b[0;31m", // Red
};

export function createLogger(config) {
  const configLogLevel = config.logLevel;
  logger = (message, level = "info") => {
    if (logLevels.indexOf(level) >= logLevels.indexOf(configLogLevel)) {
      const timestamp = dayjs().format(config.timeFormat);
      console.log(
        `\x1b[0;90m[${timestamp}] ${tags[level]} ${textColors[level]}${message}\x1b[0;0m`,
      );
    }
  };
  return logger;
}

const log = (message, level = "info") => {
  if (!logger) {
    throw new Error("Logger not initialized. Call createLogger(config) first.");
  }
  logger(message, level);
};

export const debug = (message) => log(message, "debug");
export const info = (message) => log(message, "info");
export const warn = (message) => log(message, "warn");
export const error = (message) => log(message, "error");
