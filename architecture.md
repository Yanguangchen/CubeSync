# CubeSync Architecture — UML Diagrams

Mermaid-based UML diagrams describing the system structure, data flow, and behavior of the CubeSync application.

---

## 1. Component Diagram

High-level view of how pages, shared modules, and external services connect.

```mermaid
graph TB
    subgraph Browser["Browser Pages"]
        IDX["index.html<br/>(Original Form)"]
        GLM["glassmorphic.html<br/>(Glassmorphic Form)"]
        DSH["dashboard.html<br/>(Human Dashboard)"]
        RPA["rpa-dashboard.html<br/>(RPA Queue)"]
        RPV["rpa-view.html<br/>(RPA Form View)"]
    end

    subgraph Controllers["Page Controllers"]
        APP["app.js"]
        DSHJS["dashboard.js"]
        RPAJS["rpa-dashboard.js"]
        RPVJS["rpa-view.js"]
    end

    subgraph SharedModules["Shared Modules (UMD)"]
        BC["barcode.js<br/>CubeSyncBarcode"]
        FD["cubesync-form-data.js<br/>CubeSyncFormData"]
        EX["cubesync-export.js<br/>CubeSyncExport"]
    end

    subgraph Firebase["Firebase (ES Module)"]
        FS["firestore.js<br/>CubeSyncFirestore + CubeSyncAuth"]
    end

    subgraph External["External Services"]
        FDB[("Firestore DB<br/>cubeRequests")]
        AUTH["Firebase Auth<br/>(Google OAuth)"]
        CDN["Firebase CDN<br/>v12.15.0"]
    end

    IDX --> APP
    GLM --> APP
    DSH --> DSHJS
    RPA --> RPAJS
    RPV --> RPVJS

    APP --> BC
    APP --> FD
    APP --> FS
    DSHJS --> BC
    DSHJS --> FD
    DSHJS --> FS
    RPAJS --> BC
    RPAJS --> FD
    RPAJS --> EX
    RPAJS --> FS
    RPVJS --> BC
    RPVJS --> FS

    FS --> CDN
    FS --> FDB
    FS --> AUTH
```

---

## 2. Class Diagram — Shared Module APIs

Each box represents a global object exposed on `window.*`. Methods and constants are listed with their signatures.

