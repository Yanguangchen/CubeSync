(function () {
  "use strict";

  const STORAGE_KEY = "cubesync.forms";
  const seedForms = [
    {
      id: "ccr-2406-001",
      reportNo: "RAK-CUBE-2406-001",
      client: "Acme Construction Pte Ltd",
      project: "Bukit Batok BTO Package A",
      template: "Original",
      status: "Ready",
      updatedAt: "2026-06-16",
      grade: "C35/45",
      location: "Level 12 transfer slab grid C4-D6",
      notes: "Ten cube records prepared. Barcode labels pending final lab intake."
    },
    {
      id: "ccr-2406-002",
      reportNo: "RAK-CUBE-2406-002",
      client: "Northstar Builders",
      project: "Jurong Logistics Hub",
      template: "Glassmorphic",
      status: "Draft",
      updatedAt: "2026-06-17",
      grade: "C40/50",
      location: "Ramp wall pour sequence 3",
      notes: "Awaiting slump specified value from site engineer."
    },
    {
      id: "ccr-2406-003",
      reportNo: "RAK-CUBE-2406-003",
      client: "Kinetic Civil Works",
      project: "Service tunnel package T2",
      template: "Original",
      status: "Archived",
      updatedAt: "2026-06-10",
      grade: "C30/37",
      location: "Tunnel invert chainage 220-260",
      notes: "Printed and issued for filing."
    }
  ];

  const state = {
    forms: loadForms(),
    selectedId: null,
    search: "",
    status: "all"
  };

  const elements = {};

  function loadForms() {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedForms));
      return seedForms.slice();
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedForms));
      return seedForms.slice();
    }
  }

  function saveForms() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.forms));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function filteredForms() {
    const query = state.search.trim().toLowerCase();

    return state.forms.filter(function (form) {
      const statusMatch = state.status === "all" || form.status === state.status;
      const searchText = `${form.reportNo} ${form.client} ${form.project} ${form.grade}`.toLowerCase();
      return statusMatch && (!query || searchText.includes(query));
    });
  }

  function statusClass(status) {
    if (status === "Ready") return "status-ready";
    if (status === "Archived") return "status-archived";
    return "";
  }

  function renderForms() {
    const rows = filteredForms().map(function (form) {
      const selectedClass = form.id === state.selectedId ? " selected" : "";
      return `
        <tr class="${selectedClass}" data-id="${escapeHtml(form.id)}" tabindex="0">
          <td><strong>${escapeHtml(form.reportNo)}</strong></td>
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

    elements.formList.innerHTML = rows || `<tr><td colspan="7">No forms match the current filters.</td></tr>`;
  }

  function selectedForm() {
    return state.forms.find((form) => form.id === state.selectedId) || null;
  }

  function viewForm(id) {
    state.selectedId = id;
    const form = selectedForm();

    if (!form) {
      elements.detailTitle.textContent = "No form selected";
      elements.detailContent.innerHTML = "<p>Select a form from the dashboard to view its request details and test rows.</p>";
      setDetailButtons(false);
      renderForms();
      return;
    }

    elements.detailTitle.textContent = form.reportNo;
    elements.detailContent.innerHTML = `
      <dl class="detail-list">
        <div><dt>Client</dt><dd>${escapeHtml(form.client)}</dd></div>
        <div><dt>Project</dt><dd>${escapeHtml(form.project)}</dd></div>
        <div><dt>Template</dt><dd>${escapeHtml(form.template)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(form.status)}</dd></div>
        <div><dt>Concrete grade</dt><dd>${escapeHtml(form.grade)}</dd></div>
        <div><dt>Location represented</dt><dd>${escapeHtml(form.location)}</dd></div>
        <div><dt>Notes</dt><dd>${escapeHtml(form.notes)}</dd></div>
      </dl>
    `;
    setDetailButtons(true);
    renderForms();
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

  function openEditor(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    elements.editForm.elements.id.value = form.id;
    elements.editForm.elements.reportNo.value = form.reportNo;
    elements.editForm.elements.status.value = form.status;
    elements.editForm.elements.client.value = form.client;
    elements.editForm.elements.project.value = form.project;
    elements.editForm.elements.grade.value = form.grade;
    elements.editForm.elements.template.value = form.template;
    elements.editForm.elements.location.value = form.location;
    elements.editForm.elements.notes.value = form.notes;
    elements.editDialog.showModal();
  }

  function saveEditedForm(event) {
    event.preventDefault();
    const formData = new FormData(elements.editForm);
    const id = formData.get("id");
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    form.reportNo = formData.get("reportNo").trim();
    form.status = formData.get("status");
    form.client = formData.get("client").trim();
    form.project = formData.get("project").trim();
    form.grade = formData.get("grade").trim();
    form.template = formData.get("template");
    form.location = formData.get("location").trim();
    form.notes = formData.get("notes").trim();
    form.updatedAt = new Date().toISOString().slice(0, 10);

    saveForms();
    elements.editDialog.close();
    viewForm(id);
  }

  function deleteForm(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    if (!window.confirm(`Delete ${form.reportNo}? This only removes the frontend dashboard record.`)) {
      return;
    }

    state.forms = state.forms.filter((item) => item.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    saveForms();
    viewForm(state.selectedId);
  }

  function printForm(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    elements.printArea.innerHTML = `
      <h1>${escapeHtml(form.reportNo)}</h1>
      <p><strong>Client:</strong> ${escapeHtml(form.client)}</p>
      <p><strong>Project:</strong> ${escapeHtml(form.project)}</p>
      <p><strong>Template:</strong> ${escapeHtml(form.template)}</p>
      <p><strong>Status:</strong> ${escapeHtml(form.status)}</p>
      <p><strong>Concrete grade:</strong> ${escapeHtml(form.grade)}</p>
      <p><strong>Location represented:</strong> ${escapeHtml(form.location)}</p>
      <p><strong>Notes:</strong> ${escapeHtml(form.notes)}</p>
    `;
    window.print();
  }

  function openTemplate(id) {
    const form = state.forms.find((item) => item.id === id);
    if (!form) return;

    const url = form.template === "Glassmorphic" ? "glassmorphic.html" : "index.html";
    window.location.href = url;
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
      "formList", "detailPanel", "detailContent", "detailTitle", "searchInput",
      "statusFilter", "editDialog", "editForm", "closeEditorButton", "cancelEditButton",
      "detailViewButton", "detailEditButton", "detailPrintButton", "detailDeleteButton",
      "printArea"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
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
  });
})();
