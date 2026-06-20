// Shared ClickUp-tab resolution + content-script messaging, extracted from the
// three near-identical copies that lived in popup.js, report.js, and options.js.

const CLICKUP_URL = "https://app.clickup.com/";
const CLICKUP_GLOB = "https://app.clickup.com/*";

// Resolve a ClickUp tab. `preferActive` returns the active tab only if it is a
// ClickUp tab (popup behavior); otherwise it falls back to any ClickUp tab.
export async function getClickUpTab({ preferActive = false } = {}) {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;

  if (preferActive) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.url?.startsWith(CLICKUP_URL)) return active;
  }

  const tabs = await chrome.tabs.query({ url: CLICKUP_GLOB });
  return tabs.find((tab) => tab.active) || tabs[0] || null;
}

/**
 * @param {number} tabId
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @param {{ onStatus?: (message: string) => void }} [options]
 */
export async function sendToClickUpTab(tabId, type, payload = {}, { onStatus } = {}) {
  const message = { target: "clickup-margin-report-content", type, payload };

  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
    onStatus?.("Connecting to the ClickUp tab...");
    await injectContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, message);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read data from the ClickUp tab. Reload ClickUp after installing the extension.");
  }
  return response.result;
}

async function injectContentScript(tabId) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Reload the ClickUp tab once, then try again.");
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
}

function isMissingReceiverError(error) {
  return /Receiving end does not exist|Could not establish connection/i.test(error?.message || "");
}
