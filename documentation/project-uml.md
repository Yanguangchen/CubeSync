# CubeSync Project UML

Comprehensive Mermaid UML diagrams for the current CubeSync application. These diagrams cover browser surfaces, page controllers, shared UMD modules, Firebase integration, serverless submission flow, Firestore data, and operational state transitions.

## 1. System Component Diagram

```mermaid
flowchart LR
    Customer["Customer / public user"]
    Staff["Staff user"]
    RpaBot["RPA bot"]

    subgraph Browser["Browser runtime"]
        subgraph Pages["HTML pages"]
            Index["index.html<br/>Original request form"]
            Glass["glassmorphic.html<br/>Glassmorphic request form"]
            Dashboard["dashboard.html<br/>Staff dashboard"]
            RpaDash["rpa-dashboard.html<br/>RPA queue"]
            RpaView["rpa-view.html<br/>Single request view"]
        end

        subgraph Controllers["Page controllers"]
            AppJs["app.js"]
            DashboardJs["dashboard.js"]
            RpaDashboardJs["rpa-dashboard.js"]
            RpaViewJs["rpa-view.js"]
        end

        subgraph Shared["Shared browser modules"]
            FormData["CubeSyncFormData<br/>cubesync-form-data.js"]
            FormMarkup["CubeSyncFormMarkup<br/>cubesync-form-markup.js"]
            Autocomplete["CubeSyncAutocomplete<br/>cubesync-autocomplete.js"]
            TableManager["CubeSyncTableManager<br/>cubesync-table-manager.js"]
            DashboardFilters["CubeSyncDashboardFilters<br/>cubesync-dashboard-filters.js"]
            Barcode["CubeSyncBarcode<br/>barcode.js"]
            Exporter["CubeSyncExport<br/>cubesync-export.js"]
            Chime["CubeSyncChime<br/>chime.js"]
            FirestoreClient["CubeSyncFirestore<br/>firestore.js"]
            AuthClient["CubeSyncAuth<br/>firestore.js"]
            Env["CubeSyncEnv<br/>generated public env"]
            ServiceWorker["sw.js<br/>PWA app shell cache"]
        end

        LocalStorage[("localStorage<br/>field config cache<br/>autocomplete suggestions")]
    end

    subgraph Serverless["Vercel serverless API"]
        SubmitApi["/api/cube-request-submit.js"]
        EnvLoader["scripts/load-env.js"]
        AdminSdk["Firebase Admin SDK"]
    end

    subgraph Firebase["Firebase project"]
        FirebaseAuth["Firebase Auth<br/>Google OAuth"]
        FirestoreDb[("Firestore")]
        Rules["firestore.rules<br/>WorkGrid + CubeSync rules"]
    end

    subgraph Data["Firestore documents"]
        CubeRequests[("cubeRequests/{id}")]
        FieldConfig[("settings/formFieldConfig")]
        DropdownOptions[("settings/dropdownOptions")]
        WorkGridDocs[("WorkGrid collections<br/>users, teams, bookings,<br/>collisions, appConfig/access")]
    end

    subgraph StaticAssets["Static assets"]
        DropdownFiles["dropdown-options/*.txt"]
        CssAssets["css/*.css"]
        ImageAssets["assets/*"]
        Manifest["manifest.json"]
    end

    Recaptcha["Google reCAPTCHA v2"]
    FirebaseCdn["Firebase Web SDK CDN"]

    Customer --> Index
    Customer --> Glass
    Staff --> Dashboard
    Staff --> RpaDash
    RpaBot --> RpaDash
    RpaBot --> RpaView

    Index --> AppJs
    Glass --> AppJs
    Dashboard --> DashboardJs
    RpaDash --> RpaDashboardJs
    RpaView --> RpaViewJs

    AppJs --> FormData
    AppJs --> FormMarkup
    AppJs --> Autocomplete
    AppJs --> TableManager
    AppJs --> Barcode
    AppJs --> Chime
    AppJs --> FirestoreClient
    AppJs --> Env
    AppJs --> Recaptcha

    DashboardJs --> FormData
    DashboardJs --> FormMarkup
    DashboardJs --> Autocomplete
    DashboardJs --> DashboardFilters
    DashboardJs --> Barcode
    DashboardJs --> FirestoreClient
    DashboardJs --> AuthClient
    DashboardJs --> DropdownFiles
    DashboardJs --> LocalStorage

    RpaDashboardJs --> FormData
    RpaDashboardJs --> Barcode
    RpaDashboardJs --> Exporter
    RpaDashboardJs --> FirestoreClient
    RpaDashboardJs --> AuthClient

    RpaViewJs --> FormData
    RpaViewJs --> Barcode
    RpaViewJs --> FirestoreClient
    RpaViewJs --> AuthClient

    FirestoreClient --> FirebaseCdn
    AuthClient --> FirebaseCdn
    AuthClient --> FirebaseAuth
    FirestoreClient --> Rules
    Rules --> FirestoreDb
    FirestoreDb --> CubeRequests
    FirestoreDb --> FieldConfig
    FirestoreDb --> DropdownOptions
    FirestoreDb --> WorkGridDocs

    AppJs --> SubmitApi
    SubmitApi --> EnvLoader
    SubmitApi --> Recaptcha
    SubmitApi --> AdminSdk
    AdminSdk --> FirestoreDb

    ServiceWorker --> Index
    ServiceWorker --> Glass
    ServiceWorker --> Dashboard
    ServiceWorker --> RpaDash
    ServiceWorker --> RpaView
    Index --> CssAssets
    Glass --> CssAssets
    Dashboard --> CssAssets
    RpaDash --> CssAssets
    RpaView --> CssAssets
    Index --> ImageAssets
    Glass --> ImageAssets
    Dashboard --> ImageAssets
    RpaDash --> ImageAssets
    RpaView --> ImageAssets
    Index --> Manifest
    Glass --> Manifest
    Dashboard --> Manifest
```

