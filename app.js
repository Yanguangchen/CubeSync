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

  window.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("cubeRequestForm");
    const printButton = document.getElementById("printButton");
    const barcodeInputs = Array.from(document.querySelectorAll("[data-barcode-input]"));

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
        }, 0);
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
          // Final step action - could trigger print or validation
          window.print();
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
          currentStep = parseInt(this.dataset.step);
          updateSteps();
        });
      });
    }

    renderAll(barcodeInputs);

    // Dynamic rows
    const addRowBtn = document.getElementById("addRowButton");
    const tableBody = document.querySelector(".results-table tbody");

    if (addRowBtn && tableBody) {
      addRowBtn.addEventListener("click", function () {
        const rowCount = tableBody.querySelectorAll("tr").length + 1;
        const newRow = document.createElement("tr");
        
        // Template for row content
        const rowHtml = `
          <td data-label="TEST NUMBER"><input type="text" name="testNumber${rowCount}" aria-label="Row ${rowCount} test number"></td>
          <td data-label="CLIENT CUBE MARKING"><input type="text" name="clientCubeMarking${rowCount}" aria-label="Row ${rowCount} client cube marking"></td>
          <td data-label="DATE TESTED"><input type="date" name="dateTested${rowCount}" aria-label="Row ${rowCount} date tested"></td>
          <td data-label="AGE (days)"><input type="number" name="ageDays${rowCount}" min="0" step="1" aria-label="Row ${rowCount} age in days"></td>
          <td data-label="WEIGHT AS RECEIVED (kg)"><input type="number" name="weightKg${rowCount}" min="0" step="0.01" aria-label="Row ${rowCount} weight as received in kg"></td>
          <td data-label="LOAD (kN)"><input type="number" name="loadKn${rowCount}" min="0" step="0.01" aria-label="Row ${rowCount} load in kN"></td>
          <td data-label="COMPRESSIVE STRENGTH (N/mm2)"><input type="number" name="strength${rowCount}" min="0" step="0.01" aria-label="Row ${rowCount} compressive strength"></td>
          <td data-label="MODE OF FAILURE">
            <input type="text" name="failureMode${rowCount}" aria-label="Row ${rowCount} mode of failure">
            <button type="button" class="remove-row-btn">Remove</button>
          </td>
          <td class="barcode-cell" data-label="BARCODE">
            <input type="text" name="barcode${rowCount}" data-barcode-input placeholder="Enter barcode text" aria-label="Row ${rowCount} barcode text">
            <div class="barcode-preview" aria-live="polite"><span class="barcode-placeholder">Paste Barcode Here</span></div>
            <p class="barcode-message" role="alert"></p>
          </td>
        `;

        newRow.innerHTML = rowHtml;
        tableBody.appendChild(newRow);

        // Attach barcode listener to new input
        const newInput = newRow.querySelector("[data-barcode-input]");
        if (newInput) {
          newInput.addEventListener("input", function () {
            renderBarcode(newInput);
          });
        }

        // Attach remove listener
        const removeBtn = newRow.querySelector(".remove-row-btn");
        if (removeBtn) {
          removeBtn.addEventListener("click", function () {
            newRow.remove();
            renumberRows();
          });
        }
      });
    }

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

    // Attach remove listeners to initial rows if they have remove buttons
    document.querySelectorAll(".remove-row-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        this.closest("tr").remove();
        renumberRows();
      });
    });
  });
})();
