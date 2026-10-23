export const previewHtml = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TRMNL preview</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
         justify-content: center; gap: 20px; background: #2b2b2b; color: #ddd; font: 14px system-ui, sans-serif; }
  .bezel { background: #e9e6df; padding: 28px; border-radius: 14px; box-shadow: 0 10px 40px #0008; }
  img { display: block; image-rendering: pixelated; width: 800px; height: 480px; background: #fff; }
  body.zoom img { width: 1600px; height: 960px; }
  .bar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; }
  button, input { font: inherit; }
  #status { opacity: .6; min-width: 160px; }
</style>
</head>
<body>
  <div class="bezel"><img id="screen" alt="screen"></div>
  <div class="bar">
    <label><input type="checkbox" id="demo"> demo data</label>
    <label><input type="checkbox" id="zoom"> 2× zoom</label>
    <label>pretend now <input type="datetime-local" id="now"></label>
    <button id="reset-now">real now</button>
    <button id="refresh">refresh</button>
    <span id="status"></span>
  </div>
<script>
  const $ = (id) => document.getElementById(id);
  const key = new URLSearchParams(location.search).get("key");
  const saved = JSON.parse(localStorage.getItem("trmnl-preview") || "{}");
  $("demo").checked = !!saved.demo;
  $("zoom").checked = !!saved.zoom;
  $("now").value = saved.now || "";

  function refresh() {
    const p = new URLSearchParams({ t: Date.now() });
    if (key) p.set("key", key);
    if ($("demo").checked) p.set("demo", "1");
    // Sent as wall-clock time; the server interprets it in the screen's time zone.
    if ($("now").value) p.set("now", $("now").value);
    document.body.classList.toggle("zoom", $("zoom").checked);
    localStorage.setItem("trmnl-preview", JSON.stringify({ demo: $("demo").checked, zoom: $("zoom").checked, now: $("now").value }));
    $("status").textContent = "rendering…";
    const started = performance.now();
    const img = new Image();
    img.onload = () => { $("screen").src = img.src; $("status").textContent = "rendered in " + Math.round(performance.now() - started) + " ms at " + new Date().toLocaleTimeString(); };
    img.onerror = () => { $("status").textContent = "render failed — see terminal"; };
    img.src = "/screen.png?" + p;
  }

  for (const id of ["demo", "zoom"]) $(id).addEventListener("change", refresh);
  // "input" fires as soon as the value is a complete date+time; "change" can wait for blur.
  $("now").addEventListener("input", () => { if ($("now").value) refresh(); });
  $("reset-now").addEventListener("click", () => { $("now").value = ""; refresh(); });
  $("refresh").addEventListener("click", refresh);
  // Only while the tab is visible (each refresh is a full server render); catch up when it's shown again.
  setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  // Reload whenever the dev server restarts (i.e. you saved a source file).
  let dropped = false;
  const es = new EventSource("/events" + (key ? "?key=" + encodeURIComponent(key) : ""));
  es.onerror = () => { dropped = true; $("status").textContent = "waiting for server…"; };
  es.onopen = () => { if (dropped) { dropped = false; refresh(); } };

  refresh();
</script>
</body>
</html>`;
