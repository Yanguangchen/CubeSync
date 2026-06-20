# CubeSync Entity-Relationship Diagram

```mermaid
erDiagram
    CUBE_REQUEST {
        string id PK "Auto-generated or custom (max 128 chars)"
        string projectErp "Project ERP code"
        string customerBilling "Customer billing name"
        string projectNameOnReport "Project name on report"
        string clientNameOnReport "Client name on report"
        string contact "Contact person"
        boolean enableManualCubeJobNumber "Enable manual cube job #"
        string cubeJobNumber "Cube job number / report no"
        string quote "Quote reference"
        string testItem "Test item / method"
        string concreteGrade "Concrete grade"
        string reportGrade "Report grade"
        string supplier "Supplier of concrete"
        string supplierDisplay "Supplier display name"
        string locationRepresented "Location represented"
        string additionalInformation "Additional notes"
        string dateOfCast "Date of cast (YYYY-MM-DD)"
        number slumpMeasured "Mean slump measured"
        string specimenSize "Specimen size"
        number slumpSpecified "Specified slump"
        string personInCharge "Person in charge"
        string managerInCharge "Manager in charge"
        string template "Original or Glassmorphic"
        string status "Draft, Ready, or Archived"
        timestamp createdAt "Server timestamp, immutable"
        timestamp updatedAt "Server timestamp, updated on write"
        timestamp submittedAt "Public submission timestamp"
        string rpaStatus "RPA automation status"
        string erpStatus "ERP sync status"
        number attemptCount "RPA attempt counter"
    }

    TEST_RESULT {
        number setNo "Auto-incremented set number"
        string size "Specimen size"
        string specimenRef "Specimen reference #"
        string barcode "Barcode text"
        number specifiedSlump "Specified slump"
        number meanSlump "Mean slump"
        string resultGrade "Concrete grade"
        string resultDateOfCast "Date of cast (YYYY-MM-DD)"
        number age "Age in days (auto-calculated)"
        string dateOfTest "Date of test (YYYY-MM-DD)"
        string invoiceNumber "Invoice number"
    }

    EXTRA_FIELDS {
        string fieldId PK "Custom field ID (a-z start, max 32 chars)"
        string stringValue "String value (max 500 chars)"
        number numberValue "Finite number value"
        boolean booleanValue "Boolean value"
    }

    CUSTOM_FIELD_METADATA {
        string fieldName "Dropdown field name"
    }

    FORM_FIELD_CONFIG {
        string id PK "Always formFieldConfig"
        object requestFields "Map of field name to enabled boolean"
        object resultFields "Map of field name to enabled boolean"
        object requestLabels "Map of field name to custom label"
        object resultLabels "Map of field name to custom label"
        timestamp updatedAt "Last config update"
    }

    CUSTOM_FIELD_DEFINITION {
        string id PK "Valid pattern: a-z start, alphanumeric, max 32"
        string label "Display label"
        string type "text, number, date, checkbox, or textarea"
        string formLabel "Override label on public form"
        boolean required "Whether field is required"
        boolean enabled "Whether field is shown"
    }

    FIREBASE_USER {
        string uid PK "Firebase Auth unique ID"
        string email "Verified email address"
        boolean emailVerified "Email verification status"
        string displayName "Optional display name"
    }

    ALLOWED_EMAIL_LIST {
        string email PK "Whitelisted email address"
    }

    DROPDOWN_OPTIONS {
        string fieldName PK "projectErp, customerBilling, etc."
        string sourceFile "Text file path in dropdown-options/"
        string localStorageKey "Browser cache key"
    }

    LOCAL_STORAGE_CACHE {
        string key PK "Storage key"
        string value "JSON-serialized data"
    }

    CUBE_REQUEST ||--o{ TEST_RESULT : "has results"
    CUBE_REQUEST ||--o| EXTRA_FIELDS : "has extra fields (max 25)"
    CUBE_REQUEST ||--o{ CUSTOM_FIELD_METADATA : "tracks free-text entries"
    FORM_FIELD_CONFIG ||--o{ CUSTOM_FIELD_DEFINITION : "defines custom fields (max 25)"
    CUSTOM_FIELD_DEFINITION ||--o{ EXTRA_FIELDS : "values stored as"
    FIREBASE_USER ||--o{ CUBE_REQUEST : "creates and edits"
    FIREBASE_USER }o--|| ALLOWED_EMAIL_LIST : "authorized via"
    DROPDOWN_OPTIONS ||--o{ LOCAL_STORAGE_CACHE : "cached in browser"
    FORM_FIELD_CONFIG ||--o| LOCAL_STORAGE_CACHE : "cached as cubesync-form-field-config"
```