```mermaid
classDiagram
    class CubeSyncBarcode {
        +Array~String~ CODE_128_PATTERNS
        +encodeCode128B(value: String) Object
        +renderBarcodeSvg(value: String, options?: Object) String
        +sanitizeBarcodeText(value: String) String
    }

    class CubeSyncFormData {
        +String COLLECTION_NAME
        +Array~String~ FORM_FIELDS
        +Array~String~ RESULT_FIELDS
        +buildCubeRequestFromForm(form: HTMLForm) Object
        +normalizeCubeRequestForDashboard(data: Object, id: String) Object
        +dashboardEditToCubeRequest(formData: FormData) Object
    }

    class CubeSyncExport {
        +Number CSV_RESULT_HEADER_ROW
        +Number CSV_TEST_DATA_START_ROW
        +Array~Object~ REQUEST_FIELDS
        +Array~Object~ RESULT_FIELDS
        +buildFormCsv(form: Object) String
        +buildExportFiles(forms: Array) Array~Object~
        +createZipBlob(files: Array, modifiedAt?: Date) Blob
        +downloadFilesAsZip(files: Array, filename: String) Blob
    }

    class CubeSyncFirestore {
        +String COLLECTION_NAME
        +Object firebaseConfig
        +listCubeRequests() Promise~Array~
        +getCubeRequest(id: String) Promise~Object~
        +saveCubeRequest(payload: Object, id?: String) Promise~String~
        +updateCubeRequest(id: String, updates: Object) Promise~void~
        +deleteCubeRequest(id: String) Promise~String~
    }

    class CubeSyncAuth {
        +Array~String~ CUBESYNC_ALLOWED_EMAILS
        +onAuthChange(callback: Function) Function
        +currentUser() User
        +isAllowedEmail(email: String) Boolean
        +isAllowedUser(user: User) Boolean
        +signInWithGoogle() Promise~User~
        +signOutUser() Promise~void~
    }

    CubeSyncFirestore ..> CubeSyncAuth : "same file (firestore.js)"

    class AppController {
        -Number currentStep
        -String currentDocId
        -renderBarcode(input: Element) void
        -resultRowHtml(rowCount: Number) String
        -setSaveStatus(el: Element, msg: String, err: Boolean) void
        -populateForm(form, data, tbody, addRow, renumber) void
        -updateSteps() void
        -renumberRows() void
        -addResultRow() void
    }

    class DashboardController {
        -Object state
        -renderForms() void
        -viewForm(id: String) void
        -loadForms() void
        -openEditor(id: String) void
        -saveEditedForm(event: Event) void
        -deleteForm(id: String) void
        -printForm(id: String) void
        -filteredForms() Array
        -bindAuthGate() void
    }

    class RPADashboardController {
        -Object state
        -renderQueue() void
        -loadQueue() void
        -updateERPStatus(id: String, status: String) void
        -toggleDisable(id: String) void
        -changeDate(days: Number) void
        -exportAllForms() void
        -getFilteredQueue() Array
        -bindAuthGate() void
    }

    class RPAViewController {
        -Object currentRecord
        -String documentId
        -renderRecord(record: Object) void
        -loadRecord() void
        -toggleDisable() void
        -renderBarcode(value: String) String
    }

    AppController --> CubeSyncBarcode : uses
    AppController --> CubeSyncFormData : uses
    AppController --> CubeSyncFirestore : uses

    DashboardController --> CubeSyncBarcode : uses
    DashboardController --> CubeSyncFormData : uses
    DashboardController --> CubeSyncFirestore : uses
    DashboardController --> CubeSyncAuth : uses

    RPADashboardController --> CubeSyncBarcode : uses
    RPADashboardController --> CubeSyncFormData : uses
    RPADashboardController --> CubeSyncExport : uses
    RPADashboardController --> CubeSyncFirestore : uses
    RPADashboardController --> CubeSyncAuth : uses

    RPAViewController --> CubeSyncBarcode : uses
    RPAViewController --> CubeSyncFirestore : uses
```

---

## 3. Sequence Diagram — Form Submission

How a user fills out and saves a concrete cube request form.

```mermaid
sequenceDiagram
    actor User
    participant Form as Form Page (app.js)
    participant BC as CubeSyncBarcode
    participant RC as reCAPTCHA v2 (Google)
    participant API as /api/cube-request-submit (Vercel)
    participant DB as Firestore DB (Firebase)

    User->>Form: Fill in request fields
    User->>Form: Type barcode text
    Form->>BC: renderBarcodeSvg(text)
    BC-->>Form: SVG string
    Form->>Form: Insert SVG into preview div

    User->>Form: Click "Add Row"
    Form->>Form: addResultRow() → append TR

    User->>Form: Click Save / Final Step
    
    rect rgb(240, 240, 240)
        Note over Form, RC: reCAPTCHA Flow
        Form->>Form: renderRecaptcha() (polls for grepcaptcha)
        User->>RC: Complete challenge
        Form->>RC: getResponse(widgetId)
        RC-->>Form: recaptchaToken
    end

    Form->>API: POST payload + recaptchaToken
    
    rect rgb(240, 240, 240)
        Note over API, RC: Server-Side Verification
        API->>RC: Verify token with CUBESYNC_RECAPTCHA_SECRET_KEY
        RC-->>API: { success: true, ... }
    end

    API->>DB: Admin SDK set / add
    DB-->>API: document ID
    API-->>Form: { id: documentID }
    
    Form->>Form: Update URL with ?id=docId
    Form->>Form: Show "Saved" status
```

