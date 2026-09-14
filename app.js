(function () {
  "use strict";

  function logClientObs(context) {
    const obs = window.CubeSyncObservability || (window.CubeSyncFormData && window.CubeSyncFormData.Observability);
    if (obs && typeof obs.logClientEvent === "function") {
      obs.logClientEvent(context);
    }
  }

  function formatClientUserError(error, fallback) {
    const obs = window.CubeSyncObservability || (window.CubeSyncFormData && window.CubeSyncFormData.Observability);
    if (obs && typeof obs.formatClientError === "function") {
      return obs.formatClientError(error, fallback);
    }
    return error ? error.message || fallback : fallback;
  }

  function renderBarcode(input) {
    const cell = input.closest(".barcode-cell");
    const preview = cell.querySelector(".barcode-preview");
    const message = cell.querySelector(".barcode-message");
    const barcode = window.CubeSyncBarcode;

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
      logClientObs({
        feature: "Barcode",
        functionName: "renderBarcode",
        operation: "renderSvg",
        status: "warning",
        category: "ValidationFailure",
        error: error
      });
      cell.classList.remove("has-barcode");
      cell.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      preview.innerHTML = '<span class="barcode-error">Invalid barcode text</span>';
      message.textContent = error.message;
    }
  }

  function renderAll(inputs) {
    inputs.forEach(renderBarcode);
  }

  function getBarcodeInputs() {
    return Array.from(document.querySelectorAll("[data-barcode-input]"));
  }

  function seedInitialResultRows() {
    const tableBody = document.querySelector(".results-table tbody");
    const markup = window.CubeSyncFormMarkup;
    if (!tableBody || !markup || typeof markup.seedResultRows !== "function") {
      return;
    }

    const initialRows = parseInt(tableBody.dataset.initialResultRows || "0", 10);
    if (initialRows > 0 && tableBody.children.length === 0) {
      markup.seedResultRows(tableBody, initialRows);
    }
  }

  function setSaveStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  // Toggle a button's busy/throbber state so users get feedback while an
  // async request (e.g. a slow submission API) is in flight.
  function setButtonBusy(button, isBusy) {
    if (!button) return;
    button.disabled = Boolean(isBusy);
    button.classList.toggle("is-busy", Boolean(isBusy));
    button.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function focusFirstMissingRequestField(form, missingFieldKeys, navigateToStep) {
    if (!form || !Array.isArray(missingFieldKeys)) return;

    for (const field of missingFieldKeys) {
      const control = form.elements[field];
      if (!control) continue;

      if (typeof navigateToStep === "function") {
        const step = control.closest(".form-step");
        if (step && step.dataset.step) {
          navigateToStep(parseInt(step.dataset.step, 10));
        }
      }

      if (typeof control.focus === "function") {
        control.focus();
        break;
      }
    }
  }

  function validateRequestDetails(form, formData, statusElement, config, navigateToStep) {
    const validation = formData.validateCubeRequestForm(form, config);
    if (validation.valid) {
      return true;
    }

    logClientObs({
      feature: "FormSubmission",
      functionName: "validateRequestDetails",
      operation: "validateCubeRequestForm",
      status: "warning",
      category: "ValidationFailure",
      metadata: {
        missingFieldCount: Array.isArray(validation.missingFieldKeys) ? validation.missingFieldKeys.length : 0
      }
    });
    setSaveStatus(statusElement, validation.message, true);
    focusFirstMissingRequestField(form, validation.missingFieldKeys, navigateToStep);
    return false;
  }

  function recaptchaSiteKey() {
    const env = window.CubeSyncEnv || {};
    return String(env.RECAPTCHA_SITE_KEY || "").trim();
  }

  function renderRecaptcha(container, statusElement, attempt) {
    if (!container || container.dataset.widgetId) return;

    const siteKey = recaptchaSiteKey();
    if (!siteKey) {
      setSaveStatus(statusElement, "reCAPTCHA site key is not configured", true);
      return;
    }

    if (!window.grecaptcha || typeof window.grecaptcha.render !== "function") {
      if ((attempt || 0) < 20) {
        window.setTimeout(function () {
          renderRecaptcha(container, statusElement, (attempt || 0) + 1);
        }, 250);
      }
      return;
    }

    const widgetId = window.grecaptcha.render(container, {
      sitekey: siteKey
    });
    container.dataset.widgetId = String(widgetId);
  }

  function recaptchaToken(container) {
    if (!container) return "";

    const widgetId = container.dataset.widgetId;
    if (!widgetId || !window.grecaptcha || typeof window.grecaptcha.getResponse !== "function") {
      throw new Error("reCAPTCHA is still loading. Try again in a moment.");
    }

    const token = window.grecaptcha.getResponse(Number(widgetId));
    if (!token) {
      throw new Error("Complete the reCAPTCHA before saving.");
    }

    return token;
  }

  function resetRecaptcha(container) {
    if (!container || !container.dataset.widgetId || !window.grecaptcha) return;
    if (typeof window.grecaptcha.reset === "function") {
      window.grecaptcha.reset(Number(container.dataset.widgetId));
    }
  }

  function submitForm(form, submitter) {
    if (!form) return;

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit(submitter || undefined);
      return;
    }

    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  function populateField(form, name, value) {
    const control = form.elements[name];
    if (!control) return;
    control.value = value == null ? "" : value;
  }

  function populateResults(form, results, tableBody, addRow, renumberRows) {
    if (!Array.isArray(results) || !tableBody) return;

    while (tableBody.querySelectorAll("tr").length < results.length) {
      addRow();
    }

    results.forEach(function (result, index) {
      const rowNumber = index + 1;
      window.CubeSyncFormData.RESULT_FIELDS.forEach(function (field) {
        populateField(form, `${field}${rowNumber}`, result[field]);
      });
    });

    renumberRows();
    renderAll(Array.from(document.querySelectorAll("[data-barcode-input]")));
  }

  function populateForm(form, data, tableBody, addRow, renumberRows) {
    window.CubeSyncFormData.FORM_FIELDS.forEach(function (field) {
      populateField(form, field, data[field]);
    });
    populateResults(form, data.results, tableBody, addRow, renumberRows);
  }

  function syncForgetDetailsButton() {
    const forgetButton = document.getElementById("forgetDetailsButton");
    const prefs = window.CubeSyncFormPrefs;
    if (!forgetButton || !prefs || typeof prefs.hasStoredPreferences !== "function") {
      return;
    }
    forgetButton.hidden = !prefs.hasStoredPreferences(document);
  }

  function restoreRememberedDetails(form, options) {
    const prefs = window.CubeSyncFormPrefs;
    const formData = window.CubeSyncFormData;
    if (!form || !prefs || !formData || typeof prefs.loadFormPreferences !== "function") {
      return false;
    }
    return prefs.loadFormPreferences(form, formData, document, options);
  }

  function rememberCurrentDetails(form, statusElement) {
    const prefs = window.CubeSyncFormPrefs;
    const formData = window.CubeSyncFormData;
    if (!form || !prefs || !formData || typeof prefs.saveFormPreferences !== "function") {
      setSaveStatus(statusElement, "Could not remember details in this browser", true);
      return;
    }

    const result = prefs.saveFormPreferences(form, formData, document);
    if (result && result.ok) {
      setSaveStatus(statusElement, "Details remembered for next visit", false);
    } else {
      setSaveStatus(
        statusElement,
        (result && result.message) || "Could not remember details in this browser",
        true
      );
    }
    syncForgetDetailsButton();
  }

  function forgetRememberedDetails(statusElement) {
    const prefs = window.CubeSyncFormPrefs;
    if (!prefs || typeof prefs.clearFormPreferenceCookie !== "function") {
      setSaveStatus(statusElement, "Could not clear saved details", true);
      return;
    }
    prefs.clearFormPreferenceCookie(document);
    setSaveStatus(statusElement, "Saved details cleared", false);
    syncForgetDetailsButton();
  }

  function formHistory() {
    return window.CubeSyncFormHistory || null;
  }

  function setLocalCopyBanner(visible) {
    const banner = document.getElementById("localCopyBanner");
    if (banner) {
      banner.hidden = !visible;
    }
  }

  function syncLocalHistoryControls() {
    const history = formHistory();
    const hasCopies = Boolean(history && typeof history.hasSubmissions === "function" && history.hasSubmissions());
    const listButton = document.getElementById("mySubmissionsButton");
    const forgetCopiesButton = document.getElementById("forgetLocalCopiesButton");
    const panel = document.getElementById("localSubmissionsPanel");

    if (listButton) {
      listButton.hidden = !hasCopies;
      if (!hasCopies) {
        listButton.setAttribute("aria-expanded", "false");
      }
    }
    if (forgetCopiesButton) {
      forgetCopiesButton.hidden = !hasCopies;
    }
    if (panel && !hasCopies) {
      panel.hidden = true;
    }
  }

  function rememberSubmittedCopy(payload, id) {
    const history = formHistory();
    if (!history || typeof history.saveSubmission !== "function") {
      return null;
    }
    let result = null;
    try {
      result = history.saveSubmission(payload, id);
    } catch {
      result = null;
    }
    syncLocalHistoryControls();
    return result;
  }



  async function loadAndApplyFormFieldConfig(form, onSyncApply) {
    const formData = window.CubeSyncFormData;
    if (!form || !formData) {
      return null;
    }

    let config = null;

    try {
      const cached = localStorage.getItem(formData.FORM_FIELD_CONFIG_STORAGE_KEY);
      if (cached) {
        config = JSON.parse(cached);
      }
    } catch {
      config = null;
    }

    let activeConfig = formData.applyFormFieldConfig(form, config, { activeStep: 1 });
    // Notify the caller synchronously so activeFieldConfig is available before any
    // Firestore await — prevents the race where a submit fires while the network
    // call is still pending and validation sees null config.
    if (typeof onSyncApply === "function") {
      onSyncApply(activeConfig);
    }

    const store = window.CubeSyncFirestore;

    if (store && typeof store.getFormFieldConfig === "function") {
      try {
        const remoteConfig = await store.getFormFieldConfig();
        if (remoteConfig) {
          activeConfig = formData.applyFormFieldConfig(form, remoteConfig, { activeStep: 1 });
          localStorage.setItem(formData.FORM_FIELD_CONFIG_STORAGE_KEY, JSON.stringify(activeConfig));
        }
      } catch {
        // Public form users may not have Firestore read access; keep cached config.
      }
    }

    return activeConfig;
  }

  window.addEventListener("DOMContentLoaded", function () {
    seedInitialResultRows();

    // Pre-fill dateOfCast based on the after-6pm next-day rule (Singapore time).
    // Only fills when the field is empty — does not override a loaded/saved value.
    const formData = window.CubeSyncFormData;
    const formEl = document.getElementById("cubeRequestForm");
    if (formEl && formData && typeof formData.getDefaultCastDate === "function") {
      const dateInput = formEl.elements["dateOfCast"];
      if (dateInput && !dateInput.value) {
        dateInput.value = formData.getDefaultCastDate();
      }
    }

    const setupAutocomplete = window.CubeSyncAutocomplete &&
      typeof window.CubeSyncAutocomplete.setupAutocomplete === "function"
      ? window.CubeSyncAutocomplete.setupAutocomplete
      : function () {};
    const autocompleteFields = [
      { name: "projectErp", url: "dropdown-options/project erp.txt", storageKey: "savedProjectErps" },
      { name: "customerBilling", url: "dropdown-options/customer billing.txt", storageKey: "savedCustomerBillings" },
      { name: "supplier", url: "dropdown-options/supplier.txt", storageKey: "savedSuppliers" },
      { name: "concreteGrade", url: "dropdown-options/Grade.txt", storageKey: "savedGrades" },
      { name: "personInCharge", url: "dropdown-options/person-in-charge.txt", storageKey: "savedPersonsInCharge" },
      { name: "managerInCharge", url: "dropdown-options/manager-in-charge.txt", storageKey: "savedManagersInCharge" },
      { name: "testItem", url: "dropdown-options/testitem.txt", storageKey: "savedTestItems" },
      { name: "specimenSize", url: "dropdown-options/size.txt", storageKey: "savedSizes" }
    ];

    // Pull shared (Firestore) suggestions first so a value promoted by staff
    // shows up for every visitor, then wire each field. Falls back to file +
    // local options if the shared store is unavailable.
    (async function initAutocomplete() {
      let shared = {};
      try {
        const store = window.CubeSyncFirestore;
        if (store && typeof store.getDropdownOptions === "function") {
          shared = (await store.getDropdownOptions()) || {};
        }
      } catch {
        // Shared options are optional; degrade to file + local options.
      }
      autocompleteFields.forEach(function (field) {
        setupAutocomplete(field.name, field.url, field.storageKey, shared[field.name] || []);
      });
    })();
    const form = document.getElementById("cubeRequestForm");
    const printButton = document.getElementById("printButton");
    const printFontSizeInput = document.getElementById("printFontSize");
    const printFontSizeValue = document.getElementById("printFontSizeValue");
    const saveButton = document.getElementById("saveFormButton");
    const saveStatus = document.getElementById("saveStatus");
    const rememberButton = document.getElementById("rememberDetailsButton");
    const forgetButton = document.getElementById("forgetDetailsButton");
    const mySubmissionsButton = document.getElementById("mySubmissionsButton");
    const forgetLocalCopiesButton = document.getElementById("forgetLocalCopiesButton");
    const localSubmissionsPanel = document.getElementById("localSubmissionsPanel");
    const localSubmissionsList = document.getElementById("localSubmissionsList");
    const closeLocalSubmissionsButton = document.getElementById("closeLocalSubmissionsButton");
    const recaptchaContainer = document.getElementById("recaptchaContainer");
    const barcodeInputs = getBarcodeInputs();
    const urlParams = new URLSearchParams(window.location.search);
    let currentDocId = urlParams.get("id");
    let activeFieldConfig = null;
    let currentPrintFontSize = 8;
    const paperPreview = {
      open: false,
      editing: false,
      closing: false,
      stash: null,
      entryId: null,
      reopenList: false,
      lastFocus: null
    };

    function clampPrintFontSize(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(12, Math.max(6, Math.round(parsed))) : 8;
    }

    function applyPrintFontSize(value, persist) {
      currentPrintFontSize = clampPrintFontSize(value);
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--print-form-font-size", `${currentPrintFontSize}px`);
      rootStyle.setProperty("--print-title-font-size", `${currentPrintFontSize + 4}px`);
      rootStyle.setProperty("--print-table-font-size", `${Math.max(5, currentPrintFontSize - 2)}px`);

      if (printFontSizeInput) {
        printFontSizeInput.value = String(currentPrintFontSize);
      }
      if (printFontSizeValue) {
        printFontSizeValue.textContent = `${currentPrintFontSize}px`;
      }

      if (persist) {
        try {
          window.localStorage.setItem("cubeSyncPrintFontSize", String(currentPrintFontSize));
        } catch {
          // Printing still works when storage is unavailable.
        }
      }
    }

    function printableControlValue(control) {
      if (control.tagName === "SELECT" && control.selectedOptions && control.selectedOptions[0]) {
        return control.selectedOptions[0].textContent || control.value;
      }
      return control.value || "";
    }

    function syncOriginalPrintValues() {
      if (!form || form.dataset.template !== "Original") return;

      form.querySelectorAll(".field-row").forEach(function (row) {
        const control = row.querySelector('input:not([type="checkbox"]), select, textarea');
        if (control) {
          row.dataset.printValue = printableControlValue(control);
        } else {
          delete row.dataset.printValue;
        }
      });

      form.querySelectorAll(".results-table tbody td:not(.barcode-cell):not(.result-actions)").forEach(function (cell) {
        const control = cell.querySelector("input, select, textarea");
        if (control) {
          cell.dataset.printValue = printableControlValue(control);
        } else {
          delete cell.dataset.printValue;
        }
      });
    }

    let savedPrintFontSize = null;
    try {
      savedPrintFontSize = window.localStorage.getItem("cubeSyncPrintFontSize");
    } catch {
      // Use the compact default when storage is unavailable.
    }
    applyPrintFontSize(savedPrintFontSize || (printFontSizeInput && printFontSizeInput.value), false);

    if (printFontSizeInput) {
      printFontSizeInput.addEventListener("input", function () {
        applyPrintFontSize(printFontSizeInput.value, true);
      });
    }

    function enterPrintMode() {
      syncOriginalPrintValues();
      document.body.classList.add("is-printing");
    }

    function exitPrintMode() {
      document.body.classList.remove("is-printing");
    }

    function printForm() {
      enterPrintMode();
      window.print();
    }

    window.addEventListener("beforeprint", enterPrintMode);
    window.addEventListener("afterprint", exitPrintMode);

    barcodeInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        renderBarcode(input);
      });
    });

    if (printButton) {
      printButton.addEventListener("click", function () {
        printForm();
      });
    }

    if (rememberButton) {
      rememberButton.addEventListener("click", function () {
        rememberCurrentDetails(form, saveStatus);
      });
    }

    if (forgetButton) {
      forgetButton.addEventListener("click", function () {
        forgetRememberedDetails(saveStatus);
      });
    }

    syncForgetDetailsButton();
    syncLocalHistoryControls();

    if (form) {
      form.addEventListener("reset", function () {
        window.setTimeout(function () {
          applyPrintFontSize(currentPrintFontSize, false);
          renderAll(getBarcodeInputs());
          setSaveStatus(saveStatus, "", false);
          setLocalCopyBanner(false);
        }, 0);
      });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (paperPreview.open && !paperPreview.editing) {
          return;
        }
        const submissionStartedAt = Date.now();

        // Block submits while offline: the write would fail (or worse, half
        // complete on a flaky link) and the user would retry, creating a
        // duplicate request. Reconnecting and resubmitting is the safe path.
        const connectivity = window.CubeSyncConnectivity;
        if (connectivity && !connectivity.isOnline()) {
          logClientObs({
            feature: "FormSubmission",
            functionName: "submit",
            operation: "checkConnectivity",
            status: "warning",
            category: "NetworkState",
            durationMs: Date.now() - submissionStartedAt
          });
          setSaveStatus(saveStatus, "You're offline — reconnect before saving to avoid duplicate submissions.", true);
          return;
        }

        const store = window.CubeSyncFirestore;
        const formData = window.CubeSyncFormData;

        if (!store || !formData) {
          logClientObs({
            feature: "FormSubmission",
            functionName: "submit",
            operation: "checkDependencies",
            status: "failed",
            category: "ConfigError",
            durationMs: Date.now() - submissionStartedAt,
            metadata: {
              firestoreLoaded: Boolean(store),
              formDataLoaded: Boolean(formData)
            }
          });
          setSaveStatus(saveStatus, "Firestore unavailable", true);
          return;
        }

        if (!validateRequestDetails(form, formData, saveStatus, activeFieldConfig, function (stepNumber) {
          currentStep = stepNumber;
          updateSteps();
        })) {
          return;
        }

        let token = "";
        try {
          token = recaptchaToken(recaptchaContainer);
        } catch (error) {
          logClientObs({
            feature: "FormSubmission",
            functionName: "submit",
            operation: "recaptchaToken",
            status: "failed",
            category: "AuthenticationCheck",
            durationMs: Date.now() - submissionStartedAt,
            error: error
          });
          setSaveStatus(saveStatus, formatClientUserError(error, "reCAPTCHA failed"), true);
          return;
        }

        setButtonBusy(saveButton, true);
        setSaveStatus(saveStatus, "Saving...", false);

        try {
          const payload = formData.buildCubeRequestFromForm(form);
          currentDocId = await store.savePublicCubeRequest(payload, undefined, token);
          logClientObs({
            feature: "FormSubmission",
            functionName: "submit",
            operation: "savePublicCubeRequest",
            status: "succeeded",
            category: "ApiRequest",
            durationMs: Date.now() - submissionStartedAt,
            safeId: currentDocId
          });
          
          const saveToLocal = (key, value) => {
            if (!value) return;
            try {
              let existing = JSON.parse(localStorage.getItem(key) || "[]");
              if (!existing.includes(value)) {
                existing.push(value);
                localStorage.setItem(key, JSON.stringify(existing));
              }
            } catch {
              // Ignore local storage write errors.
            }
          };
          if (payload.projectErp) saveToLocal('savedProjectErps', payload.projectErp);
          if (payload.customerBilling) saveToLocal('savedCustomerBillings', payload.customerBilling);

          const localCopy = rememberSubmittedCopy(payload, currentDocId);

          const url = new URL(window.location.href);
          url.searchParams.set("id", currentDocId);
          window.history.replaceState({}, "", url);
          setSaveStatus(
            saveStatus,
            localCopy && localCopy.ok && localCopy.evicted
              ? "Saved. Oldest copies on this device were removed to make room."
              : "Saved",
            false
          );
          if (window.CubeSyncChime && typeof window.CubeSyncChime.showEncouragingPopup === "function") {
            window.CubeSyncChime.showEncouragingPopup("Great job! Form submitted successfully.");
          }
          if (paperPreview.open) {
            closePaperPreview({ adopt: true, fromSave: true });
          }
        } catch (error) {
          logClientObs({
            feature: "FormSubmission",
            functionName: "submit",
            operation: "savePublicCubeRequest",
            status: "failed",
            category: "ApiRequest",
            durationMs: Date.now() - submissionStartedAt,
            error: error
          });
          setSaveStatus(saveStatus, formatClientUserError(error, "Save failed"), true);
          resetRecaptcha(recaptchaContainer);
        } finally {
          setButtonBusy(saveButton, false);
        }
      });
    }

    // Enable Manual Cube Job # toggles the Cube Job # field
    const manualCubeJobToggle = form ? form.elements["enableManualCubeJobNumber"] : null;
    const cubeJobNumberInput = form ? form.elements["cubeJobNumber"] : null;

    function applyManualCubeJobState() {
      if (!manualCubeJobToggle || !cubeJobNumberInput) return;
      if (cubeJobNumberInput.dataset.configDisabled === "true") {
        cubeJobNumberInput.disabled = true;
        cubeJobNumberInput.classList.add("is-disabled");
        return;
      }
      const enabled = manualCubeJobToggle.checked;
      cubeJobNumberInput.disabled = !enabled;
      cubeJobNumberInput.classList.toggle("is-disabled", !enabled);
      if (enabled) {
        cubeJobNumberInput.removeAttribute("readonly");
      } else {
        cubeJobNumberInput.value = "";
      }
    }

    if (manualCubeJobToggle && cubeJobNumberInput) {
      manualCubeJobToggle.addEventListener("change", applyManualCubeJobState);
      applyManualCubeJobState();
    }

    if (form) {
      loadAndApplyFormFieldConfig(form, function (syncConfig) {
        activeFieldConfig = syncConfig;
        applyManualCubeJobState();
        if (!currentDocId && !paperPreview.open) {
          restoreRememberedDetails(form);
          applyManualCubeJobState();
        }
        syncForgetDetailsButton();
      }).then(function (config) {
        activeFieldConfig = config;
        applyManualCubeJobState();
        if (!currentDocId && !paperPreview.open) {
          restoreRememberedDetails(form, { onlyEmpty: true });
          applyManualCubeJobState();
        }
        syncForgetDetailsButton();
      });
    }

    // Multi-step logic
    const steps = Array.from(document.querySelectorAll(".form-step"));
    const indicators = Array.from(document.querySelectorAll(".step-indicator"));
    const prevBtn = document.getElementById("prevStep");
    const nextBtn = document.getElementById("nextStep");
    let currentStep = 1;

    function updateSteps() {
      steps.forEach(function (step) {
        step.classList.toggle("active", parseInt(step.dataset.step) === currentStep);
      });

      indicators.forEach(function (indicator) {
        const indicatorStep = parseInt(indicator.dataset.step);
        indicator.classList.toggle("active", indicatorStep === currentStep);
        
        // Enable indicator if it's the current or a previous step
        if (indicatorStep <= currentStep) {
          indicator.removeAttribute("disabled");
        }
      });

      if (form && window.CubeSyncFormData) {
        window.CubeSyncFormData.syncNativeFormConstraints(form, {
          config: activeFieldConfig,
          activeStep: currentStep
        });
      }

      // Update buttons
      if (currentStep === 1) {
        prevBtn.classList.add("hidden");
        nextBtn.textContent = "Next: Test Results";
      } else {
        prevBtn.classList.remove("hidden");
        nextBtn.textContent = "Finish / Review";
      }

      // Scroll to top of form
      const formTop = form.getBoundingClientRect().top + window.pageYOffset - 20;
      window.scrollTo({ top: formTop, behavior: "smooth" });
    }

    if (nextBtn && prevBtn) {
      nextBtn.addEventListener("click", function () {
        if (currentStep < steps.length) {
          currentStep++;
          updateSteps();
        } else {
          submitForm(form, saveButton);
        }
      });

      prevBtn.addEventListener("click", function () {
        if (currentStep > 1) {
          currentStep--;
          updateSteps();
        }
      });

      indicators.forEach(function (indicator) {
        indicator.addEventListener("click", function () {
          const targetStep = parseInt(this.dataset.step, 10);
          currentStep = targetStep;
          updateSteps();
        });
      });
    }

    renderAll(barcodeInputs);
    renderRecaptcha(recaptchaContainer, saveStatus);

    // Dynamic rows
    const addRowBtn = document.getElementById("addRowButton");
    const tableBody = document.querySelector(".results-table tbody");

    function addResultRowWrapper() {
      if (window.CubeSyncTableManager &&
        typeof window.CubeSyncTableManager.addResultRow === "function") {
        window.CubeSyncTableManager.addResultRow(tableBody, form, renderBarcode, function() {
          if (activeFieldConfig && window.CubeSyncFormData) {
            window.CubeSyncFormData.applyFormFieldConfig(form, activeFieldConfig, { activeStep: currentStep });
            applyManualCubeJobState();
          }
        });
      }
    }

    function renumberRowsWrapper() {
      if (window.CubeSyncTableManager &&
        typeof window.CubeSyncTableManager.renumberRows === "function") {
        window.CubeSyncTableManager.renumberRows(tableBody);
      }
    }

    if (addRowBtn && tableBody) {
      addRowBtn.addEventListener("click", addResultRowWrapper);
    }

    document.querySelectorAll(".remove-row-btn").forEach((button) => {
      if (window.CubeSyncTableManager &&
        typeof window.CubeSyncTableManager.attachRowListeners === "function") {
        window.CubeSyncTableManager.attachRowListeners(button.closest("tr"), tableBody, renderBarcode);
      }
    });

    if (window.CubeSyncTableManager &&
      typeof window.CubeSyncTableManager.bindRequestDateOfCast === "function") {
      window.CubeSyncTableManager.bindRequestDateOfCast(form, tableBody);
    }

    function applyRecordToForm(record, fromLocalCopy) {
      if (!record || !form || !window.CubeSyncFormData) {
        return false;
      }

      const setNo = urlParams.get("setNo");
      const recordForForm = setNo && window.CubeSyncFormData.filterResultsBySetNo
        ? Object.assign({}, record, {
          results: window.CubeSyncFormData.filterResultsBySetNo(record.results, setNo)
        })
        : record;
      if (setNo && Array.isArray(recordForForm.results) && recordForForm.results.length) {
        while (tableBody && tableBody.querySelectorAll("tr").length > recordForForm.results.length) {
          const extra = tableBody.querySelector("tr:last-child");
          if (!extra) break;
          extra.remove();
        }
      }

      populateForm(form, recordForForm, tableBody, addResultRowWrapper, renumberRowsWrapper);
      window.CubeSyncFormData.applyFreeTextFlags(form, record.customFields);
      activeFieldConfig = window.CubeSyncFormData.applyFormFieldConfig(form, activeFieldConfig, {
        activeStep: currentStep,
        extraFieldValues: record.extraFields
      });
      applyManualCubeJobState();
      const loadedJobNumber = record.cubeJobNumber || record.reportNo;
      if (loadedJobNumber && cubeJobNumberInput) {
        cubeJobNumberInput.value = loadedJobNumber;
      }
      setLocalCopyBanner(Boolean(fromLocalCopy));
      return true;
    }

    function prefersReducedMotion() {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }

    function paperSheetTransitionMs(sheet) {
      if (!sheet || prefersReducedMotion()) {
        return 0;
      }
      const style = window.getComputedStyle(sheet);
      const durationText = style.transitionDuration || "0s";
      const delayText = style.transitionDelay || "0s";
      const duration = parseFloat(durationText) || 0;
      const delay = parseFloat(delayText) || 0;
      const unitIsMs = /ms/.test(durationText) || /ms/.test(delayText);
      return unitIsMs ? duration + delay : (duration + delay) * 1000;
    }

    function snapshotWorkingForm() {
      const banner = document.getElementById("localCopyBanner");
      const payload = form && window.CubeSyncFormData
        ? window.CubeSyncFormData.buildCubeRequestFromForm(form)
        : null;
      return {
        payload: payload,
        docId: currentDocId,
        step: currentStep,
        url: window.location.href,
        bannerVisible: Boolean(banner && !banner.hidden),
        bannerText: banner ? banner.textContent : "",
        status: saveStatus ? saveStatus.textContent : "",
        statusIsError: Boolean(saveStatus && saveStatus.classList.contains("is-error"))
      };
    }

    function restoreWorkingForm(snapshot) {
      if (!snapshot) {
        return;
      }
      currentDocId = snapshot.docId;
      currentStep = snapshot.step || 1;
      if (snapshot.url) {
        window.history.replaceState({}, "", snapshot.url);
      }
      if (snapshot.payload) {
        applyRecordToForm(snapshot.payload, snapshot.bannerVisible);
      }
      const banner = document.getElementById("localCopyBanner");
      if (banner && snapshot.bannerText) {
        banner.textContent = snapshot.bannerText;
      }
      if (steps.length) {
        updateSteps();
      }
      setSaveStatus(saveStatus, snapshot.status || "", snapshot.statusIsError);
    }

    function settlePaperPreview() {
      document.body.classList.add("is-paper-settled");
    }

    function finishPaperClose(adopt, fromSave) {
      const toolbar = document.getElementById("previousFormPaperToolbar");
      const backdrop = document.getElementById("previousFormPaperBackdrop");
      const kicker = document.getElementById("previousFormPaperKicker");
      const editButton = document.getElementById("editPreviousFormButton");
      const sheet = document.querySelector("main.sheet");
      const lastFocus = paperPreview.lastFocus;
      const reopenList = !adopt && paperPreview.reopenList;
      const stash = paperPreview.stash;

      document.body.classList.remove("is-paper-preview", "is-paper-readonly", "is-paper-settled");
      if (toolbar) {
        toolbar.hidden = true;
      }
      if (backdrop) {
        backdrop.hidden = true;
      }
      if (editButton) {
        editButton.hidden = false;
      }
      if (kicker) {
        kicker.textContent = "Previous submission";
      }
      if (form) {
        form.removeAttribute("inert");
      }
      if (sheet) {
        sheet.removeAttribute("role");
        sheet.removeAttribute("aria-modal");
      }
      const pageTools = document.querySelector(".page-tools");
      if (pageTools) {
        pageTools.removeAttribute("aria-hidden");
      }

      if (!adopt && stash) {
        restoreWorkingForm(stash);
      } else if (adopt && !fromSave) {
        setLocalCopyBanner(true);
      }

      paperPreview.open = false;
      paperPreview.editing = false;
      paperPreview.closing = false;
      paperPreview.stash = null;
      paperPreview.entryId = null;
      paperPreview.reopenList = false;
      paperPreview.lastFocus = null;

      if (reopenList && localSubmissionsPanel) {
        renderLocalHistoryList();
        localSubmissionsPanel.hidden = false;
        if (mySubmissionsButton) {
          mySubmissionsButton.setAttribute("aria-expanded", "true");
        }
      }

      if (lastFocus && typeof lastFocus.focus === "function") {
        try {
          lastFocus.focus();
        } catch {
          // The triggering control may have been removed.
        }
      }
    }

    function closePaperPreview(options) {
      if (!paperPreview.open || paperPreview.closing) {
        return;
      }

      const adopt = Boolean(options && options.adopt) || paperPreview.editing;
      const fromSave = Boolean(options && options.fromSave);
      const sheet = document.querySelector("main.sheet");
      paperPreview.closing = true;

      if (adopt) {
        finishPaperClose(true, fromSave);
        return;
      }

      document.body.classList.remove("is-paper-settled");
      const waitMs = paperSheetTransitionMs(sheet);
      if (!waitMs) {
        finishPaperClose(false, false);
        return;
      }

      let done = false;
      function complete() {
        if (done) {
          return;
        }
        done = true;
        if (sheet) {
          sheet.removeEventListener("transitionend", onSheetTransitionEnd);
        }
        finishPaperClose(false, false);
      }
      function onSheetTransitionEnd(event) {
        if (!event || event.target === sheet) {
          complete();
        }
      }
      if (sheet) {
        sheet.addEventListener("transitionend", onSheetTransitionEnd);
      }
      window.setTimeout(complete, waitMs + 80);
    }

    function enablePaperEditing() {
      if (!paperPreview.open || paperPreview.editing) {
        return;
      }

      paperPreview.editing = true;
      document.body.classList.remove("is-paper-readonly");
      if (form) {
        form.removeAttribute("inert");
      }

      const editButton = document.getElementById("editPreviousFormButton");
      const kicker = document.getElementById("previousFormPaperKicker");
      if (editButton) {
        editButton.hidden = true;
      }
      if (kicker) {
        kicker.textContent = "Editing previous submission";
      }

      if (paperPreview.entryId) {
        currentDocId = paperPreview.entryId;
        const url = new URL(window.location.href);
        url.searchParams.set("id", paperPreview.entryId);
        window.history.replaceState({}, "", url);
      }

      setLocalCopyBanner(true);
      setSaveStatus(saveStatus, "You can edit this copy. Save sends a new request.", false);
    }

    function openPreviousSubmissionPaper(entry) {
      if (!entry || !entry.payload || !form) {
        return;
      }
      if (paperPreview.open && paperPreview.editing) {
        return;
      }

      const toolbar = document.getElementById("previousFormPaperToolbar");
      const backdrop = document.getElementById("previousFormPaperBackdrop");
      const kicker = document.getElementById("previousFormPaperKicker");
      const editButton = document.getElementById("editPreviousFormButton");
      const sheet = document.querySelector("main.sheet");
      const pageTools = document.querySelector(".page-tools");

      if (!paperPreview.open) {
        paperPreview.stash = snapshotWorkingForm();
        paperPreview.lastFocus = document.activeElement;
      }

      paperPreview.open = true;
      paperPreview.editing = false;
      paperPreview.closing = false;
      paperPreview.entryId = entry.id;
      paperPreview.reopenList = true;

      if (localSubmissionsPanel) {
        localSubmissionsPanel.hidden = true;
      }
      if (mySubmissionsButton) {
        mySubmissionsButton.setAttribute("aria-expanded", "false");
      }

      applyRecordToForm(entry.payload, true);
      if (form) {
        form.setAttribute("inert", "");
      }
      if (sheet) {
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-labelledby", "formTitle");
      }
      if (pageTools) {
        pageTools.setAttribute("aria-hidden", "true");
      }
      if (kicker) {
        kicker.textContent = "Previous submission";
      }
      if (editButton) {
        editButton.hidden = false;
      }
      if (toolbar) {
        toolbar.hidden = false;
      }
      if (backdrop) {
        backdrop.hidden = false;
      }

      document.body.classList.add("is-paper-preview", "is-paper-readonly");
      document.body.classList.remove("is-paper-settled");
      setSaveStatus(saveStatus, "Viewing a previous submission", false);

      if (prefersReducedMotion()) {
        settlePaperPreview();
      } else {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(settlePaperPreview);
        });
      }

      window.setTimeout(function () {
        if (editButton && typeof editButton.focus === "function") {
          editButton.focus();
        }
      }, 0);
    }

    function bindPaperPreviewControls() {
      const editButton = document.getElementById("editPreviousFormButton");
      const closeButton = document.getElementById("closePreviousFormButton");
      const backdrop = document.getElementById("previousFormPaperBackdrop");

      if (editButton && editButton.dataset.historyBound !== "true") {
        editButton.dataset.historyBound = "true";
        editButton.addEventListener("click", function () {
          enablePaperEditing();
        });
      }
      if (closeButton && closeButton.dataset.historyBound !== "true") {
        closeButton.dataset.historyBound = "true";
        closeButton.addEventListener("click", function () {
          closePaperPreview();
        });
      }
      if (backdrop && backdrop.dataset.historyBound !== "true") {
        backdrop.dataset.historyBound = "true";
        backdrop.addEventListener("click", function () {
          closePaperPreview();
        });
      }
      if (document.documentElement.dataset.paperPreviewEscapeBound !== "true") {
        document.documentElement.dataset.paperPreviewEscapeBound = "true";
        document.addEventListener("keydown", function (event) {
          if (event.key === "Escape" && paperPreview.open) {
            event.preventDefault();
            closePaperPreview();
          }
        });
      }
    }

    bindPaperPreviewControls();

    function renderLocalHistoryList() {
      const history = formHistory();
      if (!localSubmissionsList) {
        return;
      }

      localSubmissionsList.replaceChildren();
      const entries = history && typeof history.listSubmissions === "function"
        ? history.listSubmissions()
        : [];

      if (!entries.length) {
        const empty = document.createElement("li");
        empty.className = "local-submissions-empty";
        empty.textContent = "No copies on this device yet. Submit a form to keep one here.";
        localSubmissionsList.appendChild(empty);
        return;
      }

      entries.forEach(function (entry) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "local-submission-item";
        const label = history && typeof history.formatEntryLabel === "function"
          ? history.formatEntryLabel(entry)
          : "";
        button.textContent = label || entry.id;
        button.addEventListener("click", function () {
          openPreviousSubmissionPaper(entry);
        });
        item.appendChild(button);
        localSubmissionsList.appendChild(item);
      });
    }

    if (mySubmissionsButton && mySubmissionsButton.dataset.historyBound !== "true") {
      mySubmissionsButton.dataset.historyBound = "true";
      mySubmissionsButton.addEventListener("click", function () {
        if (!localSubmissionsPanel) {
          return;
        }
        const opening = localSubmissionsPanel.hidden;
        if (opening) {
          renderLocalHistoryList();
        }
        localSubmissionsPanel.hidden = !opening;
        mySubmissionsButton.setAttribute("aria-expanded", opening ? "true" : "false");
      });
    }

    if (closeLocalSubmissionsButton && localSubmissionsPanel && closeLocalSubmissionsButton.dataset.historyBound !== "true") {
      closeLocalSubmissionsButton.dataset.historyBound = "true";
      closeLocalSubmissionsButton.addEventListener("click", function () {
        localSubmissionsPanel.hidden = true;
        if (mySubmissionsButton) {
          mySubmissionsButton.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (forgetLocalCopiesButton && forgetLocalCopiesButton.dataset.historyBound !== "true") {
      forgetLocalCopiesButton.dataset.historyBound = "true";
      forgetLocalCopiesButton.addEventListener("click", function () {
        const history = formHistory();
        if (!history || typeof history.clearHistory !== "function") {
          setSaveStatus(saveStatus, "Could not clear copies on this device", true);
          return;
        }
        history.clearHistory();
        setLocalCopyBanner(false);
        if (localSubmissionsList) {
          localSubmissionsList.replaceChildren();
        }
        syncLocalHistoryControls();
        setSaveStatus(saveStatus, "Copies on this device cleared", false);
      });
    }

    if (currentDocId && form) {
      const store = window.CubeSyncFirestore;
      const shouldPrint = urlParams.get("print") === "true";
      const history = formHistory();
      const localEntry = history && typeof history.getById === "function"
        ? history.getById(currentDocId)
        : null;

      function loadLocalFallback() {
        if (!localEntry || !localEntry.payload) {
          return false;
        }
        applyRecordToForm(localEntry.payload, true);
        setSaveStatus(saveStatus, "Loaded from this device", false);
        if (shouldPrint) {
          window.setTimeout(function () {
            printForm();
          }, 500);
        }
        return true;
      }

      if (store && window.CubeSyncFormData) {
        setSaveStatus(saveStatus, "Loading...", false);
        store.getCubeRequest(currentDocId)
          .then(function (record) {
            if (!record) {
              if (!loadLocalFallback()) {
                setSaveStatus(saveStatus, "Form not found", true);
              }
              return;
            }

            applyRecordToForm(record, false);
            setSaveStatus(saveStatus, "Loaded", false);

            if (shouldPrint) {
              window.setTimeout(function () {
                printForm();
              }, 500);
            }
          })
          .catch(function (error) {
            if (!loadLocalFallback()) {
              setSaveStatus(saveStatus, error.message || "Load failed", true);
            }
          });
      } else {
        loadLocalFallback();
      }
    }
  });
})();
