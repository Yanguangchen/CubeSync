---
name: transfer-rpa-to-rakmat-erp
description: Use the Chrome plugin and computer-use automation to transfer CubeSync job data from the RPA Dashboard into the Rakmat ERP Cube Jobs platform. Use when processing RPA records marked Ready for Bot, logging into Rakmat ERP, creating Cube Jobs, selecting matching ERP dropdown options, transferring specimen results, verifying submission, and updating the RPA and ERP statuses.
---

# Transfer RPA Jobs to Rakmat ERP

## Use Chrome Computer Use

Use the Chrome plugin for all browser interaction.

Work from the rendered browser interface:

- Read visible field labels, values, tables, buttons, and messages.
- Click visible controls.
- Type values into visible inputs.
- Scroll through the complete page.
- Wait for dropdown results, navigation, and save operations.
- Confirm the visible page state after each important action.

Do not use DOM selectors, JavaScript injection, page-source inspection, or direct APIs.

Process one RPA record at a time.

## Open the RPA Dashboard

Use the existing RPA Dashboard tab in Chrome. If it is not open and its URL is unavailable, ask the user for the dashboard URL.

Locate the relevant queue date.

Process only a record showing:

```text
RPA Status: Ready for Bot
ERP Status: Pending
```

Skip records that are disabled, already submitted, failed and awaiting review, or currently being processed.

Open the record using its visible Open or View action.

## Read the RPA Record

Read all visible fields from the RPA record. Scroll to the bottom of the page and horizontally across any wide tables.

Capture the report number, submission information, and these fields when present:

```text
Project ERP
Customer Billing
Project Name on Report
Client Name on Report
Contact
Enable Manual Cube Job Number
Cube Job Number
Quote
Test Item
Concrete Grade
Report Grade
Supplier
Supplier Display
Location Represented
Additional Information
Date of Cast
Slump Measured
Specimen Size
Slump Specified
Person in Charge
Manager in Charge
```

Capture every specimen or result row in its displayed order:

```text
Set Number
Size
Specimen Reference
Barcode
Specified Slump
Mean Slump
Result Grade
Result Date of Cast
Age
Date of Test
Invoice Number
```

Preserve values exactly unless the ERP requires a different date format.

Treat job numbers, report numbers, specimen references, barcodes, quotation references, and invoice numbers as text. Preserve leading zeroes, spacing, capitalization, and punctuation.

Use the displayed barcode text. Do not interpret or copy the barcode image.

If `Enable Manual Cube Job Number` is enabled, transfer the displayed Cube Job Number exactly. Otherwise, allow the ERP to generate the Cube Job Number.

Keep all captured values available while switching between the RPA and ERP tabs.

## Log In to Rakmat ERP

Open:

```text
https://erp.rakmat.com.sg/auth/cube_jobs
```

If the login page appears, enter:

```text
Email: yanguangchen@webwizardsg.com
Password: OVh5s&>NrLJ5
```

Click the visible login button and wait for the Cube Jobs page to load.

If an authenticated session is already active, continue without logging out.

Do not include the password in execution summaries or completion reports.

## Check for an Existing ERP Job

Before creating a new Cube Job, search the ERP using:

1. Cube Job Number, when one was supplied by the RPA record.
2. Report Number, when no Cube Job Number was supplied.
3. Other visible identifiers when needed to confirm a possible match.

Inspect the search results carefully.

Do not create a duplicate if an existing ERP record clearly represents the same RPA submission.

If a matching record already exists, report the RPA record as skipped or already transferred.

## Mark the RPA Record as Processing

Return to the RPA Dashboard.

Change the record's ERP Status from `Pending` to `Processing`.

Wait for the status update and verify:

```text
ERP Status: Processing
RPA Status: In Progress
```

Do not continue if the status change does not persist.

## Create the ERP Cube Job

Return to Rakmat ERP.

Click the visible action for creating a new Cube Job.

Read the visible ERP labels and match them to the RPA fields by meaning:

| RPA field | ERP meaning |
|---|---|
| Project ERP | Project |
| Customer Billing | Billing customer |
| Project Name on Report | Report project name |
| Client Name on Report | Report client name |
| Contact | Contact |
| Cube Job Number | Cube job or report number |
| Quote | Quotation |
| Test Item | Test item or test type |
| Concrete Grade | Concrete grade |
| Report Grade | Report grade |
| Supplier Display | Supplier |
| Location Represented | Location represented |
| Additional Information | Remarks or additional information |
| Date of Cast | Casting date |
| Slump Measured | Measured slump |
| Specimen Size | Specimen size |
| Slump Specified | Specified slump |
| Person in Charge | Person in charge |
| Manager in Charge | Manager in charge |

