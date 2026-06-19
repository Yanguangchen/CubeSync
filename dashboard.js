(function () {
  "use strict";

  const state = {
    forms: [],
    selectedId: null,
    search: "",
    status: "all",
    loading: false
  };

  const elements = {};

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function filteredForms() {
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

  function selectedForm() {
    return state.forms.find((form) => form.id === state.selectedId) || null;
  }

  function renderForms() {
    if (state.loading) {
      setListMessage("Loading Firestore forms...");
      return;
    }

    const rows = filteredForms().map(function (form) {
      const selectedClass = form.id === state.selectedId ? " selected" : "";
      return `
        <tr class="${selectedClass}" data-id="${escapeHtml(form.id)}" tabindex="0">
          <td><strong>${escapeHtml(form.reportNo || form.id)}</strong></td>
          <td>${escapeHtml(form.client)}</td>
          <td>${escapeHtml(form.project)}</td>
          <td>${escapeHtml(form.template)}</td>
          <td><span class="status-pill ${statusClass(form.status)}">${escapeHtml(form.status)}</span></td>
          <td>${escapeHtml(form.updatedAt)}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-action="view" data-id="${escapeHtml(form.id)}">View</button>
              <button type="button" data-action="edit" data-id="${escapeHtml(form.id)}">Edit</button>
              <button type="button" data-action="print" data-id="${escapeHtml(form.id)}">Print</button>
              <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(form.id)}">Delete</button>
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

  function viewForm(id) {
    state.selectedId = id;
    const form = selectedForm();

    if (!form) {
      elements.detailTitle.textContent = "No form selected";
      elements.detailContent.innerHTML = "<p>Select a form from the dashboard to view its request details and barcode labels.</p>";
      setDetailButtons(false);
      renderForms();
      return;
    }

    elements.detailTitle.textContent = form.reportNo || form.id;
    const renderField = (label, value, fieldName) => {
      if (!value) return '';
      const isCustom = form.customFields && form.customFields.includes(fieldName);
      const displayValue = isCustom ? `<span class="highlight-custom" title="Custom free text entry">${escapeHtml(value)}</span>` : escapeHtml(value);
      return `<div><dt>${escapeHtml(label)}</dt><dd>${displayValue}</dd></div>`;
    };

    elements.detailContent.innerHTML = `
      <dl class="detail-list">
        ${renderField("Project (ERP)", form.projectErp, "projectErp")}
        ${renderField("Customer (Billing)", form.customerBilling, "customerBilling")}
        ${renderField("Project Name on Report", form.projectNameReport, "projectNameReport")}
        ${renderField("Client Name on Report", form.clientReport, "clientReport")}
        ${renderField("Contact", form.contactPerson, "contactPerson")}
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
      </dl>
      ${renderBarcodeList(form)}
    `;
    setDetailButtons(true);
    renderForms();
  }

  async function loadForms() {
    const store = formStore();
    const helper = formDataHelper();

    if (!store || !helper) {
      state.forms = [];
      renderForms();
      elements.detailContent.innerHTML = "<p>Firestore is not available yet. Check the Firebase SDK scripts and network access.</p>";
      return;
    }

    state.loading = true;
    renderForms();

    try {
      const records = await store.listCubeRequests();
      state.forms = records.map((record) => helper.normalizeCubeRequestForDashboard(record, record.id));
      state.loading = false;
      renderForms();

      if (state.selectedId && selectedForm()) {
        viewForm(state.selectedId);
      } else {
        viewForm(null);
      }
    } catch (error) {
      state.loading = false;
      state.forms = [];
      renderForms();
      elements.detailTitle.textContent = "Firestore error";
      elements.detailContent.innerHTML = `<p>${escapeHtml(error.message || "Unable to load forms from Firestore.")}</p>`;
      setDetailButtons(false);
    }
  }

  function setDashboardLocked(locked) {
    elements.authGate.classList.toggle("is-hidden", !locked);
    elements.dashboardShell.classList.toggle("is-hidden", locked);
  }

  function clearDashboard() {
    state.forms = [];
    state.selectedId = null;
    state.loading = false;
    renderForms();
    viewForm(null);
  }

  function bindAuthGate() {
    const auth = authHelper();
    const authMessage = elements.authGate.querySelector("p:not(.eyebrow)");

    if (!auth) {
      setDashboardLocked(true);
      authMessage.textContent = "Firebase Auth is not available. Check the Firebase SDK script.";
      return;
    }

    elements.signInButton.addEventListener("click", async function () {
      try {
        await auth.signInWithGoogle();
      } catch (error) {
        window.alert(error.message || "Unable to sign in with Google.");
      }
    });

    elements.signOutButton.addEventListener("click", async function () {
      try {
        await auth.signOutUser();
      } catch (error) {
        window.alert(error.message || "Unable to sign out.");
      }
    });

    auth.onAuthChange(function (user) {
      if (!user) {
        elements.authUser.textContent = "";
        authMessage.textContent = "Use your Google account to access Firestore-backed dashboards.";
        setDashboardLocked(true);
        clearDashboard();
        return;
      }

      if (!auth.isAllowedUser(user)) {
        elements.authUser.textContent = "";
        authMessage.textContent = `${user.email || "This Google account"} is not allowed for CubeSync.`;
        setDashboardLocked(true);
        clearDashboard();
        auth.signOutUser().catch(() => {});
        return;
      }

      elements.authUser.textContent = user.email || user.displayName || "Signed in";
      setDashboardLocked(false);
      loadForms();
    });
  }

  function openEditor(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;
    const raw = form.raw || {};

    elements.editForm.elements.id.value = form.id;
    elements.editForm.elements.reportNo.value = form.reportNo;
    elements.editForm.elements.internalDate.value = raw.internalDate || "";
    elements.editForm.elements.projectCode.value = raw.projectCode || "";
    elements.editForm.elements.method.value = raw.method || "";
    elements.editForm.elements.supplier.value = raw.supplier || "";
    elements.editForm.elements.dateTimeSampled.value = raw.dateTimeSampled || "";
    elements.editForm.elements.slumpMeasured.value = raw.slumpMeasured == null ? "" : raw.slumpMeasured;
    elements.editForm.elements.specimenSize.value = raw.specimenSize || "";
    elements.editForm.elements.slumpSpecified.value = raw.slumpSpecified == null ? "" : raw.slumpSpecified;
    elements.editForm.elements.status.value = form.status;
    elements.editForm.elements.client.value = form.client;
    elements.editForm.elements.project.value = form.project;
    elements.editForm.elements.grade.value = form.grade;
    elements.editForm.elements.template.value = form.template;
    elements.editForm.elements.location.value = form.location;
    elements.editForm.elements.notes.value = form.notes;
    elements.editDialog.showModal();
  }

  async function saveEditedForm(event) {
    event.preventDefault();

    const store = formStore();
    const helper = formDataHelper();
    const formData = new FormData(elements.editForm);
    const id = formData.get("id");

    if (!store || !helper || !id) return;

    const submitButton = elements.editForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await store.updateCubeRequest(id, helper.dashboardEditToCubeRequest(formData));
      elements.editDialog.close();
      state.selectedId = id;
      await loadForms();
    } catch (error) {
      window.alert(error.message || "Unable to save changes to Firestore.");
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
      if (state.selectedId === id) state.selectedId = null;
      await loadForms();
    } catch (error) {
      window.alert(error.message || "Unable to delete this Firestore form.");
    }
  }

  function printForm(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    const url = form.template === "Glassmorphic" ? "glassmorphic.html" : "index.html";
    window.open(`${url}?id=${encodeURIComponent(id)}&print=true`, "_blank");
  }

  function openTemplate(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    const url = form.template === "Glassmorphic" ? "glassmorphic.html" : "index.html";
    window.location.href = `${url}?id=${encodeURIComponent(id)}`;
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

    if (action === "view") viewForm(id);
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
      "formList", "detailPanel", "detailContent", "detailTitle", "searchInput",
      "statusFilter", "editDialog", "editForm", "closeEditorButton", "cancelEditButton",
      "detailViewButton", "detailEditButton", "detailPrintButton", "detailDeleteButton",
      "printArea"
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

    elements.detailViewButton.addEventListener("click", () => openTemplate(state.selectedId));
    elements.detailEditButton.addEventListener("click", () => openEditor(state.selectedId));
    elements.detailPrintButton.addEventListener("click", () => printForm(state.selectedId));
    elements.detailDeleteButton.addEventListener("click", () => deleteForm(state.selectedId));

    elements.editForm.addEventListener("submit", saveEditedForm);
    elements.closeEditorButton.addEventListener("click", () => elements.editDialog.close());
    elements.cancelEditButton.addEventListener("click", () => elements.editDialog.close());

    bindThemeToggle();
    bindAuthGate();
  });
})();
