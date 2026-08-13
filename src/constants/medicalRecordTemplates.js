export const MEDICAL_RECORD_TEMPLATES = [
  {
    value: "health-record",
    label: "Health Record",
    description: "General consultation, diagnosis, treatment, and follow-up.",
  },
  {
    value: "parasite-prevention",
    label: "Parasite Prevention",
    description: "Internal and external parasite-control treatments.",
  },
  {
    value: "heartworm",
    label: "Heartworm Tests & Prevention",
    description: "Heartworm screening results and preventive care.",
  },
  {
    value: "dental",
    label: "Dental Record",
    description: "Oral-health examination, dental findings, and care.",
  },
  {
    value: "vaccination",
    label: "Vaccination Record",
    description: "Vaccines administered, age, weight, and signature.",
  },
  {
    value: "pet-profile",
    label: "Pet Health Profile",
    description: "Pet and guardian details for the front Health Record page.",
  },
];

export const DEFAULT_MEDICAL_RECORD_TEMPLATE = "health-record";

export function getMedicalRecordTemplate(value) {
  return (
    MEDICAL_RECORD_TEMPLATES.find((template) => template.value === value) ||
    MEDICAL_RECORD_TEMPLATES[0]
  );
}