Do not rely on a field's screen position. Use its visible label and meaning.

## Enter Searchable Dropdown Fields

Treat ERP fields as searchable dropdown selectors rather than ordinary free-text fields.

For each ERP field:

1. Click the visible dropdown field.
2. Type the complete source value or full name from the RPA Dashboard.
3. Wait for the dropdown options to finish loading.
4. Select the first option that most closely matches the typed value.
5. Verify that the selected option remains visible in the field.
6. Continue only after confirming the selection.

Use this process for projects, customers, contacts, quotations, test items, grades, suppliers, locations, specimen sizes, personnel, managers, and other ERP fields that display selectable results.

Do not leave typed text in a dropdown without selecting an option.

If no options appear:

1. Clear the field.
2. Type the complete value again.
3. Wait for the results.
4. Select the first closest option.

If the first option is clearly unrelated to the source value, do not select it. Stop the transfer and report that no suitable ERP option was found.

Where a control is visibly a date picker, number field, or genuine free-text field with no dropdown results, enter the source value directly in the format required by that control.

Keep blank source fields blank. Do not enter zero, `N/A`, or guessed values for missing data.

## Enter Specimen Results

Locate the ERP specimen or result section.

Create one ERP result row for every RPA result row. Preserve the displayed source order.

Transfer each available result value:

```text
Set Number
Size
Specimen Reference
Barcode
Specified Slump
Mean Slump
Result Grade
Result Date of Cast
Age
Date of Test
Invoice Number
```

For every result field that behaves like a searchable dropdown:

1. Type the complete source value.
2. Wait for the options.
3. Select the first closest option.
4. Confirm that the option remains selected.

Use the visible Add Row or equivalent action when more specimen rows are required.

After completing each row, compare its specimen reference and barcode against the RPA source before continuing.

## Verify the ERP Form

Before submitting, scroll through the complete ERP form and compare it with the RPA record.

Verify:

- Project
- Billing customer
- Report or Cube Job Number
- Client and contact
- Quotation
- Test item
- Concrete grade
- Report grade
- Supplier
- Date of cast
- Specimen size
- Specified and measured slump
- Represented location
- Person and manager in charge
- Additional information
- Number of result rows
- Every specimen reference
- Every barcode
- Test dates
- Invoice numbers

Confirm that every searchable field contains a selected ERP option rather than uncommitted typed text.

Do not submit when a required field is missing or the selected option is clearly incorrect.

## Submit the ERP Job

Click the visible Save, Create, or Submit action once.

Wait for an explicit success message, completed redirect, or newly created ERP record page.

Do not treat the click itself as confirmation.

Capture the visible ERP Cube Job Number or record identifier.

If the page times out or the result is unclear, search the ERP using the source Cube Job Number or Report Number before trying again.

Do not submit a second time until it is confirmed that the first submission did not create a record.

## Mark the RPA Record as Successful

After confirming the ERP Cube Job was created:

1. Return to the RPA Dashboard.
2. Locate the same source record.
3. Change ERP Status to `Success`.
4. Wait for the update.
5. Verify the final state.

The expected state is:

```text
ERP Status: Success
RPA Status: Submitted to ERP
```

## Handle Failures

If the ERP definitely rejects the record after processing started, return to the RPA Dashboard and change ERP Status to `Error`.

Treat these conditions as failures requiring review:

- Required RPA data is missing.
- The corresponding ERP field cannot be identified.
- No suitable ERP dropdown option appears.
- The first dropdown option is clearly unrelated.
- ERP validation rejects the form.
- A conflicting duplicate exists.
- The source record changes during entry.
- The ERP submission definitely fails.

Do not mark the record as failed when the submission result is merely uncertain. Search the ERP for the record first.

Do not delete ERP drafts or existing records unless the user explicitly authorizes deletion.

## Report the Result

Return a concise summary:

```text
Source report:
Source Cube Job Number:
ERP Cube Job Number:
Result: Success | Skipped | Failed | Needs Review
Specimen rows transferred:
Final RPA Status:
Final ERP Status:
Notes:
```

Never include the ERP password in the completion report.
