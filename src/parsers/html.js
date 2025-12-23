import * as htmlparser2 from "htmlparser2";

export class HTMLParser {
  constructor(config) {
    this.config = config;
  }

  parse(res) {
    let title = "";
    const links = [];
    const problems = [];

    // TODO: Handle embedded URLs in CSS and JS within HTML

    let currentTag = null;
    const parser = new htmlparser2.Parser({
      onopentag(name, attribs) {
        if (name === "title") {
          currentTag = "title";
        } else if (name === "base" && attribs.href) {
          links.push(attribs.href);
        } else if (name === "link" && attribs.href) {
          links.push(attribs.href);
        } else if (name === "a" && attribs.href) {
          links.push(attribs.href);
        } else if (name === "img" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "video" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "script" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "embed" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "param" && attribs.name === "movie" && attribs.value) {
          links.push(attribs.value);
        } else if (name === "frame" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "iframe" && attribs.src) {
          links.push(attribs.src);
        } else if (name === "area" && attribs.href) {
          links.push(attribs.href);
        } else if (name === "applet" && attribs.archive) {
          links.push(attribs.archive);
        } else if (name === "applet" && attribs.code) {
          links.push(attribs.code);
        }
      },
      ontext(text) {
        if (currentTag === "title") {
          title += text;
        }
      },
      onclosetag() {
        currentTag = null;
      },
    });

    parser.write(res.data);
    parser.end();

    return { title, links, problems };
  }
}
