import js from "@eslint/js";

const browserGlobals = {
  FormData: "readonly",
  Intl: "readonly",
  Audio: "readonly",
  Blob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  ImageData: "readonly",
  Event: "readonly",
  requestAnimationFrame: "readonly",
  console: "readonly",
  document: "readonly",
  encodeURIComponent: "readonly",
  fetch: "readonly",
  globalThis: "readonly",
  localStorage: "readonly",
  module: "readonly",
  navigator: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

const nodeGlobals = {
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
  FormData: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
  setTimeout: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "public/**",
      "env.js",
      ".next/**"
    ]
  },
  js.configs.recommended,
  {
    files: [
      "app.js",
      "barcode.js",
      "chime.js",
      "cubesync-autocomplete.js",
      "cubesync-export.js",
      "cubesync-form-data.js",
      "cubesync-form-markup.js",
      "cubesync-table-manager.js",
      "cubesync-dashboard-filters.js",
      "cubesync-heatmap.js",
      "cubesync-metrics.js",
      "cubesync-notifications.js",
      "cubesync-today-toggle.js",
      "dashboard.js",
      "env.example.js",
      "rpa-dashboard.js",
      "rpa-view.js"
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals
    }
  },
  {
    files: ["firestore.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals
    }
  },
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        caches: "readonly",
        clients: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        self: "readonly",
        URL: "readonly"
      }
    }
  },
  {
    files: ["*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  },
  {
    files: ["scripts/*.js", "api/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...nodeGlobals,
        fetch: "readonly",
        URLSearchParams: "readonly"
      }
    }
  }
];
