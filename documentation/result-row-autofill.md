# Test result row auto-fill

Two helpers in the **TEST RESULTS** table save clients from retyping the same text on every row:

1. **Specimen Ref #**: type the first ref (`CUBE-01`, `123-A`, `20261002-001A`, …) and the rows below count on from it.
2. **Barcode**: once one barcode is entered (`PYY-0002/00166`), the project code (`PYY-0002/`) is carried into the barcodes below, so only the running number is typed.

Both run on the public **Original** (`index.html`) and **Digital** (`glassmorphic.html`) forms. The dashboard editor uses the same table manager, so staff get the same behaviour when editing a submission.

Neither helper restricts what can be typed. Any value can still be entered in any row and is saved exactly as typed. The rules below only decide **when rows are filled automatically**.

---

## 1. Specimen Ref #

### 1.1 Anatomy of a ref

A specimen ref has three parts:

```
 20261002 - 001A
 └──┬───┘ │ └┬─┘
 reference│ sequence
       delimiter
```

| Part | What it is | Rules |
|------|------------|-------|
| **Specimen reference** | Identifies the specimen group | Anything: letters, digits, spaces, symbols, even other dashes. Kept exactly as typed. May be empty. |
| **Delimiter** | A hyphen-minus `-` | The **last** `-` in the ref is the delimiter. Spaces right after it are allowed. |
| **Sequence** | What counts up from row to row | One of three shapes (below). Must run to the end of the ref. |

The three sequence shapes:

| Shape | Examples | What steps |
|-------|----------|------------|
| **Number** | `1`, `01`, `001`, `12` | The whole number, keeping zero padding |
| **Single letter** | `A`, `b` | The letter, keeping case, A → Z |
| **Number + single letter** | `001A`, `1b`, `12C` | Only the letter; the number stays fixed |

### 1.2 The regex

The ref is trimmed of leading and trailing spaces, then matched against:

```js
/^(.*-\s*)(?:(\d+)|(\d*)([A-Za-z]))$/
```

| Group | Pattern | Meaning |
|-------|---------|---------|
| 1 | `(.*-\s*)` | Specimen reference plus delimiter. `.*` is greedy, so it runs to the **last** `-`. Spaces after the `-` belong here. |
| 2 | `(\d+)` | **Number** sequence: one or more digits 0–9 |
| 3 | `(\d*)` | Optional fixed number in front of a letter (may be empty) |
| 4 | `([A-Za-z])` | **Letter** sequence: exactly one ASCII letter |

Groups 2 and 3–4 are alternatives: the sequence is either a number (group 2) or optional digits followed by one letter (groups 3 + 4).

### 1.3 How the next ref is built

| Matched | Next ref | Detail |
|---------|----------|--------|
| Number (group 2) | reference + number + 1 | Width is kept (`01` → `02`, `09` → `10`, `001` → `002`). Grows by a digit only when it must (`99` → `100`, `999` → `1000`). Exact for numbers of any length. |
| Letter, no number (group 4) | reference + next letter | Case is kept (`A` → `B`, `c` → `d`). |
| Number + letter (groups 3 + 4) | reference + same number + next letter | `001A` → `001B`. The number never changes. |
| Letter is `Z` or `z` | *blank* | Letters stop at Z. Nothing rolls over (`CUBE-Z` does not become `CUBE-AA`; `001Z` does not become `002A`). |
| No match | *blank* | There is nothing to count on. |

### 1.4 Accepted: number sequence

| Row 1 typed | Next row | Note |
|-------------|----------|------|
| `CUBE-01` | `CUBE-02` | Letters, dash, number |
| `CUBE-1` | `CUBE-2` | No zero padding |
| `CUBE-0` | `CUBE-1` | Can start at 0 |
| `CUBE-09` | `CUBE-10` | Carries over, width kept |
| `CUBE-99` | `CUBE-100` | Grows by a digit when needed |
| `CUBE-001` | `CUBE-002` | Zero padding kept |
| `cube-01` | `cube-02` | Reference case kept |
| `TT-1` | `TT-2` | Short reference |
| `123-1` | `123-2` | Numeric reference |
| `123-9` | `123-10` | Numeric reference, carry over |
| `123-001` | `123-002` | Numeric reference, padding kept |
| `1-1` | `1-2` | One-digit reference |
| `A-1` | `A-2` | One-letter reference |
| `PYY-0002-1` | `PYY-0002-2` | Reference contains a dash; the last dash is the delimiter |
| `S1-A-3` | `S1-A-4` | Several dashes |
| `CUBE/A-1` | `CUBE/A-2` | Other symbols in the reference |
| `BLK 5-1` | `BLK 5-2` | Space inside the reference |
| `TT - 1` | `TT - 2` | Spaces on both sides of the dash |
| `TT -1` | `TT -2` | Space before the dash |
| `TT- 1` | `TT- 2` | Space after the dash |
| ` CUBE-01 ` | `CUBE-02` | Leading and trailing spaces are trimmed |
| `CUBE--1` | `CUBE--2` | Double dash |
| `-1` | `-2` | Empty reference |
| `123-12345678901234567899` | `123-12345678901234567900` | Very long numbers stay exact |

