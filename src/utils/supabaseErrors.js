// Turns a low-level Supabase/Postgres error into a safe, user-friendly
// message. Full technical detail (code, message, hint) is only logged to
// the console outside production -- it is never shown to the user.
export function describeDbError(error, fallback, context = "") {
  if (!error) return fallback;
  if (process.env.NODE_ENV !== "production") {
    console.error(`[DB error]${context ? ` ${context}:` : ""}`, error);
  }
  switch (error.code) {
    case "23505":
      return "That record already exists. Please check for duplicates and try again.";
    case "23514":
      return friendlyCheckViolation(error) || "Please review the required fields — one of them doesn't meet the clinic's requirements.";
    case "23502":
      return "A required field is missing. Please fill in all required fields and try again.";
    case "23503":
      return "A related record could not be found. Please refresh the page and try again.";
    case "42501":
    case "PGRST301":
      return "You don't have permission to perform this action.";
    default:
      return fallback;
  }
}

function friendlyCheckViolation(error) {
  const text = String(error.message || error.details || "").toLowerCase();
  if (text.includes("address")) return "A complete address is required to register a pet owner.";
  if (text.includes("password")) return "The password does not meet the clinic's security requirements.";
  if (text.includes("phone")) return "Please enter a valid phone number.";
  if (text.includes("email")) return "Please enter a valid email address.";
  return null;
}
