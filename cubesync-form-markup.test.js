const { test, describe } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { resultRowHtml, seedResultRows } = require("./cubesync-form-markup.js");

describe("cubesync-form-markup.js", () => {
  describe("resultRowHtml", () => {
    test("generates row HTML with correct row count in names and labels", () => {
      const html = resultRowHtml(42);
      assert.ok(html.includes('name="setNo42"'));
      assert.ok(html.includes('name="size42"'));
      assert.ok(html.includes('name="specimenRef42"'));
      assert.ok(html.includes('name="barcode42"'));
      assert.ok(html.includes('name="specifiedSlump42"'));
      assert.ok(html.includes('aria-label="Row 42 barcode text"'));
      assert.ok(html.includes('aria-label="Remove row 42"'));
    });
  });

  describe("seedResultRows", () => {
    test("generates wrapper tr elements containing resultRowHtml", () => {
      const dom = new JSDOM("<table><tbody></tbody></table>");
      const previousDocument = global.document;
      global.document = dom.window.document;

      try {
        const tableBody = dom.window.document.querySelector("tbody");
        seedResultRows(tableBody, 2);
        const html = tableBody.innerHTML;

        assert.ok(html.includes("<tr>"));
        assert.ok(html.includes("</tr>"));
        assert.ok(html.includes('name="setNo1"'));
        assert.ok(html.includes('name="setNo2"'));
        assert.ok(!html.includes('name="setNo3"'));
      } finally {
        global.document = previousDocument;
      }
    });
  });
});