---

## 4. Security Architecture

CubeSync employs a hybrid security model to balance ease-of-use for customers with strict access control for internal staff.

### Public Submissions
Customers submitting cube requests do not need to sign in. Security is maintained through:
1.  **reCAPTCHA v2:** Prevents automated spam submissions.
2.  **API Proxy:** All public writes go through `/api/cube-request-submit`. This serverless function acts as a gatekeeper, verifying reCAPTCHA before using elevated Admin SDK privileges to write to Firestore.
3.  **Schema Validation:** The API function strictly validates the incoming JSON payload against the `FORM_FIELDS`, `ALLOWED_TEMPLATES`, and `ALLOWED_STATUSES` sets to prevent malicious data injection.

### Internal Operations
Dashboard and RPA operations require Google Authentication:
1.  **Firestore Rules:** The `firestore.rules` file enforces `allow read, write: if isSignedIn();` for the `cubeRequests` collection.
2.  **Application Allowlist:** `firestore.js` maintains `CUBESYNC_ALLOWED_EMAILS`. Even if a user is signed in to Firebase, the UI remains locked unless their email is in the allowlist.
3.  **Security Rule Mirrors:** The Firestore rules should ideally mirror this allowlist for defense-in-depth (see `firestore.rules`).

---

## 5. Sequence Diagram — Dashboard CRUD Flow

How the human dashboard loads, displays, edits, and deletes forms.

```mermaid
sequenceDiagram
    actor User
    participant DSH as Dashboard (dashboard.js)
    participant Auth as CubeSyncAuth
    participant FD as CubeSyncFormData
    participant FS as CubeSyncFirestore
    participant DB as Firestore DB

    User->>DSH: Open dashboard.html
    DSH->>Auth: onAuthChange(callback)

    alt No authenticated user
        DSH->>DSH: Show auth gate (locked)
        User->>DSH: Click "Sign in with Google"
        DSH->>Auth: signInWithGoogle()
        Auth-->>DSH: user
    end

    DSH->>Auth: isAllowedUser(user)
    DSH->>DSH: Unlock dashboard shell

    DSH->>FS: listCubeRequests()
    FS->>DB: getDocs(cubeRequests)
    DB-->>FS: snapshots
    FS-->>DSH: raw form array

    loop Each form
        DSH->>FD: normalizeCubeRequestForDashboard(data, id)
        FD-->>DSH: normalized record
    end
    DSH->>DSH: renderForms() → table

    User->>DSH: Click row → viewForm(id)
    DSH->>DSH: Render detail panel with barcodes

    User->>DSH: Click Edit → openEditor(id)
    DSH->>DSH: Populate dialog from state
    User->>DSH: Modify fields, submit dialog
    DSH->>FD: dashboardEditToCubeRequest(formData)
    FD-->>DSH: updates object
    DSH->>FS: updateCubeRequest(id, updates)
    FS->>DB: updateDoc
    DSH->>DSH: Reload forms

    User->>DSH: Click Delete
    DSH->>DSH: window.confirm()
    DSH->>FS: deleteCubeRequest(id)
    FS->>DB: deleteDoc
    DSH->>DSH: Reload forms
```

---

## 5. Sequence Diagram — RPA Export Flow

How the RPA dashboard exports all forms as a CSV ZIP archive.

```mermaid
sequenceDiagram
    actor User
    participant RPA as RPA Dashboard (rpa-dashboard.js)
    participant EX as CubeSyncExport
    participant FS as CubeSyncFirestore

    User->>RPA: Click "Export all CSV"
    RPA->>RPA: Collect state.forms

    RPA->>EX: buildExportFiles(forms)

    loop Each form
        EX->>EX: buildFormCsv(form)
        EX->>EX: rawValue() → csvCell() → csvRow()
    end

    EX-->>RPA: Array of {name, content}

    RPA->>EX: downloadFilesAsZip(files, archiveName)
    EX->>EX: createZipBlob(files)
    EX->>EX: Compute CRC-32, build ZIP headers
    EX-->>RPA: Blob

    EX->>EX: Create <a> element, click(), revokeObjectURL()
    Note right of EX: Browser downloads ZIP file
```

