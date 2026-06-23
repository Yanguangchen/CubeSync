(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncDashboardFilters = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Convert a dashboard date string into a comparable integer key (YYYYMMDD).
  // Accepts ISO (YYYY-MM-DD / YYYY/MM/DD) and day-first (DD-MM-YYYY / DD/MM/YYYY)
  // because `updatedAt` may arrive in either shape depending on the source.
  function parseDateKey(value) {
    if (value == null) {
      return NaN;
    }

    const text = String(value).trim();
    if (!text) {
      return NaN;
    }

    const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      return Number(isoMatch[1]) * 10000 + Number(isoMatch[2]) * 100 + Number(isoMatch[3]);
    }

    const dayFirstMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dayFirstMatch) {
      return Number(dayFirstMatch[3]) * 10000 + Number(dayFirstMatch[2]) * 100 + Number(dayFirstMatch[1]);
    }

    return NaN;
  }

  // Today's local date as a YYYY-MM-DD string (used as the default reference
  // for the "today only" filter when the caller does not supply one).
  function currentIsoDate(now) {
    const date = now instanceof Date ? now : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function distinctSorted(values) {
    const byKey = new Map();

    values.forEach((value) => {
      const text = (value == null ? "" : String(value)).trim();
      if (!text) {
        return;
      }
      const key = text.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, text);
      }
    });

    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }

  // Build the option lists for the Client and Project filter dropdowns from the
  // values actually present in the loaded forms (de-duplicated, sorted).
  function collectFilterOptions(forms) {
    const list = Array.isArray(forms) ? forms : [];
    return {
      clients: distinctSorted(list.map((form) => form && form.client)),
      projects: distinctSorted(list.map((form) => form && form.project))
    };
  }

  function matchesFacet(formValue, filterValue) {
    if (!filterValue || filterValue === "all") {
      return true;
    }
    const left = String(formValue == null ? "" : formValue).trim().toLowerCase();
    const right = String(filterValue).trim().toLowerCase();
    return left === right;
  }

  function barcodeSearchText(form) {
    const results = form && form.raw && Array.isArray(form.raw.results) ? form.raw.results : [];
    return results
      .map((row) => String((row && row.barcode) || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  function buildSearchText(form) {
    return [
      form.reportNo,
      form.client,
      form.project,
      form.grade,
      barcodeSearchText(form)
    ].join(" ").toLowerCase();
  }

  // Apply the dashboard's search box, status filter, Client/Project facet
  // filters, and date sort in one pass. Returns a new array; never mutates
  // the input. `criteria`: { search, status, client, project, sort }.
  function applyDashboardFilters(forms, criteria) {
    const list = Array.isArray(forms) ? forms.slice() : [];
    const options = criteria || {};
    const query = String(options.search || "").trim().toLowerCase();
    const status = options.status || "all";
    const client = options.client || "all";
    const project = options.project || "all";
    const sort = options.sort || "date-desc";
    const todayOnly = Boolean(options.todayOnly);
    const todayKey = todayOnly
      ? (parseDateKey(options.today) || parseDateKey(currentIsoDate()))
      : NaN;

    const filtered = list.filter((form) => {
      if (!form) {
        return false;
      }
      const statusMatch = status === "all" || form.status === status;
      const clientMatch = matchesFacet(form.client, client);
      const projectMatch = matchesFacet(form.project, project);
      const searchMatch = !query || buildSearchText(form).includes(query);
      const todayMatch = !todayOnly || parseDateKey(form.updatedAt) === todayKey;
      return statusMatch && clientMatch && projectMatch && searchMatch && todayMatch;
    });

    if (sort === "date-asc" || sort === "date-desc") {
      const direction = sort === "date-asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const keyA = parseDateKey(a.updatedAt);
        const keyB = parseDateKey(b.updatedAt);
        // Undated forms sort to the end regardless of direction.
        const valueA = Number.isNaN(keyA) ? -Infinity : keyA;
        const valueB = Number.isNaN(keyB) ? -Infinity : keyB;
        if (valueA === valueB) {
          return 0;
        }
        return valueA < valueB ? -direction : direction;
      });
    }

    return filtered;
  }

  return {
    parseDateKey: parseDateKey,
    currentIsoDate: currentIsoDate,
    collectFilterOptions: collectFilterOptions,
    applyDashboardFilters: applyDashboardFilters
  };
});
