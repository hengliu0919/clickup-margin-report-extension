(() => {
  if (window.__clickupMarginReportContentScript) return;
  window.__clickupMarginReportContentScript = true;

  const pageSource = "clickup-margin-report-page";
  const contentSource = "clickup-margin-report-content";
  const pending = new Map();

  injectBridge();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== pageSource || !pending.has(message.requestId)) return;

    const { resolve, reject, timeout } = pending.get(message.requestId);
    clearTimeout(timeout);
    pending.delete(message.requestId);

    if (message.ok) resolve(message.result);
    else reject(new Error(message.error || "ClickUp page bridge request failed."));
  });

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

  function bridgeRequest(type, payload = {}) {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.get(requestId).reject(new Error("Timed out waiting for ClickUp page data."));
      pending.delete(requestId);
    }, 30000);

    const promise = new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, timeout });
    });

    window.postMessage({ source: contentSource, requestId, type, ...payload }, window.location.origin);
    return promise;
  }
})();
