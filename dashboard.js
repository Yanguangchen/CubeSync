(function () {
  "use strict";

  const state = {
    forms: [],
    selectedId: null,
    search: "",
    status: "all",
    client: "all",
    project: "all",
    sort: "date-desc",
    todayOnly: false,
    loading: false,
    fieldConfig: null,
    dropdownOptions: {},
    pendingDetailStatus: null
  };

  const DROPDOWN_OPTION_SOURCES = [
    { field: "projectErp", url: "dropdown-options/project erp.txt", storageKey: "savedProjectErps" },
    { field: "customerBilling", url: "dropdown-options/customer billing.txt", storageKey: "savedCustomerBillings" },
    { field: "supplier", url: "dropdown-options/supplier.txt", storageKey: "savedSuppliers" },
    { field: "concreteGrade", url: "dropdown-options/Grade.txt", storageKey: "savedGrades" },
    { field: "personInCharge", url: "dropdown-options/person-in-charge.txt", storageKey: "savedPersonsInCharge" },
    { field: "managerInCharge", url: "dropdown-options/manager-in-charge.txt", storageKey: "savedManagersInCharge" },
    { field: "testItem", url: "dropdown-options/testitem.txt", storageKey: "savedTestItems" },
    { field: "specimenSize", url: "dropdown-options/size.txt", storageKey: "savedSizes" }
  ];

  const elements = {};
  let initialized = false;

  async function loadDropdownOptionSets() {
    const fetchFn = typeof window !== "undefined" && window.fetch
      ? window.fetch
      : (typeof fetch !== "undefined" ? fetch : null);

    const options = {};

    // Use the shared, deployed option files as the canonical reference only.
    // Browser-local (localStorage) suggestions are intentionally excluded so a
    // value is judged free text consistently across machines, regardless of
    // what any single staff browser has cached.
    await Promise.all(DROPDOWN_OPTION_SOURCES.map(async ({ field, url }) => {
      if (!fetchFn) {
        return;
      }

      try {
        const response = await fetchFn(encodeURI(url));
        if (response.ok) {
          const text = await response.text();
          const fileOptions = text.split("\n").map((line) => line.trim()).filter(Boolean);
          if (fileOptions.length) {
            options[field] = fileOptions;
          }
        }
      } catch {
        // Missing option file: leave this field without a reference list.
      }
    }));

    // Merge the shared, dynamic Firestore options on top of the deployed files
    // so promoted values count as canonical (and stop being flagged as free
    // text). Still excludes browser-local suggestions on purpose.
    const store = formStore();
    if (store && typeof store.getDropdownOptions === "function") {
      try {
        const shared = (await store.getDropdownOptions()) || {};
        Object.keys(shared).forEach((field) => {
          if (!Array.isArray(shared[field]) || !shared[field].length) {
            return;
          }
          const existing = Array.isArray(options[field]) ? options[field] : [];
          options[field] = Array.from(new Set([...existing, ...shared[field]]));
        });
      } catch {
        // Shared options are optional; fall back to deployed files only.
      }
    }

    state.dropdownOptions = options;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setSurfaceStatus(element, message, tone) {
    if (!element) {
      return;
    }

    if (!message) {
      element.textContent = "";
      element.hidden = true;
      element.removeAttribute("data-tone");
      return;
    }

    element.textContent = message;
    element.hidden = false;
    element.setAttribute("data-tone", tone || "info");
  }

  function clearSurfaceStatus(element) {
    setSurfaceStatus(element, "", "");
  }

  function queueDetailStatus(message, tone) {
    state.pendingDetailStatus = message ? { message, tone: tone || "info" } : null;
  }

  function classifyActionError(error, fallbackMessage) {
    const code = String(error && error.code || "").trim();
    const message = String(error && error.message || "").trim();
    const lowerCode = code.toLowerCase();
    const lowerMessage = message.toLowerCase();

    if (lowerCode === "permission-denied" || lowerCode === "unauthenticated") {
      return {
        tone: "warning",
        message: "Access denied. Sign in with an allowed account and try again."
      };
    }

    if (
      lowerCode === "unavailable" ||
      lowerCode === "deadline-exceeded" ||
      lowerCode === "internal" ||
      lowerCode === "resource-exhausted" ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("offline") ||
      lowerMessage.includes("failed to fetch") ||
      lowerMessage.includes("firestore") ||
      lowerMessage.includes("service unavailable")
    ) {
      return {
        tone: "error",
        message: "Service issue. The request did not complete. Retry in a moment."
      };
    }

    if (
      lowerMessage.includes("required") ||
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("complete") ||
      lowerMessage.includes("choose") ||
      lowerMessage.includes("fix")
    ) {
      return {
        tone: "warning",
        message: message || fallbackMessage
      };
    }

    return {
      tone: "error",
      message: message || fallbackMessage
    };
  }

  function formatDashboardDate(value) {
    if (value == null || value === "") {
      return "";
    }

    const text = String(value).trim();
    const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
    if (yearFirst) {
      return `${yearFirst[1]}/${yearFirst[2].padStart(2, "0")}/${yearFirst[3].padStart(2, "0")}`;
    }

    const dayFirst = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:$|[T\s])/);
    if (dayFirst) {
      return `${dayFirst[3]}/${dayFirst[2].padStart(2, "0")}/${dayFirst[1].padStart(2, "0")}`;
    }

    return text;
  }

  function formStore() {
    return window.CubeSyncFirestore;
  }

  function formDataHelper() {
    return window.CubeSyncFormData;
  }

  function authHelper() {
    return window.CubeSyncAuth;
  }

  function statusClass(status) {
    if (status === "Ready") return "status-ready";
    if (status === "Archived") return "status-archived";
    return "status-draft";
  }

  function barcodeValues(form) {
    return (form.raw && Array.isArray(form.raw.results) ? form.raw.results : [])
      .map((row) => String(row.barcode || "").trim())
      .filter(Boolean);
  }

  function dashboardFilters() {
    return window.CubeSyncDashboardFilters;
  }

  function filteredForms() {
    const helper = dashboardFilters();
    if (helper && typeof helper.applyDashboardFilters === "function") {
      const today = typeof helper.currentIsoDate === "function" ? helper.currentIsoDate() : undefined;
      return helper.applyDashboardFilters(state.forms, {
        search: state.search,
        status: state.status,
        client: state.client,
        project: state.project,
        sort: state.sort,
        todayOnly: state.todayOnly,
        today: today
      });
    }

    // Fallback (helper script unavailable): legacy search + status only.
    const query = state.search.trim().toLowerCase();

    return state.forms.filter(function (form) {
      const statusMatch = state.status === "all" || form.status === state.status;
      const searchText = [
        form.reportNo,
        form.client,
        form.project,
        form.grade,
        barcodeValues(form).join(" ")
      ].join(" ").toLowerCase();

      return statusMatch && (!query || searchText.includes(query));
    });
  }

  // Repopulate the Client/Project filter dropdowns from the loaded forms,
  // preserving the current selection when it still exists.
  function refreshFilterOptions() {
    const helper = dashboardFilters();
    if (!helper || typeof helper.collectFilterOptions !== "function") {
      return;
    }

    const options = helper.collectFilterOptions(state.forms);
    populateFilterSelect(elements.clientFilter, options.clients, state.client, "All clients");
    populateFilterSelect(elements.projectFilter, options.projects, state.project, "All projects");

    // Drop selections that no longer match any loaded form.
    if (state.client !== "all" && !optionsContain(options.clients, state.client)) {
      state.client = "all";
      if (elements.clientFilter) elements.clientFilter.value = "all";
    }
    if (state.project !== "all" && !optionsContain(options.projects, state.project)) {
      state.project = "all";
      if (elements.projectFilter) elements.projectFilter.value = "all";
    }
  }

  function optionsContain(values, target) {
    const wanted = String(target).trim().toLowerCase();
    return values.some((value) => String(value).trim().toLowerCase() === wanted);
  }

  function populateFilterSelect(select, values, selected, allLabel) {
    if (!select) {
      return;
    }

    const allOption = `<option value="all">${escapeHtml(allLabel)}</option>`;
    const valueOptions = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    select.innerHTML = allOption + valueOptions;
    select.value = optionsContain(values, selected) ? selected : "all";
  }

  function setListMessage(message) {
    elements.formList.innerHTML = `<tr><td colspan="7">${escapeHtml(message)}</td></tr>`;
  }

  function setDetailButtons(enabled) {
    [
      elements.detailViewButton,
      elements.detailEditButton,
      elements.detailPrintButton,
      elements.detailDeleteButton
    ].forEach((button) => {
      button.disabled = !enabled;
    });
  }

  // Toggle the detail panel's visibility. On desktop it is hidden until a form
  // is selected, then eases in from behind the list panel (see `.has-detail`
  // in css/dashboard.css). On mobile the panel simply stacks below the list.
  function setDetailPanelVisible(visible) {
    const panel = elements.detailPanel;
    if (!panel) return;

    const workspace = (panel.closest && panel.closest(".workspace")) || panel.parentElement;
    if (workspace) {
      workspace.classList.toggle("has-detail", Boolean(visible));
    }
    panel.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function selectedForm() {
    return state.forms.find((form) => form.id === state.selectedId) || null;
  }

  function customFields(form) {
    return form && Array.isArray(form.customFields) ? form.customFields : [];
  }

  function customFieldCount(form) {
    return customFields(form).length;
  }

  function renderCustomFieldBadge(form) {
    const count = customFieldCount(form);
    if (!count) {
      return "";
    }

    const label = count === 1 ? "1 free-text field" : `${count} free-text fields`;
    return `<span class="custom-field-count" title="Dropdown values typed as free text">${escapeHtml(label)}</span>`;
  }

  function renderCustomFieldLegend(form) {
    const count = customFieldCount(form);
    if (!count) {
      return "";
    }

    return `
      <aside class="custom-field-legend" aria-label="Free text dropdown legend">
        <strong>Free-text dropdown fields: ${escapeHtml(count)}</strong>
        <span>Orange tint indicates free text typed instead of selecting a dropdown option.</span>
      </aside>
    `;
  }

  function renderForms() {
    if (state.loading) {
      setListMessage("Loading Firestore forms...");
      return;
    }

    const rows = filteredForms().map(function (form) {
      const selectedClass = form.id === state.selectedId ? " selected" : "";
      const customClass = customFieldCount(form) ? " has-custom-fields" : "";
      return `
        <tr class="${selectedClass}${customClass}" data-id="${escapeHtml(form.id)}" tabindex="0">
          <td><strong>${escapeHtml(form.reportNo || form.id)}</strong>${renderCustomFieldBadge(form)}</td>
          <td>${escapeHtml(form.client)}</td>
          <td>${escapeHtml(form.project)}</td>
          <td>${escapeHtml(form.template)}</td>
          <td><span class="status-pill ${statusClass(form.status)}">${escapeHtml(form.status)}</span></td>
          <td>${escapeHtml(formatDashboardDate(form.updatedAt))}</td>
          <td>
            <div class="row-actions dropdown">
              <button type="button" class="action-dropdown-btn" data-action="toggle-dropdown" aria-haspopup="true" aria-expanded="false" data-id="${escapeHtml(form.id)}">Actions ▼</button>
              <div class="dropdown-menu">
                <button type="button" data-action="view" data-id="${escapeHtml(form.id)}">View</button>
                <button type="button" data-action="edit" data-id="${escapeHtml(form.id)}">Edit</button>
                <button type="button" data-action="print" data-id="${escapeHtml(form.id)}">Print</button>
                <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(form.id)}">Delete</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    elements.formList.innerHTML = rows || `<tr><td colspan="7">No Firestore forms match the current filters.</td></tr>`;
  }

  function renderBarcodePreview(value) {
    const barcode = window.CubeSyncBarcode;

    if (!value || !barcode) {
      return "";
    }

    try {
      return barcode.renderBarcodeSvg(value, {
        height: 46,
        moduleWidth: 1.1,
        quietZoneModules: 6,
        includeText: true
      });
    } catch (error) {
      return `<span class="barcode-error">${escapeHtml(error.message)}</span>`;
    }
  }

  function renderBarcodeList(form) {
    const values = barcodeValues(form);

    if (!values.length) {
      return "";
    }

    const items = values.map((value) => `
      <li>
        <code>${escapeHtml(value)}</code>
        <div class="dashboard-barcode-preview">${renderBarcodePreview(value)}</div>
      </li>
    `).join("");

    return `
      <section class="dashboard-barcodes" aria-label="Barcodes">
        <h3>Barcodes</h3>
        <ul>${items}</ul>
      </section>
    `;
  }

  function renderCustomDetailFields(raw, helper) {
    if (!helper || typeof helper.getCustomRequestFields !== "function") {
      return "";
    }

    const config = state.fieldConfig || helper.defaultFormFieldConfig();
    const extraFields = raw.extraFields && typeof raw.extraFields === "object" ? raw.extraFields : {};

    return helper.getCustomRequestFields(config).map(function (def) {
      const value = extraFields[def.id];
      if (value == null || value === "") {
        return "";
      }

      const rawDisplayValue = helper.formatCustomFieldDisplayValue
        ? helper.formatCustomFieldDisplayValue(def, value)
        : String(value);
      const displayValue = def.type === "date" ? formatDashboardDate(rawDisplayValue) : rawDisplayValue;

      return `<div class="detail-field"><dt>${escapeHtml(def.label)}</dt><dd>${escapeHtml(displayValue)}</dd></div>`;
    }).join("");
  }

  function viewForm(id) {
    clearSurfaceStatus(elements.detailStatus);
    state.selectedId = id;
    const form = selectedForm();

    if (!form) {
      elements.detailTitle.textContent = "No form selected";
      elements.detailContent.innerHTML = "<p>Select a form from the dashboard to view its request details and barcode labels.</p>";
      setDetailButtons(false);
      setDetailPanelVisible(false);
      renderForms();
      return;
    }

    elements.detailTitle.textContent = form.reportNo || form.id;
    const helper = formDataHelper();
    const flaggedFields = customFields(form);
    const renderField = (label, value, formFieldKey) => {
      if (value == null || value === "") return '';
      const isCustom = helper && typeof helper.isDropdownFreeTextField === "function"
        ? helper.isDropdownFreeTextField(flaggedFields, formFieldKey)
        : flaggedFields.includes(formFieldKey);
      const displayText = formFieldKey === "dateOfCast" ? formatDashboardDate(value) : value;
      const displayValue = isCustom ? `<span class="highlight-custom" title="Custom free text entry">${escapeHtml(displayText)}</span>` : escapeHtml(displayText);
      return `<div class="detail-field${isCustom ? " is-custom-field" : ""}"><dt>${escapeHtml(label)}</dt><dd>${displayValue}</dd></div>`;
    };

    elements.detailContent.innerHTML = `
      ${renderCustomFieldLegend(form)}
      <dl class="detail-list">
        ${renderField("Project (ERP)", form.projectErp, "projectErp")}
        ${renderField("Customer (Billing)", form.customerBilling, "customerBilling")}
        ${renderField("Project Name on Report", form.projectNameReport, "projectNameReport")}
        ${renderField("Client Name on Report", form.clientReport, "clientReport")}
        ${renderField("Contact", form.contactPerson, "contact")}
        ${renderField("Manual Job", form.enableManualCubeJob, "enableManualCubeJob")}
        ${renderField("Cube Job #", form.cubeJob, "cubeJob")}
        ${renderField("Quote", form.quote, "quote")}
        ${renderField("Test Item", form.testItem, "testItem")}
        ${renderField("Supplier of concrete", form.supplier, "supplier")}
        ${renderField("Supplier display", form.supplierDisplay, "supplierDisplay")}
        ${renderField("Location", form.location, "locationRepresented")}
        ${renderField("Additional Info", form.notes, "additionalInformation")}
        ${renderField("Date of Cast", form.dateOfCast, "dateOfCast")}
        ${renderField("Grade", form.grade, "concreteGrade")}
        ${renderField("Grade (Free text)", form.gradeFreeText, "gradeFreeText")}
        ${renderField("Size", form.specimenSize, "specimenSize")}
        ${renderField("Mean Slump", form.slumpMeasured, "slumpMeasured")}
        ${renderField("Specified Slump", form.slumpSpecified, "slumpSpecified")}
        ${renderField("Person in Charge", form.personInCharge, "personInCharge")}
        ${renderField("Manager in Charge", form.managerInCharge, "managerInCharge")}
        ${renderCustomDetailFields(form.raw || {}, formDataHelper())}
      </dl>
      ${renderBarcodeList(form)}
    `;
    setDetailButtons(true);
    setDetailPanelVisible(true);
    renderForms();
  }

  async function loadForms() {
    const store = formStore();
    const helper = formDataHelper();

    if (!store || !helper) {
      state.forms = [];
      renderForms();
      setSurfaceStatus(elements.detailStatus, "Dashboard services are unavailable.", "error");
      elements.detailContent.innerHTML = "<p>Firestore is not available yet. Check the Firebase SDK scripts and network access.</p>";
      return;
    }

    state.loading = true;
    renderForms();

    try {
      const records = await store.listCubeRequests();
      state.forms = records.map((record) => {
        const form = helper.normalizeCubeRequestForDashboard(record, record.id);

        // Flag dropdown fields by comparing the stored value against the known
        // option list (value-based). Capture-time `customFields` metadata is
        // only used as a fallback when an option list is unavailable.
        if (typeof helper.resolveFreeTextDropdownFields === "function") {
          form.customFields = helper.resolveFreeTextDropdownFields(
            form.raw || record,
            state.dropdownOptions,
            form.customFields
          );
          form.customFieldCount = form.customFields.length;
        }

        return form;
      });
      state.loading = false;
      refreshFilterOptions();
      renderForms();

      if (state.selectedId && selectedForm()) {
        viewForm(state.selectedId);
      } else {
        viewForm(null);
      }

      if (state.pendingDetailStatus) {
        setSurfaceStatus(elements.detailStatus, state.pendingDetailStatus.message, state.pendingDetailStatus.tone);
        state.pendingDetailStatus = null;
      }
    } catch (error) {
      state.loading = false;
      state.forms = [];
      renderForms();
      setSurfaceStatus(elements.detailStatus, "Unable to load requests. Retry after the connection or Firestore access is restored.", "error");
      elements.detailTitle.textContent = "Firestore error";
      elements.detailContent.innerHTML = `<p>${escapeHtml(error.message || "Unable to load forms from Firestore.")}</p>`;
      setDetailButtons(false);
    }
  }

  function setDashboardLocked(locked) {
    elements.authGate.classList.toggle("is-hidden", !locked);
    elements.dashboardShell.classList.toggle("is-hidden", locked);
  }

  function cacheFieldConfig(config) {
    const helper = formDataHelper();
    if (!helper || !config) return;

    try {
      localStorage.setItem(helper.FORM_FIELD_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage failures in private browsing.
    }
  }

  function renderFieldConfigEditor(config) {
    const helper = formDataHelper();
    if (!helper || !elements.fieldConfigGroups) return;

    const normalized = helper.normalizeFormFieldConfig(config);

    function renderItem(prefix, field, label, enabled, customLabel) {
      const checked = enabled ? "checked" : "";
      const value = customLabel ? escapeHtml(customLabel) : "";
      const safeLabel = escapeHtml(label);
      return `
        <div class="field-config-item">
          <label class="field-config-toggle">
            <input type="checkbox" name="${prefix}-${field}" ${checked}>
            <span>${safeLabel}</span>
          </label>
          <input type="text" class="field-config-rename" name="${prefix}-label-${field}"
            value="${value}" placeholder="${safeLabel}"
            aria-label="Custom label shown on forms for ${safeLabel}">
        </div>
      `;
    }

    const requestItems = helper.FORM_FIELDS.map(function (field) {
      const label = helper.REQUEST_FIELD_LABELS[field] || field;
      return renderItem("request", field, label, normalized.requestFields[field] !== false, normalized.requestLabels[field]);
    }).join("");

    const resultItems = helper.RESULT_FIELDS.map(function (field) {
      const label = helper.RESULT_FIELD_LABELS[field] || field;
      return renderItem("result", field, label, normalized.resultFields[field] !== false, normalized.resultLabels[field]);
    }).join("");

    const customFieldRows = normalized.customRequestFields.map(function (def, index) {
      return renderCustomFieldEditorRow(def, index, helper);
    }).join("");

    const showResultsSectionChecked = normalized.showResultsSection !== false ? "checked" : "";

    elements.fieldConfigGroups.innerHTML = `
      <section class="field-config-group" aria-labelledby="requestFieldConfigTitle">
        <h3 id="requestFieldConfigTitle">Request details</h3>
        <div class="field-config-list">${requestItems}</div>
      </section>
      <section class="field-config-group" aria-labelledby="resultFieldConfigTitle">
        <h3 id="resultFieldConfigTitle">Test results columns</h3>
        <div class="field-config-item">
          <label class="field-config-toggle">
            <input type="checkbox" name="showResultsSection" ${showResultsSectionChecked}>
            <span>Show test results section on public forms</span>
          </label>
        </div>
        <div class="field-config-list">${resultItems}</div>
      </section>
      <section class="field-config-group field-config-group-full" aria-labelledby="customFieldConfigTitle">
        <div class="field-config-group-header">
          <h3 id="customFieldConfigTitle">Custom request fields</h3>
          <button type="button" id="addCustomFieldButton" class="field-config-add-button">Add custom field</button>
        </div>
        <p class="field-config-section-note">Custom fields appear on both public forms. Use a unique key such as <code>siteRef</code>.</p>
        <div class="custom-field-editor-list">${customFieldRows}</div>
      </section>
    `;

    bindCustomFieldEditorActions();
  }

  function renderCustomFieldEditorRow(def, index, helper) {
    const types = helper.CUSTOM_FIELD_TYPES || ["text", "number", "date", "checkbox", "textarea"];
    const typeOptions = types.map(function (type) {
      const selected = (def.type || "text") === type ? "selected" : "";
      return `<option value="${type}" ${selected}>${type}</option>`;
    }).join("");
    const requiredChecked = def.required ? "checked" : "";
    const enabledChecked = def.enabled !== false ? "checked" : "";

    return `
      <div class="custom-field-editor">
        <input type="text" name="custom-field-id-${index}" value="${escapeHtml(def.id || "")}" placeholder="Key (e.g. siteRef)" aria-label="Custom field key">
        <input type="text" name="custom-field-label-${index}" value="${escapeHtml(def.label || "")}" placeholder="Dashboard label" aria-label="Custom field dashboard label">
        <select name="custom-field-type-${index}" aria-label="Custom field type">${typeOptions}</select>
        <label class="custom-field-flag"><input type="checkbox" name="custom-field-required-${index}" ${requiredChecked}> Required</label>
        <label class="custom-field-flag"><input type="checkbox" name="custom-field-enabled-${index}" ${enabledChecked}> Enabled</label>
        <input type="text" name="custom-field-form-label-${index}" value="${escapeHtml(def.formLabel || "")}" placeholder="Form label override" aria-label="Custom field form label override">
        <button type="button" class="custom-field-remove">Delete</button>
      </div>
    `;
  }

  function bindCustomFieldEditorActions() {
    if (!elements.fieldConfigGroups) return;

    elements.addCustomFieldButton = document.getElementById("addCustomFieldButton");
    if (elements.addCustomFieldButton) {
      elements.addCustomFieldButton.onclick = addCustomFieldEditorRow;
    }

    elements.fieldConfigGroups.querySelectorAll(".custom-field-remove").forEach(function (button) {
      button.addEventListener("click", function () {
        const row = button.closest(".custom-field-editor");
        if (row) row.remove();
      });
    });
  }

  function addCustomFieldEditorRow() {
    const helper = formDataHelper();
    const list = elements.fieldConfigGroups && elements.fieldConfigGroups.querySelector(".custom-field-editor-list");
    if (!helper || !list) return;

    const index = list.querySelectorAll(".custom-field-editor").length;
    list.insertAdjacentHTML("beforeend", renderCustomFieldEditorRow({}, index, helper));

    const newRow = list.lastElementChild;
    if (!newRow) return;

    const removeButton = newRow.querySelector(".custom-field-remove");
    if (removeButton) {
      removeButton.addEventListener("click", function () {
        newRow.remove();
      });
    }
  }

  async function loadFieldConfig() {
    const store = formStore();
    const helper = formDataHelper();
    if (!helper) return;

    let config = null;

    if (store && typeof store.getFormFieldConfig === "function") {
      try {
        config = await store.getFormFieldConfig();
        clearSurfaceStatus(elements.fieldConfigStatus);
      } catch {
        setSurfaceStatus(
          elements.topbarStatus,
          "Field settings could not be loaded. Using cached or default settings for now.",
          "warning"
        );
        setSurfaceStatus(
          elements.fieldConfigStatus,
          "Field settings could not be loaded. You can keep working with cached or default settings, but changes should wait until the service recovers.",
          "warning"
        );
      }
    }

    state.fieldConfig = helper.normalizeFormFieldConfig(config);
    cacheFieldConfig(state.fieldConfig);
    renderFieldConfigEditor(state.fieldConfig);
  }

  function openFieldConfigDialog() {
    if (!elements.fieldConfigStatus.hidden && elements.fieldConfigStatus.getAttribute("data-tone") === "success") {
      clearSurfaceStatus(elements.fieldConfigStatus);
    }
    renderFieldConfigEditor(state.fieldConfig);
    elements.fieldConfigDialog.showModal();
  }

  function resetFieldConfigEditor() {
    const helper = formDataHelper();
    if (!helper) return;
    renderFieldConfigEditor(helper.defaultFormFieldConfig());
  }

  async function saveFieldConfig(event) {
    event.preventDefault();

    const store = formStore();
    const helper = formDataHelper();
    if (!store || !helper) return;

    const config = helper.readFormFieldConfigFromEditor(elements.fieldConfigForm);
    const submitButton = elements.fieldConfigForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setSurfaceStatus(elements.fieldConfigStatus, "Saving field settings...", "info");

    try {
      await store.saveFormFieldConfig(config);
      state.fieldConfig = helper.normalizeFormFieldConfig(config);
      cacheFieldConfig(state.fieldConfig);
      clearSurfaceStatus(elements.topbarStatus);
      setSurfaceStatus(elements.fieldConfigStatus, "Field settings saved.", "success");
      elements.fieldConfigDialog.close();
    } catch (error) {
      const detail = classifyActionError(error, "Unable to save form field settings.");
      setSurfaceStatus(elements.fieldConfigStatus, detail.message, detail.tone);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  const DROPDOWN_OPTION_FIELD_LABELS = {
    projectErp: "Project (ERP)",
    customerBilling: "Customer (Billing)",
    supplier: "Supplier of concrete",
    concreteGrade: "Concrete Grade",
    personInCharge: "Person In Charge",
    managerInCharge: "Manager In Charge",
    testItem: "Test Item",
    specimenSize: "Size"
  };

  function renderOptionsManager(shared) {
    if (!elements.optionsGroups) return;
    elements.optionsGroups.innerHTML = Object.keys(DROPDOWN_OPTION_FIELD_LABELS).map((field) => {
      const values = Array.isArray(shared[field]) ? shared[field] : [];
      return `
        <label class="options-group">
          <span>${escapeHtml(DROPDOWN_OPTION_FIELD_LABELS[field])}</span>
          <textarea name="${escapeHtml(field)}" rows="5" placeholder="One value per line">${escapeHtml(values.join("\n"))}</textarea>
        </label>
      `;
    }).join("");
  }

  async function openOptionsManager() {
    const store = formStore();
    if (!store || typeof store.getDropdownOptions !== "function" || !elements.optionsDialog) {
      return;
    }

    clearSurfaceStatus(elements.optionsStatus);
    let shared = {};
    try {
      shared = (await store.getDropdownOptions()) || {};
    } catch {
      shared = {};
    }
    renderOptionsManager(shared);

    if (typeof elements.optionsDialog.showModal === "function") {
      try {
        elements.optionsDialog.showModal();
      } catch {
        // jsdom / unsupported environments: dialog still rendered in the DOM.
      }
    }
  }

  async function saveOptionsManager(event) {
    event.preventDefault();
    const store = formStore();
    if (!store || typeof store.saveDropdownOptions !== "function" || !elements.optionsForm) {
      return;
    }

    const map = {};
    Object.keys(DROPDOWN_OPTION_FIELD_LABELS).forEach((field) => {
      const control = elements.optionsForm.elements[field];
      if (!control) return;
      map[field] = String(control.value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    });

    const submitButton = elements.optionsForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setSurfaceStatus(elements.optionsStatus, "Saving suggestion lists...", "info");

    try {
      await store.saveDropdownOptions(map);
      if (elements.optionsDialog) elements.optionsDialog.close();
      await loadForms();
    } catch (error) {
      const detail = classifyActionError(error, "Unable to save the suggestion lists.");
      setSurfaceStatus(elements.optionsStatus, detail.message, detail.tone);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  function clearDashboard() {
    state.forms = [];
    state.selectedId = null;
    state.loading = false;
    state.fieldConfig = null;
    renderForms();
    viewForm(null);
  }

  function bindAuthGate() {
    const auth = authHelper();
    const authMessage = elements.authGate.querySelector("p:not(.eyebrow)");

    if (!auth) {
      setDashboardLocked(true);
      authMessage.textContent = "Firebase Auth is not available. Check the Firebase SDK script.";
      setSurfaceStatus(elements.authGateStatus, "Authentication services are unavailable.", "error");
      return;
    }

    elements.signInButton.addEventListener("click", async function () {
      setSurfaceStatus(elements.authGateStatus, "Starting Google sign-in...", "info");
      try {
        await auth.signInWithGoogle();
      } catch (error) {
        const detail = classifyActionError(error, "Unable to sign in with Google.");
        setSurfaceStatus(elements.authGateStatus, detail.message, detail.tone);
      }
    });

    elements.signOutButton.addEventListener("click", async function () {
      setSurfaceStatus(elements.topbarStatus, "Signing out...", "info");
      try {
        await auth.signOutUser();
      } catch (error) {
        const detail = classifyActionError(error, "Unable to sign out.");
        setSurfaceStatus(elements.topbarStatus, detail.message, detail.tone);
      }
    });

    auth.onAuthChange(function (user) {
      if (!user) {
        elements.authUser.textContent = "";
        authMessage.textContent = "Use your Google account to access Firestore-backed dashboards.";
        clearSurfaceStatus(elements.topbarStatus);
        setDashboardLocked(true);
        clearDashboard();
        return;
      }

      if (!auth.isAllowedUser(user)) {
        elements.authUser.textContent = "";
        authMessage.textContent = `${user.email || "This Google account"} is not allowed for CubeSync.`;
        setSurfaceStatus(elements.authGateStatus, "This account does not have dashboard access.", "warning");
        setDashboardLocked(true);
        clearDashboard();
        auth.signOutUser().catch(() => {});
        return;
      }

      elements.authUser.textContent = user.email || user.displayName || "Signed in";
      clearSurfaceStatus(elements.authGateStatus);
      setDashboardLocked(false);
      loadFieldConfig();
      loadDropdownOptionSets()
        .catch(() => {})
        .then(() => loadForms());
    });
  }

  let currentEditorStep = 1;

  function setEditorStep(step) {
    currentEditorStep = step;
    
    const indicator1 = document.getElementById("editStepIndicator1");
    const indicator2 = document.getElementById("editStepIndicator2");
    
    if (indicator1 && indicator2) {
      indicator1.classList.toggle("active", step === 1);
      indicator2.classList.toggle("active", step === 2);
      
      if (step === 2) {
        indicator2.removeAttribute("disabled");
      }
    }

    const step1 = document.getElementById("editFormStep1");
    const step2 = document.getElementById("editFormStep2");
    
    if (step1 && step2) {
      step1.classList.toggle("active", step === 1);
      step2.classList.toggle("active", step === 2);
    }

    const prevBtn = document.getElementById("editPrevStep");
    const nextBtn = document.getElementById("editNextStep");

    if (prevBtn && nextBtn) {
      if (step === 1) {
        prevBtn.classList.add("hidden");
        nextBtn.textContent = "Next: Test Results";
      } else {
        prevBtn.classList.remove("hidden");
        nextBtn.textContent = "Finish / Review";
      }
    }
  }

  function renderEditorBarcode(input) {
    const cell = input.closest(".barcode-cell");
    if (!cell) return;
    const preview = cell.querySelector(".barcode-preview");
    const message = cell.querySelector(".barcode-message");
    const barcode = window.CubeSyncBarcode;

    if (!preview || !message || !barcode) return;

    try {
      const svg = barcode.renderBarcodeSvg(input.value, {
        height: 64,
        moduleWidth: 1.45,
        quietZoneModules: 8,
        includeText: false
      });
      const hasBarcode = Boolean(svg);

      cell.classList.toggle("has-barcode", hasBarcode);
      cell.classList.remove("has-error");
      input.setAttribute("aria-invalid", "false");
      message.textContent = "";
      if (hasBarcode) {
        preview.innerHTML = svg;
      } else {
        preview.innerHTML = "";
      }
    } catch (error) {
      cell.classList.remove("has-barcode");
      cell.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      preview.innerHTML = '<span class="barcode-error">Invalid barcode text</span>';
      message.textContent = error.message;
    }
  }

  function renderAllEditorBarcodes() {
    const inputs = elements.editResultsBody.querySelectorAll("[data-barcode-input]");
    inputs.forEach(renderEditorBarcode);
  }

  function addEditResultRow() {
    if (window.CubeSyncTableManager) {
      window.CubeSyncTableManager.addResultRow(elements.editResultsBody, elements.editForm, renderEditorBarcode);
    }
  }

  function renumberEditRows() {
    if (window.CubeSyncTableManager) {
      window.CubeSyncTableManager.renumberRows(elements.editResultsBody);
    }
  }

  function applyEditorManualCubeJobState() {
    const manualCubeJobToggle = elements.editForm.elements["enableManualCubeJobNumber"];
    const cubeJobNumberInput = elements.editForm.elements["cubeJobNumber"];
    if (!manualCubeJobToggle || !cubeJobNumberInput) return;
    
    const enabled = manualCubeJobToggle.checked;
    cubeJobNumberInput.disabled = !enabled;
    cubeJobNumberInput.classList.toggle("is-disabled", !enabled);
    if (enabled) {
      cubeJobNumberInput.removeAttribute("readonly");
    } else {
      cubeJobNumberInput.value = "";
    }
  }



  function openEditor(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;
    clearSurfaceStatus(elements.editFormStatus);
    const raw = form.raw || {};
    const existingCustomFields = new Set(customFields(form));

    elements.editResultsBody.innerHTML = "";

    elements.editForm.elements.id.value = form.id;

    const helper = formDataHelper();
    if (helper && helper.FORM_FIELDS) {
      helper.FORM_FIELDS.forEach((field) => {
        const control = elements.editForm.elements[field];
        if (control) {
          if (control.type === "checkbox") {
            control.checked = Boolean(helper.getCubeRequestFormValue(raw, field));
          } else {
            control.value = helper.getCubeRequestFormValue(raw, field);
          }
        }
      });
    }

    const legacyFields = {
      internalDate: raw.internalDate || raw.dateOfCast || "",
      projectCode: raw.projectCode || raw.projectErp || "",
      method: raw.method || raw.testItem || "",
      dateTimeSampled: raw.dateTimeSampled || raw.dateOfCast || "",
      client: form.client || raw.client || raw.customerBilling || "",
      project: form.project || raw.project || raw.projectNameOnReport || "",
      grade: form.grade || raw.concreteGrade || raw.reportGrade || "",
      location: form.location || raw.locationRepresented || raw.location || "",
      notes: form.notes || raw.additionalInformation || raw.notes || "",
      reportNo: form.reportNo || raw.cubeJobNumber || ""
    };
    Object.keys(legacyFields).forEach((field) => {
      const control = elements.editForm.elements[field];
      if (control) {
        control.value = legacyFields[field];
      }
    });

    if (helper && typeof helper.applyFreeTextFlags === "function") {
      helper.applyFreeTextFlags(elements.editForm, customFields(form));
    } else {
      existingCustomFields.forEach((field) => {
        const control = elements.editForm.elements[field];
        if (control && control.dataset && String(control.value || "").trim()) {
          control.dataset.freeTextEntry = "true";
        }
      });
    }

    if (helper && typeof helper.applyCustomRequestFields === "function") {
      helper.applyCustomRequestFields(elements.editForm, state.fieldConfig, raw.extraFields || {});
    }

    if (elements.editForm.elements.status) {
      elements.editForm.elements.status.value = form.status || "Draft";
    }
    if (elements.editForm.elements.template) {
      elements.editForm.elements.template.value = form.template || "Original";
    }

    const results = raw.results || [];
    results.forEach((result, index) => {
      addEditResultRow();
      const rowNum = index + 1;
      if (helper && helper.RESULT_FIELDS) {
        helper.RESULT_FIELDS.forEach((field) => {
          const control = elements.editForm.elements[`${field}${rowNum}`];
          if (control) {
            control.value = result[field] == null ? "" : result[field];
          }
        });
      }
    });

    renumberEditRows();
    renderAllEditorBarcodes();
    setEditorStep(1);
    applyEditorManualCubeJobState();

    elements.editDialog.showModal();
  }

  async function promoteFlaggedDropdownValues(store, helper, payload, existing) {
    if (!store || typeof store.addDropdownOptions !== "function" ||
        !helper || typeof helper.collectFlaggedDropdownValues !== "function") {
      return;
    }

    try {
      const metadata = (payload && payload.customFields) ||
        (existing && existing.customFields) || [];
      const values = helper.collectFlaggedDropdownValues(payload, state.dropdownOptions, metadata);
      if (values && Object.keys(values).length) {
        await store.addDropdownOptions(values);
      }
    } catch (error) {
      // Promotion is best-effort and must never block saving the form.
      console.warn("CubeSync: could not promote dropdown options", error);
    }
  }

  async function saveEditedForm(event) {
    event.preventDefault();

    const store = formStore();
    const helper = formDataHelper();
    if (!store || !helper) return;

    const id = elements.editForm.elements.id.value;
    if (!id) return;

    const submitButton = elements.editForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setSurfaceStatus(elements.editFormStatus, "Saving changes...", "info");

    try {
      // Sync legacy hidden fields from standard visible fields before serializing
      const syncLegacy = (legacyName, standardName) => {
        const legacyControl = elements.editForm.elements[legacyName];
        const standardControl = elements.editForm.elements[standardName];
        if (legacyControl && standardControl) {
          if (standardControl.type === "checkbox") {
            legacyControl.value = standardControl.checked ? "true" : "";
          } else {
            legacyControl.value = standardControl.value;
          }
        }
      };

      syncLegacy("internalDate", "dateOfCast");
      syncLegacy("projectCode", "projectErp");
      syncLegacy("method", "testItem");
      syncLegacy("dateTimeSampled", "dateOfCast");
      syncLegacy("client", "customerBilling");
      syncLegacy("project", "projectNameOnReport");
      syncLegacy("grade", "reportGrade");
      syncLegacy("location", "locationRepresented");
      syncLegacy("notes", "additionalInformation");
      syncLegacy("reportNo", "cubeJobNumber");

      const formData = new FormData(elements.editForm);
      const payload = {
        ...helper.buildCubeRequestFromForm(elements.editForm),
        ...helper.dashboardEditToCubeRequest(formData)
      };

      if (elements.editForm.elements.status) {
        payload.status = elements.editForm.elements.status.value;
      }
      if (elements.editForm.elements.template) {
        payload.template = elements.editForm.elements.template.value;
      }

      const existing = (state.forms.find((item) => item.id === id) || {}).raw || {};
      const patch = typeof helper.buildCubeRequestUpdatePatch === "function"
        ? helper.buildCubeRequestUpdatePatch(existing, payload)
        : payload;

      if (!Object.keys(patch).length) {
        elements.editDialog.close();
        return;
      }

      await store.updateCubeRequest(id, patch);

      // Promote flagged free-text values to the shared option lists when a form
      // is set to Ready, so the value becomes a suggestion for everyone. Refresh
      // the option sets afterward so the reload below treats the promoted value
      // as canonical and stops flagging it.
      if (payload.status === "Ready") {
        await promoteFlaggedDropdownValues(store, helper, payload, existing);
        await loadDropdownOptionSets();
      }

      queueDetailStatus("Changes saved.", "success");
      elements.editDialog.close();
      state.selectedId = id;
      await loadForms();
    } catch (error) {
      console.error("CubeSync dashboard save failed", error);
      const detail = classifyActionError(error, "Unable to save changes to Firestore.");
      setSurfaceStatus(elements.editFormStatus, detail.message, detail.tone);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function deleteForm(id) {
    const store = formStore();
    const form = state.forms.find((item) => item.id === id);
    if (!store || !form) return;

    if (!window.confirm(`Delete ${form.reportNo || form.id} from Firestore?`)) {
      return;
    }

    try {
      await store.deleteCubeRequest(id);
      queueDetailStatus(`${form.reportNo || form.id} deleted.`, "success");
      if (state.selectedId === id) state.selectedId = null;
      await loadForms();
    } catch (error) {
      const detail = classifyActionError(error, "Unable to delete this Firestore form.");
      setSurfaceStatus(elements.detailStatus, detail.message, detail.tone);
    }
  }

  function printForm(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    const url = form.template === "Glassmorphic" ? "glassmorphic.html" : "index.html";
    window.open(`${url}?id=${encodeURIComponent(id)}&print=true`, "_blank");
  }

  function handleListClick(event) {
    const actionButton = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-id]");
    if (!row) return;

    const id = actionButton ? actionButton.dataset.id : row.dataset.id;

    if (!actionButton) {
      viewForm(id);
      return;
    }

    event.stopPropagation();
    const action = actionButton.dataset.action;

    if (action === "toggle-dropdown") {
      const dropdownMenu = actionButton.nextElementSibling;
      const isActive = dropdownMenu.classList.contains("active");

      // Close all other dropdowns
      document.querySelectorAll('#formList .dropdown-menu.active').forEach(menu => {
        menu.classList.remove('active');
        const toggleBtn = menu.previousElementSibling;
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      });

      if (!isActive) {
        dropdownMenu.classList.add("active");
        actionButton.setAttribute("aria-expanded", "true");
      }
      return;
    }

    // Close any open dropdowns when clicking an action
    document.querySelectorAll('#formList .dropdown-menu.active').forEach(menu => {
      menu.classList.remove('active');
      const toggleBtn = menu.previousElementSibling;
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    });

    if (action === "view") {
      viewForm(id);
      openEditor(id);
    }
    if (action === "edit") openEditor(id);
    if (action === "print") printForm(id);
    if (action === "delete") deleteForm(id);
  }

  function handleListKeydown(event) {
    if (event.key !== "Enter") return;
    const row = event.target.closest("tr[data-id]");
    if (row) viewForm(row.dataset.id);
  }

  function bindElements() {
    [
      "authGate", "dashboardShell", "signInButton", "signOutButton", "authUser",
      "authGateStatus", "topbarStatus", "formList", "detailPanel", "detailContent", "detailTitle", "detailStatus", "searchInput",
      "statusFilter", "clientFilter", "projectFilter", "sortOrder",
      "todayToggle", "todayOnlyToggle",
      "editDialog", "editForm", "editFormStatus", "closeEditorButton", "cancelEditButton",
      "detailViewButton", "detailEditButton", "detailPrintButton", "detailDeleteButton", "detailHideButton",
      "printArea", "fieldSettingsButton", "fieldConfigDialog", "fieldConfigForm",
      "manageOptionsButton", "optionsDialog", "optionsForm", "optionsGroups", "optionsStatus",
      "closeOptionsButton", "cancelOptionsButton",
      "fieldConfigStatus", "fieldConfigGroups", "closeFieldConfigButton", "cancelFieldConfigButton",
      "resetFieldConfigButton", "addCustomFieldButton",
      "menuToggle", "dropdownMenu", "editAddRowButton", "editResultsBody", 
      "editPrevStep", "editNextStep", "editStepIndicator1", "editStepIndicator2"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function bindThemeToggle() {
    const themeToggle = document.getElementById("themeToggle");
    const themeSwitchParts = document.querySelectorAll(
      ".theme-switch-face, .theme-switch-mouth, .theme-switch-eye, .theme-switch-tongue"
    );

    function applyTheme(theme) {
      const isLight = theme === "light";
      document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
      localStorage.setItem("theme", isLight ? "light" : "dark");
      if (themeToggle) {
        themeToggle.checked = isLight;
      }
      themeSwitchParts.forEach(function (element) {
        element.classList.toggle("happy", isLight);
      });
    }

    applyTheme(localStorage.getItem("theme") || "light");

    if (themeToggle) {
      themeToggle.addEventListener("change", function () {
        applyTheme(themeToggle.checked ? "light" : "dark");
      });
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    if (initialized) {
      return;
    }

    initialized = true;
    bindElements();
    renderForms();

    elements.formList.addEventListener("click", handleListClick);
    elements.formList.addEventListener("keydown", handleListKeydown);
    elements.searchInput.addEventListener("input", function () {
      state.search = elements.searchInput.value;
      renderForms();
    });
    elements.statusFilter.addEventListener("change", function () {
      state.status = elements.statusFilter.value;
      renderForms();
    });
    if (elements.clientFilter) {
      elements.clientFilter.addEventListener("change", function () {
        state.client = elements.clientFilter.value;
        renderForms();
      });
    }
    if (elements.projectFilter) {
      elements.projectFilter.addEventListener("change", function () {
        state.project = elements.projectFilter.value;
        renderForms();
      });
    }
    if (elements.sortOrder) {
      elements.sortOrder.addEventListener("change", function () {
        state.sort = elements.sortOrder.value;
        renderForms();
      });
    }
    if (elements.todayOnlyToggle) {
      elements.todayOnlyToggle.addEventListener("change", function () {
        state.todayOnly = elements.todayOnlyToggle.checked;
        renderForms();
      });
    }
    if (elements.todayToggle && window.CubeSyncTodayToggle &&
        typeof window.CubeSyncTodayToggle.setup === "function") {
      window.CubeSyncTodayToggle.setup(elements.todayToggle);
    }

    elements.detailViewButton.addEventListener("click", () => openEditor(state.selectedId));
    elements.detailEditButton.addEventListener("click", () => openEditor(state.selectedId));
    elements.detailPrintButton.addEventListener("click", () => printForm(state.selectedId));
    elements.detailDeleteButton.addEventListener("click", () => deleteForm(state.selectedId));
    if (elements.detailHideButton) {
      elements.detailHideButton.addEventListener("click", () => viewForm(null));
    }

    elements.editForm.addEventListener("submit", saveEditedForm);
    elements.closeEditorButton.addEventListener("click", () => elements.editDialog.close());
    elements.cancelEditButton.addEventListener("click", () => elements.editDialog.close());

    if (elements.editAddRowButton) {
      elements.editAddRowButton.addEventListener("click", addEditResultRow);
    }
    if (elements.editPrevStep) {
      elements.editPrevStep.addEventListener("click", () => {
        if (currentEditorStep > 1) setEditorStep(currentEditorStep - 1);
      });
    }
    if (elements.editNextStep) {
      elements.editNextStep.addEventListener("click", () => {
        if (currentEditorStep === 1) {
          setEditorStep(2);
        } else {
          elements.editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
        }
      });
    }
    if (elements.editStepIndicator1) {
      elements.editStepIndicator1.addEventListener("click", () => setEditorStep(1));
    }
    if (elements.editStepIndicator2) {
      elements.editStepIndicator2.addEventListener("click", () => setEditorStep(2));
    }

    const manualCubeJobToggle = elements.editForm.elements["enableManualCubeJobNumber"];
    if (manualCubeJobToggle) {
      manualCubeJobToggle.addEventListener("change", applyEditorManualCubeJobState);
    }

    const setupAutocomplete = window.CubeSyncAutocomplete ? window.CubeSyncAutocomplete.setupAutocomplete : function(){};
    setupAutocomplete('projectErp', 'dropdown-options/project erp.txt', 'savedProjectErps');
    setupAutocomplete('customerBilling', 'dropdown-options/customer billing.txt', 'savedCustomerBillings');
    setupAutocomplete('supplier', 'dropdown-options/supplier.txt', 'savedSuppliers');
    setupAutocomplete('concreteGrade', 'dropdown-options/Grade.txt', 'savedGrades');
    setupAutocomplete('personInCharge', 'dropdown-options/person-in-charge.txt', 'savedPersonsInCharge');
    setupAutocomplete('managerInCharge', 'dropdown-options/manager-in-charge.txt', 'savedManagersInCharge');
    setupAutocomplete('testItem', 'dropdown-options/testitem.txt', 'savedTestItems');
    setupAutocomplete('specimenSize', 'dropdown-options/size.txt', 'savedSizes');

    if (elements.fieldSettingsButton) {
      elements.fieldSettingsButton.addEventListener("click", openFieldConfigDialog);
    }
    if (elements.fieldConfigForm) {
      elements.fieldConfigForm.addEventListener("submit", saveFieldConfig);
    }
    if (elements.closeFieldConfigButton) {
      elements.closeFieldConfigButton.addEventListener("click", () => elements.fieldConfigDialog.close());
    }
    if (elements.cancelFieldConfigButton) {
      elements.cancelFieldConfigButton.addEventListener("click", () => elements.fieldConfigDialog.close());
    }
    if (elements.resetFieldConfigButton) {
      elements.resetFieldConfigButton.addEventListener("click", resetFieldConfigEditor);
    }

    if (elements.manageOptionsButton) {
      elements.manageOptionsButton.addEventListener("click", openOptionsManager);
    }
    if (elements.optionsForm) {
      elements.optionsForm.addEventListener("submit", saveOptionsManager);
    }
    if (elements.closeOptionsButton) {
      elements.closeOptionsButton.addEventListener("click", () => elements.optionsDialog.close());
    }
    if (elements.cancelOptionsButton) {
      elements.cancelOptionsButton.addEventListener("click", () => elements.optionsDialog.close());
    }

    if (elements.menuToggle && elements.dropdownMenu) {
      elements.menuToggle.addEventListener("click", function (event) {
        event.stopPropagation();
        const expanded = elements.menuToggle.getAttribute("aria-expanded") === "true";
        elements.menuToggle.setAttribute("aria-expanded", !expanded);
        elements.dropdownMenu.classList.toggle("active");
      });

      document.addEventListener("click", function (event) {
        if (!elements.dropdownMenu.contains(event.target) && event.target !== elements.menuToggle) {
          elements.menuToggle.setAttribute("aria-expanded", "false");
          elements.dropdownMenu.classList.remove("active");
        }

        // Close row actions dropdowns if clicked outside
        if (!event.target.closest('.row-actions.dropdown')) {
          document.querySelectorAll('#formList .dropdown-menu.active').forEach(menu => {
            menu.classList.remove('active');
            const toggleBtn = menu.previousElementSibling;
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
          });
        }
      });
    }

    bindThemeToggle();
    bindAuthGate();
  });
})();
