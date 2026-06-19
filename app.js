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

  function resultRowHtml(rowCount) {
    return `
      <td data-result-field="setNo" data-label="Set No"><input type="number" name="setNo${rowCount}" min="1" step="1" value="1" aria-label="Row ${rowCount} set number"></td>
      <td data-result-field="size" data-label="Size"><input type="text" name="size${rowCount}" aria-label="Row ${rowCount} size"></td>
      <td data-result-field="specimenRef" data-label="Specimen Ref #"><input type="text" name="specimenRef${rowCount}" aria-label="Row ${rowCount} specimen reference"></td>
      <td class="barcode-cell" data-result-field="barcode" data-label="Barcode">
        <input type="text" name="barcode${rowCount}" data-barcode-input placeholder="Enter barcode text" aria-label="Row ${rowCount} barcode text">
        <div class="barcode-preview" aria-live="polite"><span class="barcode-placeholder">Paste Barcode Here</span></div>
        <p class="barcode-message" role="alert"></p>
      </td>
      <td data-result-field="specifiedSlump" data-label="Specified Slump"><input type="text" name="specifiedSlump${rowCount}" aria-label="Row ${rowCount} specified slump"></td>
      <td data-result-field="meanSlump" data-label="Mean Slump"><input type="number" name="meanSlump${rowCount}" min="0" step="1" aria-label="Row ${rowCount} mean slump"></td>
      <td data-result-field="resultGrade" data-label="Concrete Grade"><input type="text" name="resultGrade${rowCount}" aria-label="Row ${rowCount} concrete grade"></td>
      <td data-result-field="resultDateOfCast" data-label="Date Of Cast"><input type="date" name="resultDateOfCast${rowCount}" aria-label="Row ${rowCount} date of cast"></td>
      <td data-result-field="age" data-label="Age"><input type="number" name="age${rowCount}" min="0" step="1" aria-label="Row ${rowCount} age in days"></td>
      <td data-result-field="dateOfTest" data-label="Date Of Test"><input type="date" name="dateOfTest${rowCount}" aria-label="Row ${rowCount} date of test"></td>
      <td data-result-field="invoiceNumber" data-label="Invoice Number"><input type="text" name="invoiceNumber${rowCount}" aria-label="Row ${rowCount} invoice number"></td>
      <td data-label="Action"><button type="button" class="remove-row-btn" aria-label="Remove row ${rowCount}">Remove</button></td>
    `;
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
  async function setupAutocomplete(inputName, fetchUrl, storageKey) {
    try {
      const fetchFn = window.fetch || fetch;
      
      let fileOptions = [];
      try {
        const response = await fetchFn(encodeURI(fetchUrl));
        if (response.ok) {
          const text = await response.text();
          fileOptions = text.split('\n').map(l => l.trim()).filter(l => l);
        }
      } catch {
        // Ignore missing autocomplete source files.
      }
      
      let localOptions = [];
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          localOptions = JSON.parse(stored);
        }
      } catch {
        // Ignore missing autocomplete source files.
      }
      
      const allOptions = Array.from(new Set([...fileOptions, ...localOptions]));
      
      document.querySelectorAll(`input[name="${inputName}"]`).forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.removeAttribute('list');
        
        let wrapper = input.parentElement;
        if (!wrapper.classList.contains('erp-autocomplete-wrapper')) {
          wrapper = document.createElement('div');
          wrapper.className = 'erp-autocomplete-wrapper';
          input.parentNode.insertBefore(wrapper, input);
          wrapper.appendChild(input);
        }
        
        let dropdown = wrapper.querySelector('.erp-dropdown');
        if (!dropdown) {
          dropdown = document.createElement('ul');
          dropdown.className = 'erp-dropdown';
          wrapper.appendChild(dropdown);
        }
        
        let focusedIndex = -1;
        
        const renderDropdown = (query) => {
          dropdown.innerHTML = '';
          const lowerQuery = query.toLowerCase();
          
          let matches = allOptions.filter(opt => opt.toLowerCase().includes(lowerQuery));
          
          if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
          }
          
          matches.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            if (aLower === lowerQuery) return -1;
            if (bLower === lowerQuery) return 1;
            const aStarts = aLower.startsWith(lowerQuery);
            const bStarts = bLower.startsWith(lowerQuery);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
          });
          
          matches.forEach((match) => {
            const li = document.createElement('li');
            li.className = 'erp-dropdown-item';
            
            const queryLen = query.length;
            const matchIndex = match.toLowerCase().indexOf(lowerQuery);
            if (queryLen > 0 && matchIndex !== -1) {
              const before = match.substring(0, matchIndex);
              const matchedPart = match.substring(matchIndex, matchIndex + queryLen);
              const after = match.substring(matchIndex + queryLen);
              
              let html = '';
              if (before) html += `<strong>${before}</strong>`;
              html += matchedPart;
              if (after) html += `<strong>${after}</strong>`;
              li.innerHTML = html;
            } else {
              li.innerHTML = `<strong>${match}</strong>`;
            }
            
            li.addEventListener('mousedown', (e) => {
              e.preventDefault();
              input.value = match;
              input.dispatchEvent(new window.Event('input', { bubbles: true }));
              closeDropdown();
            });
            
            dropdown.appendChild(li);
          });
          
          dropdown.style.display = 'block';
          focusedIndex = -1;
        };
        
        const closeDropdown = () => {
          dropdown.style.display = 'none';
          focusedIndex = -1;
        };
        
        const updateFocus = () => {
          const items = dropdown.querySelectorAll('.erp-dropdown-item');
          items.forEach((item, idx) => {
            if (idx === focusedIndex) {
              item.classList.add('selected');
              if (typeof item.scrollIntoView === 'function') {
                item.scrollIntoView({ block: 'nearest' });
              }
            } else {
              item.classList.remove('selected');
            }
          });
        };
        
        input.addEventListener('focus', () => renderDropdown(input.value));
        input.addEventListener('input', () => renderDropdown(input.value));
        input.addEventListener('blur', closeDropdown);
        
        input.addEventListener('keydown', (e) => {
          const items = dropdown.querySelectorAll('.erp-dropdown-item');
          if (dropdown.style.display === 'block' && items.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusedIndex = (focusedIndex + 1) % items.length;
              updateFocus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusedIndex = (focusedIndex - 1 + items.length) % items.length;
              updateFocus();
            } else if (e.key === 'Enter') {
              if (focusedIndex >= 0 && focusedIndex < items.length) {
                e.preventDefault();
                input.value = items[focusedIndex].textContent;
                input.dispatchEvent(new window.Event('input', { bubbles: true }));
                closeDropdown();
              }
            } else if (e.key === 'Escape') {
              closeDropdown();
            }
          }
        });
      });
      
      if (!document.getElementById('erp-dropdown-css')) {
        const style = document.createElement('style');
        style.id = 'erp-dropdown-css';
        style.textContent = `
          .erp-autocomplete-wrapper { position: relative; display: inline-block; width: 100%; }
          .erp-autocomplete-wrapper input:focus { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
          .erp-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #dfe1e5; border-top: none; border-radius: 0 0 24px 24px; box-shadow: 0 4px 6px rgba(32, 33, 36, 0.28); z-index: 1000; list-style: none; padding: 10px 0 20px 0; margin: 0; display: none; max-height: 350px; overflow-y: auto; text-align: left; }
          .erp-dropdown-item { padding: 4px 20px; cursor: pointer; display: flex; align-items: center; font-family: Arial, sans-serif; font-size: 16px; color: #212124; line-height: 24px; }
          .erp-dropdown-item::before { content: "🔍"; margin-right: 14px; opacity: 0.4; font-size: 14px; }
          .erp-dropdown-item:hover, .erp-dropdown-item.selected { background-color: #f1f3f4; }
          .erp-dropdown-item strong { font-weight: 600; }
        `;
        document.head.appendChild(style);
      }
    } catch (e) {
      console.error('Failed to setup autocomplete for', inputName, e);
    }
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
    setupAutocomplete('projectErp', 'project erp.txt', 'savedProjectErps');
    setupAutocomplete('customerBilling', 'customer billing.txt', 'savedCustomerBillings');
    setupAutocomplete('supplier', 'supplier.txt', 'savedSuppliers');
    setupAutocomplete('concreteGrade', 'Grade.txt', 'savedGrades');
    setupAutocomplete('personInCharge', 'person-in-charge', 'savedPersonsInCharge');
    setupAutocomplete('managerInCharge', 'manager-in-charge.txt', 'savedManagersInCharge');
    setupAutocomplete('testItem', 'testitem.txt', 'savedTestItems');
    setupAutocomplete('specimenSize', 'size.txt', 'savedSizes');
    const form = document.getElementById("cubeRequestForm");
    const printButton = document.getElementById("printButton");
    const saveButton = document.getElementById("saveFormButton");
    const saveStatus = document.getElementById("saveStatus");
    const recaptchaContainer = document.getElementById("recaptchaContainer");
    const barcodeInputs = Array.from(document.querySelectorAll("[data-barcode-input]"));
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
          renderAll(barcodeInputs);
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
          currentDocId = await store.savePublicCubeRequest(payload, currentDocId, token);
          
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

    function renumberRows() {
      const rows = tableBody.querySelectorAll("tr");
      rows.forEach((row, index) => {
        const num = index + 1;
        const inputs = row.querySelectorAll("input, select");
        inputs.forEach(input => {
          // Update name and aria-label
          const baseName = input.name.replace(/\d+$/, "");
          input.name = baseName + num;
          
          if (input.hasAttribute("aria-label")) {
            const baseAria = input.getAttribute("aria-label").replace(/Row \d+/, `Row ${num}`);
            input.setAttribute("aria-label", baseAria);
          }
        });

        // Update data-label if necessary (though they are static, the content might need update if we had row numbers in them)
      });
    }

    function computeRowAge(row) {
      const cast = row.querySelector('[name^="resultDateOfCast"]');
      const test = row.querySelector('[name^="dateOfTest"]');
      const age = row.querySelector('[name^="age"]');
      if (!cast || !test || !age || !cast.value || !test.value) return;

      const castDate = new Date(cast.value);
      const testDate = new Date(test.value);
      const diffDays = Math.round((testDate - castDate) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(diffDays) && diffDays >= 0) {
        age.value = diffDays;
      }
    }

    const REQUEST_TO_RESULT_PREFILL = {
      size: "specimenSize",
      specifiedSlump: "slumpSpecified",
      meanSlump: "slumpMeasured",
      resultGrade: "concreteGrade",
      resultDateOfCast: "dateOfCast"
    };

    function prefillRowFromRequest(row) {
      if (!form) return;
      Object.keys(REQUEST_TO_RESULT_PREFILL).forEach(function (rowField) {
        const target = row.querySelector('[name^="' + rowField + '"]');
        const source = form.elements[REQUEST_TO_RESULT_PREFILL[rowField]];
        if (target && source && !target.value) {
          target.value = source.value || "";
        }
      });
    }

    function attachRowListeners(row) {
      const newInput = row.querySelector("[data-barcode-input]");
      if (newInput) {
        newInput.addEventListener("input", function () {
          renderBarcode(newInput);
        });
      }

      ['[name^="resultDateOfCast"]', '[name^="dateOfTest"]'].forEach(function (selector) {
        const dateInput = row.querySelector(selector);
        if (dateInput) {
          dateInput.addEventListener("change", function () {
            computeRowAge(row);
          });
        }
      });

      const removeBtn = row.querySelector(".remove-row-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", function () {
          row.remove();
          renumberRows();
        });
      }
    }

    function addResultRow() {
      if (!tableBody) return;
      const rowCount = tableBody.querySelectorAll("tr").length + 1;
      const newRow = document.createElement("tr");
      newRow.innerHTML = resultRowHtml(rowCount);
      tableBody.appendChild(newRow);
      prefillRowFromRequest(newRow);
      attachRowListeners(newRow);
      if (activeFieldConfig && window.CubeSyncFormData) {
        window.CubeSyncFormData.applyFormFieldConfig(form, activeFieldConfig, { activeStep: currentStep });
        applyManualCubeJobState();
      }
    }

    if (addRowBtn && tableBody) {
      addRowBtn.addEventListener("click", addResultRow);
    }

    document.querySelectorAll(".remove-row-btn").forEach((button) => {
      attachRowListeners(button.closest("tr"));
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

            populateForm(form, record, tableBody, addResultRow, renumberRows);
            if (window.CubeSyncFormData) {
              activeFieldConfig = window.CubeSyncFormData.applyFormFieldConfig(form, activeFieldConfig, {
                activeStep: currentStep
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
