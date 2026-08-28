// Shared between the web (CRA) and mobile (Expo) apps -- plain data only,
// no DOM/React Native imports, so it works from both bundlers.

export const PRIVACY_NOTICE_VERSION = "1.0";

// Split so the UI can render "PawCruz Privacy Notice" as an inline
// clickable link in the middle of one sentence.
export const CONSENT_CHECKBOX_PREFIX = "I have read and agree to the ";
export const CONSENT_CHECKBOX_LINK_TEXT = "PawCruz Privacy Notice";
export const CONSENT_CHECKBOX_SUFFIX =
  " and consent to the collection, use, storage, and processing of my personal information for account registration and veterinary clinic services.";

export const MARKETING_CONSENT_TEXT =
  "I agree to receive optional clinic promotions, offers, and marketing announcements.";

export const CONSENT_REQUIRED_ERROR = "You must agree to the Data Privacy Consent before continuing.";

export const PRIVACY_NOTICE_SECTIONS = [
  {
    heading: "Introduction",
    body:
      "PawCruz (Cruz Veterinary Clinic) is committed to protecting the privacy of Pet Owners who register for an account and use our services, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.",
  },
  {
    heading: "Information We Collect",
    body:
      "When you create a Pet Owner account, we collect your full name, username, email address, contact number, and home address. Additional information -- such as your pets' details, appointment history, and medical records -- is collected as you use the clinic's services.",
  },
  {
    heading: "How We Use Your Information",
    body:
      "Your personal information is used to create and manage your account, schedule and manage appointments, communicate with you about your pets' care, process transactions, and fulfill our legal and regulatory obligations as a veterinary clinic.",
  },
  {
    heading: "Data Sharing and Disclosure",
    body:
      "Your information is accessible only to authorized PawCruz staff and veterinarians directly involved in your account and your pets' care. We do not sell your personal information, and we only disclose it to third parties when required by law or with your explicit consent.",
  },
  {
    heading: "Data Retention and Security",
    body:
      "We retain your personal information for as long as your account is active and as needed to comply with legal, regulatory, and recordkeeping requirements. We apply reasonable organizational and technical safeguards to protect your information from unauthorized access, use, or disclosure.",
  },
  {
    heading: "Your Rights",
    body:
      "Under the Data Privacy Act, you have the right to be informed, to access, to object, to correct, to erase or block, to data portability, and to file a complaint with the National Privacy Commission. You may also withdraw consent to optional marketing communications at any time without affecting your account or access to clinic services.",
  },
  {
    heading: "Contact Us",
    body:
      "For questions or concerns about this Privacy Notice or your personal information, please visit or contact Cruz Veterinary Clinic at 2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City, or call 0938 537 649 / 0917 165 379.",
  },
];
