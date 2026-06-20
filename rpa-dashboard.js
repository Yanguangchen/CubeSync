(function () {
  "use strict";

  function getSGTDate(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const d = parts.find((p) => p.type === "day").value;
    const m = parts.find((p) => p.type === "month").value;
    const y = parts.find((p) => p.type === "year").value;
    return `${y}-${m}-${d}`;
  }

  function getSGTTime(date = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  const todaySGT = getSGTDate();

  const state = {
    forms: [],
    viewDate: todaySGT,
    loading: false
  };

  const elements = {};
  let initialized = false;

  function store() {
    return window.CubeSyncFirestore;
  }

  function helper() {
    return window.CubeSyncFormData;
  }

  function exportHelper() {
    return window.CubeSyncExport;
  }

  function authHelper() {
    return window.CubeSyncAuth;
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

  function queueDate(form) {
    const raw = form.raw || {};
    const date = toDate(raw.submittedAt || raw.createdAt || raw.updatedAt || raw.internalDate);
    return date || new Date();
  }

  function rpaStatus(form) {
    return form.raw && form.raw.rpaStatus ? form.raw.rpaStatus : "Ready for Bot";
  }

  function erpStatus(form) {
    return form.raw && form.raw.erpStatus ? form.raw.erpStatus : "Pending";
  }

  function attemptCount(form) {
    const value = form.raw && form.raw.attemptCount;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function getFilteredQueue() {
    return state.forms
      .filter((form) => getSGTDate(queueDate(form)) === state.viewDate)
      .sort((left, right) => queueDate(left) - queueDate(right));
  }

  function getExportableForms() {
    return state.forms.filter((form) => rpaStatus(form) !== "Disabled");
  }

  function getStatusClass(status) {
    if (status === "Ready for Bot") return "status-ready";
    if (status === "In Progress") return "status-processing";
    if (status === "Submitted to ERP") return "status-ready";
    if (status === "Failed") return "status-failed";
    return "";
  }

  function setExportButtonState() {
    if (!elements.exportAllButton) return;

    elements.exportAllButton.disabled = state.loading || getExportableForms().length === 0;
    elements.exportAllButton.textContent = state.loading ? "Loading forms..." : "Export all CSV";
  }

  function renderQueue() {
    setExportButtonState();

    if (state.loading) {
      elements.queueList.innerHTML = `<tr><td colspan="7">Loading Firestore forms...</td></tr>`;
      return;
    }

    const rows = getFilteredQueue().map(function (form) {
      const status = rpaStatus(form);
      const time = getSGTTime(queueDate(form));
      const isDisabled = status === "Disabled";
      const rowClass = isDisabled ? "disabled-row" : "";
      const statusClass = getStatusClass(status);
      const currentErpStatus = erpStatus(form);
      const erpStatusSelector = isDisabled
        ? '<span class="status-pill status-failed">Disabled</span>'
        : `
        <select data-action="update-erp" data-id="${escapeHtml(form.id)}" class="erp-selector ${statusClass}">
          <option value="Pending" ${currentErpStatus === "Pending" ? "selected" : ""}>Pending</option>
          <option value="Processing" ${currentErpStatus === "Processing" ? "selected" : ""}>Processing</option>
          <option value="Success" ${currentErpStatus === "Success" ? "selected" : ""}>Success</option>
          <option value="Error" ${currentErpStatus === "Error" ? "selected" : ""}>Error</option>
        </select>
        `;

      return `
        <tr data-id="${escapeHtml(form.id)}" tabindex="0" class="${rowClass}">
          <td><strong>${escapeHtml(time)}</strong></td>
          <td>${escapeHtml(form.reportNo || form.id)}</td>
          <td>${escapeHtml(form.client)}</td>
          <td>${escapeHtml(form.project)}</td>
          <td>${erpStatusSelector}</td>
          <td>${escapeHtml(attemptCount(form))}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-action="open">Open Form</button>
              <button type="button" class="${isDisabled ? "" : "danger"}" data-action="toggle-disable" data-id="${escapeHtml(form.id)}">
                ${isDisabled ? "Enable RPA" : "Disable RPA"}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    elements.queueList.innerHTML = rows || `<tr><td colspan="7">No Firestore forms submitted for this date.</td></tr>`;

    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    const dateObj = new Date(`${state.viewDate}T00:00:00+08:00`);
    elements.currentDateDisplay.textContent = dateObj.toLocaleDateString("en-SG", options);
    elements.todayBtn.classList.toggle("active", state.viewDate === todaySGT);
  }

  async function loadQueue() {
    const firestore = store();
    const formData = helper();

    if (!firestore || !formData) {
      elements.queueList.innerHTML = `<tr><td colspan="7">Firestore is not available.</td></tr>`;
      return;
    }

    state.loading = true;
    renderQueue();

    try {
      const records = await firestore.listCubeRequests();
      state.forms = records.map((record) => formData.normalizeCubeRequestForDashboard(record, record.id));
    } catch (error) {
      state.forms = [];
      state.loading = false;
      setExportButtonState();
      elements.queueList.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message || "Unable to load Firestore forms.")}</td></tr>`;
      return;
    } finally {
      state.loading = false;
    }

    renderQueue();
  }

  function setDashboardLocked(locked) {
    elements.authGate.classList.toggle("is-hidden", !locked);
    elements.dashboardShell.classList.toggle("is-hidden", locked);
  }

  function clearQueue() {
    state.forms = [];
    state.loading = false;
    renderQueue();
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
        authMessage.textContent = "Use your Google account to access Firestore-backed RPA operations.";
        setDashboardLocked(true);
        clearQueue();
        return;
      }

      if (!auth.isAllowedUser(user)) {
        elements.authUser.textContent = "";
        authMessage.textContent = `${user.email || "This Google account"} is not allowed for CubeSync.`;
        setDashboardLocked(true);
        clearQueue();
        auth.signOutUser().catch(() => {});
        return;
      }

      if (elements.authUser) elements.authUser.textContent = user.email || user.displayName || "Signed in";
      setDashboardLocked(false);
      
      // Play startup sound once on enter
      if (!window.rpaStartupSoundPlayed) {
        window.rpaStartupSoundPlayed = true;
        const audio = new Audio("assets/startupsound.mp3");
        audio.volume = 0.3; // Lower the volume
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => console.warn("Startup sound blocked:", err));
        }
      }

      loadQueue();
    });
  }

  async function updateERPStatus(id, newStatus) {
    const firestore = store();
    if (!firestore) return;

    const updates = { erpStatus: newStatus };
    if (newStatus === "Processing") updates.rpaStatus = "In Progress";
    if (newStatus === "Success") updates.rpaStatus = "Submitted to ERP";
    if (newStatus === "Error") updates.rpaStatus = "Failed";
    if (newStatus === "Pending") updates.rpaStatus = "Ready for Bot";

    await firestore.updateCubeRequest(id, updates);
    await loadQueue();
  }

  async function toggleDisable(id) {
    const firestore = store();
    const form = state.forms.find((item) => item.id === id);
    if (!firestore || !form) return;

    const nextStatus = rpaStatus(form) === "Disabled" ? "Ready for Bot" : "Disabled";
    await firestore.updateCubeRequest(id, { rpaStatus: nextStatus });
    await loadQueue();
  }

  function changeDate(days) {
    const date = new Date(`${state.viewDate}T12:00:00+08:00`);
    date.setDate(date.getDate() + days);
    state.viewDate = getSGTDate(date);
    elements.datePicker.value = state.viewDate;
    renderQueue();
  }

  function exportArchiveName() {
    return `cubesync-rpa-test-data-${new Date().toISOString().slice(0, 10)}.zip`;
  }

  function exportAllForms() {
    const exporter = exportHelper();

    if (!exporter) {
      window.alert("CSV export is not available yet. Check the RPA dashboard scripts.");
      return;
    }

    const exportableForms = getExportableForms();

    if (!exportableForms.length) {
      window.alert("No enabled RPA forms are loaded for export.");
      return;
    }

    const originalLabel = elements.exportAllButton.textContent;
    elements.exportAllButton.disabled = true;
    elements.exportAllButton.textContent = "Exporting...";

    try {
      const files = exporter.buildExportFiles(exportableForms);
      exporter.downloadFilesAsZip(files, exportArchiveName());
    } catch (error) {
      window.alert(error.message || "Unable to export forms.");
    } finally {
      elements.exportAllButton.textContent = originalLabel;
      setExportButtonState();
    }
  }

  function bindElements() {
    [
      "authGate", "dashboardShell", "signInButton", "signOutButton", "authUser",
      "queueList", "prevDay", "todayBtn", "datePicker", "currentDateDisplay",
      "exportAllButton"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    if (initialized) return;
    initialized = true;

    bindElements();
    elements.datePicker.max = todaySGT;
    elements.datePicker.value = state.viewDate;
    renderQueue();

    elements.queueList.addEventListener("click", async function (event) {
      const button = event.target.closest("button[data-action]");
      const row = event.target.closest("tr[data-id]");
      const selector = event.target.closest("select[data-action]");

      if (selector || !row) return;

      const id = button && button.dataset.id ? button.dataset.id : row.dataset.id;

      if (button && button.dataset.action === "toggle-disable") {
        await toggleDisable(id);
        return;
      }

      window.location.href = `rpa-view.html?id=${encodeURIComponent(id)}`;
    });

    elements.queueList.addEventListener("change", async function (event) {
      const selector = event.target.closest("select[data-action='update-erp']");
      if (selector) {
        await updateERPStatus(selector.dataset.id, selector.value);
      }
    });

    elements.prevDay.addEventListener("click", () => changeDate(-1));
    elements.exportAllButton.addEventListener("click", exportAllForms);
    elements.todayBtn.addEventListener("click", () => {
      state.viewDate = todaySGT;
      elements.datePicker.value = todaySGT;
      renderQueue();
    });
    elements.datePicker.addEventListener("change", () => {
      state.viewDate = elements.datePicker.value;
      renderQueue();
    });

    bindAuthGate();
  });
})();
