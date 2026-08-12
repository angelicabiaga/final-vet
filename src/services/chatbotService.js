function createError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getDemoReply(message) {
  const text = message.toLowerCase();

  if (
    /(?:cannot|can't|difficulty|trouble).*(?:breathe|breathing)/.test(text) ||
    /(?:seizure|collapsed|unconscious|poison|toxin|severe bleeding|bloated abdomen)/.test(text)
  ) {
    return {
      reply:
        "This may be an emergency. Please contact the nearest emergency veterinary clinic now. Keep your pet calm, do not give food or medicine unless a veterinarian tells you to, and bring any suspected toxin packaging with you.",
      urgency: "emergency",
      suggestedAction: "emergency_vet"
    };
  }

  if (
    /(?:no|lost|loss of|poor|decreased).*(?:appetite)/.test(text) ||
    /(?:not|won't|will not).*(?:eat|eating)/.test(text)
  ) {
    return {
      reply:
        "A reduced appetite can have many causes, so there is no single safe quick remedy. How long has your pet not been eating? Are they drinking, vomiting, having diarrhea, showing pain or low energy, or could they have reached a toxin or foreign object? Offer fresh water and their usual food, but do not force-feed or give human medicine. Contact the clinic today if it continues or if any other symptoms are present.",
      urgency: "same_day",
      suggestedAction: "contact_clinic"
    };
  }

  if (/(?:human medicine|paracetamol|acetaminophen|ibuprofen|aspirin|medicine dose|dosage)/.test(text)) {
    return {
      reply:
        "Please do not give human medicine or guess a dose. Some common medicines are toxic to pets, and the safe treatment depends on species, weight, age, and health history. Contact a veterinarian for advice.",
      urgency: "same_day",
      suggestedAction: "contact_clinic"
    };
  }

  if (/(?:vomit|vomiting|diarrhea|loose stool)/.test(text)) {
    return {
      reply:
        "Please tell me how often this is happening, when it started, and whether there is blood, weakness, pain, refusal to drink, or possible toxin exposure. Repeated symptoms, blood, marked weakness, or inability to keep water down need prompt veterinary care. Do not give human medicine.",
      urgency: "same_day",
      suggestedAction: "contact_clinic"
    };
  }

  if (/(?:itch|itchy|scratching|skin rash|hot spot)/.test(text)) {
    return {
      reply:
        "Itching can come from fleas, allergies, irritation, or infection. Check gently for fleas, swelling, wounds, discharge, and rapidly spreading redness, and prevent excessive licking if you can do so safely. A clinic visit is best if it is persistent, painful, spreading, or affecting sleep or appetite.",
      urgency: "routine",
      suggestedAction: "book_appointment"
    };
  }

  return {
    reply:
      "I can give basic educational guidance. Please share your pet type, age, main symptom, when it started, whether it is getting worse, and any changes in eating, drinking, energy, breathing, vomiting, or stool. A veterinarian should examine urgent, severe, or persistent problems.",
    urgency: "unknown",
    suggestedAction: "contact_clinic"
  };
}

export async function askPetAssistant({ messages }) {
  const latestUserMessage = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .at(-1);

  if (!latestUserMessage) {
    throw createError("Please enter a question for the pet care assistant.", "INVALID_REQUEST");
  }

  return getDemoReply(latestUserMessage);
}
