import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkPath = path.join(root, "packages/js/dist/index.js");

const app = `<!doctype html>
<meta charset="utf-8">
<title>NamoID popup browser test</title>
<button id="sign-in">Sign in</button>
<script type="module">
  import { createNamoIDClient } from "/sdk.js";
  const client = createNamoIDClient({ clientId: "namoid_client_test_browser" });
  window.runPopup = (mode = "success") => client.hostedAuth.popup({
    redirectUri: window.location.origin + "/popup-callback",
    scopes: ["openid", "email"],
    extraParams: { browser_test_mode: mode },
    timeoutMs: mode === "hang" ? 1_000 : 10_000,
  });
  window.runCrossOriginPopup = () => client.hostedAuth.popup({
    redirectUri: "https://other.example/popup-callback",
  });
</script>`;

const bridge = `<!doctype html>
<meta charset="utf-8">
<title>Completing sign-in</title>
<script type="module">
  import { relayHostedAuthPopupCallback } from "/sdk.js";
  relayHostedAuthPopupCallback();
</script>`;

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4173");
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (url.pathname === "/sdk.js") {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    createReadStream(sdkPath).pipe(response);
    return;
  }
  const body = url.pathname === "/popup-callback" ? bridge : app;
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "cross-origin-opener-policy": "same-origin-allow-popups",
  });
  response.end(body);
}).listen(4173, "127.0.0.1");
