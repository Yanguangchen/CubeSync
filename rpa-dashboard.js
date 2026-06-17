(function () {
  "use strict";

  const STORAGE_KEY = "cubesync.rpa.forms";
  
  // Get current date in Singapore Time (SGT)
  function getSGTDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function getSGTTime(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  const todaySGT = getSGTDate();

  const seedData = [
    {
      id: "rpa-001",
      reportNo: "RAK-CUBE-2406-001",
      client: "Acme Construction",
      project: "Bukit Batok BTO",
      submittedAt: todaySGT + "T08:32:00",
      validationStatus: "Validated",
      rpaStatus: "Submitted to ERP",
      erpStatus: "Success",
      erpReferenceNo: "ERP-99210",
      attemptCount: 1,
      lastError: "",
      history: [
        { time: todaySGT + "T08:45:00", event: "Bot picked up record" },
        { time: todaySGT + "T08:46:20", event: "Successfully posted to ERP. Ref: ERP-99210" }
      ]
    },
    {
      id: "rpa-002",
      reportNo: "RAK-CUBE-2406-002",
      client: "Northstar Builders",
      project: "Jurong Logistics",
      submittedAt: todaySGT + "T08:40:00",
      validationStatus: "Validated",
      rpaStatus: "Ready for Bot",
      erpStatus: "Pending",
      erpReferenceNo: "",
      attemptCount: 0,
      lastError: "",
      history: []
    },
    {
      id: "rpa-003",
      reportNo: "RAK-CUBE-2406-003",
      client: "Kinetic Civil",
      project: "Service Tunnel",
      submittedAt: todaySGT + "T09:15:00",
      validationStatus: "Validated",
      rpaStatus: "In Progress",
      erpStatus: "Processing",
      erpReferenceNo: "",
      attemptCount: 1,
      lastError: "",
      history: [
        { time: todaySGT + "T10:05:00", event: "Bot started processing" }
      ]
    },
    {
      id: "rpa-004",
      reportNo: "RAK-CUBE-2406-004",
      client: "BuildRight",
      project: "Changi Terminal 5",
      submittedAt: todaySGT + "T10:20:00",
      validationStatus: "Validated",
      rpaStatus: "Failed",
      erpStatus: "Error",
      erpReferenceNo: "",
      attemptCount: 3,
      lastError: "Connection timeout while accessing ERP portal",
      history: [
        { time: todaySGT + "T10:30:00", event: "Attempt 1: Network error" },
        { time: todaySGT + "T10:45:00", event: "Attempt 2: Timeout" },
        { time: todaySGT + "T11:00:00", event: "Attempt 3: Fatal timeout" }
      ]
    },
    // Old failure for the warning banner
    {
      id: "rpa-old-001",
      reportNo: "RAK-CUBE-2406-999",
      client: "Legacy Corp",
      project: "Old Project",
      submittedAt: "2026-06-15T14:00:00",
      validationStatus: "Validated",
      rpaStatus: "Failed",
      erpStatus: "Error",
      erpReferenceNo: "",
      attemptCount: 5,
      lastError: "Invalid project code in ERP",
      history: []
    }
  ];

  const state = {
    forms: loadForms(),
    viewDate: todaySGT,
    selectedId: null
  };

  const elements = {};

  function loadForms() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
      return seedData;
    }
    return JSON.parse(stored);
  }

  function saveForms() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.forms));
  }

  function getFilteredQueue() {
    return state.forms
      .filter(f => f.submittedAt.startsWith(state.viewDate))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)); // Oldest first
  }

  function getStatusClass(status) {
    if (status === "Ready for Bot") return "status-ready";
    if (status === "In Progress") return "status-processing";
    if (status === "Submitted to ERP") return "status-ready";
    if (status === "Failed") return "status-failed";
    return "";
  }

      const erpStatusSelector = isDisabled ? 
        '<span class="status-pill status-failed">Disabled</span>' : 
        `
        <select data-action="update-erp" data-id="${form.id}" class="erp-selector">
          <option value="Pending" ${form.erpStatus === "Pending" ? "selected" : ""}>Pending</option>
          <option value="Processing" ${form.erpStatus === "Processing" ? "selected" : ""}>Processing</option>
          <option value="Success" ${form.erpStatus === "Success" ? "selected" : ""}>Success</option>
          <option value="Error" ${form.erpStatus === "Error" ? "selected" : ""}>Error</option>
        </select>
        `;
      
      return `
        <tr data-id="${form.id}" tabindex="0" class="${rowClass}">
          <td><strong>${time}</strong></td>
          <td>${form.reportNo}</td>
          <td>${form.client}</td>
          <td>${form.project}</td>
          <td>${erpStatusSelector}</td>
          <td>${form.attemptCount}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-action="open">Open Form</button>
              <button type="button" class="${isDisabled ? '' : 'danger'}" data-action="toggle-disable" data-id="${form.id}">
                ${isDisabled ? 'Enable RPA' : 'Disable RPA'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    elements.queueList.innerHTML = rows || `<tr><td colspan="7">No records submitted for this date.</td></tr>`;
    
    // Update date display
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateObj = new Date(state.viewDate);
    elements.currentDateDisplay.textContent = dateObj.toLocaleDateString('en-SG', options);
    
    // Update button states
    elements.todayBtn.classList.toggle("active", state.viewDate === todaySGT);
  }

  function updateERPStatus(id, newStatus) {
    const form = state.forms.find(f => f.id === id);
    if (!form) return;

    form.erpStatus = newStatus;
    if (newStatus === "Processing") {
      form.rpaStatus = "In Progress";
    } else if (newStatus === "Success") {
      form.rpaStatus = "Submitted to ERP";
    } else if (newStatus === "Error") {
      form.rpaStatus = "Failed";
    }
    
    saveForms();
    renderQueue();
  }

  function toggleDisable(id) {
    const form = state.forms.find(f => f.id === id);
    if (!form) return;

    if (form.rpaStatus === "Disabled") {
      form.rpaStatus = "Ready for Bot"; // Or restore previous status
    } else {
      form.rpaStatus = "Disabled";
    }
    saveForms();
    renderQueue();
  }

  function changeDate(days) {
    const date = new Date(state.viewDate);
    date.setDate(date.getDate() + days);
    state.viewDate = getSGTDate(date);
    elements.datePicker.value = state.viewDate;
    renderQueue();
  }

  function bindElements() {
    [
      "queueList", "prevDay", "todayBtn", "nextDay", "datePicker", "currentDateDisplay"
    ].forEach(id => {
      elements[id] = document.getElementById(id);
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    bindElements();
    elements.datePicker.value = state.viewDate;
    renderQueue();

    elements.queueList.addEventListener("click", e => {
      const btn = e.target.closest("button[data-action]");
      const row = e.target.closest("tr[data-id]");
      const selector = e.target.closest("select[data-action]");
      
      if (selector) return; // Handled by change event

      if (!row) return;

      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id || row.dataset.id;

        if (action === "open") {
          window.location.href = `rpa-view.html?id=${id}`;
        } else if (action === "toggle-disable") {
          toggleDisable(id);
        }
      } else {
        // Row click defaults to opening the form
        window.location.href = `rpa-view.html?id=${row.dataset.id}`;
      }
    });

    elements.queueList.addEventListener("change", e => {
      const selector = e.target.closest("select[data-action='update-erp']");
      if (selector) {
        updateERPStatus(selector.dataset.id, selector.value);
      }
    });

    elements.prevDay.addEventListener("click", () => changeDate(-1));
    elements.nextDay.addEventListener("click", () => changeDate(1));
    elements.todayBtn.addEventListener("click", () => {
      state.viewDate = todaySGT;
      elements.datePicker.value = todaySGT;
      renderQueue();
    });

    elements.datePicker.addEventListener("change", () => {
      state.viewDate = elements.datePicker.value;
      renderQueue();
    });

    // Theme toggle (reused from main dashboard)
    const themeToggle = document.getElementById("themeToggle");
    function applyTheme(theme) {
      const isLight = theme === "light";
      document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
      localStorage.setItem("theme", isLight ? "light" : "dark");
      if (themeToggle) themeToggle.checked = isLight;
    }
    applyTheme(localStorage.getItem("theme") || "light");
    if (themeToggle) {
      themeToggle.addEventListener("change", () => applyTheme(themeToggle.checked ? "light" : "dark"));
    }
  });
})();
