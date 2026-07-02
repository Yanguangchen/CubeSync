const { test, describe } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const {
  resultTableHeadHtml,
  resultRowHtml,
  seedResultRows,
  resultRowFieldNames
} = require("./cubesync-form-markup.js");

describe("cubesync-form-markup.js", () => {
  describe("resultTableHeadHtml", () => {
    test("generates table header with correct columns and action column", () => {
      const html = resultTableHeadHtml();
      assert.ok(html.includes('<th scope="col" data-result-field="setNo">Set No</th>'));
      assert.ok(html.includes('<th scope="col">Action</th>'));
      assert.ok(html.startsWith("<tr>"));
      assert.ok(html.endsWith("</tr>"));
    });
  });

  describe("resultRowHtml", () => {
    test("generates row HTML with correct row count in names and labels", () => {
      const html = resultRowHtml(42);
      assert.ok(html.includes('name="setNo42"'));
      assert.ok(html.includes('name="size42"'));
      assert.ok(html.includes('name="specimenRef42"'));
      assert.ok(html.includes('name="barcode42"'));
      assert.ok(html.includes('name="specifiedSlump42"'));
      assert.match(html, /type="text" name="meanSlump42"/);
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

  describe("resultRowFieldNames", () => {
    test("generates list of field names with correct row suffix", () => {
      const fieldNames = resultRowFieldNames(3);
      assert.deepEqual(fieldNames, [
        "setNo3",
        "size3",
        "specimenRef3",
        "barcode3",
        "specifiedSlump3",
        "meanSlump3",
        "resultGrade3",
        "resultDateOfCast3",
        "age3",
        "dateOfTest3",
        "invoiceNumber3"
      ]);
    });
  });
});