## Entity Details

### CubeRequest (Firestore: `cubeRequests/{id}`)
The central entity. Represents a concrete cube test request form submission.
- **Templates:** `Original` | `Glassmorphic`
- **Statuses:** `Draft` | `Ready` | `Archived`
- **RPA Statuses:** `Ready for Bot` | `In Progress` | `Submitted to ERP` | `Failed` | `Disabled`
- **ERP Statuses:** `Pending` | `Processing` | `Success` | `Error`
- **Legacy aliases:** `reportNo`/`reportNumber` for `cubeJobNumber`, `client` for `customerBilling`, `project` for `projectNameOnReport`, `method` for `testItem`, `grade` for `concreteGrade`

### TestResult (embedded array in CubeRequest.results)
Each cube request can have 0..N test result rows. `age` is auto-calculated as `dateOfTest - resultDateOfCast` in days.

### ExtraFields (embedded object in CubeRequest.extraFields)
Up to 25 custom key-value pairs. Keys must match `^[a-z][a-zA-Z0-9_]{0,31}$` and not collide with reserved field IDs. Values are strings (max 500 chars), finite numbers, or booleans.

### FormFieldConfig (Firestore: `settings/formFieldConfig`)
Singleton document controlling which fields are visible/required and their labels. Staff can toggle fields on/off and rename labels from the dashboard.

### CustomFieldDefinition (embedded array in FormFieldConfig.customRequestFields)
Defines additional fields beyond the standard schema. Types: `text`, `number`, `date`, `checkbox`, `textarea`.

### FirebaseUser (Firebase Authentication)
Google-authenticated users. Only emails in the hardcoded allowlist can access the staff dashboard and RPA queue.

### DropdownOptions (file-based + localStorage)
Eight dropdown fields load options from text files and cache selections in localStorage:

| Field | Source File | localStorage Key |
|-------|------------|-----------------|
| projectErp | `dropdown-options/project erp.txt` | `savedProjectErps` |
| customerBilling | `dropdown-options/customer billing.txt` | `savedCustomerBillings` |
| supplier | `dropdown-options/supplier.txt` | `savedSuppliers` |
| concreteGrade | `dropdown-options/Grade.txt` | `savedGrades` |
| personInCharge | `dropdown-options/person-in-charge.txt` | `savedPersonsInCharge` |
| managerInCharge | `dropdown-options/manager-in-charge.txt` | `savedManagersInCharge` |
| testItem | `dropdown-options/testitem.txt` | `savedTestItems` |
| specimenSize | `dropdown-options/size.txt` | `savedSizes` |

## Data Flow

```
Public Form (app.js)
    |
    | POST /api/cube-request-submit
    | (reCAPTCHA verified)
    v
Firestore: cubeRequests/{id}
    |
    +---> Staff Dashboard (dashboard.js)
    |         - List, filter, edit forms
    |         - Manage field config
    |
    +---> RPA Dashboard (rpa-dashboard.js)
    |         - Queue by SGT date
    |         - Update ERP/RPA status
    |         - Export CSV/ZIP
    |
    +---> RPA View (rpa-view.js)
              - Read-only form view
              - ERP status controls
              - Enable/Disable RPA toggle
```
