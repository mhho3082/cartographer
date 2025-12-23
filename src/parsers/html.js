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
          return;
        }

        const attr = TAG_ATTRS[name];
        if (attr && attribs[attr]) links.push(attribs[attr]);

        if (name === "applet") {
          if (attribs.archive) links.push(attribs.archive);
          if (attribs.code) links.push(attribs.code);
        } else if (
          name === "param" &&
          attribs.name === "movie" &&
          attribs.value
        ) {
          links.push(attribs.value);
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
    }, {
      decodeEntities: false
    });

    parser.write(res.data);
    parser.end();

    return { title, links, problems };
  }
}
