export const GATE_AUDIT_ACTIONS = [
  { value: "", label: "All actions" },
  { value: "login_success", label: "Successful Login" },
  { value: "login_failed", label: "Failed Login" },
  { value: "logout", label: "Logout" },
  { value: "qr_scan_success", label: "QR Scan Success" },
  { value: "qr_scan_denied", label: "QR Scan Denied" },
  { value: "manual_entry", label: "Manual Entry" },
  { value: "password_reset", label: "Password Reset" },
  { value: "account_created", label: "Account Created" },
  { value: "account_deactivated", label: "Account Deactivated" },
  { value: "account_reactivated", label: "Account Reactivated" },
  { value: "account_deleted", label: "Account Deleted" },
];

export const GATE_AUDIT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "denied", label: "Denied" },
  { value: "warning", label: "Account Changes" },
  { value: "info", label: "Info" },
];

export const DEFAULT_GATE_AUDIT_FILTERS = {
  q: "",
  account: "",
  performed_by: "",
  action_type: "",
  status: "",
  date_from: "",
  date_to: "",
};