## 2. Class And Module Diagram

```mermaid
classDiagram
    direction LR

    class AppController {
        +DOMContentLoaded()
        -renderBarcode(input)
        -renderAll(inputs)
        -validateRequestDetails(form, helper, status, config, navigate)
        -loadAndApplyFormFieldConfig(form)
        -populateForm(form, data, tableBody, addRow, renumberRows)
        -submitForm(form, submitter)
        -renderRecaptcha(container, status, attempt)
        -recaptchaToken(container)
        -resetRecaptcha(container)
        -updateSteps()
        -addResultRowWrapper()
        -renumberRowsWrapper()
    }

    class DashboardController {
        +DOMContentLoaded()
        -loadDropdownOptionSets()
        -loadForms()
        -renderForms()
        -viewForm(id)
        -openEditor(id)
        -saveEditedForm(event)
        -deleteForm(id)
        -printForm(id)
        -loadFieldConfig()
        -saveFieldConfig(event)
        -bindAuthGate()
    }

    class RpaDashboardController {
        +DOMContentLoaded()
        -loadQueue()
        -renderQueue()
        -updateERPStatus(id, status)
        -toggleDisable(id)
        -changeDate(days)
        -exportAllForms()
        -bindAuthGate()
    }

    class RpaViewController {
        +DOMContentLoaded()
        -loadRecord()
        -renderRecord(record)
        -toggleDisable()
        -renderBarcode(value)
    }

    class CubeSyncFormData {
        +COLLECTION_NAME
        +SETTINGS_COLLECTION
        +FORM_FIELD_CONFIG_DOC_ID
        +FORM_FIELD_CONFIG_STORAGE_KEY
        +FORM_FIELDS
        +REQUIRED_FORM_FIELDS
        +RESULT_FIELDS
        +DROPDOWN_OPTION_FIELDS
        +REQUEST_FIELD_LABELS
        +RESULT_FIELD_LABELS
        +CUSTOM_FIELD_TYPES
        +MAX_CUSTOM_REQUEST_FIELDS
        +defaultFormFieldConfig()
        +normalizeFormFieldConfig(raw)
        +normalizeCustomRequestFields(raw)
        +applyCustomRequestFields(container, config)
        +collectExtraFields(form)
        +validateExtraFields(extraFields, config)
        +readFormFieldConfigFromEditor(form)
        +applyFormFieldConfig(form, config, options)
        +syncNativeFormConstraints(form, options)
        +validateCubeRequestForm(form, config)
        +validateCubeRequestPayload(payload, config)
        +buildCubeRequestFromForm(form)
        +dashboardEditToCubeRequest(formData)
        +buildCubeRequestUpdatePatch(existing, payload)
        +normalizeCubeRequestForDashboard(data, id)
        +deriveFreeTextDropdownFields(data, optionsByField)
        +resolveFreeTextDropdownFields(data, optionsByField, metadataFields)
        +applyFreeTextFlags(form, customFieldNames)
    }

    class CubeSyncDashboardFilters {
        +parseDateKey(value)
        +collectFilterOptions(forms)
        +applyDashboardFilters(forms, criteria)
    }

    class CubeSyncFormMarkup {
        +RESULT_COLUMNS
        +resultTableHeadHtml()
        +resultRowHtml(rowCount)
        +seedResultRows(tableBody, count)
        +resultRowFieldNames(rowIndex)
    }

    class CubeSyncAutocomplete {
        +setupAutocomplete(inputName, fetchUrl, storageKey)
        +setFreeTextState(input, isFreeText)
    }

    class CubeSyncTableManager {
        +computeRowAge(row)
        +prefillRowFromRequest(row, form)
        +renumberRows(tableBody)
        +attachRowListeners(row, tableBody, renderBarcodeCb)
        +addResultRow(tableBody, form, renderBarcodeCb, onRowAdded)
    }

    class CubeSyncBarcode {
        +CODE_128_PATTERNS
        +sanitizeBarcodeText(value)
        +encodeCode128B(value)
        +renderBarcodeSvg(value, options)
    }

    class CubeSyncExport {
        +CSV_RESULT_HEADER_ROW
        +CSV_TEST_DATA_START_ROW
        +REQUEST_FIELDS
        +RESULT_FIELDS
        +buildFormCsv(form)
        +buildExportFiles(forms)
        +createZipBlob(files, modifiedAt)
        +downloadFilesAsZip(files, filename)
    }

    class CubeSyncFirestore {
        +listCubeRequests()
        +getCubeRequest(id)
        +saveCubeRequest(payload, id)
        +savePublicCubeRequest(payload, id, recaptchaToken)
        +updateCubeRequest(id, updates)
        +deleteCubeRequest(id)
        +getFormFieldConfig()
        +saveFormFieldConfig(config)
    }

    class CubeSyncAuth {
        +CUBESYNC_ALLOWED_EMAILS
        +onAuthChange(callback)
        +currentUser()
        +isAllowedEmail(email)
        +isAllowedUser(user)
        +signInWithGoogle()
        +signOutUser()
    }

    class CubeSyncChime {
        +playButtonChime()
        +playUpliftingChime()
        +showEncouragingPopup(message)
        +attachButtonChimes()
    }

    class CubeRequestSubmitApi {
        +handler(request, response)
        -setApiHeaders(request, response)
        -parseServiceAccount(raw)
        -initializeFirebaseAdmin()
        -verifyRecaptcha(token, remoteAddress)
        -cleanPayload(payload)
        -cleanExtraFields(value)
        -isValidDocumentId(id)
    }

    class FirestoreRules {
        +isCubeSyncStaff()
        +isCubeSyncAllowedEmail()
        +isValidCubeRequest(data)
        +isValidCubeRequestUpdate()
        +isValidFormFieldConfig(data)
        +isAdmin()
        +isActiveUser()
        +canWriteBookings()
    }

    AppController ..> CubeSyncFormData : validates and serializes
    AppController ..> CubeSyncFormMarkup : creates result rows
    AppController ..> CubeSyncAutocomplete : dropdowns
    AppController ..> CubeSyncTableManager : row behavior
    AppController ..> CubeSyncBarcode : barcode preview
    AppController ..> CubeSyncFirestore : load existing records
    AppController ..> CubeSyncChime : success feedback
    AppController ..> CubeRequestSubmitApi : public save

    DashboardController ..> CubeSyncAuth : gates staff access
    DashboardController ..> CubeSyncFirestore : CRUD and field settings
    DashboardController ..> CubeSyncFormData : normalize, edit, patch
    DashboardController ..> CubeSyncDashboardFilters : list filtering and sort
    DashboardController ..> CubeSyncFormMarkup : editor rows
    DashboardController ..> CubeSyncAutocomplete : editor dropdowns
    DashboardController ..> CubeSyncBarcode : detail and editor previews

    RpaDashboardController ..> CubeSyncAuth : gates RPA access
    RpaDashboardController ..> CubeSyncFirestore : queue status updates
    RpaDashboardController ..> CubeSyncFormData : queue normalization
    RpaDashboardController ..> CubeSyncExport : CSV and ZIP

    RpaViewController ..> CubeSyncAuth : gates single view
    RpaViewController ..> CubeSyncFirestore : loads request
    RpaViewController ..> CubeSyncFormData : displays fields
    RpaViewController ..> CubeSyncBarcode : barcode SVGs

    CubeSyncFirestore ..> CubeSyncAuth : same Firebase app
    CubeSyncFirestore ..> FirestoreRules : direct client writes
    CubeRequestSubmitApi ..> FirestoreRules : bypassed by Admin SDK
```

