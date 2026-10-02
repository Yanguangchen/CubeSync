# Test result row auto-fill

Two helpers in the TEST RESULTS table save customers from retyping the same text on every row.

## Specimen Ref # counts on

Typing a ref that ends in a number or a single letter fills the rows below it, counting up. Numbers keep their zero padding; letters go through the alphabet and keep their case:

| Row 1 typed | Rows below |
|-------------|------------|
| `CUBE-01` | `CUBE-02`, `CUBE-03`, `CUBE-04`, … |
| `TT-9` | `TT-10`, `TT-11`, … |
| `ABC007` | `ABC008`, `ABC009`, … |
| `CUBE-A` | `CUBE-B`, `CUBE-C`, `CUBE-D`, … |
| `1A` | `1B`, `1C`, … |

- The name in front can be anything; only the trailing digits, or one trailing letter, are counted.
- A letter counts only when it stands on its own at the end (after a dash, space, digit and so on), so a word such as `CUBE` or `TT-TOP` is not stepped to `CUBF` / `TT-TOQ`. Letters stop at `Z`: the row after `CUBE-Z` is left blank.
- Any ref can be overwritten by hand, including switching row 1 between numbers and letters (`CUBE-01` → `CUBE-A`); the rows that were following it switch too.
- **+ Add New Set** gives the new row the next ref after the row above it.
- Editing a ref renumbers the rows below that are blank or still continue its sequence. A ref typed by hand that breaks the sequence is kept, and the rows below it keep theirs.
- Clearing a ref, or typing one with nothing to count on, clears the rows that followed it.
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
