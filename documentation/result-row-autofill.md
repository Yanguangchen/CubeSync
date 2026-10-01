# Test result row auto-fill

Two helpers in the TEST RESULTS table save customers from retyping the same text on every row.

## Specimen Ref # counts on

Typing a ref that ends in a number fills the rows below it, counting up and keeping the zero padding:

| Row 1 typed | Rows below |
|-------------|------------|
| `CUBE-01` | `CUBE-02`, `CUBE-03`, `CUBE-04`, … |
| `TT-9` | `TT-10`, `TT-11`, … |
| `ABC007` | `ABC008`, `ABC009`, … |

- The name in front of the number can be anything; only the trailing digits are counted.
- **+ Add New Set** gives the new row the next ref after the row above it.
- Editing a ref renumbers the rows below that are blank or still continue its sequence. A ref typed by hand that breaks the sequence is kept, and the rows below it keep theirs.
- Clearing a ref, or typing one with no trailing number, clears the rows that followed it.
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
| `table-manager.test.js` | Counting, padding, hand-typed refs, added rows, barcode fill / empty / de-duplicate / placeholders |

The dashboard editor uses the same table manager, so staff get the same behaviour when editing a submission.
