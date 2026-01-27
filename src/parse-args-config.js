/**
 * Basic JSDoc-based command-line argument parser
 *
 * Last updated: 2026-01-27
 *
 * Copyright (c) 2026 Max Ho
 *
 * Usage of the works is permitted provided that this instrument is retained with the works,
 * so that any entity that uses the works is notified of this instrument.
 *
 * DISCLAIMER: THE WORKS ARE WITHOUT WARRANTY.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import * as defaultConfig from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const camelToKebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function extractJsdocExports(source) {
  // Captures: /** ... */ export const <name> =
  const re = /\/\*\*([\s\S]*?)\*\/\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;

  const items = [];
  for (let m; (m = re.exec(source));) {
    const rawBlock = m[1];
    const name = m[2];

    const lines = rawBlock
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trim());

    const description = lines
      .filter((l) => l && !l.startsWith("@"))
      .join(" ")
      .trim();

    const jsdocType = lines
      .find((l) => l.startsWith("@type"))
      ?.match(/@type\s*\{([^}]+)\}/)?.[1]
      ?.trim();

    const jsdocDefaultRaw = lines
      .find((l) => l.startsWith("@default"))
      ?.replace(/^@default\s+/, "")
      .trim();

    items.push({ name, description, jsdocType, jsdocDefaultRaw });
  }
  return items;
}

function parseJsonOrThrow(flag, raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON for ${flag}: ${JSON.stringify(raw)}`);
  }
}

/**
 * Normalize JSDoc type strings into a small set of kinds we care about.
 * Anything unknown falls back to `"json"`.
 */
function jsdocTypeToKind(jsdocType) {
  if (!jsdocType) return null;
  const t = jsdocType.toLowerCase().replace(/\s/g, "");

  if (t.includes("boolean") || t === "bool") return "boolean";
  if (t.includes("string")) return "string";
  if (t.includes("number") || t.includes("bigint")) return "number";
  if (t.includes("array") || t.endsWith("[]")) return "array";
  if (t.includes("object") || t.includes("record") || t.includes("{"))
    return "object";
  if (t.includes("null")) return "null";
  return "json";
}

/**
 * Infer type-kind + default from the *actual exported value* in defaultConfig
 * when JSDoc is missing.
 */
function inferFromDefaultConfig(name) {
  const value = defaultConfig[name];

  if (typeof value === "boolean")
    return { kind: "boolean", defaultValue: value };
  if (typeof value === "string") return { kind: "string", defaultValue: value };
  if (typeof value === "number") return { kind: "number", defaultValue: value };
  if (typeof value === "bigint") return { kind: "json", defaultValue: value }; // JSON.parse can't produce `bigint`; treat as JSON-like
  if (value === null) return { kind: "json", defaultValue: null };
  if (Array.isArray(value)) return { kind: "array", defaultValue: value };
  if (typeof value === "object") return { kind: "object", defaultValue: value };
  if (typeof value === "undefined")
    return { kind: "string", defaultValue: undefined }; // best-effort fallback
  return { kind: "json", defaultValue: value };
}

function coerceFromJsdocDefaultRaw(flag, kind, jsdocDefaultRaw) {
  if (jsdocDefaultRaw == null) return { hasDefault: false };

  // For string defaults in JSDoc, allow either raw text or JSON string literal.
  if (kind === "string") {
    // If author wrote @default "hi", parse as JSON to unquote.
    if (/^".*"$/.test(jsdocDefaultRaw) || /^'.*'$/.test(jsdocDefaultRaw)) {
      // JSON.parse doesn't accept single quotes; handle both.
      const normalized =
        jsdocDefaultRaw[0] === "'"
          ? `"${jsdocDefaultRaw.slice(1, -1).replace(/"/g, '\\"')}"`
          : jsdocDefaultRaw;
      return {
        hasDefault: true,
        defaultValue: parseJsonOrThrow(flag, normalized),
      };
    }
    return { hasDefault: true, defaultValue: jsdocDefaultRaw };
  }

  // For boolean defaults, accept true/false (or JSON literals).
  if (kind === "boolean") {
    if (jsdocDefaultRaw === "true")
      return { hasDefault: true, defaultValue: true };
    if (jsdocDefaultRaw === "false")
      return { hasDefault: true, defaultValue: false };
    return {
      hasDefault: true,
      defaultValue: !!parseJsonOrThrow(flag, jsdocDefaultRaw),
    };
  }

  // For number/object/array/etc, require JSON.
  return {
    hasDefault: true,
    defaultValue: parseJsonOrThrow(flag, jsdocDefaultRaw),
  };
}

