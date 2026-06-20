(() => {
  if (window.__clickupMarginReportContentScript) return;
  window.__clickupMarginReportContentScript = true;

  const PAGE_READY = "clickup-margin-report-page-ready";
  const CONTENT_INIT = "clickup-margin-report-content-init";

  const pending = new Map();
  let port = null;
  let portReady = null;
  let portTransferred = false;

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

    portReady = connect();

    const script = document.createElement("script");
    script.id = id;
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  }

  // Establish a private MessageChannel with the page bridge. The bridge replies
  // only on this port, and port2 is transferred exactly once via a structured
  // clone the page cannot intercept. Page-world JS on app.clickup.com therefore
  // cannot impersonate the content script to mint a token or read financial data.
  function connect() {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      port = channel.port1;

      port.onmessage = (event) => {
        const message = event.data;
        if (!message || !pending.has(message.requestId)) return;
        const { resolve: res, reject: rej, timeout } = pending.get(message.requestId);
        clearTimeout(timeout);
        pending.delete(message.requestId);
        if (message.ok) res(message.result);
        else rej(new Error(message.error || "ClickUp page bridge request failed."));
      };
      port.start();

      const transfer = () => {
        if (portTransferred) return;
        portTransferred = true;
        window.postMessage({ source: CONTENT_INIT }, window.location.origin, [channel.port2]);
        resolve(port);
      };

      // The bridge posts PAGE_READY once it has loaded. We register this listener
      // before the script can execute (dynamic src scripts always load async), so
      // the signal is not missed.
      const onReady = (event) => {
        if (event.source !== window) return;
        if (event.data?.source !== PAGE_READY) return;
        window.removeEventListener("message", onReady);
        transfer();
      };
      window.addEventListener("message", onReady);

      // Fallback: if the ready signal never arrives (bridge already present from a
      // prior injection), transfer anyway after a short delay, then give up later.
      setTimeout(transfer, 500);
      setTimeout(() => {
        if (!portTransferred) reject(new Error("Could not connect to the ClickUp page bridge. Reload ClickUp."));
      }, 5000);
    });
  }

  async function bridgeRequest(type, payload = {}) {
    await portReady;
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.get(requestId).reject(new Error("Timed out waiting for ClickUp page data. Reload the ClickUp tab and try again."));
      pending.delete(requestId);
    }, 30000);

    const promise = new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, timeout });
    });

    port.postMessage({ requestId, type, ...payload });
    return promise;
  }
})();
