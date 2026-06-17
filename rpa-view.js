(function () {
  "use strict";

  const FORM_FIELD_LABELS = {
    internalDate: "Internal date",
    projectCode: "Project code",
    reportNo: "Report no.",
    client: "Client",
    method: "Method",
    project: "Project",
    concreteGrade: "Concrete grade",
    supplier: "Supplier",
    locationRepresented: "Location represented",
    additionalInformation: "Additional information",
    dateTimeSampled: "Date and time sampled",
    slumpMeasured: "Slump measured (mm)",
    specimenSize: "Specimen size (mm)",
    slumpSpecified: "Slump specified (mm)"
  };

  const RESULT_FIELD_LABELS = {
    testNumber: "Test number",
    clientCubeMarking: "Client cube marking",
    dateTested: "Date tested",
    ageDays: "Age (days)",
    weightKg: "Weight as received (kg)",
    loadKn: "Load (kN)",
    strength: "Compressive strength (N/mm2)",
    failureMode: "Mode of failure",
    barcode: "Barcode"
  };

  const params = new URLSearchParams(window.location.search);
  const documentId = params.get("id");
  let currentRecord = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatValue(value) {
    if (value == null || value === "") {
      return "Not provided";
    }

    const date = toDate(value);
    if (date && typeof value !== "number") {
      return date.toLocaleString("en-SG", { timeZone: "Asia/Singapore" });
    }

    return String(value);
  }

  function rpaStatus(record) {
    return record.rpaStatus || "Ready for Bot";
  }

  function erpStatus(record) {
    return record.erpStatus || "Pending";
  }

  function setMessage(message, isError) {
    const element = document.getElementById("viewMessage");
    element.textContent = message;
    element.style.color = isError ? "#b42318" : "#4b5563";
  }

  function renderBarcode(value) {
    const barcode = window.CubeSyncBarcode;

    if (!value || !barcode) {
      return "";
    }

    try {
      return barcode.renderBarcodeSvg(value, {
        height: 54,
        moduleWidth: 1.25,
        quietZoneModules: 8,
        includeText: true
      });
    } catch (error) {
      return `<span class="rpa-message">${escapeHtml(error.message)}</span>`;
    }
  }

  function renderFieldGrid(record) {
    const html = Object.entries(FORM_FIELD_LABELS).map(([field, label]) => `
      <div class="rpa-field">
        <span class="rpa-label">${escapeHtml(label)}</span>
        <div class="rpa-value">${escapeHtml(formatValue(record[field]))}</div>
      </div>
    `).join("");

    document.getElementById("formFieldsGrid").innerHTML = html;
  }

  function renderResults(record) {
    const headers = Object.values(RESULT_FIELD_LABELS).map((label) => `
      <th scope="col">${escapeHtml(label)}</th>
    `).join("");
    const rows = Array.isArray(record.results) ? record.results : [];
    const body = rows.map((row) => {
      const cells = Object.keys(RESULT_FIELD_LABELS).map((field) => {
        const value = row[field];
        const barcodePreview = field === "barcode" && value
          ? `<div class="rpa-barcode-preview">${renderBarcode(String(value))}</div>`
          : "";

        return `<td>${escapeHtml(formatValue(value))}${barcodePreview}</td>`;
      }).join("");

      return `<tr>${cells}</tr>`;
    }).join("");

    document.getElementById("resultsHeader").innerHTML = `<tr>${headers}</tr>`;
    document.getElementById("resultsBody").innerHTML = body || `
      <tr><td colspan="${Object.keys(RESULT_FIELD_LABELS).length}">No test result rows saved.</td></tr>
    `;
  }

  function renderSummary(record) {
    const submittedDate = toDate(record.submittedAt || record.createdAt || record.updatedAt || record.internalDate);
    const status = rpaStatus(record);
    const statusBadge = document.getElementById("statusBadge");
    const disableButton = document.getElementById("btnDisable");

    document.getElementById("reportNoDisplay").textContent = record.reportNo || documentId;
    document.getElementById("submittedAtDisplay").textContent = submittedDate
      ? `Submitted: ${submittedDate.toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`
      : "";
    statusBadge.textContent = `${status} / ERP: ${erpStatus(record)}`;

    disableButton.textContent = status === "Disabled" ? "Enable RPA" : "Disable RPA";
    disableButton.classList.toggle("danger", status !== "Disabled");
  }

  function renderRecord(record) {
    currentRecord = record;
    renderSummary(record);
    renderFieldGrid(record);
    renderResults(record);
  }

  async function loadRecord() {
    if (!documentId) {
      setMessage("Missing Firestore document id.", true);
      return;
    }

    if (!window.CubeSyncFirestore) {
      setMessage("Firestore is not available.", true);
      return;
    }

    setMessage("Loading Firestore form...", false);

    try {
      const record = await window.CubeSyncFirestore.getCubeRequest(documentId);
      if (!record) {
        setMessage("Form not found in Firestore.", true);
        return;
      }

      renderRecord(record);
      setMessage("", false);
    } catch (error) {
      setMessage(error.message || "Unable to load Firestore form.", true);
    }
  }

  async function toggleDisable() {
    if (!currentRecord || !window.CubeSyncFirestore) return;

    const nextStatus = rpaStatus(currentRecord) === "Disabled" ? "Ready for Bot" : "Disabled";

    try {
      await window.CubeSyncFirestore.updateCubeRequest(documentId, { rpaStatus: nextStatus });
      currentRecord.rpaStatus = nextStatus;
      renderSummary(currentRecord);
    } catch (error) {
      setMessage(error.message || "Unable to update RPA status.", true);
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("btnDisable").addEventListener("click", toggleDisable);
    loadRecord();
  });
})();
