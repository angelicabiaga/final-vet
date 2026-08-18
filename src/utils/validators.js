export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
export const INVALID_IMAGE_TYPE_MESSAGE = "Only JPG, JPEG, PNG, and WEBP images are allowed.";
export const IMAGE_TOO_LARGE_MESSAGE = "Image must not exceed 25 MB.";

export function validateImageFile(file) {
  if (!file) return;
  const typeOk = ALLOWED_IMAGE_TYPES.includes(String(file.type || "").toLowerCase()) || ALLOWED_IMAGE_EXTENSIONS.test(file.name || "");
  if (!typeOk) throw new Error(INVALID_IMAGE_TYPE_MESSAGE);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(IMAGE_TOO_LARGE_MESSAGE);
}

export const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
export const INVALID_PH_MOBILE_MESSAGE = "Enter a valid Philippine mobile number.";

export function isValidPhMobile(value) {
  return PH_MOBILE_REGEX.test(String(value || "").trim());
}

export const FIRST_NAME_REQUIRED_MESSAGE = "First name is required.";
export const LAST_NAME_REQUIRED_MESSAGE = "Last name is required.";

export function validateRequiredName(firstName, lastName) {
  if (!String(firstName || "").trim()) throw new Error(FIRST_NAME_REQUIRED_MESSAGE);
  if (!String(lastName || "").trim()) throw new Error(LAST_NAME_REQUIRED_MESSAGE);
}

// Order matters: each rule's message doubles as the live-checklist label, so
// keep them short and in the order the checklist should display them.
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { key: "upper", label: "One uppercase letter (A–Z)", test: (value) => /[A-Z]/.test(value) },
  { key: "lower", label: "One lowercase letter (a–z)", test: (value) => /[a-z]/.test(value) },
  { key: "number", label: "One number (0–9)", test: (value) => /[0-9]/.test(value) },
  { key: "special", label: "One special character (!@#$%^&*, etc.)", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export function getPasswordRuleStatus(password) {
  const value = String(password || "");
  return PASSWORD_RULES.map((rule) => ({ key: rule.key, label: rule.label, met: rule.test(value) }));
}

export function isPasswordValid(password) {
  return getPasswordRuleStatus(password).every((rule) => rule.met);
}

export function validatePassword(password) {
  const failed = getPasswordRuleStatus(password).find((rule) => !rule.met);
  if (failed) throw new Error(`Password does not meet all requirements: ${failed.label}.`);
}

export const PASSWORDS_DO_NOT_MATCH_MESSAGE = "Passwords do not match. Please re-enter to confirm.";

export function validatePasswordsMatch(password, confirmPassword) {
  if (String(password || "") !== String(confirmPassword || "")) throw new Error(PASSWORDS_DO_NOT_MATCH_MESSAGE);
}
