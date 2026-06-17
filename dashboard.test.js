const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("dashboard frontend exposes form CRUD controls", () => {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const css = fs.readFileSync("dashboard.css", "utf8");
  const js = fs.readFileSync("dashboard.js", "utf8");

  assert.match(html, /<title>Dashboard<\/title>/);
  assert.match(html, /<h1>Dashboard<\/h1>/);
  assert.doesNotMatch(html, /<h1>Concrete Cube Dashboard<\/h1>/);
  assert.match(html, /dashboard\.css/);
  assert.match(html, /dashboard\.js/);
  assert.match(html, /assets\/logoBanner\.png/);
  assert.match(html, /formList/);
  assert.match(html, /detailPanel/);
  assert.match(html, /editDialog/);
  assert.match(html, /printArea/);
  assert.match(html, /New Original Form/);
  assert.match(html, /New Glassmorphic Form/);

  for (const action of ["View", "Edit", "Print", "Delete"]) {
    assert.match(js, new RegExp(`data-action=\\"${action.toLowerCase()}\\"`));
  }

  assert.match(js, /localStorage/);
  assert.match(js, /renderForms/);
  assert.match(js, /openEditor/);
  assert.match(js, /deleteForm/);
  assert.match(js, /printForm/);
  assert.match(css, /\.dashboard-shell/);
  assert.match(css, /\.dashboard-logo/);
  assert.match(css, /\.form-table/);
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /rgba\(255, 255, 255, 0\./);
  assert.match(css, /linear-gradient/);
  assert.match(css, /\.glass-panel/);
});
