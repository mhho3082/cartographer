import * as htmlparser2 from "htmlparser2";

const TAG_ATTRS = {
  a: "href",
  link: "href",
  base: "href",
  img: "src",
  script: "src",
  iframe: "src",
  frame: "src",
  embed: "src",
  video: "src",
  area: "href",
};

export class HTMLParser {
  constructor(config) {
    this.config = config;
  }

  parse(data) {
    let title = "";
    let base = undefined;
    const links = [];
    let charset = undefined;

    let currentTag = null;
    let inBody = false;
    const parser = new htmlparser2.Parser(
      {
        onopentag(name, attribs) {
          if (name === "title") {
            currentTag = "title";
            return;
          }
          if (name === "body") {
            inBody = true;
            return;
          }

          const attr = TAG_ATTRS[name];
          if (attr && attribs[attr]) links.push(attribs[attr]);

          if (name === "base") {
            base = attribs.href;
          } else if (name === "applet") {
            if (attribs.archive) links.push(attribs.archive);
            if (attribs.code) links.push(attribs.code);
          } else if (
            name === "param" &&
            attribs.name === "movie" &&
            attribs.value
          ) {
            links.push(attribs.value);
          }

          // Capture <meta charset="..."> or <meta http-equiv="Content-Type" content="...; charset=...">
          if (name === "meta") {
            if (attribs.charset) {
              charset = attribs.charset;
            } else if (attribs["http-equiv"] && attribs.content) {
              const m = attribs.content.match(/charset=([^;\s]+)/i);
              if (m) charset = m[1];
            }
          }
        },
        ontext(text) {
          if (!inBody && currentTag === "title") {
            title += text;
          }
        },
        onclosetag() {
          currentTag = null;
        },
      },
      {
        decodeEntities: false,
      },
    );

    parser.write(data);
    parser.end();

    return { title, base, links, charset };
  }
}