## 3. Firestore Domain Model

```mermaid
erDiagram
    CUBE_REQUEST ||--o{ CUBE_RESULT : contains
    CUBE_REQUEST ||--o{ EXTRA_FIELD_VALUE : stores
    FORM_FIELD_CONFIG ||--o{ CUSTOM_REQUEST_FIELD : defines
    FORM_FIELD_CONFIG ||--o{ FIELD_VISIBILITY : controls
    FORM_FIELD_CONFIG ||--o{ FIELD_LABEL_OVERRIDE : renames
    AUTH_USER ||--o{ CUBE_REQUEST : manages

    CUBE_REQUEST {
        string id PK
        string internalDate
        string projectCode
        string reportNo
        string client
        string method
        string project
        string concreteGrade
        string supplier
        string locationRepresented
        string dateTimeSampled
        string specimenSize
        string projectErp
        string customerBilling
        string projectNameOnReport
        string clientNameOnReport
        string contact
        boolean enableManualCubeJobNumber
        string cubeJobNumber
        string quote
        string testItem
        string dateOfCast
        string reportGrade
        string personInCharge
        string managerInCharge
        string_array customFields
        string erpStatus
        string rpaStatus
        string template
        string status
        timestamp createdAt
        timestamp updatedAt
    }

    CUBE_RESULT {
        string testNumber
        string dateTested
        number ageDays
        number weightKg
        number loadKn
        number strength
        string failureMode
        string setNo
        string size
        string specimenRef
        string barcode
        string specifiedSlump
        string meanSlump
        string resultGrade
        string resultDateOfCast
        string age
        string dateOfTest
        string invoiceNumber
    }

    EXTRA_FIELD_VALUE {
        string fieldId PK
        string label
        string type
        string_or_number_or_bool value
    }

    FORM_FIELD_CONFIG {
        string id PK
        map requestFields
        map resultFields
        map requestLabels
        map resultLabels
        timestamp updatedAt
    }

    CUSTOM_REQUEST_FIELD {
        string id PK
        string label
        string type
        boolean required
        boolean enabled
        string formLabel
    }

    FIELD_VISIBILITY {
        string fieldName PK
        string fieldGroup
        boolean enabled
    }

    FIELD_LABEL_OVERRIDE {
        string fieldName PK
        string fieldGroup
        string label
    }

    AUTH_USER {
        string uid PK
        string email
        boolean emailVerified
        boolean cubeSyncAllowed
        string workGridRole
    }
```

