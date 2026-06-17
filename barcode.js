(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncBarcode = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const START_CODE_B = 104;
  const STOP_CODE = 106;
  const MIN_PRINTABLE_ASCII = 32;
  const MAX_CODE_B_ASCII = 126;

  const CODE_128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222",
    "122213", "122312", "132212", "221213", "221312", "231212",
    "112232", "122132", "122231", "113222", "123122", "123221",
    "223211", "221132", "221231", "213212", "223112", "312131",
    "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321",
    "112313", "132113", "132311", "211313", "231113", "231311",
    "112133", "112331", "132131", "113123", "113321", "133121",
    "313121", "211331", "231131", "213113", "213311", "213131",
    "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124",
    "121421", "141122", "141221", "112214", "112412", "122114",
    "122411", "142112", "142211", "241211", "221114", "413111",
    "241112", "134111", "111242", "121142", "121241", "114212",
    "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113",
    "114311", "411113", "411311", "113141", "114131", "311141",
    "411131", "211412", "211214", "211232", "2331112"
  ];

  function sanitizeBarcodeText(value) {
    return String(value || "").trim();
  }

  function toCode128BValue(character, index) {
    const charCode = character.charCodeAt(0);

    if (charCode < MIN_PRINTABLE_ASCII || charCode > MAX_CODE_B_ASCII) {
      throw new RangeError(
        `Barcode text must use Code 128-B printable ASCII characters; unsupported character at position ${index + 1}.`
      );
    }

    return charCode - MIN_PRINTABLE_ASCII;
  }

  function encodeCode128B(value) {
    const input = sanitizeBarcodeText(value);

    if (!input) {
      return {
        input,
        codes: [],
        checksum: null,
        pattern: ""
      };
    }

    const values = Array.from(input, toCode128BValue);
    const weightedTotal = values.reduce(
      (total, codeValue, index) => total + codeValue * (index + 1),
      START_CODE_B
    );
    const checksum = weightedTotal % 103;
    const codes = [START_CODE_B, ...values, checksum, STOP_CODE];

    return {
      input,
      codes,
      checksum,
      pattern: codes.map((code) => CODE_128_PATTERNS[code]).join("")
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderBarcodeSvg(value, options) {
    const settings = Object.assign({
      height: 54,
      moduleWidth: 1.45,
      quietZoneModules: 10,
      includeText: false
    }, options || {});
    const encoded = encodeCode128B(value);

    if (!encoded.pattern) {
      return "";
    }

    const textHeight = settings.includeText ? 14 : 0;
    const barHeight = Math.max(12, settings.height - textHeight);
    const quietZone = settings.quietZoneModules * settings.moduleWidth;
    const moduleCount = Array.from(encoded.pattern).reduce(
      (total, width) => total + Number(width),
      0
    );
    const width = moduleCount * settings.moduleWidth + quietZone * 2;
    let x = quietZone;
    let isBar = true;
    const bars = [];

    for (const widthValue of encoded.pattern) {
      const elementWidth = Number(widthValue) * settings.moduleWidth;

      if (isBar) {
        bars.push(
          `<rect x="${x.toFixed(2)}" y="0" width="${elementWidth.toFixed(2)}" height="${barHeight}" />`
        );
      }

      x += elementWidth;
      isBar = !isBar;
    }

    const safeInput = escapeHtml(encoded.input);
    const label = settings.includeText
      ? `<text x="${(width / 2).toFixed(2)}" y="${settings.height - 2}" text-anchor="middle">${safeInput}</text>`
      : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(2)}" height="${settings.height}" role="img" aria-label="Barcode for ${safeInput}" viewBox="0 0 ${width.toFixed(2)} ${settings.height}" preserveAspectRatio="xMidYMid meet"><rect class="barcode-background" x="0" y="0" width="${width.toFixed(2)}" height="${settings.height}" fill="#fff" />${bars.join("")}${label}</svg>`;
  }

  return {
    CODE_128_PATTERNS,
    encodeCode128B,
    renderBarcodeSvg,
    sanitizeBarcodeText
  };
});
