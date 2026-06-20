// Shared ClickUp-tab resolution + content-script messaging, extracted from the
// three near-identical copies that lived in popup.js, report.js, and options.js.

const CLICKUP_GLOB = "https://app.clickup.com/*";

// A workspace URL begins with a numeric workspace-id segment, e.g.
// app.clickup.com/90141340871/v/l/... — the bridge reads the workspace id from
// there. Task (/t/...) and other tabs lack it, so prefer workspace tabs.
const WORKSPACE_PATH = /^https:\/\/app\.clickup\.com\/\d+(\/|$)/;

function isWorkspaceTab(tab) {
  return WORKSPACE_PATH.test(tab?.url || "");
}

// Resolve the best ClickUp tab to talk to. Preference order:
//   1. the active tab, if it's a workspace tab (popup behavior)
//   2. any workspace tab (active first)
//   3. any ClickUp tab at all (last resort)
// This avoids landing on a stale /t/<task> or /time tab when several are open.
export async function getClickUpTab({ preferActive = false } = {}) {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;

  if (preferActive) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (isWorkspaceTab(active)) return active;
  }

  const tabs = await chrome.tabs.query({ url: CLICKUP_GLOB });
  const workspace = tabs.filter(isWorkspaceTab);
  if (workspace.length) return workspace.find((t) => t.active) || workspace[0];
  return tabs.find((t) => t.active) || tabs[0] || null;
}

/**
 * @param {number} tabId
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @param {{ onStatus?: (message: string) => void, timeoutMs?: number }} [options]
 */
export async function sendToClickUpTab(tabId, type, payload = {}, { onStatus, timeoutMs } = {}) {
  const message = { target: "clickup-margin-report-content", type, payload };

  let response;
  try {
    response = await send(tabId, message, timeoutMs);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
    onStatus?.("Connecting to the ClickUp tab...");
    await injectContentScript(tabId);
    response = await send(tabId, message, timeoutMs);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read data from the ClickUp tab. Reload ClickUp after installing the extension.");
  }
  return response.result;
}

// Optional client-side timeout, used for a fast readiness ping so we don't wait
// on the content-script's long timeout when the bridge isn't ready yet.
function send(tabId, message, timeoutMs) {
  const call = chrome.tabs.sendMessage(tabId, message);
  if (!timeoutMs) return call;
  return Promise.race([
    call,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the ClickUp page bridge.")), timeoutMs)),
  ]);
}

// Cheap readiness check that completes the content-script <-> page-bridge
// handshake (no ClickUp API calls). Returns true once the bridge responds.
/**
 * @param {number} tabId
 * @param {{ attempts?: number, timeoutMs?: number, onStatus?: (message: string) => void }} [options]
 */
export async function ensureBridgeReady(tabId, { attempts = 4, timeoutMs = 1500, onStatus } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await sendToClickUpTab(tabId, "GET_CONTEXT", {}, { timeoutMs, onStatus });
      return true;
    } catch (error) {
      if (!/Timed out|Receiving end|establish connection|page bridge/i.test(error?.message || "")) throw error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
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
