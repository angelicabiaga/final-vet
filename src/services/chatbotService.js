import { supabase } from "../config/supabaseClient";

// PawCruz Pet Care Assistant. Answers come from Groq (same key and model as
// the medical-record and inventory AI features: REACT_APP_GROQ_API_KEY).
// Without a key, or if the AI can't be reached, the built-in guidance below
// answers instead, so the assistant always replies with something safe.

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;
const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const URGENCIES = ["emergency", "same_day", "routine", "unknown"];
const ACTIONS = ["emergency_vet", "contact_clinic", "book_appointment", "none"];

const SYSTEM_PROMPT = `You are the PawCruz Pet Care Assistant for Cruz Veterinary Clinic (PawCruz), chatting with a pet owner in the PawCruz app.

Clinic facts:
- Open every day, 9:00 AM to 7:00 PM.
- Owners book a General Consultation from the Book Appointment page (choose the pet, veterinarian, date and an available time).
- My Queue shows their queue number on the visit day; Animal Patients shows each pet's records and vaccinations.

How to help:
- Give practical, educational pet-care guidance in plain, friendly language. You are not a veterinarian and cannot examine the pet.
- Never give a definite diagnosis. Never give medicine names with doses, and never suggest human medicines (paracetamol, ibuprofen, aspirin and similar are dangerous for pets).
- If details are missing, ask one or two short follow-up questions (species, age, how long, other symptoms).
- Emergency signs (trouble breathing, collapse, seizures, suspected poisoning, heavy bleeding, bloated or hard belly, straining to urinate with nothing coming out, heat stroke, being hit by a vehicle): tell them to go to the nearest emergency veterinary clinic now.
- Only answer about pets, pet care and the clinic. For anything else, politely say you can only help with pet care and PawCruz.
- Keep replies short: at most about 120 words, short paragraphs, "- " for lists. Plain text only: no markdown, no asterisks, no headings.

Respond with ONLY a JSON object, no other text:
{"reply": "<your message to the owner>", "urgency": "emergency" | "same_day" | "routine" | "unknown", "suggestedAction": "emergency_vet" | "contact_clinic" | "book_appointment" | "none"}
urgency: emergency = needs a vet right now; same_day = should be seen or call the clinic today; routine = can wait for a normal appointment; unknown = not enough information or not a health question.
suggestedAction: emergency_vet for emergencies, contact_clinic when they should call the clinic, book_appointment when a normal visit makes sense, none otherwise.`;

function createError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const EMERGENCY_PATTERN = /(?:cannot|can't|difficulty|trouble|not).*(?:breathe|breathing)|seizure|collapsed|unconscious|poison|toxin|severe bleeding|bleeding (?:a lot|heavily)|bloated (?:abdomen|belly|stomach)|hit by a (?:car|vehicle)|heat ?stroke/;

// Built-in guidance: used without an API key or when the AI is unreachable,
// and as a safety net so emergency wording is never under-triaged.
function getOfflineReply(message) {
  const text = message.toLowerCase();

  if (EMERGENCY_PATTERN.test(text)) {
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

function ageText(dateOfBirth) {
  if (!dateOfBirth) return "";
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return "";
  const months = Math.max(0, Math.floor((Date.now() - born.getTime()) / (30.44 * 24 * 3600 * 1000)));
  return months >= 24 ? `${Math.floor(months / 12)} years` : `${months} months`;
}

// The selected pet's basics, so answers fit the animal (best effort).
async function getPetContext(petId) {
  if (!petId) return "";
  try {
    const { data } = await supabase.from("pets")
      .select("pet_name, species, breed, sex, date_of_birth, weight, allergies, existing_conditions")
      .eq("id", petId)
      .maybeSingle();
    if (!data) return "";
    const facts = [
      `Name: ${data.pet_name}`,
      data.species && `Species: ${data.species}`,
      data.breed && `Breed: ${data.breed}`,
      data.sex && data.sex !== "Unknown" && `Sex: ${data.sex}`,
      ageText(data.date_of_birth) && `Age: about ${ageText(data.date_of_birth)}`,
      data.weight && `Weight: ${data.weight} kg`,
      data.allergies && `Known allergies: ${data.allergies}`,
      data.existing_conditions && `Existing conditions: ${data.existing_conditions}`
    ].filter(Boolean);
    return `The owner is asking about this pet:\n${facts.join("\n")}`;
  } catch {
    return "";
  }
}

// Plain text for the chat bubble: no markdown symbols the model may add.
function cleanReply(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1$2")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The model answers with a JSON object; fall back to its plain text if not.
function parseModelOutput(content) {
  const raw = String(content || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
        return {
          reply: cleanReply(parsed.reply),
          urgency: URGENCIES.includes(parsed.urgency) ? parsed.urgency : "unknown",
          suggestedAction: ACTIONS.includes(parsed.suggestedAction) ? parsed.suggestedAction : "none"
        };
      }
    } catch {
      // Not valid JSON: use the text as it is.
    }
  }
  return raw ? { reply: cleanReply(raw), urgency: "unknown", suggestedAction: "none" } : null;
}

async function callGroq(messages) {
  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      })
    });
  } catch {
    throw createError("Could not reach the pet care assistant. Check your internet connection and try again.", "NETWORK_ERROR");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Pet care assistant error:", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw createError("The pet care assistant isn't set up correctly (AI key). Please tell the clinic.", "PROVIDER_AUTH");
    }
    if (response.status === 429) {
      throw createError("The pet care assistant is busy right now. Please wait a moment and try again.", "RATE_LIMITED");
    }
    // e.g. the model couldn't produce valid JSON: let the caller retry as text.
    if (response.status === 400) throw createError("bad request", "BAD_REQUEST");
    throw createError("The pet care assistant is temporarily unavailable. Please try again later.", "PROVIDER_UNAVAILABLE");
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

export async function askPetAssistant({ messages, petId = null }) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter(message => ["user", "assistant"].includes(message?.role) && String(message.content || "").trim())
    .map(message => ({ role: message.role, content: String(message.content).slice(0, 2000) }))
    .slice(-10);
  const latestUserMessage = history.filter(message => message.role === "user").map(message => message.content).at(-1);

  if (!latestUserMessage) {
    throw createError("Please enter a question for the pet care assistant.", "INVALID_REQUEST");
  }

  const offline = getOfflineReply(latestUserMessage);
  if (!GROQ_API_KEY) return offline;

  const petContext = await getPetContext(petId);
  const prompt = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(petContext ? [{ role: "system", content: petContext }] : []),
    ...history
  ];

  let content;
  try {
    content = await callGroq(prompt);
  } catch (error) {
    if (error.code === "BAD_REQUEST") {
      // Retry once without JSON mode; the reply is then used as plain text.
      try {
        content = await callGroqPlain(prompt);
      } catch {
        return offline;
      }
    } else if (["NETWORK_ERROR", "PROVIDER_UNAVAILABLE", "PROVIDER_AUTH"].includes(error.code)) {
      // Owners still get the built-in guidance; the cause is in the console
      // (e.g. an invalid or expired REACT_APP_GROQ_API_KEY).
      return offline;
    } else {
      throw error;
    }
  }

  const result = parseModelOutput(content);
  if (!result) return offline;

  // Safety net: emergency wording is always treated as an emergency.
  if (offline.urgency === "emergency" && result.urgency !== "emergency") {
    return { ...result, urgency: "emergency", suggestedAction: "emergency_vet" };
  }
  return result;
}

async function callGroqPlain(messages) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.3, max_tokens: 1200 })
  });
  if (!response.ok) throw createError("unavailable", "PROVIDER_UNAVAILABLE");
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}
