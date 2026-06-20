(() => {
  if (window.__clickupMarginReportContentScript) return;
  window.__clickupMarginReportContentScript = true;

  const PAGE_READY = "clickup-margin-report-page-ready";
  const CONTENT_INIT = "clickup-margin-report-content-init";
  const CONTENT_HELLO = "clickup-margin-report-content-hello";

  const pending = new Map();
  let port = null;
  let connecting = null; // in-flight connect() promise, if any

  injectBridge();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== "clickup-margin-report-content") return false;

    bridgeRequest(message.type, message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });

  function injectBridge() {
    const id = "clickup-margin-report-page-bridge";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  }

  // Return a live port, (re)connecting on demand. Unlike a one-shot handshake at
  // injection time, this recovers if an earlier connect attempt failed (e.g. the
  // request arrived before the bridge finished loading).
  function getPort() {
    if (port) return Promise.resolve(port);
    if (!connecting) {
      connecting = connect()
        .then((p) => {
          port = p;
          connecting = null;
          return p;
        })
        .catch((err) => {
          connecting = null;
          throw err;
        });
    }
    return connecting;
  }

  // Establish a private MessageChannel with the page bridge. The bridge replies
  // only on this port, and port2 is transferred exactly once via a structured
  // clone the page cannot intercept. Page-world JS on app.clickup.com therefore
  // cannot impersonate the content script to mint a token or read financial data.
  //
  // Both scripts may load in either order (the bridge <script> is async), so we
  // use a two-way solicitation: the content script keeps sending CONTENT_HELLO
  // until the bridge answers PAGE_READY, and the bridge also announces PAGE_READY
  // when it loads. Whichever happens first, the port is transferred exactly once.
  function connect() {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const localPort = channel.port1;
      let transferred = false;
      let pingTimer = null;

      localPort.onmessage = (event) => {
        const message = event.data;
        if (!message || !pending.has(message.requestId)) return;
        const { resolve: res, reject: rej, timeout } = pending.get(message.requestId);
        clearTimeout(timeout);
        pending.delete(message.requestId);
        if (message.ok) res(message.result);
        else rej(new Error(message.error || "ClickUp page bridge request failed."));
      };
      localPort.start();

      const transfer = () => {
        if (transferred) return;
        transferred = true;
        if (pingTimer) clearInterval(pingTimer);
        window.removeEventListener("message", onReady);
        window.postMessage({ source: CONTENT_INIT }, window.location.origin, [channel.port2]);
        resolve(localPort);
      };

      // Transfer the port only once the bridge has actually answered.
      const onReady = (event) => {
        if (event.source !== window) return;
        if (event.data?.source !== PAGE_READY) return;
        transfer();
      };
      window.addEventListener("message", onReady);

      // Solicit the bridge until it answers (covers the bridge loading after us).
      window.postMessage({ source: CONTENT_HELLO }, window.location.origin);
      pingTimer = setInterval(() => {
        if (transferred) return clearInterval(pingTimer);
        window.postMessage({ source: CONTENT_HELLO }, window.location.origin);
      }, 250);

      setTimeout(() => {
        if (transferred) return;
        clearInterval(pingTimer);
        window.removeEventListener("message", onReady);
        reject(new Error("Could not connect to the ClickUp page bridge. Reload the ClickUp tab."));
      }, 10000);
    });
  }

  async function bridgeRequest(type, payload = {}) {
    const activePort = await getPort();
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.get(requestId).reject(new Error("Timed out waiting for ClickUp page data. Reload the ClickUp tab and try again."));
      pending.delete(requestId);
      // Drop the (possibly dead) port so the next request reconnects fresh.
      port = null;
    }, 30000);

    const promise = new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, timeout });
    });

    activePort.postMessage({ requestId, type, ...payload });
    return promise;
  }
})();
