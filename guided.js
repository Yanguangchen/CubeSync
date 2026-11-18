/**
 * Guided request form (guided.html): one question per screen.
 *
 * The page keeps the same real form controls as the other public forms, so
 * app.js still owns saving, validation, reCAPTCHA, remembered details,
 * autocomplete, barcodes and result-row auto-fill. This controller only
 * decides which single control is on screen and moves between them.
 *
 * Flow:
 *   - Company details missing  → ask the request details one at a time, then
 *     the test results, then review & submit.
 *   - Company details present (remembered on this device) → a short "welcome
 *     back" check, then straight to the test results, then review & submit.
 *
 * Exposes `window.CubeSyncGuided`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CubeSyncGuided = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DETAIL_SECTIONS = [
    {
      id: "company",
      title: "Company details",
      fields: ["customerBilling", "contact", "projectErp", "projectNameOnReport", "clientNameOnReport"]
    },
    {
      id: "concrete",
      title: "Concrete & casting",
      fields: [
        "dateOfCast",
        "concreteGrade",
        "reportGrade",
        "specimenSize",
        "slumpSpecified",
        "slumpMeasured",
        "supplier",
        "supplierDisplay",
        "locationRepresented"
      ]
    },
    {
      id: "people",
      title: "People in charge",
      fields: ["personInCharge", "managerInCharge"]
    },
    {
      id: "other",
      title: "Other details",
      fields: ["quote", "enableManualCubeJobNumber", "cubeJobNumber", "testItem", "additionalInformation"],
      includeCustomFields: true
    }
  ];

  // The result fields a customer fills in for each specimen. The rest (size,
  // slumps, grade, cast date, set no, date of test) are filled in from the
  // request details and can still be changed from the review screen.
  const RESULT_WALK_FIELDS = ["specimenRef", "barcode", "age"];
  const RESULT_REVIEW_FIELDS = ["specimenRef", "barcode", "age", "dateOfTest"];
  // Copied from the request details, so tucked behind "More details".
  const RESULT_REVIEW_MORE_FIELDS = [
    "size",
    "resultGrade",
    "resultDateOfCast",
    "specifiedSlump",
    "meanSlump",
    "invoiceNumber"
  ];
  // A specimen counts as entered once any of these has a value; the others
  // are only ever auto-filled, so a row with nothing here is never sent.
  const RESULT_ENTRY_FIELDS = ["specimenRef", "barcode", "age", "invoiceNumber"];
  // Result columns that are copied from a request field. When the request
  // value changes, rows still showing the old copy follow it (cast date is
  // already handled by CubeSyncTableManager.bindRequestDateOfCast).
  const REQUEST_TO_RESULT_FOLLOW = {
    specimenSize: "size",
    slumpSpecified: "specifiedSlump",
    slumpMeasured: "meanSlump",
    concreteGrade: "resultGrade"
  };
  const WELCOME_FIELDS = ["contact", "projectErp", "dateOfCast", "concreteGrade", "locationRepresented"];
  const AGE_PRESETS = [7, 14, 28, 56];
  const AUTO_ADVANCE_MS = 220;
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

  const REQUEST_HINTS = {
    customerBilling: "The company billed for this test.",
    contact: "Who the lab should contact about this request.",
    projectErp: "Choose your project from the list if it's there.",
    projectNameOnReport: "As it should appear on the test report.",
    clientNameOnReport: "As it should appear on the test report.",
    dateOfCast: "Requests submitted after 6 pm (SGT) count as the next day.",
    concreteGrade: "Choose from the list or type it in.",
    reportGrade: "The grade as it should appear on the test report.",
    specimenSize: "Cube size in mm. Choose from the list or type it in.",
    supplier: "Who supplied the concrete.",
    supplierDisplay: "The supplier as it should appear on the test report.",
    locationRepresented: "Where this concrete was placed.",
    personInCharge: "Choose from the list or type a name.",
    managerInCharge: "Choose from the list or type a name.",
    quote: "Your quotation reference, if you have one.",
    enableManualCubeJobNumber: "Turn this on only if you already have a cube job number.",
    additionalInformation: "Anything else the lab should know."
  };
  const RESULT_HINTS = {
    specimenRef: "The reference marked on this cube, e.g. CUBE-01. The next specimens count on from it.",
    barcode: "Type or scan the barcode on the cube's label.",
    age: "Days from casting to testing. The test date is worked out for you."
  };

  function cleanLabel(text) {
    return String(text == null ? "" : text)
      .replace(/\s*:\s*$/, "")
      .replace(/\s*\*\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function formatDate(value) {
    const date = parseIsoDate(value);
    if (!date) return String(value || "");
    try {
      return date.toLocaleDateString("en-SG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      });
    } catch {
      return String(value);
    }
  }

  function singaporeIsoDate(now, addDays) {
    const date = new Date(now + SGT_OFFSET_MS);
    date.setUTCDate(date.getUTCDate() + (addDays || 0));
    return date.toISOString().slice(0, 10);
  }

  // "Today" / "Tomorrow" / "" for an ISO date, using Singapore time.
  function relativeDayLabel(value, now) {
    const at = now == null ? Date.now() : now;
    if (value === singaporeIsoDate(at, 0)) return "Today";
    if (value === singaporeIsoDate(at, 1)) return "Tomorrow";
    if (value === singaporeIsoDate(at, -1)) return "Yesterday";
    return "";
  }

  function isControlFilled(control) {
    if (!control) return false;
    if (control.type === "checkbox") return Boolean(control.checked);
    return String(control.value == null ? "" : control.value).trim() !== "";
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function init(doc) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return null;
    const win = documentRef.defaultView || (typeof window !== "undefined" ? window : null);
    const form = documentRef.getElementById("cubeRequestForm");
    if (!win || !form || form.dataset.template !== "Guided" || form.dataset.guidedReady === "true") {
      return null;
    }
    form.dataset.guidedReady = "true";

    const tableManager = win.CubeSyncTableManager || null;
    const prefs = win.CubeSyncFormPrefs || null;
    const formData = win.CubeSyncFormData || null;
    const tableBody = form.querySelector(".results-table tbody");
    const resultsSection = form.querySelector(".results-section");
    const customFieldsContainer = form.querySelector("#customRequestFields");
    const byId = function (id) {
      return documentRef.getElementById(id);
    };
    const el = {
      progressBar: byId("guidedProgressBar"),
      eyebrow: byId("guidedEyebrow"),
      optional: byId("guidedOptional"),
      context: byId("guidedContext"),
      question: byId("guidedQuestion"),
      hint: byId("guidedHint"),
      intro: byId("guidedIntro"),
      chips: byId("guidedChips"),
      note: byId("guidedNote"),
      error: byId("guidedError"),
      back: byId("guidedBack"),
      next: byId("guidedNext"),
      live: byId("guidedLive"),
      welcomeSummary: byId("guidedWelcomeSummary"),
      welcomeActions: byId("guidedWelcomeActions"),
      editAll: byId("guidedEditAllDetails"),
      forget: byId("guidedForgetDetails"),
      specimenList: byId("guidedSpecimenList"),
      addRow: byId("addRowButton"),
      reviewDetails: byId("guidedReviewDetails"),
      reviewResults: byId("guidedReviewResults"),
      remember: byId("guidedRememberDetails"),
      doneText: byId("guidedDoneText"),
      startAgain: byId("guidedStartAgain")
    };
    const screens = {};
    form.querySelectorAll("[data-guided-screen]").forEach(function (screen) {
      screens[screen.dataset.guidedScreen] = screen;
    });

    const params = new win.URLSearchParams(win.location.search);
    const state = {
      mode: "setup",
      sections: new Set(DETAIL_SECTIONS.map(function (section) { return section.id; })),
      key: null,
      returnTo: null,
      hasPrefs: Boolean(prefs && typeof prefs.hasStoredPreferences === "function" &&
        prefs.hasStoredPreferences(documentRef)),
      autoAdvanceTimer: null,
      saved: false
    };

    /* ------------------------------------------------------------------
       Reading the form
       ------------------------------------------------------------------ */

    function controlByName(name) {
      const control = form.elements[name];
      if (!control || typeof control.closest !== "function") return null;
      return control;
    }

    function rowOf(control) {
      return control ? control.closest(".field-row") : null;
    }

    function requestLabel(control) {
      const row = rowOf(control);
      const span = row ? row.querySelector("span:not(.guided-switch-text)") : null;
      return cleanLabel(span ? span.textContent : control.name);
    }

    function isShownRequest(control) {
      const row = rowOf(control);
      return Boolean(control && row && !row.hidden && control.dataset.configDisabled !== "true" &&
        control.type !== "hidden");
    }

    function isAskable(control) {
      return isShownRequest(control) && !control.disabled && !control.readOnly;
    }

    function isRequired(control) {
      return Boolean(control && control.hasAttribute("required"));
    }

    // Every request control in question order, tagged with its section.
    function detailEntries() {
      const entries = [];
      DETAIL_SECTIONS.forEach(function (section) {
        section.fields.forEach(function (name) {
          const control = controlByName(name);
          if (control) entries.push({ section: section, control: control });
        });
        if (section.includeCustomFields && customFieldsContainer) {
          customFieldsContainer.querySelectorAll("[data-custom-field-id]").forEach(function (control) {
            entries.push({ section: section, control: control });
          });
        }
      });
      return entries;
    }

    function sectionOf(control) {
      const entry = detailEntries().find(function (item) { return item.control === control; });
      return entry ? entry.section : DETAIL_SECTIONS[DETAIL_SECTIONS.length - 1];
    }

    function missingRequired(entries) {
      return (entries || detailEntries()).filter(function (entry) {
        return isAskable(entry.control) && isRequired(entry.control) && !isControlFilled(entry.control);
      });
    }

    function incompleteSectionIds() {
      const ids = new Set();
      missingRequired().forEach(function (entry) { ids.add(entry.section.id); });
      return ids;
    }

    function resultsEnabled() {
      return Boolean(resultsSection && tableBody && !resultsSection.hidden);
    }

    function resultRows() {
      return tableBody ? Array.from(tableBody.querySelectorAll("tr")) : [];
    }

    function resultCell(row, field) {
      return row ? row.querySelector(`td[data-result-field="${field}"]`) : null;
    }

    function cellControl(cell) {
      return cell ? cell.querySelector("input, select, textarea") : null;
    }

    function isShownCell(cell) {
      const control = cellControl(cell);
      return Boolean(cell && !cell.hidden && control && control.dataset.configDisabled !== "true");
    }

    function isAskableCell(cell) {
      const control = cellControl(cell);
      return isShownCell(cell) && !control.disabled && !control.readOnly;
    }

    function cellLabel(cell) {
      return cleanLabel(cell ? cell.getAttribute("data-label") : "");
    }

    function rowValue(row, field) {
      const control = cellControl(resultCell(row, field));
      return control ? String(control.value || "").trim() : "";
    }

    function isRowEntered(row) {
      return RESULT_ENTRY_FIELDS.some(function (field) { return rowValue(row, field) !== ""; });
    }

    function displayValue(control) {
      if (!control) return "";
      if (control.type === "checkbox") return control.checked ? "Yes" : "No";
      const value = String(control.value || "").trim();
      if (!value) return "";
      return control.type === "date" ? formatDate(value) : value;
    }

    function requestValue(name) {
      const control = controlByName(name);
      return control ? String(control.value || "").trim() : "";
    }

    /* ------------------------------------------------------------------
       Steps
       ------------------------------------------------------------------ */

    function requestKey(control) {
      return `req:${control.name}`;
    }

    function resultKey(rowIndex, field) {
      return `res:${rowIndex}:${field}`;
    }

    function firstResultKey(rowIndex) {
      const row = resultRows()[rowIndex];
      const field = RESULT_WALK_FIELDS.find(function (name) { return isAskableCell(resultCell(row, name)); });
      return field ? resultKey(rowIndex, field) : null;
    }

    function buildFlow() {
      const flow = [];
      if (state.mode === "returning") {
        flow.push("screen:welcome");
      } else {
        detailEntries().forEach(function (entry) {
          if (state.sections.has(entry.section.id) && isAskable(entry.control)) {
            flow.push(requestKey(entry.control));
          }
        });
      }
      if (resultsEnabled()) {
        resultRows().forEach(function (row, index) {
          RESULT_WALK_FIELDS.forEach(function (field) {
            if (isAskableCell(resultCell(row, field))) flow.push(resultKey(index, field));
          });
        });
        flow.push("screen:another");
      }
      flow.push("screen:review");
      return flow;
    }

    function resolve(key) {
      const text = String(key || "");
      if (text.indexOf("screen:") === 0) {
        const name = text.slice(7);
        return screens[name] ? { key: text, kind: "screen", screen: name } : null;
      }
      if (text.indexOf("req:") === 0) {
        const control = controlByName(text.slice(4));
        if (!control || !isShownRequest(control)) return null;
        return { key: text, kind: "req", control: control, row: rowOf(control), section: sectionOf(control) };
      }
      if (text.indexOf("res:") === 0) {
        const parts = text.split(":");
        const rowIndex = Number(parts[1]);
        const row = resultRows()[rowIndex];
        const cell = resultCell(row, parts[2]);
        if (!row || !isShownCell(cell)) return null;
        return {
          key: text,
          kind: "res",
          rowIndex: rowIndex,
          field: parts[2],
          row: row,
          cell: cell,
          control: cellControl(cell)
        };
      }
      return null;
    }

    /* ------------------------------------------------------------------
       Rendering
       ------------------------------------------------------------------ */

    function setText(node, text) {
      if (!node) return;
      node.textContent = text || "";
      node.hidden = !text;
    }

    function clearCurrent() {
      form.querySelectorAll("[data-guided-current]").forEach(function (node) {
        node.removeAttribute("data-guided-current");
      });
      Object.keys(screens).forEach(function (name) {
        screens[name].hidden = true;
      });
    }

    function ensureSwitchText(row) {
      if (!row || !row.classList.contains("toggle-row")) return;
      const box = row.querySelector('input[type="checkbox"]');
      let text = row.querySelector(".guided-switch-text");
      if (!text) {
        text = documentRef.createElement("span");
        text.className = "guided-switch-text";
        text.setAttribute("aria-hidden", "true");
        row.appendChild(text);
      }
      text.textContent = box && box.checked ? "Yes" : "No";
    }

    function enhanceControl(step, isLast) {
      const control = step.control;
      if (!control) return;
      control.setAttribute("enterkeyhint", isLast ? "done" : "next");
      if (step.kind !== "res") return;
      if (step.field === "specimenRef" || step.field === "barcode") {
        control.setAttribute("autocapitalize", "characters");
        control.setAttribute("autocomplete", "off");
        control.setAttribute("spellcheck", "false");
      }
      if (step.field === "age") {
        control.setAttribute("inputmode", "numeric");
      }
    }

    // Fill each specimen's size, slumps, grade and cast date from the request
    // details (only where still empty) and refresh its test date and set no.
    function prefillResultRows() {
      if (!tableManager || !tableBody) return;
      resultRows().forEach(function (row) {
        if (typeof tableManager.prefillRowFromRequest === "function") {
          tableManager.prefillRowFromRequest(row, form);
        }
        if (typeof tableManager.computeRowDateOfTest === "function") {
          tableManager.computeRowDateOfTest(row, form);
        }
      });
      if (typeof tableManager.assignSetNumbersByAge === "function") {
        tableManager.assignSetNumbersByAge(tableBody);
      }
    }

    function sectionPosition(step, flow) {
      const keys = flow.filter(function (key) {
        const other = key.indexOf("req:") === 0 ? controlByName(key.slice(4)) : null;
        return other && sectionOf(other) === step.section;
      });
      const index = keys.indexOf(step.key);
      return index >= 0 ? `${step.section.title} · ${index + 1} of ${keys.length}` : step.section.title;
    }

    function resultContext() {
      const customer = requestValue("customerBilling");
      const cast = requestValue("dateOfCast");
      const parts = [];
      if (customer) parts.push(customer);
      if (cast) parts.push(`cast ${formatDate(cast)}`);
      return parts.join(" · ");
    }

    function renderPrompt(step, flow) {
      let eyebrow = "";
      let question = "";
      let hint = "";
      let context = "";
      let optional = false;

      if (step.kind === "req") {
        eyebrow = sectionPosition(step, flow);
        question = requestLabel(step.control);
        hint = REQUEST_HINTS[step.control.name] || "";
        optional = !isRequired(step.control);
      } else if (step.kind === "res") {
        const rows = resultRows();
        eyebrow = `Test results · Specimen ${step.rowIndex + 1} of ${rows.length}`;
        context = resultContext();
        question = cellLabel(step.cell);
        hint = RESULT_HINTS[step.field] || "";
        if (step.field === "specimenRef" && step.rowIndex > 0 && step.control.value) {
          hint = "Counted on from the specimen above. Change it if this cube is marked differently.";
        }
      } else if (step.screen === "welcome") {
        const customer = requestValue("customerBilling");
        eyebrow = "Welcome back";
        question = customer ? `Submitting for ${customer}` : "Your saved details";
        hint = resultsEnabled()
          ? "Check your saved details, then add your test results."
          : "Check your saved details, then review and submit.";
      } else if (step.screen === "another") {
        const count = resultRows().length;
        eyebrow = "Test results";
        question = count ? `${plural(count, "specimen")} added. Add another?` : "Add your first specimen";
        hint = "Add one specimen for each cube you're sending to the lab.";
        context = resultContext();
      } else if (step.screen === "review") {
        eyebrow = "Last step";
        question = "Check and submit";
        hint = "Tap anything to change it.";
      } else if (step.screen === "done") {
        eyebrow = "Submitted";
        question = "Request sent";
      }

      setText(el.eyebrow, eyebrow);
      if (el.optional) el.optional.hidden = !optional;
      setText(el.context, context);
      if (el.question) el.question.textContent = question;
      setText(el.hint, hint);
      if (el.intro) {
        el.intro.hidden = !(state.mode === "setup" && !state.hasPrefs && step.key === flow[0] &&
          step.kind === "req");
      }
    }

    function renderNote(step) {
      let note = "";
      if (step.kind === "res" && step.field === "age") {
        const testDate = rowValue(step.row, "dateOfTest");
        const setNo = rowValue(step.row, "setNo");
        if (testDate) {
          note = `Date of test: ${formatDate(testDate)}${setNo ? ` · Set ${setNo}` : ""}`;
        }
      } else if (step.control && step.control.type === "date" && step.control.value) {
        const relative = relativeDayLabel(step.control.value);
        note = `${formatDate(step.control.value)}${relative ? ` (${relative.toLowerCase()})` : ""}`;
      }
      setText(el.note, note);
    }

    function renderChips(step) {
      if (!el.chips) return;
      el.chips.replaceChildren();
      const isAge = step.kind === "res" && step.field === "age";
      el.chips.hidden = !isAge;
      if (!isAge) return;
      el.chips.setAttribute("role", "group");
      el.chips.setAttribute("aria-label", "Common test ages");
      AGE_PRESETS.forEach(function (days) {
        const chip = documentRef.createElement("button");
        chip.type = "button";
        chip.className = "guided-chip";
        chip.textContent = `${days} days`;
        chip.setAttribute("aria-pressed", String(step.control.value) === String(days) ? "true" : "false");
        chip.addEventListener("click", function () {
          setControlValue(step.control, String(days));
          renderChips(step);
          renderNote(step);
          win.clearTimeout(state.autoAdvanceTimer);
          state.autoAdvanceTimer = win.setTimeout(function () {
            if (state.key === step.key) next();
          }, AUTO_ADVANCE_MS);
        });
        el.chips.appendChild(chip);
      });
    }

    function nextLabel(step) {
      if (step.kind === "req" || step.kind === "res") {
        if (state.returnTo) return "Done";
        if (step.kind === "req" && step.control.type !== "checkbox" && !isRequired(step.control) &&
          !isControlFilled(step.control)) {
          return "Skip";
        }
        return "Next";
      }
      if (step.screen === "welcome") return resultsEnabled() ? "Continue to test results" : "Continue";
      if (step.screen === "another") return "Review & submit";
      return "Next";
    }

    function renderNav(step, flow, index) {
      const showNext = step.kind !== "screen" || step.screen === "welcome" || step.screen === "another";
      const canGoBack = step.screen !== "done" && (Boolean(state.returnTo) || index > 0);
      if (el.next) {
        el.next.hidden = !showNext;
        el.next.textContent = nextLabel(step);
      }
      if (el.back) {
        el.back.hidden = !canGoBack;
      }
      if (el.welcomeActions) {
        el.welcomeActions.hidden = step.screen !== "welcome";
      }
    }

    function renderProgress(flow, index) {
      if (!el.progressBar) return;
      const doneRatio = state.saved ? 1 : (index < 0 ? 0 : index / Math.max(flow.length - 1, 1));
      el.progressBar.style.width = `${Math.round(Math.max(doneRatio, 0.04) * 100)}%`;
    }

    function hideError() {
      if (el.error) {
        el.error.hidden = true;
        el.error.textContent = "";
      }
      form.querySelectorAll('[aria-invalid="true"][data-guided-invalid]').forEach(function (control) {
        control.removeAttribute("aria-invalid");
        control.removeAttribute("data-guided-invalid");
      });
    }

    function showError(message, control) {
      if (el.error) {
        el.error.textContent = message;
        el.error.hidden = false;
      }
      if (control && control.getAttribute("aria-invalid") !== "true") {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("data-guided-invalid", "true");
      }
      if (control && typeof control.focus === "function") {
        control.focus({ preventScroll: true });
      }
    }

    function announce(text) {
      if (el.live) el.live.textContent = text;
    }

    function focusStep(step) {
      const target = step.control || el.question;
      if (target && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    }

    function scrollPromptIntoView() {
      const prompt = form.querySelector(".guided-prompt") || form;
      if (typeof prompt.getBoundingClientRect !== "function") return;
      const top = prompt.getBoundingClientRect().top;
      if (top < 0 && typeof win.scrollTo === "function") {
        win.scrollTo({ top: Math.max(0, top + (win.pageYOffset || 0) - 12), behavior: "auto" });
      }
    }

    function go(key, options) {
      const opts = options || {};
      win.clearTimeout(state.autoAdvanceTimer);
      const step = resolve(key) || resolve("screen:review");
      if (!step) return;

      state.key = step.key;
      clearCurrent();
      hideError();
      form.dataset.guidedKind = step.kind === "screen" ? step.screen : step.kind;

      if (step.kind === "req") {
        step.row.setAttribute("data-guided-current", "");
        ensureSwitchText(step.row);
      } else if (step.kind === "res") {
        prefillResultRows();
        step.row.setAttribute("data-guided-current", "");
        step.cell.setAttribute("data-guided-current", "");
      } else {
        screens[step.screen].hidden = false;
        renderScreen(step.screen);
      }

      const flow = buildFlow();
      const index = flow.indexOf(state.returnTo || step.key);
      enhanceControl(step, flow[flow.indexOf(step.key) + 1] === "screen:review" || Boolean(state.returnTo));
      renderPrompt(step, flow);
      renderChips(step);
      renderNote(step);
      renderNav(step, flow, flow.indexOf(step.key));
      renderProgress(flow, index);
      announce(`${el.eyebrow ? el.eyebrow.textContent : ""}. ${el.question ? el.question.textContent : ""}`);

      if (opts.focus !== false) focusStep(step);
      if (opts.scroll !== false) scrollPromptIntoView();
    }

    function refreshCurrent() {
      if (state.key) go(state.key, { focus: false, scroll: false });
    }

    /* ------------------------------------------------------------------
       Summary screens
       ------------------------------------------------------------------ */

    function summaryRow(label, value, options) {
      const opts = options || {};
      const editable = Boolean(opts.key);
      const node = documentRef.createElement(editable ? "button" : "div");
      node.className = "guided-summary-row";
      if (editable) node.type = "button";
      if (opts.missing) node.classList.add("is-missing");

      const labelNode = documentRef.createElement("span");
      labelNode.className = "guided-summary-label";
      labelNode.textContent = label;
      const valueNode = documentRef.createElement("span");
      valueNode.className = "guided-summary-value";
      valueNode.textContent = value || (opts.missing ? "Required — tap to add" : "Not given");
      if (!value) valueNode.classList.add("is-empty");
      node.append(labelNode, valueNode);

      if (opts.tag) {
        const tag = documentRef.createElement("span");
        tag.className = "guided-summary-tag";
        tag.textContent = opts.tag;
        valueNode.appendChild(tag);
      }
      if (editable) {
        const action = documentRef.createElement("span");
        action.className = "guided-summary-action";
        action.setAttribute("aria-hidden", "true");
        action.textContent = value ? "Change" : "Add";
        node.appendChild(action);
        node.addEventListener("click", function () {
          editStep(opts.key, opts.returnTo);
        });
      }
      return node;
    }

    function requestSummaryRow(control, returnTo) {
      const value = displayValue(control);
      const relative = control.type === "date" && control.value ? relativeDayLabel(control.value) : "";
      return summaryRow(requestLabel(control), value, {
        key: isAskable(control) ? requestKey(control) : null,
        returnTo: returnTo,
        missing: isAskable(control) && isRequired(control) && !isControlFilled(control),
        tag: relative
      });
    }

    function renderWelcome() {
      if (!el.welcomeSummary) return;
      el.welcomeSummary.replaceChildren();
      WELCOME_FIELDS.forEach(function (name) {
        const control = controlByName(name);
        if (!control || !isShownRequest(control)) return;
        if (!isControlFilled(control) && !isRequired(control)) return;
        el.welcomeSummary.appendChild(requestSummaryRow(control, "screen:welcome"));
      });
    }

    function specimenSummary(row) {
      const parts = [];
      const ref = rowValue(row, "specimenRef");
      const barcode = rowValue(row, "barcode");
      const age = rowValue(row, "age");
      if (ref) parts.push(ref);
      if (barcode) parts.push(barcode);
      if (age) parts.push(`${age} days`);
      return parts.length ? parts.join(" · ") : "Nothing entered yet";
    }

    function renderSpecimenList() {
      if (!el.specimenList) return;
      el.specimenList.replaceChildren();
      resultRows().forEach(function (row, index) {
        const item = documentRef.createElement("li");
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "guided-specimen-item";
        if (!isRowEntered(row)) button.classList.add("is-empty");
        const title = documentRef.createElement("span");
        title.className = "guided-specimen-title";
        title.textContent = `Specimen ${index + 1}`;
        const detail = documentRef.createElement("span");
        detail.className = "guided-specimen-detail";
        detail.textContent = specimenSummary(row);
        button.append(title, detail);
        button.addEventListener("click", function () {
          const key = firstResultKey(index);
          if (key) editStep(key, null);
        });
        item.appendChild(button);
        el.specimenList.appendChild(item);
      });
    }

    function groupHeading(text) {
      const heading = documentRef.createElement("h3");
      heading.className = "guided-group-title";
      heading.textContent = text;
      return heading;
    }

    function renderReviewDetails() {
      if (!el.reviewDetails) return;
      el.reviewDetails.replaceChildren();
      DETAIL_SECTIONS.forEach(function (section) {
        const rows = detailEntries()
          .filter(function (entry) {
            return entry.section === section && isShownRequest(entry.control) &&
              !(entry.control.disabled && !entry.control.readOnly);
          })
          .map(function (entry) { return requestSummaryRow(entry.control, "screen:review"); });
        if (!rows.length) return;
        const group = documentRef.createElement("section");
        group.className = "guided-summary";
        group.append(groupHeading(section.title), ...rows);
        el.reviewDetails.appendChild(group);
      });
    }

    function renderReviewResults() {
      if (!el.reviewResults) return;
      el.reviewResults.replaceChildren();
      if (!resultsEnabled()) {
        el.reviewResults.hidden = true;
        return;
      }
      el.reviewResults.hidden = false;
      el.reviewResults.appendChild(groupHeading("Test results"));

      const rows = resultRows();
      if (!rows.some(isRowEntered)) {
        const empty = documentRef.createElement("p");
        empty.className = "guided-empty";
        empty.textContent = "No specimens entered yet.";
        el.reviewResults.appendChild(empty);
      }

      rows.forEach(function (row, index) {
        const card = documentRef.createElement("article");
        card.className = "guided-specimen-card";
        const header = documentRef.createElement("header");
        const title = documentRef.createElement("h4");
        const setNo = rowValue(row, "setNo");
        title.textContent = `Specimen ${index + 1}${setNo && isRowEntered(row) ? ` · Set ${setNo}` : ""}`;
        const remove = documentRef.createElement("button");
        remove.type = "button";
        remove.className = "guided-remove";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove specimen ${index + 1}`);
        remove.addEventListener("click", function () {
          removeSpecimen(row);
        });
        header.append(title, remove);
        card.appendChild(header);

        if (!isRowEntered(row)) {
          card.classList.add("is-empty");
          const note = documentRef.createElement("p");
          note.className = "guided-empty";
          note.textContent = "Nothing entered — this specimen won't be sent.";
          card.appendChild(note);
          const key = firstResultKey(index);
          if (key) {
            card.appendChild(summaryRow("Specimen details", "", { key: key, returnTo: "screen:review" }));
          }
        } else {
          const resultRowFor = function (field) {
            const cell = resultCell(row, field);
            if (!isShownCell(cell)) return null;
            return summaryRow(cellLabel(cell), displayValue(cellControl(cell)), {
              key: isAskableCell(cell) ? resultKey(index, field) : null,
              returnTo: "screen:review"
            });
          };
          RESULT_REVIEW_FIELDS.forEach(function (field) {
            const node = resultRowFor(field);
            if (node) card.appendChild(node);
          });
          const more = RESULT_REVIEW_MORE_FIELDS.map(resultRowFor).filter(Boolean);
          if (more.length) {
            const details = documentRef.createElement("details");
            details.className = "guided-more";
            const summary = documentRef.createElement("summary");
            summary.textContent = "More details";
            details.append(summary, ...more);
            card.appendChild(details);
          }
        }
        el.reviewResults.appendChild(card);
      });

      const add = documentRef.createElement("button");
      add.type = "button";
      add.className = "guided-secondary guided-add";
      add.textContent = "+ Add specimen";
      add.addEventListener("click", function () {
        if (el.addRow) el.addRow.click();
      });
      el.reviewResults.appendChild(add);
    }

    function renderScreen(name) {
      if (name === "welcome") {
        renderWelcome();
      } else if (name === "another") {
        prefillResultRows();
        renderSpecimenList();
      } else if (name === "review") {
        prefillResultRows();
        renderReviewDetails();
        renderReviewResults();
      }
    }

    /* ------------------------------------------------------------------
       Actions
       ------------------------------------------------------------------ */

    function setControlValue(control, value) {
      control.value = value;
      control.dispatchEvent(new win.Event("input", { bubbles: true }));
      control.dispatchEvent(new win.Event("change", { bubbles: true }));
    }

    function stepProblem(step) {
      const control = step.control;
      if (!control) return "";
      if (step.kind === "req" && isRequired(control) && !isControlFilled(control)) {
        return `${requestLabel(control)} is required.`;
      }
      if (step.kind === "res" && step.field === "barcode" && control.getAttribute("aria-invalid") === "true" &&
        !control.hasAttribute("data-guided-invalid")) {
        const message = step.cell.querySelector(".barcode-message");
        return (message && message.textContent) || "This barcode can't be used. Check the text and try again.";
      }
      if (control.type === "number" && control.validity &&
        (control.validity.badInput || control.validity.rangeUnderflow || control.validity.stepMismatch)) {
        return "Enter a whole number.";
      }
      return "";
    }

    function next() {
      const step = resolve(state.key);
      if (!step) {
        go("screen:review");
        return;
      }
      if (step.kind === "req" || step.kind === "res") {
        const problem = stepProblem(step);
        if (problem) {
          showError(problem, step.control);
          return;
        }
      }
      if (state.returnTo) {
        const target = state.returnTo;
        state.returnTo = null;
        go(target);
        return;
      }
      const flow = buildFlow();
      const index = flow.indexOf(state.key);
      go(index >= 0 && flow[index + 1] ? flow[index + 1] : "screen:review");
    }

    function back() {
      if (state.returnTo) {
        const target = state.returnTo;
        state.returnTo = null;
        go(target);
        return;
      }
      const flow = buildFlow();
      const index = flow.indexOf(state.key);
      if (index > 0) go(flow[index - 1]);
    }

    function editStep(key, returnTo) {
      state.returnTo = returnTo || null;
      go(key);
    }

    function enterSetup(sectionIds) {
      state.mode = "setup";
      state.sections = new Set(sectionIds || DETAIL_SECTIONS.map(function (section) { return section.id; }));
      state.returnTo = null;
      const flow = buildFlow();
      go(flow[0]);
    }

    function forgetDetails() {
      if (prefs && typeof prefs.clearFormPreferenceCookie === "function") {
        prefs.clearFormPreferenceCookie(documentRef);
      }
      state.hasPrefs = false;
      detailEntries().forEach(function (entry) {
        const control = entry.control;
        if (!isShownRequest(control) || control.readOnly || control.name === "dateOfCast") return;
        if (control.type === "checkbox") {
          if (control.checked) {
            control.checked = false;
            control.dispatchEvent(new win.Event("change", { bubbles: true }));
          }
        } else if (control.value) {
          setControlValue(control, "");
        }
      });
      // Clearing a suggestion field opens its list; close them all again.
      form.querySelectorAll(".erp-dropdown").forEach(function (dropdown) {
        dropdown.style.display = "none";
      });
      enterSetup();
    }

    function removeSpecimen(row) {
      const button = row.querySelector(".remove-row-btn");
      if (button) {
        button.click();
      } else {
        row.remove();
      }
      refreshCurrent();
    }

    // Blank specimens only carry values copied from the request details;
    // empty them so they are not sent as results.
    function clearBlankResultRows() {
      resultRows().forEach(function (row) {
        if (isRowEntered(row)) return;
        row.querySelectorAll("input, select, textarea").forEach(function (control) {
          if (control.name && control.name.indexOf("setNo") === 0) return;
          if (control.type === "checkbox") {
            control.checked = false;
          } else {
            control.value = "";
          }
        });
      });
    }

    function rememberDetails() {
      if (!el.remember || !el.remember.checked || !prefs || !formData ||
        typeof prefs.saveFormPreferences !== "function") {
        return false;
      }
      const result = prefs.saveFormPreferences(form, formData, documentRef);
      return Boolean(result && result.ok);
    }

    /* ------------------------------------------------------------------
       Wiring
       ------------------------------------------------------------------ */

    [el.next, el.back].forEach(function (button) {
      if (!button) return;
      // Keep focus in the field while the button is pressed: blurring it
      // would close its suggestion list and shift the button mid-click.
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
    });
    if (el.next) el.next.addEventListener("click", next);
    if (el.back) el.back.addEventListener("click", back);
    if (el.editAll) {
      el.editAll.addEventListener("click", function () {
        enterSetup();
      });
    }
    if (el.forget) el.forget.addEventListener("click", forgetDetails);

    // Runs after app.js has added the row (its listener was bound first).
    if (el.addRow) {
      el.addRow.addEventListener("click", function () {
        const rows = resultRows();
        const last = rows[rows.length - 1];
        const above = rows[rows.length - 2];
        const lastAge = cellControl(resultCell(last, "age"));
        const aboveAge = cellControl(resultCell(above, "age"));
        if (lastAge && aboveAge && !lastAge.value && aboveAge.value && isAskableCell(resultCell(last, "age"))) {
          setControlValue(lastAge, aboveAge.value);
        }
        state.returnTo = null;
        const key = last ? firstResultKey(rows.length - 1) : null;
        go(key || "screen:another");
      });
    }

    // Enter moves on instead of submitting the whole form; a barcode scanner
    // that ends with Enter therefore lands on the next question.
    form.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || event.isComposing) return;
      const target = event.target;
      if (!target || (target.tagName !== "INPUT" && target.tagName !== "SELECT")) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      const step = resolve(state.key);
      if (step && (step.kind === "req" || step.kind === "res") && target === step.control) {
        next();
      }
    });

    form.addEventListener("input", function (event) {
      const step = resolve(state.key);
      if (!step || event.target !== step.control) return;
      hideError();
      renderNote(step);
      if (el.next) el.next.textContent = nextLabel(step);
      if (step.kind === "res" && step.field === "age") renderChips(step);
    });

    form.addEventListener("change", function (event) {
      const target = event.target;
      if (target && target.type === "checkbox") {
        ensureSwitchText(target.closest(".toggle-row"));
      }
      const step = resolve(state.key);
      if (step && target === step.control) {
        renderNote(step);
        if (el.next) el.next.textContent = nextLabel(step);
      }
    });

    Object.keys(REQUEST_TO_RESULT_FOLLOW).forEach(function (name) {
      const control = controlByName(name);
      const field = REQUEST_TO_RESULT_FOLLOW[name];
      if (!control) return;
      let previous = control.value;
      control.addEventListener("focus", function () {
        previous = control.value;
      });
      function follow() {
        const value = control.value;
        resultRows().forEach(function (row) {
          const target = cellControl(resultCell(row, field));
          if (target && !target.readOnly && (!target.value || target.value === previous)) {
            target.value = value;
          }
        });
        previous = value;
      }
      control.addEventListener("input", follow);
      control.addEventListener("change", follow);
    });

    // Check the request details before app.js does, so a missing answer
    // opens its own question instead of focusing a control that is off screen.
    documentRef.addEventListener("submit", function (event) {
      if (event.target !== form) return;
      clearBlankResultRows();
      const missing = missingRequired()[0];
      if (missing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editStep(requestKey(missing.control), "screen:review");
        showError(`${requestLabel(missing.control)} is required.`, missing.control);
      }
    }, true);

    form.addEventListener("cubesync:saved", function (event) {
      state.saved = true;
      const remembered = rememberDetails();
      if (remembered) state.hasPrefs = true;
      const id = event && event.detail && event.detail.id;
      if (el.doneText) {
        el.doneText.textContent = [
          "Your request has been sent to the R.A.K. lab.",
          id ? `Reference: ${id}.` : "",
          remembered ? "Your company details are saved on this device for next time." : ""
        ].filter(Boolean).join(" ");
      }
      state.returnTo = null;
      go("screen:done");
    });

    form.addEventListener("cubesync:recordapplied", function () {
      const step = resolve(state.key);
      if (step && step.kind === "screen") refreshCurrent();
    });

    if (customFieldsContainer && typeof win.MutationObserver === "function") {
      new win.MutationObserver(function () {
        const step = resolve(state.key);
        if (!step || step.kind !== "res") refreshCurrent();
      }).observe(customFieldsContainer, { childList: true });
    }

    /* ------------------------------------------------------------------
       Start
       ------------------------------------------------------------------ */

    let startKey;
    if (params.get("id")) {
      state.mode = "returning";
      startKey = "screen:review";
    } else if (!missingRequired().length) {
      state.mode = "returning";
      startKey = "screen:welcome";
    } else {
      state.mode = "setup";
      if (state.hasPrefs) {
        state.sections = incompleteSectionIds();
      }
      startKey = buildFlow()[0];
    }

    const finePointer = Boolean(win.matchMedia && win.matchMedia("(pointer: fine)").matches);
    go(startKey, { focus: finePointer, scroll: false });

    // cubesync-autocomplete.js wraps its inputs once their option lists load,
    // and moving an input drops its focus. Put the opening focus back until
    // the visitor starts interacting.
    const requestGrid = form.querySelector(".request-grid");
    if (finePointer && requestGrid && typeof win.MutationObserver === "function") {
      const keepFocus = new win.MutationObserver(function () {
        const step = resolve(state.key);
        const active = documentRef.activeElement;
        if (step && step.control && active !== step.control && (!active || active === documentRef.body)) {
          step.control.focus({ preventScroll: true });
        }
      });
      const stopKeepingFocus = function () {
        keepFocus.disconnect();
        documentRef.removeEventListener("pointerdown", stopKeepingFocus, true);
        documentRef.removeEventListener("keydown", stopKeepingFocus, true);
      };
      keepFocus.observe(requestGrid, { childList: true, subtree: true });
      documentRef.addEventListener("pointerdown", stopKeepingFocus, true);
      documentRef.addEventListener("keydown", stopKeepingFocus, true);
      win.setTimeout(stopKeepingFocus, 4000);
    }

    return {
      next: next,
      back: back,
      go: go,
      editStep: editStep,
      enterSetup: enterSetup,
      buildFlow: buildFlow,
      state: function () {
        return { mode: state.mode, key: state.key, returnTo: state.returnTo, saved: state.saved };
      }
    };
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function" &&
    !(typeof module === "object" && module.exports)) {
    window.addEventListener("DOMContentLoaded", function () {
      window.CubeSyncGuidedController = init(window.document);
    });
  }

  return {
    DETAIL_SECTIONS: DETAIL_SECTIONS,
    RESULT_WALK_FIELDS: RESULT_WALK_FIELDS,
    AGE_PRESETS: AGE_PRESETS,
    cleanLabel: cleanLabel,
    formatDate: formatDate,
    relativeDayLabel: relativeDayLabel,
    init: init
  };
});
