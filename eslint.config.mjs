import js from "@eslint/js";

const browserGlobals = {
  FormData: "readonly",
  Intl: "readonly",
  Blob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  console: "readonly",
  document: "readonly",
  encodeURIComponent: "readonly",
  globalThis: "readonly",
  localStorage: "readonly",
  module: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

const nodeGlobals = {
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
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
      ".next/**"
    ]
  },
  js.configs.recommended,
  {
    files: [
      "app.js",
      "barcode.js",
      "cubesync-export.js",
      "cubesync-form-data.js",
      "dashboard.js",
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
    files: ["*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  }
];
