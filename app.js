(function () {
  "use strict";

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



  async function loadAndApplyFormFieldConfig(form) {
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

    const setupAutocomplete = window.CubeSyncAutocomplete &&
      typeof window.CubeSyncAutocomplete.setupAutocomplete === "function"
      ? window.CubeSyncAutocomplete.setupAutocomplete
      : function () {};
    setupAutocomplete('projectErp', 'dropdown-options/project erp.txt', 'savedProjectErps');
    setupAutocomplete('customerBilling', 'dropdown-options/customer billing.txt', 'savedCustomerBillings');
    setupAutocomplete('supplier', 'dropdown-options/supplier.txt', 'savedSuppliers');
    setupAutocomplete('concreteGrade', 'dropdown-options/Grade.txt', 'savedGrades');
    setupAutocomplete('personInCharge', 'dropdown-options/person-in-charge.txt', 'savedPersonsInCharge');
    setupAutocomplete('managerInCharge', 'dropdown-options/manager-in-charge.txt', 'savedManagersInCharge');
    setupAutocomplete('testItem', 'dropdown-options/testitem.txt', 'savedTestItems');
    setupAutocomplete('specimenSize', 'dropdown-options/size.txt', 'savedSizes');
    const form = document.getElementById("cubeRequestForm");
    const printButton = document.getElementById("printButton");
    const saveButton = document.getElementById("saveFormButton");
    const saveStatus = document.getElementById("saveStatus");
    const recaptchaContainer = document.getElementById("recaptchaContainer");
    const barcodeInputs = getBarcodeInputs();
    const urlParams = new URLSearchParams(window.location.search);
    let currentDocId = urlParams.get("id");
    let activeFieldConfig = null;

    barcodeInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        renderBarcode(input);
      });
    });

    if (printButton) {
      printButton.addEventListener("click", function () {
        window.print();
      });
    }

    if (form) {
      form.addEventListener("reset", function () {
        window.setTimeout(function () {
          renderAll(getBarcodeInputs());
          setSaveStatus(saveStatus, "", false);
        }, 0);
      });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const store = window.CubeSyncFirestore;
        const formData = window.CubeSyncFormData;

        if (!store || !formData) {
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
          setSaveStatus(saveStatus, error.message || "reCAPTCHA failed", true);
          return;
        }

        if (saveButton) {
          saveButton.disabled = true;
        }
        setSaveStatus(saveStatus, "Saving...", false);

        try {
          const payload = formData.buildCubeRequestFromForm(form);
          // Public submissions are create-only (the API rejects a supplied id),
          // so never resend the current id — each save creates a new Draft.
          currentDocId = await store.savePublicCubeRequest(payload, undefined, token);
          
          const saveToLocal = (key, value) => {
            if (!value) return;
            try {
              let existing = JSON.parse(localStorage.getItem(key) || "[]");
              if (!existing.includes(value)) {
                existing.push(value);
                localStorage.setItem(key, JSON.stringify(existing));
              }
            } catch {
        // Ignore missing autocomplete source files.
      }
          };
          if (payload.projectErp) saveToLocal('savedProjectErps', payload.projectErp);
          if (payload.customerBilling) saveToLocal('savedCustomerBillings', payload.customerBilling);

          const url = new URL(window.location.href);
          url.searchParams.set("id", currentDocId);
          window.history.replaceState({}, "", url);
          setSaveStatus(saveStatus, "Saved", false);
          if (window.CubeSyncChime && typeof window.CubeSyncChime.showEncouragingPopup === "function") {
            window.CubeSyncChime.showEncouragingPopup("Great job! Form submitted successfully.");
          }
        } catch (error) {
          setSaveStatus(saveStatus, error.message || "Save failed", true);
          resetRecaptcha(recaptchaContainer);
        } finally {
          if (saveButton) {
            saveButton.disabled = false;
          }
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
      loadAndApplyFormFieldConfig(form).then(function (config) {
        activeFieldConfig = config;
        applyManualCubeJobState();
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

    if (currentDocId && form) {
      const store = window.CubeSyncFirestore;
      const shouldPrint = urlParams.get("print") === "true";

      if (store && window.CubeSyncFormData) {
        setSaveStatus(saveStatus, "Loading...", false);
        store.getCubeRequest(currentDocId)
          .then(function (record) {
            if (!record) {
              setSaveStatus(saveStatus, "Form not found", true);
              return;
            }

            populateForm(form, record, tableBody, addResultRowWrapper, renumberRowsWrapper);
            if (window.CubeSyncFormData) {
              window.CubeSyncFormData.applyFreeTextFlags(form, record.customFields);
              activeFieldConfig = window.CubeSyncFormData.applyFormFieldConfig(form, activeFieldConfig, {
                activeStep: currentStep,
                extraFieldValues: record.extraFields
              });
              applyManualCubeJobState();
            }
            setSaveStatus(saveStatus, "Loaded", false);

            if (shouldPrint) {
              window.setTimeout(function () {
                window.print();
              }, 500);
            }
          })
          .catch(function (error) {
            setSaveStatus(saveStatus, error.message || "Load failed", true);
          });
      }
    }
  });
})();
