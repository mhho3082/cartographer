export class TagScanner {
  constructor(config) {
    this.config = config;
  }

  // res: axios response (may be HEAD or GET), url: string, attrs: current aggregated attrs for this URL
  async scan(res, url, attrs) {
    const tags = [];
    const out = {};

    // status
    if (attrs.status !== undefined) {
      tags.push(`status:${attrs.status}`);
      out.status = attrs.status;
    }

    // Bad page indicator
    if (attrs.bad) {
      tags.push("bad:true");
    } else {
      tags.push("bad:false");
    }

    // content type
    if (attrs.contentType) {
      tags.push(`contentType:${attrs.contentType}`);
      out.contentType = attrs.contentType;
    } else if (res.headers && res.headers["content-type"]) {
      const ct = String(res.headers["content-type"])
        .split(";")[0]
        .trim()
        .toLowerCase();
      out.contentType = ct;
      tags.push(`contentType:${ct}`);
    }

    // content-encoding header -> attribute 'encoding'
    const encoding =
      res.headers &&
      (res.headers["content-encoding"] || res.headers["content-encoding"]);
    if (encoding) {
      tags.push(`encoding:${encoding}`);
      out.encoding = encoding;
    }

    // charset: prefer attrs.charset, then content-type header, then inspect HTML body if available
    let detectedCharset = attrs.charset;
    if (!detectedCharset && res.headers && res.headers["content-type"]) {
      const m = String(res.headers["content-type"]).match(/charset=([^;\s]+)/i);
      if (m) detectedCharset = m[1];
    }
    if (
      !detectedCharset &&
      out.contentType === "text/html" &&
      res.data &&
      typeof res.data === "string"
    ) {
      const mm = res.data.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
      if (mm) detectedCharset = mm[1];
      else {
        // also try http-equiv
        const mm2 = res.data.match(
          /<meta[^>]+http-equiv=["']?Content-Type["']?[^>]*content=["']?[^"']*charset=([^"'\s>]+)/i,
        );
        if (mm2) detectedCharset = mm2[1];
      }
    }
    if (detectedCharset) {
      tags.push(`charset:${detectedCharset.toLowerCase()}`);
      out.charset = detectedCharset;
    }

    // page size (bytes): prefer attrs.pageSize, else content-length header, else measure body
    let pageSize = attrs.pageSize;
    if (!pageSize && res.headers && res.headers["content-length"]) {
      const cl = parseInt(res.headers["content-length"], 10);
      if (!Number.isNaN(cl)) pageSize = cl;
    }
    if (!pageSize && res.data && typeof res.data === "string") {
      pageSize = Buffer.byteLength(res.data, "utf8");
    }
    if (pageSize !== undefined) {
      if (pageSize >= 1000000) tags.push("pageSize:>=1000000");
      else if (pageSize >= 100000) tags.push("pageSize:>=100000");
      else tags.push("pageSize:<100000");
      out.pageSize = pageSize;
    }

    // responseTime (attrs.responseTime expected in ms)
    if (attrs.responseTime !== undefined) {
      const rt = Math.round(attrs.responseTime);
      if (rt >= 1000) tags.push("responseTime:>=1000");
      else if (rt >= 500) tags.push("responseTime:>=500");
      else if (rt >= 100) tags.push("responseTime:>=100");
      else tags.push("responseTime:<100");
      out.responseTime = attrs.responseTime;
    }

    // link type / internal vs external
    if (attrs.linkType) {
      tags.push(`linkType:${attrs.linkType}`);
      out.linkType = attrs.linkType;
    }

    // cache-control header
    if (res.headers && res.headers["cache-control"]) {
      const cc = String(res.headers["cache-control"]).toLowerCase();
      tags.push(`cacheControl:"${cc}"`);
      out.cacheControl = cc;
    }

    // last-modified header
    if (res.headers && res.headers["last-modified"]) {
      const lm = res.headers["last-modified"];
      // Split out only the month and year
      const lmMonthYear = String(lm).match(/([a-z]+)\s+(\d{4})/i);
      tags.push(`lastModified:"${lmMonthYear ? lmMonthYear[0] : lm}"`);
      out.lastModified = res.headers["last-modified"];
    }

    // server header
    if (res.headers && res.headers["server"]) {
      const server = String(res.headers["server"]).toLowerCase();
      tags.push(`server:${server}`);
      out.server = server;
    }

    // X-Powered-By header (common framework indicator)
    if (res.headers && res.headers["x-powered-by"]) {
      const xPoweredBy = String(res.headers["x-powered-by"]).toLowerCase();
      tags.push(`poweredBy:${xPoweredBy}`);
      out.xPoweredBy = xPoweredBy;
    }

    // Compression / Content-Encoding
    if (attrs.encoding) {
      tags.push(`compressed:${attrs.encoding}`);
    } else if (!attrs.encoding && out.contentType) {
      tags.push("compressed:none");
    }

    // Deduplicate tags
    const unique = [...new Set(tags)];

    // Return both tags and any inferred attributes so spider will merge them into result[url]
    return { ...out, tags: unique };
  }
}