## 4. Public Submission Sequence

```mermaid
sequenceDiagram
    actor Customer
    participant FormPage as index.html or glassmorphic.html
    participant App as app.js
    participant FormData as CubeSyncFormData
    participant Recaptcha as Google reCAPTCHA
    participant Api as /api/cube-request-submit
    participant Admin as Firebase Admin SDK
    participant Firestore as Firestore cubeRequests

    Customer->>FormPage: Fill request and result fields
    FormPage->>App: submit event
    App->>FormData: validateCubeRequestForm(form, activeConfig)
    FormData-->>App: validation result
    App->>Recaptcha: getResponse(widgetId)
    Recaptcha-->>App: token
    App->>FormData: buildCubeRequestFromForm(form)
    FormData-->>App: payload with customFields, extraFields, results
    App->>Api: POST payload + recaptcha token
    Api->>Recaptcha: siteverify(secret, token, remoteip)
    Recaptcha-->>Api: success or failure
    Api->>Api: cleanPayload(payload)
    Api->>Admin: initializeFirebaseAdmin()
    Admin->>Firestore: add or update cubeRequests/{id}
    Firestore-->>Admin: write result
    Admin-->>Api: document id
    Api-->>App: JSON response
    App-->>Customer: save status and optional success chime
```

## 5. Staff Dashboard Edit Sequence

