import "./env.js";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { renderScreen } from "./render.js";
import { parseInZone } from "./plugins/calendar/dates.js";
import { previewHtml } from "./preview.js";

const PORT = Number(process.env.PORT ?? 3000);
const KEY = process.env.SCREEN_KEY;

// Track when the image content last changed so TRMNL's ETag / Last-Modified
// checks only trigger a redraw when something is actually different.
let last = { etag: "", modified: new Date() };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (KEY && url.searchParams.get("key") !== KEY) {
    res.writeHead(401).end("unauthorized");
    return;
  }

  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" }).end(previewHtml);
      return;
    }

    if (url.pathname === "/events") {
      // The preview page holds this open; when `tsx watch` restarts the server
      // the connection drops, and the page reloads the image on reconnect.
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write("retry: 300\n\n");
      return;
    }

    if (url.pathname === "/screen.png") {
      const nowParam = url.searchParams.get("now");
      const png = await renderScreen(config, {
        now: nowParam ? parseInZone(nowParam, config.timeZone) : new Date(),
        timeZone: config.timeZone,
        demo: url.searchParams.has("demo"),
      });
      const etag = `"${createHash("sha1").update(png).digest("hex").slice(0, 16)}"`;
      if (etag !== last.etag) last = { etag, modified: new Date() };

      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { etag }).end();
        return;
      }
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": png.length,
        "cache-control": "no-cache",
        etag,
        "last-modified": last.modified.toUTCString(),
      });
      res.end(png);
      return;
    }

    res.writeHead(404).end("not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain" }).end(String((err as Error).stack ?? err));
  }
});

server.listen(PORT, () => console.log(`preview: http://localhost:${PORT}${KEY ? `/?key=${KEY}` : ""}`));
