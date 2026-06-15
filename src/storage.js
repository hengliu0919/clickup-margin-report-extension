const defaultPeopleRatesCsv = `clickup_user_id,username,cost_rate,default_bill_rate,role
216168054,Demo Admin,65,140,Project Manager
216168243,Marco,55,135,Designer
216168277,Alice,85,175,Senior Engineer
`;

const defaultProjectRatesCsv = `clickup_list_id,client,project,bill_rate,budget_hours,target_margin
901417274458,Acme Co,Website Redesign,150,80,0.55
901417274459,Northstar,MSP Support Retainer,185,40,0.50
901417274460,Helio,Mobile App Rescue,175,60,0.55
`;

export const defaultSettings = {
  clickupToken: "",
  workspaceId: "",
  lookbackDays: 14,
  peopleRatesCsv: defaultPeopleRatesCsv,
  projectRatesCsv: defaultProjectRatesCsv,
  lastWorkspaceName: "",
};

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

export async function loadSettings() {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(Object.keys(defaultSettings));
    return { ...defaultSettings, ...stored };
  }

  const raw = localStorage.getItem("clickupMarginReportSettings");
  return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
}

export async function saveSettings(settings) {
  const next = { ...defaultSettings, ...settings };
  if (hasChromeStorage()) {
    await chrome.storage.local.set(next);
    return next;
  }

  localStorage.setItem("clickupMarginReportSettings", JSON.stringify(next));
  return next;
}

export function openOptionsPage() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }

  window.location.href = "options.html";
}

