import css from "css";

export class CSSParser {
  constructor(config) {
    this.config = config;
  }
  parse(res) {
    // Returns every URL a browser would potentially fetch from CSS:
    // - `url(...)`: background, src, mask, cursor, border-image, content, etc.
    // - `@import "..."/url(...)`
    // - `@font-face src: url(...) / local(...)`
    const ast = css.parse(res.data, { silent: true });
    const links = [];

    const add = (u) => {
      if (!u) {
        return;
      }
      u = String(u)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      links.push(u);
    };

    const fromValue = (v) => {
      if (!v) {
        return;
      }
      // `url(...)` tokens (handles quotes, spaces, and multiple URLs per value)
      v.replace(
        /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s][^)]*))\s*\)/gi,
        (_, a, b, c) => (add(a || b || c), ""),
      );
      // `@import "..."` without `url()`
      v.replace(
        /@import\s+(?:url\(\s*)?(?:'([^']*)'|"([^"]*)"|([^'")\s;][^;)]*))\s*\)?/gi,
        (_, a, b, c) => (add(a || b || c), ""),
      );
      // `@font-face local(...)` is not fetched (ignore)
    };

    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);

      if (node.type === "stylesheet") return walk(node.stylesheet?.rules);
      if (node.type === "rule") return walk(node.declarations);
      if (node.type === "declaration") return fromValue(node.value);
      if (node.type === "import") return add(node.import);

      // media/supports/document/host/etc: recurse into nested rules
      if (node.rules) walk(node.rules);

      // keyframes contain rules with declarations
      if (node.keyframes) walk(node.keyframes);

      // font-face: declarations contain `src:url(...)`
      if (node.declarations) walk(node.declarations);
    };

    walk(ast);
    return { links };
  }
}