---

## 6. State Machine — Form Multi-Step Wizard

The stepped form navigation in `app.js`.

```mermaid
stateDiagram-v2
    [*] --> Step1 : DOMContentLoaded

    Step1 : Step 1 — Request Details
    Step2 : Step 2 — Test Results

    Step1 --> Step2 : Click "Next"
    Step2 --> Step1 : Click "Previous"
    Step1 --> Step1 : Click step indicator 1
    Step2 --> Step2 : Click step indicator 2

    Step2 --> SaveOrPrint : Click "Save" / "Print"

    state SaveOrPrint <<choice>>
    SaveOrPrint --> FormSubmission : Glassmorphic template
    SaveOrPrint --> PrintDialog : Original template

    FormSubmission : Submit to Firestore
    PrintDialog : window.print()

    FormSubmission --> Step2 : Save complete
    PrintDialog --> Step2 : Print dialog closed
```

---

## 7. State Machine — Auth Gate

Shared auth flow used by `dashboard.js` and `rpa-dashboard.js`.

```mermaid
stateDiagram-v2
    [*] --> Locked : Page loads

    Locked : Auth gate visible
    Locked : Dashboard shell hidden

    Locked --> CheckingUser : onAuthChange fires

    state CheckingUser <<choice>>
    CheckingUser --> Locked : No user (signed out)
    CheckingUser --> Rejected : User not in allowlist
    CheckingUser --> Unlocked : User is allowed

    Rejected : Sign out immediately
    Rejected : Show "Unauthorized" alert
    Rejected --> Locked : Auto sign-out

    Unlocked : Auth gate hidden
    Unlocked : Dashboard shell visible
    Unlocked --> LoadingData : loadForms() / loadQueue()

    LoadingData --> Ready : Data loaded
    LoadingData --> ErrorState : Firestore error

    Ready : Forms / queue rendered
    ErrorState : Error message shown

    Ready --> Locked : Click "Sign out"
    ErrorState --> Locked : Click "Sign out"
```

---

## 8. State Machine — RPA Status Lifecycle

How a form's RPA and ERP statuses evolve.

```mermaid
stateDiagram-v2
    [*] --> ReadyForBot : Form submitted

    ReadyForBot : rpaStatus = "Ready for Bot"
    ReadyForBot : erpStatus = "Pending"

    ReadyForBot --> Disabled : Toggle disable
    Disabled --> ReadyForBot : Toggle disable

    Disabled : rpaStatus = "Disabled"
    Disabled : ERP dropdown hidden

    ReadyForBot --> InProgress : ERP set to "Processing"
    InProgress : rpaStatus = "In Progress"
    InProgress : erpStatus = "Processing"

    InProgress --> SubmittedToERP : ERP set to "Success"
    SubmittedToERP : rpaStatus = "Submitted to ERP"
    SubmittedToERP : erpStatus = "Success"

    InProgress --> Failed : ERP set to "Error"
    Failed : rpaStatus = "Failed"
    Failed : erpStatus = "Error"

    Failed --> ReadyForBot : ERP reset to "Pending"
    SubmittedToERP --> ReadyForBot : ERP reset to "Pending"
```

---

## 9. Entity-Relationship Diagram — Data Model

The Firestore document structure for `cubeRequests`.