function buildSpec(items) {
  return items.map((it) => {
    const inferred = inferFromDefaultConfig(it.name);
    const jsdocKind = jsdocTypeToKind(it.jsdocType);

    // Prefer JSDoc type if present; otherwise infer from defaultConfig export.
    const kind = jsdocKind ?? inferred.kind;

    // Prefer JSDoc default if present; otherwise infer from defaultConfig export.
    const jsdocDefault = coerceFromJsdocDefaultRaw(
      `--${camelToKebab(it.name)}`,
      kind,
      it.jsdocDefaultRaw,
    );
    const defaultValue = jsdocDefault.hasDefault
      ? jsdocDefault.defaultValue
      : inferred.defaultValue;

    return {
      ...it,
      flag: camelToKebab(it.name),
      kind, // `"boolean"` | `"string"` | `"number"` | `"array"` | `"object"` | `"json"` | ...
      defaultValue,
    };
  });
}

function buildParseArgsOptions(spec) {
  const options = Object.fromEntries(
    spec.map((s) => [
      s.flag,
      s.kind === "boolean" ? { type: "boolean" } : { type: "string" },
    ]),
  );
  return options;
}

function parseValueByKind(flag, kind, raw) {
  if (kind === "boolean") {
    // raw already boolean (from parseArgs)
    return raw;
  }
  if (kind === "string") {
    // raw already string (from parseArgs)
    return raw;
  }
  // number/array/object/etc: require JSON input
  const value = parseJsonOrThrow(flag, raw);
  // Validate the result type
  switch (kind) {
    case "number":
      if (typeof value !== "number") {
        throw new Error(
          `Expected number for ${flag}, got: ${JSON.stringify(value)}`,
        );
      }
      return value;
    case "array":
      if (!Array.isArray(value)) {
        throw new Error(
          `Expected array for ${flag}, got: ${JSON.stringify(value)}`,
        );
      }
      return value;
    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          `Expected object for ${flag}, got: ${JSON.stringify(value)}`,
        );
      }
      return value;
    case "json":
    default:
      return value;
  }
}

function formatHelp({ bin, desc, positionalSpec, spec, substitutions = [] }) {
  const rows = spec.map((s) => {
    const opt =
      s.kind === "boolean" ? `--[no-]${s.flag}` : `--${s.flag} <${s.kind}>`;
    const desc = `${s.description || ""}`;
    return { opt, desc };
  });

  const optW = Math.max(...rows.map((r) => r.opt.length));

  return `Usage: node ${bin} [options] ${positionalSpec} ${desc ? "\n\n" + desc : ""}

Options:
${rows.map((r) => `  ${r.opt.padEnd(optW)}  ${r.desc}`.trimEnd()).join("\n")}

Notes:
  - boolean options support --no-[flag] for negation
  - string options take raw strings (no JSON required)
  - number/array/object options require JSON input (e.g. --count 3 --list "[1,2]")
  - substitution keys for string values: ${substitutions.length > 0 ? substitutions.join(", ") : "None"}
  - for shapes like array/object, and for default values, see ${path.relative(
    process.cwd(),
    path.join(__dirname, "config.js"),
  )}
`;
}

/**
 * Parse command-line arguments and return the merged config object.
 * @param {Object} options
 * @param {string} options.desc - Description of the program (shown in help).
 * @param {string} options.positionalSpec - Positional arguments spec (e.g. "[seedUrls...]"). If provided, positionals will be allowed in the CLI.
 */
export function parseArgsConfig({
  desc,
  positionalSpec = "",
  substitutions = [],
}) {
  const configPath = path.join(__dirname, "config.js");
  const src = fs.readFileSync(configPath, "utf8");
  const items = extractJsdocExports(src);

  const spec = buildSpec(items);

  const { values, positionals } = parseArgs({
    options: buildParseArgsOptions(spec),
    allowPositionals: positionalSpec.length > 0,
    allowNegative: true,
  });

  // defaultConfig is a namespace import; spread it into a plain object
  const config = { ...defaultConfig };

  for (const s of spec) {
    const flag = s.flag;
    if (!(flag in values)) continue; // not provided in CLI

    const raw = values[flag];
    const parsed = parseValueByKind(`--${flag}`, s.kind, raw);
    config[s.name] = parsed; // keep config keys `camelCase`
  }

  if (values.help || config.help) {
    console.log(
      formatHelp({
        bin: path.relative(process.cwd(), process.argv[1]),
        desc,
        positionalSpec,
        spec,
        substitutions,
      }),
    );
    process.exit(0);
  }

  return { config, positionals };
}