### 1.5 Accepted: letter sequence

| Row 1 typed | Next row | Note |
|-------------|----------|------|
| `CUBE-A` | `CUBE-B` | One letter after the dash |
| `CUBE-a` | `CUBE-b` | Lowercase kept |
| `cube-c` | `cube-d` | Lowercase reference and letter |
| `123-A` | `123-B` | Numeric reference |
| `CUBE-Y` | `CUBE-Z` | Last letter that steps |
| `PYY-0002-A` | `PYY-0002-B` | Reference contains a dash |
| `TT - A` | `TT - B` | Spaces around the dash |
| `-A` | `-B` | Empty reference |

### 1.6 Accepted: number + letter sequence

| Row 1 typed | Next row | Note |
|-------------|----------|------|
| `20261002-001A` | `20261002-001B` | Dated reference, group `001`, cube `A` |
| `20261002-001b` | `20261002-001c` | Lowercase kept |
| `20261002-001Y` | `20261002-001Z` | Last letter that steps |
| `20261002-1A` | `20261002-1B` | Unpadded number |
| `20261002-0A` | `20261002-0B` | Zero is a valid fixed number |
| `CUBE-01A` | `CUBE-01B` | Letter reference |
| `123-1A` | `123-1B` | Numeric reference |
| `PYY-0002-12C` | `PYY-0002-12D` | Reference contains a dash |

### 1.7 Valid, but nothing comes next

| Row 1 typed | Next row | Why |
|-------------|----------|-----|
| `CUBE-Z` / `cube-z` | *blank* | Letters stop at Z |
| `123-Z` | *blank* | Letters stop at Z |
| `20261002-001Z` / `20261002-001z` | *blank* | Letters stop at Z; the number is not moved on to `002` |

### 1.8 Not accepted: no dash sequence

The ref is a reference on its own, so nothing is counted:

| Row 1 typed | Why |
|-------------|-----|
| `123` | No `-`. A numeric reference on its own is not counted. |
| `CUBE` | No `-` |
| `CUBE01`, `ABC007` | No dash before the number |
| `1A`, `A` | No dash before the letter |
| `CUBE_01` | Underscore is not the delimiter |
| `CUBE/01` | Slash is not the delimiter |
| `CUBE 01` | A space alone is not the delimiter |
| `CUBE.01` | Full stop is not the delimiter |
| `CUBE–01` | En dash `–` (U+2013), not hyphen-minus `-` |
| `CUBE—01` | Em dash `—` (U+2014), not hyphen-minus `-` |

### 1.9 Not accepted: the part after the dash is not a sequence

| Row 1 typed | Why |
|-------------|-----|
| `CUBE-AB` | Two letters |
| `TT-TOP` | A word |
| `CUBE-A1` | Letter before a digit |
| `20261002-A001` | Letter before the number |
| `20261002-001AB` | Two letters after the number |
| `20261002-001A2` | Digit after the letter |
| `CUBE-1.5` | Decimal point |
| `CUBE-1,000` | Comma |
| `CUBE-#1`, `CUBE-(1)` | Symbols around the number |
| `CUBE-01 x` | Extra text after the sequence |
| `CUBE-1-` | Ends with a dash (nothing after the last dash) |
| `CUBE-`, `123-`, `CUBE- ` | Nothing after the dash |
| `CUBE-Ä` | Only A–Z letters count |
| `CUBE-１` | Full-width digit; only 0–9 count |
| *(empty)* | Nothing typed |

### 1.10 How the rows below are filled

These rules decide which rows follow when a ref is typed or changed.

**Which rows follow.** When a ref changes, the code walks down the table from that row. A row below **follows** (is overwritten with the next ref) when it is:

- blank, or
- still holding the next ref after the **old** value of the row above it, meaning it was continuing the sequence.