```mermaid
erDiagram
    CUBE_REQUEST {
        string id PK "Firestore document ID"
        string reportNo "e.g. RAK-CUBE-001"
        string client "Client company name"
        string project "Project name"
        string projectCode "Internal project code"
        string method "Test method"
        string concreteGrade "e.g. C50"
        string supplier "Concrete supplier"
        string locationRepresented "Sampling location"
        string additionalInformation "Free-text notes"
        string specimenSize "e.g. 150mm"
        number slumpMeasured "Measured slump (mm)"
        number slumpSpecified "Specified slump (mm)"
        string internalDate "Internal reference date"
        timestamp dateTimeSampled "When sample was taken"
        string template "Original or Glassmorphic"
        string status "Draft, Ready, Archived"
        string rpaStatus "Ready for Bot, In Progress, etc."
        string erpStatus "Pending, Processing, Success, Error"
        number attemptCount "RPA retry count"
        timestamp createdAt "Server timestamp"
        timestamp updatedAt "Server timestamp"
    }

    TEST_RESULT {
        number testNumber "Sequential row index"

        string dateTested "Date of test"
        number ageDays "Age in days"
        number weightKg "Weight (kg)"
        number loadKn "Load (kN)"
        number strength "Compressive strength"
        string failureMode "Type of failure"
        string barcode "Barcode text (not SVG)"
    }

    CUBE_REQUEST ||--o{ TEST_RESULT : "results[]"
```

---

## 10. File Dependency Graph

Which source files depend on which.

```mermaid
graph LR
    subgraph Pages
        A1[index.html]
        A2[glassmorphic.html]
        A3[dashboard.html]
        A4[rpa-dashboard.html]
        A5[rpa-view.html]
    end

    subgraph Styles
        S1[styles.css]
        S2[glassmorphic.css]
        S3[dashboard.css]
        S4[rpa-dashboard.css]
    end

    subgraph Scripts
        B[barcode.js]
        F[cubesync-form-data.js]
        E[cubesync-export.js]
        G[firestore.js]
        C1[app.js]
        C2[dashboard.js]
        C3[rpa-dashboard.js]
        C4[rpa-view.js]
    end

    A1 --- S1
    A1 --- B & F & G & C1
    A2 --- S2
    A2 --- B & F & G & C1
    A3 --- S3
    A3 --- B & F & G & C2
    A4 --- S3 & S4
    A4 --- B & F & E & G & C3
    A5 --- S3
    A5 --- B & F & G & C4

    C1 -.->|uses| B & F & G
    C2 -.->|uses| B & F & G
    C3 -.->|uses| B & F & E & G
    C4 -.->|uses| B & G
```

---

## 11. Test Architecture

How the three testing tiers cover the source code.

```mermaid
graph TB
    subgraph UnitTests["Unit Tests (pure functions)"]
        T1["barcode.test.js<br/>7 tests"]
        T2["export.test.js<br/>5 tests"]
        T3["form-data.test.js<br/>4 tests"]
    end

    subgraph FunctionalTests["Functional Tests (JSDOM + mocks)"]
        T4["app-functional.test.js<br/>3 tests"]
        T5["dashboard-functional.test.js<br/>2 tests"]
        T6["rpa-functional.test.js<br/>2 tests"]
    end

    subgraph ContractTests["Contract Tests (static regex)"]
        T7["form.test.js<br/>3 tests"]
        T8["dashboard.test.js<br/>1 test"]
        T9["firestore.test.js<br/>2 tests"]
        T10["rpa-view.test.js<br/>2 tests"]
    end

    T1 -->|covers| B[barcode.js]
    T2 -->|covers| E[cubesync-export.js]
    T3 -->|covers| F[cubesync-form-data.js]

    T4 -->|exercises| C1[app.js]
    T5 -->|exercises| C2[dashboard.js]
    T6 -->|exercises| C3[rpa-dashboard.js]
    T6 -->|exercises| C4[rpa-view.js]

    T7 -.->|validates structure| C1
    T7 -.->|validates structure| HTMLForms[index.html + glassmorphic.html]
    T8 -.->|validates structure| C2
    T9 -.->|validates structure| G[firestore.js]
    T10 -.->|validates structure| C3
    T10 -.->|validates structure| C4
```
