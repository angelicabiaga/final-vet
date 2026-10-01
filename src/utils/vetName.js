// Veterinarian full_name is saved both with and without the title
// ("Dr. Redmond Lopez", "Neil Norrman A. Cruz"). Always strip whatever title
// is already there and add it back once, so nothing ever prints "Dr. Dr.".
const DR_PREFIX = /^(?:dr\.\s*|dr\s+)+/i;

export function stripDrTitle(name) {
  return String(name || "").trim().replace(DR_PREFIX, "").trim();
}

export function withDrTitle(name, fallback = "") {
  const bare = stripDrTitle(name);
  return bare ? `Dr. ${bare}` : fallback;
}
