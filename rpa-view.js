(function () {
  "use strict";

  const FORM_FIELD_LABELS = {
    projectErp: "Project (ERP)",
    customerBilling: "Customer (Billing)",
    projectNameOnReport: "Project Name on Report",
    clientNameOnReport: "Client Name on Report",
    contact: "Contact",
    enableManualCubeJobNumber: "Enable Manual Cube Job #",
    cubeJobNumber: "Cube Job #",
    quote: "Quote",
    testItem: "Test Item",
    concreteGrade: "Grade",
    reportGrade: "Grade",
    supplier: "Supplier Of Concrete",
    supplierDisplay: "Supplier Of Concrete Display",
    locationRepresented: "Location",
    additionalInformation: "Additional Info",
    dateOfCast: "Date of cast",
    slumpMeasured: "Mean Slump",
    specimenSize: "Size",
    slumpSpecified: "Specified Slump",
    personInCharge: "Person In Charge",
    managerInCharge: "Manager In Charge"
  };

  const RESULT_FIELD_LABELS = {
    setNo: "Set No",
    size: "Size",
    specimenRef: "Specimen Ref #",
    barcode: "Barcode",
    specifiedSlump: "Specified Slump",
    meanSlump: "Mean Slump",
    resultGrade: "Concrete Grade",
    resultDateOfCast: "Date Of Cast",
    age: "Age",
    dateOfTest: "Date Of Test",
    weightKg: "WEIGHT AS RECEIVED (kg)",
    loadKn: "LOAD (kN)",
    strength: "COMPRESSIVE STRENGTH (N/mm²)",
    failureMode: "MODE OF FAILURE",
    invoiceNumber: "Invoice Number"
  };

  const params = new URLSearchParams(window.location.search);
  const requestedId = parseRequestedId(params.get("id"), params.get("setNo"));
  const documentId = requestedId.sourceRequestId;
  // The full Firestore document, and the record rendered from it: for a set of
  // a multi-set request that is the shared details plus only that set's rows
  // and RPA state.
  let sourceRecord = null;
  let currentRecord = null;
  let viewSetNo = null;

  // Accepts ?id=<doc>&setNo=<n> as well as a queue row id (<doc>#set-<n>).
  function parseRequestedId(id, setNo) {
    const formData = window.CubeSyncFormData;
    const parsed = id && formData && typeof formData.parseDashboardFormId === "function"
      ? formData.parseDashboardFormId(id)
      : { sourceRequestId: id, setNo: null };
    return {
      sourceRequestId: parsed.sourceRequestId,
      setNo: setNo != null && setNo !== "" ? setNo : parsed.setNo
    };
  }

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

  function isDateLikeString(value) {
    return typeof value === "string" &&
      (/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(value) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}(?:[T\s]|$)/.test(value));
  }

  function formatValue(value) {
    if (value == null || value === "") {
      return "Not provided";
    }

    const shouldFormatDate = value instanceof Date ||
      (value && typeof value.toDate === "function") ||
      isDateLikeString(value);
    const date = shouldFormatDate ? toDate(value) : null;
    if (date) {
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
        <div class="rpa-value">${escapeHtml(formatValue(formFieldValue(record, field)))}</div>
      </div>
    `).join("");

    document.getElementById("formFieldsGrid").innerHTML = html;
  }

  function formFieldValue(record, field) {
    const formData = window.CubeSyncFormData;
    if (formData && typeof formData.getCubeRequestFormValue === "function") {
      return formData.getCubeRequestFormValue(record, field);
    }

    return record[field];
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
    const submittedDate = toDate(record.submittedAt || record.createdAt || record.updatedAt || record.internalDate || record.dateOfCast);
    const status = rpaStatus(record);
    const statusBadge = document.getElementById("statusBadge");
    const disableButton = document.getElementById("btnDisable");

    const reportNo = record.reportNo || record.cubeJobNumber || documentId;
    document.getElementById("reportNoDisplay").textContent = viewSetNo != null
      ? `${reportNo} · Set ${viewSetNo}`
      : reportNo;
    document.getElementById("submittedAtDisplay").textContent = submittedDate
      ? `Submitted: ${submittedDate.toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`
      : "";
    statusBadge.textContent = `${status} / ERP: ${erpStatus(record)}`;

    disableButton.textContent = status === "Disabled" ? "Enable RPA" : "Disable RPA";
    disableButton.classList.toggle("danger", status !== "Disabled");
  }

  // Returns the record to render, or null when the requested set is missing.
  // A set is only scoped when the request still has more than one set, which
  // matches when the RPA queue shows it as its own row.
  function recordForView(record) {
    const formData = window.CubeSyncFormData;
    viewSetNo = null;
    if (requestedId.setNo == null || !formData || typeof formData.groupResultRowsBySet !== "function") {
      return record;
    }

    const groups = formData.groupResultRowsBySet(record.results);
    if (groups.length <= 1) {
      return record;
    }

    const group = groups.find((item) => item.setNo === formData.normalizeSetNo(requestedId.setNo));
    if (!group) {
      return null;
    }

    viewSetNo = group.setNo;
    return Object.assign({}, record, { results: group.rows }, formData.rpaStateForSet(record, group.setNo));
  }

  function renderRecord(record) {
    sourceRecord = record;
    const viewRecord = recordForView(record);
    if (!viewRecord) {
      currentRecord = null;
      setMessage(`Set ${requestedId.setNo} is no longer on this request.`, true);
      return false;
    }

    currentRecord = viewRecord;
    renderSummary(viewRecord);
    renderFieldGrid(viewRecord);
    renderResults(viewRecord);
    return true;
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

      if (renderRecord(record)) {
        setMessage("", false);
      }
    } catch (error) {
      setMessage(error.message || "Unable to load Firestore form.", true);
    }
  }

  async function toggleDisable() {
    if (!currentRecord || !window.CubeSyncFirestore) return;

    const nextStatus = rpaStatus(currentRecord) === "Disabled" ? "Ready for Bot" : "Disabled";
    const formData = window.CubeSyncFormData;
    const updates = viewSetNo != null
      ? formData.buildRpaSetStatusUpdate(sourceRecord, { [viewSetNo]: { rpaStatus: nextStatus } })
      : { rpaStatus: nextStatus };

    try {
      await window.CubeSyncFirestore.updateCubeRequest(documentId, updates);
      if (viewSetNo != null) {
        renderRecord(formData.applyRpaSetStatusUpdate(sourceRecord, updates));
      } else {
        currentRecord.rpaStatus = nextStatus;
        renderSummary(currentRecord);
      }
    } catch (error) {
      setMessage(error.message || "Unable to update RPA status.", true);
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("btnDisable").addEventListener("click", toggleDisable);
    loadRecord();
  });
})();