The walk stops at the first row that holds anything else. That row is treated as **typed by hand**, and it and every row below it are left alone.

The table keeps no hidden "auto-filled" flags; following is decided from the values alone. So:

- Refs loaded from a saved or previous form follow exactly like refs filled moments ago.
- A ref typed by hand that happens to be the next one in the sequence (typing `CUBE-02` under `CUBE-01`) is treated as following.

**Rows above never change.** Editing row 3 only affects rows 4, 5, ….

**Add New Set.** The new row gets the next ref after the row directly above it. If that row's ref has no sequence (or is blank), the new row starts blank.

**Remove row.** Removing a row renumbers nothing, so refs already written on physical cubes stay put. The rows that were below the removed one are no longer one step after the row now above them. They stop following, and editing row 1 afterwards leaves them alone.

**Clear test results.** Every ref is cleared along with the rest of the results table.

**While typing.** The rows below update on every keystroke, so they can show in-between values before the ref is complete. For example, typing `20261002-001A` one key at a time shows `20261002-002`, `20261002-003` below while `20261002-001` is on screen. They become `20261002-001B`, `20261002-001C` when the `A` is typed. Nothing fills while only the reference is typed (`123`, `20261002`), because there is no dash sequence yet.

**Saving.** Auto-filled refs are ordinary values and are saved like any other. A row the client did not use but which still shows an auto-filled ref (say `CUBE-04`) is submitted with that ref. Only completely blank rows are dropped. Clients should remove unused rows before saving.

### 1.11 Worked scenarios

All start from an empty table. *Italic* values were filled automatically.

**Typing the first ref (4 rows).** Type `CUBE-01` in row 1:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| `CUBE-01` | *`CUBE-02`* | *`CUBE-03`* | *`CUBE-04`* |

**Overriding a row.** Then type `SPEC-10` over row 3. It is kept, and row 4 follows it:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| `CUBE-01` | *`CUBE-02`* | `SPEC-10` | *`SPEC-11`* |

**Changing row 1 later.** Then change row 1 to `TT-01`. Row 2 was following, so it changes. Row 3 was typed by hand, so the walk stops there:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| `TT-01` | *`TT-02`* | `SPEC-10` | *`SPEC-11`* |

**Clearing row 1.** Then clear row 1. The row that was following it clears too:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| | | `SPEC-10` | *`SPEC-11`* |

**Switching between numbers and letters.** Type `CUBE-01` in row 1, then change it to `CUBE-A`, then back to `CUBE-01`. The following rows switch each time:

| Row 1 | Row 2 | Row 3 |
|-------|-------|-------|
| `CUBE-A` | *`CUBE-B`* | *`CUBE-C`* |
| `CUBE-01` | *`CUBE-02`* | *`CUBE-03`* |

**Numeric reference.** Typing `123` fills nothing. Typing `-1` after it fills the rows:

| Typed so far | Row 1 | Row 2 | Row 3 |
|--------------|-------|-------|-------|
| `123` | `123` | | |
| `123-1` | `123-1` | *`123-2`* | *`123-3`* |

**Editing a middle row.** With `CUBE-01` … `CUBE-04` filled, change row 2 to `CUBE-07`. Rows below row 2 follow; row 1 does not change:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| `CUBE-01` | `CUBE-07` | *`CUBE-08`* | *`CUBE-09`* |

**Running out of letters.** Type `CUBE-Y` in row 1 of 3:

| Row 1 | Row 2 | Row 3 |
|-------|-------|-------|
| `CUBE-Y` | *`CUBE-Z`* | |

**Removing a row.** With `CUBE-01` … `CUBE-04` filled, remove row 2. The rest keep their refs. Changing row 1 to `CUBE-05` afterwards leaves them alone, because `CUBE-03` no longer comes right after the row above it:

| Step | Row 1 | Row 2 | Row 3 |
|------|-------|-------|-------|
| After removing | `CUBE-01` | `CUBE-03` | `CUBE-04` |
| Row 1 → `CUBE-05` | `CUBE-05` | `CUBE-03` | `CUBE-04` |

**A hand-typed ref below.** Type `X` in row 2 first, then `CUBE-01` in row 1. Row 2 is hand-typed, so the walk stops there and rows 3–4 stay blank. Blank rows below a hand-typed ref follow *that* ref when it is edited, not row 1:

| Row 1 | Row 2 | Row 3 | Row 4 |
|-------|-------|-------|-------|
| `CUBE-01` | `X` | | |

---

## 2. Barcode carries the project code