```mermaid
sequenceDiagram
    actor Staff
    participant DashboardPage as dashboard.html
    participant Dashboard as dashboard.js
    participant Auth as CubeSyncAuth
    participant Store as CubeSyncFirestore
    participant Rules as firestore.rules
    participant FormData as CubeSyncFormData
    participant Firestore as Firestore

    Staff->>DashboardPage: Open dashboard
    DashboardPage->>Dashboard: DOMContentLoaded
    Dashboard->>Auth: onAuthChange(callback)
    Auth-->>Dashboard: signed-in Google user
    Dashboard->>Auth: isAllowedUser(user)
    Auth-->>Dashboard: allowed or rejected
    Dashboard->>Store: getFormFieldConfig()
    Store->>Rules: read settings/formFieldConfig
    Rules-->>Store: allow if isCubeSyncStaff()
    Store-->>Dashboard: field config
    Dashboard->>Store: listCubeRequests()
    Store->>Rules: read cubeRequests
    Rules-->>Store: allow if isCubeSyncStaff()
    Store-->>Dashboard: raw records
    Dashboard->>FormData: normalizeCubeRequestForDashboard(record, id)
    FormData-->>Dashboard: dashboard model
    Staff->>Dashboard: Edit and save form
    Dashboard->>FormData: dashboardEditToCubeRequest(FormData)
    Dashboard->>FormData: buildCubeRequestUpdatePatch(existing, payload)
    FormData-->>Dashboard: changed fields only
    Dashboard->>Store: updateCubeRequest(id, patch)
    Store->>Rules: validate isValidCubeRequestUpdate()
    Rules-->>Store: allow or deny
    Store->>Firestore: update cubeRequests/{id}
    Firestore-->>Dashboard: updated record
```

## 6. RPA Queue And Export Sequence

```mermaid
sequenceDiagram
    actor Bot as RPA bot or staff operator
    participant RpaPage as rpa-dashboard.html
    participant Rpa as rpa-dashboard.js
    participant Auth as CubeSyncAuth
    participant Store as CubeSyncFirestore
    participant FormData as CubeSyncFormData
    participant Export as CubeSyncExport
    participant Firestore as Firestore

    Bot->>RpaPage: Open RPA queue
    RpaPage->>Rpa: DOMContentLoaded
    Rpa->>Auth: onAuthChange(callback)
    Auth-->>Rpa: allowed staff user
    Rpa->>Store: listCubeRequests()
    Store-->>Rpa: cube request documents
    Rpa->>FormData: normalizeCubeRequestForDashboard(record, id)
    FormData-->>Rpa: queue records
    Rpa-->>Bot: Render date-filtered queue

    alt Export selected queue
        Bot->>Rpa: Click export
        Rpa->>Export: buildExportFiles(forms)
        Export-->>Rpa: CSV file list
        Rpa->>Export: downloadFilesAsZip(files, filename)
        Export-->>Bot: ZIP download
    else Update ERP or RPA status
        Bot->>Rpa: Change status
        Rpa->>Store: updateCubeRequest(id, {erpStatus, rpaStatus})
        Store->>Firestore: update cubeRequests/{id}
        Firestore-->>Rpa: status persisted
    end
```

## 7. Request And Automation State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft: Public form saved as draft
    Draft --> Ready: Staff or submit flow marks ready
    Ready --> Archived: Staff archives completed work
    Draft --> Archived: Staff archives unused request
    Archived --> Ready: Staff restores request

    state Ready {
        [*] --> ReadyForBot
        ReadyForBot --> InProgress: ERP processing starts
        InProgress --> SubmittedToERP: ERP success
        InProgress --> Failed: ERP error
        Failed --> InProgress: Retry
        ReadyForBot --> Disabled: Operator disables RPA
        Disabled --> ReadyForBot: Operator enables RPA
        SubmittedToERP --> [*]
    }
```

## 8. Security Boundary Diagram

```mermaid
flowchart TB
    PublicUser["Public user"]
    StaffUser["Staff user with verified Google email"]
    WorkGridAdmin["WorkGrid admin / master"]

    PublicUser --> PublicApi["/api/cube-request-submit"]
    PublicApi --> CaptchaCheck["Server-side reCAPTCHA verification"]
    CaptchaCheck --> AdminWrite["Firebase Admin SDK write"]
    AdminWrite --> CubeRequests["cubeRequests"]

    StaffUser --> ClientFirestore["CubeSyncFirestore direct client access"]
    ClientFirestore --> CubeRules["isCubeSyncStaff()<br/>verified email + CubeSync allowlist"]
    CubeRules --> CubeRequests["cubeRequests"]
    CubeRules --> FieldConfig["settings/formFieldConfig"]
    CubeRules --> DropdownOptions["settings/dropdownOptions"]

    WorkGridAdmin --> WorkGridRules["isAdmin()<br/>hardcoded master, configured master,<br/>or active profile admin"]
    WorkGridRules --> WorkGridData["WorkGrid collections"]

    CubeRules -.->|"same organization overlap is intentional for selected admins"| WorkGridRules
```
