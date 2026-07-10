(function () {
  "use strict";

  // Dedicated metrics page. The operational metrics dashboard and submission
  // heatmap used to live on the human dashboard; they were split out here so
  // the dashboard stays focused on the request list. This script owns its own
  // auth gate and Firestore subscription, and reuses the shared CubeSyncMetrics
  // and CubeSyncHeatmap helpers for the actual analytics.

  const state = {
    records: [],
    heatmapMode: "weekly",
    loading: false
  };

  const elements = {};
  let initialized = false;
  let recordsUnsubscribe = null;

  function metricsHelper() {
    return window.CubeSyncMetrics;
  }

  function heatmapHelper() {
    return window.CubeSyncHeatmap;
  }

  function authHelper() {
    return window.CubeSyncAuth;
  }

  function formStore() {
    return window.CubeSyncFirestore;
  }

  function observability() {
    return window.CubeSyncObservability ||
      (window.CubeSyncFormData && window.CubeSyncFormData.Observability) || null;
  }

  function logObs(context) {
    const obs = observability();
    if (obs && typeof obs.logClientEvent === "function") {
      obs.logClientEvent(context);
    }
  }

  function formatObsError(error, fallback) {
    const obs = observability();
    if (obs && typeof obs.formatClientError === "function") {
      return obs.formatClientError(error, fallback);
    }
    return error ? error.message || fallback : fallback;
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

  function formatMetricNumber(value, options) {
    if (typeof value === "string") {
      return value;
    }
    const opts = options || {};
    const numeric = Number(value || 0);
    const digits = opts.maximumFractionDigits == null ? 0 : opts.maximumFractionDigits;
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: opts.minimumFractionDigits || 0,
      maximumFractionDigits: digits
    });
  }

  function workloadSignalLabel(signal) {
    if (signal === "high") return "Unusually high activity";
    if (signal === "low") return "Unusually quiet activity";
    return "Activity within expected range";
  }

  function workloadTrendLabel(trend) {
    if (trend === "rising") return "Rising trend";
    if (trend === "falling") return "Falling trend";
    return "Steady trend";
  }

  function formatWorkloadPeriodList(periods) {
    if (!Array.isArray(periods) || periods.length === 0) return "Not enough history yet";
    return periods.map((period) => period.label + " (avg " + formatMetricNumber(period.average, { maximumFractionDigits: 1 }) + ")").join(", ");
  }

  function renderWorkloadChart(points, upcoming) {
    const history = Array.isArray(points) ? points : [];
    const forecast = Array.isArray(upcoming) ? upcoming : [];
    const combined = history.map((point) => Number(point.count || 0))
      .concat(forecast.map((point) => Number(point.expected || 0)));
    const max = Math.max(1, ...combined);
    const chartWidth = 560;
    const chartHeight = 160;
    const padding = 18;
    const plotWidth = chartWidth - (padding * 2);
    const plotHeight = chartHeight - (padding * 2);
    const historyCount = history.length;
    const totalPoints = historyCount + forecast.length;
    if (totalPoints === 0) {
      return '<div class="workload-chart-empty">No dated submissions yet.</div>';
    }

    function pointFor(index, value) {
      const denominator = Math.max(1, totalPoints - 1);
      const x = padding + ((index / denominator) * plotWidth);
      const y = padding + (plotHeight - ((Number(value || 0) / max) * plotHeight));
      return x.toFixed(1) + "," + y.toFixed(1);
    }

    const historyPoints = history.map((point, index) => pointFor(index, point.count)).join(" ");
    const forecastPoints = forecast.map((point, index) => pointFor(historyCount + index, point.expected)).join(" ");
    const separatorX = historyCount > 0 ? padding + ((Math.max(0, historyCount - 1) / Math.max(1, totalPoints - 1)) * plotWidth) : padding;
    const latestHistory = history.length ? history[history.length - 1] : null;
    const forecastTitle = forecast.length
      ? "Forecast: " + forecast.map((point) => point.label + " " + formatMetricNumber(point.expected, { maximumFractionDigits: 1 })).join(", ")
      : "Forecast unavailable";

    return `
      <svg class="workload-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Historical workload and seven day forecast line chart">
        <title>Historical workload and seven day forecast</title>
        <desc>${escapeHtml(forecastTitle)}</desc>
        <line class="workload-chart-axis" x1="${padding}" y1="${chartHeight - padding}" x2="${chartWidth - padding}" y2="${chartHeight - padding}"></line>
        <line class="workload-chart-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${chartHeight - padding}"></line>
        ${historyPoints ? `<polyline class="workload-chart-history" points="${historyPoints}"></polyline>` : ""}
        ${latestHistory && forecastPoints ? `<polyline class="workload-chart-forecast" points="${pointFor(historyCount - 1, latestHistory.count)} ${forecastPoints}"></polyline>` : ""}
        <line class="workload-chart-separator" x1="${separatorX.toFixed(1)}" y1="${padding}" x2="${separatorX.toFixed(1)}" y2="${chartHeight - padding}"></line>
        <text class="workload-chart-label" x="${padding}" y="${chartHeight - 4}">Past 28 days</text>
        <text class="workload-chart-label workload-chart-label-end" x="${chartWidth - padding}" y="${chartHeight - 4}">Next 7 days</text>
      </svg>
    `;
  }

  function renderWorkloadInsight(insight) {
    const panel = elements.workloadInsight;
    if (!panel) return;
    if (!insight) {
      panel.innerHTML = "";
      return;
    }
    const busiestUpcoming = insight.busiestUpcoming || { label: "—", expected: 0 };
    panel.innerHTML = `
      <article class="workload-insight-card workload-insight-${escapeHtml(insight.activitySignal || "normal")}">
        <div class="workload-insight-copy">
          <p class="metric-label">Predictive workload insight</p>
          <h3>${escapeHtml(workloadSignalLabel(insight.activitySignal))}</h3>
          <p>
            Expected tomorrow: <strong>${escapeHtml(formatMetricNumber(insight.expectedTomorrow, { maximumFractionDigits: 1 }))} forms</strong> ·
            ${escapeHtml(workloadTrendLabel(insight.trend))} ·
            28-day baseline: ${escapeHtml(formatMetricNumber(insight.recentAverage, { maximumFractionDigits: 1 }))} forms/day.
          </p>
          <dl class="workload-insight-list">
            <div><dt>Recurring busy periods</dt><dd>${escapeHtml(formatWorkloadPeriodList(insight.busyPeriods))}</dd></div>
            <div><dt>Quiet periods</dt><dd>${escapeHtml(formatWorkloadPeriodList(insight.quietPeriods))}</dd></div>
            <div><dt>Next likely peak</dt><dd>${escapeHtml(busiestUpcoming.label)} · ${escapeHtml(formatMetricNumber(busiestUpcoming.expected, { maximumFractionDigits: 1 }))} expected forms</dd></div>
          </dl>
        </div>
        <div class="workload-chart-wrap">${renderWorkloadChart(insight.chart, insight.upcoming)}</div>
      </article>
    `;
  }

  function renderMetrics() {
    const grid = elements.metricsGrid;
    if (!grid) {
      return;
    }

    const helper = metricsHelper();
    if (!helper || typeof helper.buildMetrics !== "function") {
      grid.innerHTML = "";
      renderWorkloadInsight(null);
      if (elements.metricsSummary) {
        elements.metricsSummary.textContent = "Metrics are unavailable until the metrics helper loads.";
      }
      return;
    }

    const metrics = helper.buildMetrics(state.records);
    const peakLabel = metrics.peakPeriods.length
      ? metrics.peakPeriods.slice(0, 2).map((period) => period.label).join(", ")
      : "—";
    const peakDetail = metrics.peakCount > 0
      ? metrics.peakCount + " submission" + (metrics.peakCount === 1 ? "" : "s") + " at peak"
      : "No dated submissions yet";

    const cards = [
      { label: "Today", value: metrics.dailyCount, detail: "Form submissions today" },
      { label: "This week", value: metrics.weeklyCount, detail: "Form submissions this week" },
      { label: "This month", value: metrics.monthlyCount, detail: "Form submissions this month" },
      {
        label: "Avg / day",
        value: formatMetricNumber(metrics.averagePerDay, { maximumFractionDigits: 1 }),
        detail: "Across dated records in view"
      },
      {
        label: "Expected tomorrow",
        value: formatMetricNumber(metrics.workloadInsight.expectedTomorrow, { maximumFractionDigits: 1 }),
        detail: workloadTrendLabel(metrics.workloadInsight.trend)
      },
      { label: "Peak period", value: peakLabel, detail: peakDetail, wide: true },
      { label: "Total records", value: metrics.totalRecords, detail: "Records in the current view" },
      { label: "Processed", value: metrics.processedCount, detail: "ERP success, submitted, or archived" },
      { label: "Manual review", value: metrics.manualReviewCount, detail: "Free-text or failed/error records" }
    ];

    grid.innerHTML = cards.map((card) => `
      <article class="metric-card${card.wide ? " metric-card-wide" : ""}">
        <span class="metric-label">${escapeHtml(card.label)}</span>
        <strong class="metric-value">${escapeHtml(formatMetricNumber(card.value))}</strong>
        <span class="metric-detail">${escapeHtml(card.detail)}</span>
      </article>
    `).join("");

    renderWorkloadInsight(metrics.workloadInsight);

    if (elements.metricsSummary) {
      const total = metrics.totalRecords;
      if (total === 0) {
        elements.metricsSummary.textContent = "No records match the current filters yet.";
      } else {
        elements.metricsSummary.textContent =
          formatMetricNumber(total) + " records in view · " +
          formatMetricNumber(metrics.processedCount) + " processed · " +
          formatMetricNumber(metrics.manualReviewCount) + " requiring review.";
      }
    }
  }

  // Compact axis label for a bucket, e.g. "9 AM" -> "9a", "Monday" -> "Mon".
  function heatmapShortLabel(label, mode) {
    if (mode === "daily") {
      const match = /^(\d+)\s*(AM|PM)$/.exec(label);
      if (match) {
        return match[1] + (match[2] === "AM" ? "a" : "p");
      }
      return label;
    }
    return label.slice(0, 3);
  }

  function renderHeatmap() {
    const grid = elements.heatmapGrid;
    if (!grid) {
      return;
    }

    const helper = heatmapHelper();
    if (!helper || typeof helper.buildHeatmap !== "function") {
      grid.innerHTML = "";
      return;
    }

    const result = helper.buildHeatmap(state.records, { mode: state.heatmapMode });
    grid.className = "heatmap-grid heatmap-grid-" + result.mode;

    grid.innerHTML = result.buckets.map((bucket) => {
      const countLabel = bucket.count + " submission" + (bucket.count === 1 ? "" : "s");
      const title = bucket.label + ": " + countLabel;
      const busiest = result.busiest && result.busiest.key === bucket.key && result.max > 0;
      const emptyClass = bucket.count === 0 ? " is-empty" : "";
      const busyClass = busiest ? " is-busiest" : "";
      return `
        <div class="heatmap-cell${emptyClass}${busyClass}" style="--heat: ${bucket.intensity.toFixed(3)}" title="${escapeHtml(title)}" role="img" aria-label="${escapeHtml(title)}">
          <span class="heatmap-cell-bar" aria-hidden="true"></span>
          <span class="heatmap-cell-count">${bucket.count}</span>
          <span class="heatmap-cell-label">${escapeHtml(heatmapShortLabel(bucket.label, result.mode))}</span>
        </div>`;
    }).join("");

    if (elements.heatmapSummary) {
      if (result.total === 0) {
        elements.heatmapSummary.textContent = "No submissions match the current filters yet.";
      } else if (result.busiest) {
        const totalLabel = result.total + " submission" + (result.total === 1 ? "" : "s");
        elements.heatmapSummary.textContent =
          "Busiest: " + result.busiest.label + " (" + result.busiest.count + " of " + totalLabel + ").";
      }
    }
  }

  function render() {
    renderMetrics();
    renderHeatmap();
  }

  // Real-time subscription over the raw Firestore records. The metrics and
  // heatmap helpers read the original submission timestamps straight off the
  // raw documents, so no dashboard normalization is needed here.
  function applyRecords(records) {
    state.records = Array.isArray(records) ? records : [];
    state.loading = false;
    render();
    logObs({
      feature: "MetricsPage",
      functionName: "applyRecords",
      operation: "listCubeRequests",
      status: "success",
      category: "DatabaseRead"
    });
  }

  function handleRecordsError(error) {
    state.loading = false;
    state.records = [];
    render();
    logObs({
      feature: "MetricsPage",
      functionName: "startRecords",
      operation: "listCubeRequests",
      status: "failed",
      category: "DatabaseRead",
      error: error
    });
    setSurfaceStatus(
      elements.topbarStatus,
      formatObsError(error, "Unable to load metrics from Firestore."),
      "error"
    );
  }

  function stopRecordsSubscription() {
    if (typeof recordsUnsubscribe === "function") {
      recordsUnsubscribe();
    }
    recordsUnsubscribe = null;
  }

  function startRecords() {
    const store = formStore();
    if (!store) {
      setSurfaceStatus(elements.topbarStatus, "Firestore services are unavailable.", "error");
      return;
    }

    stopRecordsSubscription();
    state.loading = true;

    if (typeof store.watchCubeRequests === "function") {
      recordsUnsubscribe = store.watchCubeRequests(
        (records) => applyRecords(records),
        (error) => handleRecordsError(error)
      );
      return;
    }

    if (typeof store.listCubeRequests === "function") {
      store.listCubeRequests()
        .then((records) => applyRecords(records))
        .catch((error) => handleRecordsError(error));
    }
  }

  function setLocked(locked) {
    if (elements.authGate) {
      elements.authGate.classList.toggle("is-hidden", !locked);
    }
    if (elements.metricsShell) {
      elements.metricsShell.classList.toggle("is-hidden", locked);
    }
  }

  function clearMetrics() {
    stopRecordsSubscription();
    state.records = [];
    render();
  }

  function bindAuthGate() {
    const auth = authHelper();
    const authMessage = elements.authGate
      ? elements.authGate.querySelector("p:not(.eyebrow)")
      : null;

    if (!auth) {
      setLocked(true);
      if (authMessage) {
        authMessage.textContent = "Firebase Auth is not available. Check the Firebase SDK script.";
      }
      setSurfaceStatus(elements.authGateStatus, "Authentication services are unavailable.", "error");
      return;
    }

    if (elements.signInButton) {
      elements.signInButton.addEventListener("click", async function () {
        setSurfaceStatus(elements.authGateStatus, "Starting Google sign-in...", "info");
        const connectivity = window.CubeSyncConnectivity;
        elements.signInButton.classList.add("is-busy");
        elements.signInButton.disabled = true;
        elements.signInButton.setAttribute("aria-busy", "true");
        if (connectivity) connectivity.showLoader();
        try {
          await auth.signInWithGoogle();
        } catch (error) {
          logObs({
            feature: "MetricsPage",
            functionName: "bindAuthGate",
            operation: "signInWithGoogle",
            status: "failed",
            category: "AuthenticationCheck",
            error: error
          });
          setSurfaceStatus(elements.authGateStatus, formatObsError(error, "Unable to sign in with Google."), "error");
        } finally {
          elements.signInButton.classList.remove("is-busy");
          elements.signInButton.disabled = false;
          elements.signInButton.setAttribute("aria-busy", "false");
          if (connectivity) connectivity.hideLoader();
        }
      });
    }

    if (elements.signOutButton) {
      elements.signOutButton.addEventListener("click", async function () {
        setSurfaceStatus(elements.topbarStatus, "Signing out...", "info");
        try {
          await auth.signOutUser();
        } catch (error) {
          setSurfaceStatus(elements.topbarStatus, formatObsError(error, "Unable to sign out."), "error");
        }
      });
    }

    auth.onAuthChange(function (user) {
      if (!user) {
        if (elements.authUser) elements.authUser.textContent = "";
        if (authMessage) authMessage.textContent = "Use your Google account to access Firestore-backed dashboards.";
        clearSurfaceStatus(elements.topbarStatus);
        setLocked(true);
        clearMetrics();
        return;
      }

      if (!auth.isAllowedUser(user)) {
        if (elements.authUser) elements.authUser.textContent = "";
        if (authMessage) authMessage.textContent = `${user.email || "This Google account"} is not allowed for CubeSync.`;
        setSurfaceStatus(elements.authGateStatus, "This account does not have dashboard access.", "warning");
        setLocked(true);
        clearMetrics();
        auth.signOutUser().catch(() => {});
        return;
      }

      if (elements.authUser) elements.authUser.textContent = user.email || user.displayName || "Signed in";
      clearSurfaceStatus(elements.authGateStatus);
      setLocked(false);
      startRecords();
    });
  }

  function bindHeatmapModes() {
    const heatmapModeButtons = document.querySelectorAll("[data-heatmap-mode]");
    heatmapModeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        state.heatmapMode = button.getAttribute("data-heatmap-mode");
        heatmapModeButtons.forEach((other) => {
          const active = other === button;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-pressed", active ? "true" : "false");
        });
        renderHeatmap();
      });
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

  function bindMenu() {
    if (!elements.menuToggle || !elements.dropdownMenu) {
      return;
    }
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
    });
  }

  function bindElements() {
    [
      "authGate", "metricsShell", "signInButton", "signOutButton", "authUser",
      "authGateStatus", "topbarStatus",
      "metricsGrid", "metricsSummary", "workloadInsight",
      "heatmapGrid", "heatmapSummary",
      "menuToggle", "dropdownMenu"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    if (initialized) {
      return;
    }
    initialized = true;
    bindElements();
    render();
    bindHeatmapModes();
    bindThemeToggle();
    bindMenu();
    bindAuthGate();
    logObs({
      feature: "MetricsPage",
      functionName: "init",
      operation: "pageView",
      status: "success",
      category: "PageView"
    });
  });
})();