Barcodes in one request usually share a project code and differ only in the running number, for example `PYY-0002/00166`, `PYY-0002/00165`, `PYY-0002/00164`. Running numbers are often not consecutive, so the number is **not** counted on. Only the project code is carried.

### 2.1 What counts as the project code

The project code is everything in front of the barcode's trailing digits:

```js
/^(.*?)(\d+)$/   // group 1 = project code, group 2 = running number
```

A barcode only has a project code when it **ends in digits** and has **something in front of them**:

| Barcode above | Project code carried |
|---------------|---------------------|
| `PYY-0002/00166` | `PYY-0002/` |
| `PYY-0002/1` | `PYY-0002/` |
| `PYY-0002-00166` | `PYY-0002-` |
| `PYY 0002 00166` | `PYY 0002 ` (with trailing space) |
| `PYY-0002/ 00166` | `PYY-0002/ ` (with trailing space) |
| `ABC12345` | `ABC` |
| `00166`, `12345678` | *none*: digits only |
| `PYY-0002/` | *none*: no running number |
| `PYY-0002/00166A` | *none*: does not end in digits |

### 2.2 Behaviour

| Action | What happens |
|--------|--------------|
| A barcode with a project code is entered | Every **empty** barcode below it shows that code as its grey placeholder. |
| Click, tap or Tab into an empty barcode | The code from the **nearest barcode above that has one** is filled in as real text, with the caret after it. Type only the running number. |
| Clicking at the start of the field | The caret is still moved after the code, so typing never lands in front of it. |
| Leave the field without typing a number | The field empties again. Unused rows are never saved, printed or sent to the RPA bot with a bare project code. |
| Type or scan the **whole** barcode anyway | A repeated code is removed: typing `PYY-0002/00165` after the filled-in `PYY-0002/` gives `PYY-0002/00165`, not `PYY-0002/PYY-0002/00165`. |
| Focus a barcode that already has text | Nothing is added. |
| Focus a read-only or disabled barcode | Nothing is added. |
| No barcode above has a project code | Nothing is added; the normal placeholder ("Enter barcode text") shows. |

**Nearest barcode above wins.** If row 1 is `PYY-0002/00166` and row 2 is `ABC-9/00001`, rows 3 and below are given `ABC-9/`. Empty rows in between are skipped when looking upwards.

**Barcode image.** Filling in the code does not draw a barcode image; the field keeps showing "Paste Barcode Here" until the running number is typed. If the number is typed and then deleted back to the bare code, the image of the bare code is cleared when the field is left (because the field empties).

**Printing.** The barcode text box is hidden in print, so placeholder hints never print.

**Placeholders update** whenever a barcode is typed in, a row is added or removed, the results are cleared, or a saved or previous form is loaded into the table.

### 2.3 Worked scenario

| Step | Row 1 | Row 2 | Row 3 |
|------|-------|-------|-------|
| Type `PYY-0002/00166` in row 1 | `PYY-0002/00166` | placeholder `PYY-0002/` | placeholder `PYY-0002/` |
| Click into row 2 | `PYY-0002/00166` | `PYY-0002/▌` | placeholder `PYY-0002/` |
| Type `00165` | `PYY-0002/00166` | `PYY-0002/00165` | placeholder `PYY-0002/` |
| Click into row 3, then leave without typing | `PYY-0002/00166` | `PYY-0002/00165` | *(empty)* |

---

## 3. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Rows below did not fill | No `-` before the sequence (`CUBE01`, `123`) | Add a dash: `CUBE-01`, `123-1` |
| Rows below did not fill, but the ref looks right | The dash is an en dash `–` or em dash `—`, often from text pasted out of Word or Excel | Retype the dash with the keyboard's `-` key |
| Rows below did not fill | The part after the dash is not a sequence (`TT-TOP`, `CUBE-A1`, `001AB`) | Use a number, one letter, or a number followed by one letter |
| The row after `…-Z` is blank | Letters stop at Z | Type the next ref by hand |
| Some rows filled, rows further down did not | A row in between holds a hand-typed value, so the walk stopped there | Edit or clear that row |
| Rows stopped following after a row was removed | Removing a row breaks the sequence below it on purpose | Retype the first ref below the gap, or edit those rows |
| Unwanted refs on unused rows were submitted | Auto-filled refs are real values | Remove unused rows before saving |
| Barcode shows a doubled, mixed code (`PYY-0002/ABC-9/00001`) | A barcode with a **different** project code was pasted after the carried code. Only a repeat of the same code is removed. | Select all the text in the field before pasting |
| Barcode project code did not appear | The field was not empty, the barcode above has no project code (digits only, or no trailing number), or the field is read-only | Type the full barcode once; the rows below it then carry its code |

