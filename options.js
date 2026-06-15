import { ClickUpClient } from "./src/clickup.js";
import { defaultSettings, loadSettings, saveSettings } from "./src/storage.js";

const fields = {
  clickupToken: document.querySelector("#clickupToken"),
  workspaceId: document.querySelector("#workspaceId"),
  lookbackDays: document.querySelector("#lookbackDays"),
  peopleRatesCsv: document.querySelector("#peopleRatesCsv"),
  projectRatesCsv: document.querySelector("#projectRatesCsv"),
};

const saveStatus = document.querySelector("#saveStatus");
const connectionStatus = document.querySelector("#connectionStatus");

let currentSettings = await loadSettings();
renderSettings(currentSettings);

document.querySelector("#saveTop").addEventListener("click", handleSave);
document.querySelector("#saveBottom").addEventListener("click", handleSave);
document.querySelector("#resetSamples").addEventListener("click", resetSamples);
document.querySelector("#loadWorkspaces").addEventListener("click", loadWorkspaces);
document.querySelector("#loadMembers").addEventListener("click", loadMembers);

function renderSettings(settings) {
  fields.clickupToken.value = settings.clickupToken || "";
  fields.workspaceId.value = settings.workspaceId || "";
  fields.lookbackDays.value = settings.lookbackDays || 14;
  fields.peopleRatesCsv.value = settings.peopleRatesCsv || "";
  fields.projectRatesCsv.value = settings.projectRatesCsv || "";
}

function collectSettings() {
  return {
    clickupToken: fields.clickupToken.value.trim(),
    workspaceId: fields.workspaceId.value.trim(),
    lookbackDays: Math.max(1, Number(fields.lookbackDays.value || 14)),
    peopleRatesCsv: fields.peopleRatesCsv.value.trim() + "\n",
    projectRatesCsv: fields.projectRatesCsv.value.trim() + "\n",
    lastWorkspaceName: currentSettings.lastWorkspaceName || "",
  };
}

async function handleSave() {
  saveStatus.className = "status";
  saveStatus.textContent = "Saving...";
  currentSettings = await saveSettings(collectSettings());
  saveStatus.className = "status success";
  saveStatus.textContent = "Saved.";
}

async function resetSamples() {
  fields.peopleRatesCsv.value = defaultSettings.peopleRatesCsv;
  fields.projectRatesCsv.value = defaultSettings.projectRatesCsv;
  await handleSave();
}

async function loadWorkspaces() {
  connectionStatus.className = "status";
  connectionStatus.textContent = "Loading workspaces...";

  try {
    const client = new ClickUpClient(fields.clickupToken.value.trim());
    const workspaces = await client.getWorkspaces();
    if (!workspaces.length) {
      connectionStatus.textContent = "No workspaces found for this token.";
      return;
    }

    const lines = workspaces.map((team) => `${team.name}: ${team.id}`);
    const first = workspaces[0];
    fields.workspaceId.value ||= first.id;
    currentSettings.lastWorkspaceName = first.name;
    connectionStatus.className = "status success";
    connectionStatus.textContent = lines.join(" | ");
  } catch (error) {
    connectionStatus.className = "status error";
    connectionStatus.textContent = error.message;
  }
}

async function loadMembers() {
  connectionStatus.className = "status";
  connectionStatus.textContent = "Loading members...";

  try {
    const client = new ClickUpClient(fields.clickupToken.value.trim());
    const members = await client.getWorkspaceMembers(fields.workspaceId.value.trim());
    connectionStatus.className = "status success";
    connectionStatus.textContent = members.map((member) => `${member.username} (${member.id})`).join(" | ");
  } catch (error) {
    connectionStatus.className = "status error";
    connectionStatus.textContent = error.message;
  }
}

