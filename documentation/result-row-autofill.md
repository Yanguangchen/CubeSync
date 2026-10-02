# Test result row auto-fill

Two helpers in the TEST RESULTS table save customers from retyping the same text on every row.

## Specimen Ref # counts on

A specimen ref is the **specimen reference**, a `-`, then the **sequence**. The sequence is a number (`1, 2, 3`) or a single letter (`A, B, C`); the reference in front can be letters, digits or both. Typing a ref with a sequence fills the rows below by stepping the sequence and keeping the reference:

| Row 1 typed | Rows below |
|-------------|------------|
| `CUBE-01` | `CUBE-02`, `CUBE-03`, `CUBE-04`, … |
| `TT-9` | `TT-10`, `TT-11`, … |
| `123-1` | `123-2`, `123-3`, … |
| `CUBE-A` | `CUBE-B`, `CUBE-C`, `CUBE-D`, … |
| `123-A` | `123-B`, `123-C`, … |
| `PYY-0002-1` | `PYY-0002-2`, `PYY-0002-3`, … |

- The sequence is whatever follows the **last** `-`, so a reference may contain dashes itself (`PYY-0002-1`).
- Numbers keep their zero padding (`CUBE-09` → `CUBE-10`, `123-001` → `123-002`). Letters keep their case and stop at `Z`: the row after `CUBE-Z` is left blank.
- A ref with no `-` sequence is a reference on its own and is never counted, so typing the numeric reference `123` does not fill `124`, `125` below; the rows fill once `-1` is typed. A word after the dash (`TT-TOP`) is not a sequence either.
- Any ref can be overwritten by hand, including switching row 1 between numbers and letters (`123-1` → `123-A`); the rows that were following it switch too.
- **+ Add New Set** gives the new row the next ref after the row above it.
- Editing a ref renumbers the rows below that are blank or still continue its sequence. A ref typed by hand that breaks the sequence is kept, and the rows below it keep theirs.
- Clearing a ref, or typing one with no sequence, clears the rows that followed it.
- Removing a row does not renumber the others, so the refs already given to physical cubes stay put.

## Barcode carries the project code

Barcodes in one request share a project code and differ only in the running number, for example `PYY-0002/00166`, `PYY-0002/00165`, `PYY-0002/00164`.

- Once a barcode has a project code (everything before its trailing digits, here `PYY-0002/`), the empty barcodes below it show that code as their placeholder.
- Clicking, tapping or tabbing into an empty barcode fills in the code from the nearest barcode above it, with the caret after it, so only the running number is typed. The running number is not counted on, because barcode labels are not sequential.
- Leaving the field without typing a number empties it again, so unused rows are never saved with a bare project code.
- Typing or scanning the whole barcode after the filled-in code keeps a single copy of the code.

## Code

| Piece | Role |
|-------|------|
| `cubesync-table-manager.js` | `nextSpecimenRef`, `followSpecimenRefs`, `barcodePrefix`, `refreshBarcodePlaceholders`, and the row listeners that drive them |
| `app.js` | Refreshes barcode placeholders after a saved or previous form is loaded |
| `table-manager.test.js` | Number and letter counting, padding, hand-typed refs, added rows, barcode fill / empty / de-duplicate / placeholders |

The dashboard editor uses the same table manager, so staff get the same behaviour when editing a submission.