---

## 4. Developer reference

### 4.1 Functions (`cubesync-table-manager.js`)

| Function | Exported | Purpose |
|----------|----------|---------|
| `nextSpecimenRef(value)` | yes | The ref after `value` per §1.2–1.3, or `""` when there is nothing to count on. |
| `followSpecimenRefs(tableBody, fromRow, previousValue)` | yes | Walks the rows below `fromRow` after its ref changed from `previousValue`, applying §1.10. |
| `continueSpecimenRef(row)` | no | Fills a blank ref in a newly added row from the row above. |
| `barcodePrefix(value)` | yes | The project code per §2.1, or `""`. |
| `refreshBarcodePlaceholders(tableBody)` | yes | Sets each empty barcode's placeholder to the carried code or its default. |
| `findCarriedBarcodePrefix(tableBody, row)` | no | The project code of the nearest barcode above `row`. |
| `attachBarcodePrefixListeners(input, row, tableBody, renderBarcodeCb)` | no | Focus, click and blur handling for one barcode input. |
| `splitRunningNumber(value)`, `incrementDigits(digits)` | no | Shared helpers: split off trailing digits, and add one to a digit string keeping its width. |

Exported functions are on `window.CubeSyncTableManager` in the browser and on `module.exports` in Node.

### 4.2 Events and wiring

| Where | Event | Effect |
|-------|-------|--------|
| Specimen ref input | `focus` | Remembers the current value as the "old" value. It is re-read on focus because loading a saved form sets values without events. |
| Specimen ref input | `input` | `followSpecimenRefs(tableBody, row, oldValue)`, then the new value becomes the old value. |
| Barcode input | `focus` | Fills in the carried code when the field is empty, editable and a code exists, then moves the caret to the end. The caret is set again after a `setTimeout(0)` because Tab can select all the text. |
| Barcode input | `click` | Moves the caret to the end while the field holds only the carried code. A mouse release can place the caret in front of it. |
| Barcode input | `input` | Removes a repeated carried code, redraws the barcode, refreshes placeholders. |
| Barcode input | `blur` | Empties the field if it still holds only the carried code, and redraws the barcode. |
| Remove button | `click` | Renumbers rows, reassigns set numbers, refreshes placeholders. |
| `addResultRow` | n/a | Prefills from the request, calls `continueSpecimenRef`, then refreshes placeholders. |
| `clearResultRows` | n/a | Resets inputs, then refreshes placeholders. |
| `app.js` `populateResults` | n/a | Refreshes placeholders after a saved or previous form is loaded into the table. |

### 4.3 Data attributes

| Attribute | On | Meaning |
|-----------|----|---------|
| `data-carried-barcode-prefix` | Barcode input | Set while the field holds a code filled in on focus. Removed on blur. Used to remove a repeated code and to empty an untouched field. |
| `data-default-placeholder` | Barcode input | The input's original placeholder, restored when no code is carried. |

Specimen refs use no data attributes; following is decided from the values alone (§1.10).

### 4.4 Service worker cache

`sw.js` precaches `cubesync-table-manager.js` and `app.js`. Bump `CACHE_NAME` in `sw.js`, and add the matching check in `sw.test.js`, whenever either changes, so returning visitors get the new script. Past bumps for this feature: `v27` (#31), `v28` (#32), `v29` (#33).

### 4.5 Tests (`table-manager.test.js`)

- **Ref parsing:** numeric sequences and zero padding; numeric references; single-letter sequences, case and the `Z` stop; number-plus-letter sequences; refs without a dash sequence.
- **Filling the table:**
  - typing the first ref;
  - hand-typed refs being kept;
  - clearing;
  - refs loaded without events;
  - **+ Add New Set**;
  - switching between numbers and letters;
  - numeric references while typing;
  - dated number-plus-letter refs.
- **Barcode:**
  - project code parsing;
  - filling on focus;
  - emptying on blur;
  - fields with values, read-only fields, no code above;
  - removing a repeated code;
  - placeholders on add, clear and remove;
  - caret after a click.

### 4.6 History

| PR | Change |
|----|--------|
| #31 | Specimen refs count on by number; barcode project code carried |
| #32 | Letter sequences; the sequence must follow a `-`, so numeric references are not counted |
| #33 | Number-plus-letter sequences (`20261002-001A`) |
