import { defaultSettings, loadSettings, saveSettings } from "./src/storage.js";

const fields = {
  lookbackDays: document.querySelector("#lookbackDays"),
  peopleRatesCsv: document.querySelector("#peopleRatesCsv"),
  projectRatesCsv: document.querySelector("#projectRatesCsv"),
};

const saveStatus = document.querySelector("#saveStatus");

let currentSettings = await loadSettings();
renderSettings(currentSettings);

document.querySelector("#saveTop").addEventListener("click", handleSave);
document.querySelector("#saveBottom").addEventListener("click", handleSave);
document.querySelector("#resetSamples").addEventListener("click", resetSamples);

function renderSettings(settings) {
  fields.lookbackDays.value = settings.lookbackDays || 14;
  fields.peopleRatesCsv.value = settings.peopleRatesCsv || "";
  fields.projectRatesCsv.value = settings.projectRatesCsv || "";
}

function collectSettings() {
  return {
    lookbackDays: Math.max(1, Number(fields.lookbackDays.value || 14)),
    peopleRatesCsv: fields.peopleRatesCsv.value.trim() + "\n",
    projectRatesCsv: fields.projectRatesCsv.value.trim() + "\n",
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
