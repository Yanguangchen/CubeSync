/**
 * Node-safe schema definitions and validation logic for CubeSync API endpoints.
 * This facade module exports only the schema constants and purely functional validators,
 * strictly excluding browser-specific DOM manipulation methods.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cubesync-form-data"));
  } else {
    root.CubeSyncSchema = factory(root.CubeSyncFormData);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (formData) {
  "use strict";

  if (!formData) {
    return {};
  }

  const NODE_SAFE_SCHEMA_KEYS = [
    "COLLECTION_NAME",
    "SETTINGS_COLLECTION",
    "FORM_FIELD_CONFIG_DOC_ID",
    "FORM_FIELD_CONFIG_STORAGE_KEY",
    "FORM_FIELDS",
    "REQUIRED_FORM_FIELDS",
    "RESULT_FIELDS",
    "DROPDOWN_OPTION_FIELDS",
    "DEFAULT_FORM_FIELD_CONFIG",
    "normalizeFormFieldConfig",
    "normalizeCustomFieldDefinition",
    "normalizeCustomRequestFields",
    "isValidCustomFieldId",
    "customFieldInputName",
    "getCustomFieldFormLabel",
    "getCustomRequestFields",
    "getEnabledCustomRequestFields",
    "normalizeExtraFields",
    "validateExtraFields",
    "formatCustomFieldDisplayValue",
    "getExtraFieldValue",
    "getActiveRequiredFormFields",
    "isRequestFieldEnabled",
    "isResultFieldEnabled",
    "getRequestFieldLabel",
    "getResultFieldLabel",
    "isDropdownFreeTextField",
    "deriveFreeTextDropdownFields",
    "mergeFreeTextDropdownFields",
    "resolveFreeTextDropdownFields",
    "collectFlaggedDropdownValues",
    "normalizeDropdownOptionList",
    "readSharedDropdownOptions",
    "buildSharedDropdownAddValues",
    "buildSharedDropdownSaveValues",
    "isRequestFieldFilled",
    "FIXED_TEST_ITEM_VALUE",
    "getDefaultCastDate",
    "validateCubeRequestPayload",
    "normalizeCubeRequestForDashboard",
    "CUBE_REQUEST_UPDATE_FIELDS",
    "sanitizeCubeRequestUpdatePayload",
    "buildCubeRequestUpdatePatch",
    "EDIT_HISTORY_SENSITIVE_FIELDS",
    "buildEditHistoryChanges",
    "changesRequireReason"
  ];

  const schema = {};
  NODE_SAFE_SCHEMA_KEYS.forEach((key) => {
    if (key in formData) {
      schema[key] = formData[key];
    }
  });

  return Object.freeze(schema);
});
