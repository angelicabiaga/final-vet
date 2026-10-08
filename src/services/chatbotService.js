import { supabase } from "../config/supabaseClient";

// PawCruz Pet Care Assistant. Answers come from Groq (same key and model as
// the medical-record and inventory AI features: REACT_APP_GROQ_API_KEY).
// Every answer is generated for the owner's actual question. If the AI can't
// be reached the owner sees a "try again" error, never a canned answer, except
// for emergency wording, which always gets the emergency advice below.

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;
const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const ACTIONS = ["emergency_vet", "contact_clinic", "book_appointment", "none"];

// Concern level (chosen by the AI) -> what the chat shows under the reply.
// Only "concerning" shows the same-day notice and only "emergency" the
// emergency notice, so ordinary questions get a plain answer.
const CONCERN_LEVELS = {
  info: { urgency: "routine", actions: ["none", "book_appointment"] },
  mild: { urgency: "routine", actions: ["none", "book_appointment"] },
  concerning: { urgency: "same_day", actions: ["contact_clinic"] },
  emergency: { urgency: "emergency", actions: ["emergency_vet"] },
  unclear: { urgency: "unknown", actions: ["none"] }
};
const LEGACY_URGENCY = { emergency: "emergency", same_day: "concerning", routine: "mild", unknown: "unclear" };

const SYSTEM_PROMPT = `You are the PawCruz Pet Care Assistant for Cruz Veterinary Clinic (PawCruz), chatting with a pet owner in the PawCruz app.

Clinic facts:
- Open every day, 9:00 AM to 7:00 PM.
- Owners book a General Consultation from the Book Appointment page (choose the pet, veterinarian, date and an available time).
- My Queue shows their queue number on the visit day; Animal Patients shows each pet's records and vaccinations.

How to answer:
1. First work out exactly what the owner is asking: the animal (dog, cat, rabbit, hamster, bird, fish, turtle or other pet), the specific concern, and what was already said earlier in this conversation. Read past spelling mistakes and informal English, Tagalog or Taglish ("why cats vomit hair" = why cats throw up hairballs; "ayaw kumain ng aso ko" = my dog won't eat).
2. Answer THAT question directly in the first sentence, then give the most useful guidance for that exact situation. Different questions need different answers.
   - A question that mentions hair or fur being vomited is about HAIRBALLS: cats swallow loose fur while grooming, it collects in the stomach and comes back up; brushing helps; see a vet if vomiting is frequent, the cat stops eating, is constipated, or retches without bringing anything up. Do not reply with general vomiting advice.
   - "Why is my dog not eating?" covers common appetite causes in dogs and the warning signs to watch.
   - "Can dogs eat chocolate?" starts with a clear "No" and explains why, plus: contact a vet immediately if it was eaten.
3. Follow-ups use the conversation. "How can I prevent it?", "is that normal?", "what about kittens?" refer to the topic just discussed; answer about that topic. Never ask again for something the owner already told you, and treat short replies ("3 times today", "oo", "2 years old") as answers to your last question.
4. Ask a follow-up question only when the answer truly depends on it (at most one or two, at the end). Purely informational questions need no follow-up.
5. If the message is unclear, gibberish, or too short to understand, ask briefly what they mean instead of guessing. If it is not about pets or the clinic, politely say you can only help with pet care and PawCruz.
6. All pet topics are welcome: symptoms, illnesses, nutrition and toxic foods, behavior and training, grooming, vaccinations, deworming, fleas/ticks, medicines in general terms, puppy/kitten and senior care.
7. Reply in the owner's language (English, Tagalog or Taglish), simple and friendly.

Safety:
- You are not a veterinarian and cannot examine the pet. Never give a definite diagnosis; use "possible causes include".
- Never name medicines with doses, never invent dosages, never suggest human medicines (paracetamol, ibuprofen, aspirin are dangerous for pets).
- Emergencies (trouble breathing, seizures, collapse, suspected poisoning or a toxic food actually eaten, heavy bleeding, bloated hard belly, straining to urinate with nothing coming out, heat stroke, hit by a vehicle): say clearly to go to the nearest emergency veterinary clinic now, with one or two safe first steps.

Format: at most about 130 words, short paragraphs, "- " for lists. Plain text only: no markdown, no asterisks, no headings.

Choose "concern" from what the owner describes, not from the topic:
- "info": a general question with no sick pet described ("Why do cats get hairballs?", "How often should I bathe my dog?", "Can dogs eat chocolate?").
- "mild": a symptom that can be watched at home for now ("my cat vomited once but is acting normal", one hairball, mild itching). Explain what to monitor and when to see a vet.
- "concerning": symptoms that need a vet soon, today ("keeps vomiting and can't keep water down", blood in stool, not eating for over a day, very weak).
- "emergency": an emergency sign above is happening now.
- "unclear": you had to ask what they mean, or it is not a pet question.

suggestedAction: "emergency_vet" only for emergency; "contact_clinic" only for concerning; "book_appointment" when a regular check-up would genuinely help; otherwise "none".

Respond with ONLY a JSON object, no other text:
{"reply": "<your message to the owner>", "concern": "info" | "mild" | "concerning" | "emergency" | "unclear", "suggestedAction": "emergency_vet" | "contact_clinic" | "book_appointment" | "none"}`;

function createError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Urgent signs in English, Tagalog and Taglish. Poison only counts when the
// pet actually ate or was exposed to something, so "Is chocolate toxic?" is
// not treated as an emergency.
const EMERGENCY_PATTERNS = [
  /(?:can'?t|cannot|can not|hard|difficult(?:y)?|trouble|struggling|not)\s*(?:to\s*)?breath/,
  /hirap (?:huminga|sa paghinga)|hindi (?:maka|makapag)hinga|gasping|blue (?:gums|tongue)/,
  /seizure|convuls|kombulsyon|nangingisay/,
  /collapsed?|unconscious|passed out|nahimatay|walang malay/,
  /poisoned|nalason|(?:ate|eaten|swallowed|ingested|licked|kinain|nakain|nakakain|nalunok)\b.{0,40}(?:poison|rat bait|lason|pesticide|antifreeze|bleach|xylitol|chocolate|tsokolate|grapes|ubas|paracetamol|ibuprofen|lily|lilies)/,
  /severe bleeding|bleeding (?:a lot|heavily|won'?t stop|nonstop)|maraming dugo|hindi tumitigil (?:ang )?(?:pagdurugo|dugo)/,
  /bloated (?:abdomen|belly|stomach)|hard (?:belly|stomach)|lumaki (?:ang )?tiyan/,
  /(?:straining|can'?t|cannot|unable) to (?:urinate|pee)|hindi (?:maka-?ihi|makaihi)/,
  /hit by a (?:car|vehicle|motorcycle)|nabangga|nasagasaan/,
  /heat ?stroke/
];

const isEmergencyText = text => EMERGENCY_PATTERNS.some(pattern => pattern.test(String(text || "").toLowerCase()));

// Used only when the AI is unreachable and the owner describes an emergency,
// so urgent advice is never lost to an outage.
const EMERGENCY_REPLY = {
  reply:
    "This may be an emergency. Please bring your pet to the nearest emergency veterinary clinic now. Keep them calm and still, do not give food, water or medicine unless a veterinarian tells you to, and bring any packaging of what they may have eaten.",
  urgency: "emergency",
  suggestedAction: "emergency_vet"
};

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
    return `The owner selected this pet in the app:\n${facts.join("\n")}\nUse these details when relevant. If the owner asks about a different animal, answer for the animal they mention.`;
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

function toResult(reply, concern, action) {
  const level = CONCERN_LEVELS[concern] ? concern : "unclear";
  const { urgency, actions } = CONCERN_LEVELS[level];
  return {
    reply: cleanReply(reply),
    urgency,
    suggestedAction: actions.includes(action) ? action : actions[0]
  };
}

// The model answers with a JSON object; a plain-text answer (from the
// retry without JSON mode) is used as it is.
function parseModelOutput(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
        const concern = String(parsed.concern || LEGACY_URGENCY[parsed.urgency] || "").toLowerCase();
        return toResult(parsed.reply, concern, ACTIONS.includes(parsed.suggestedAction) ? parsed.suggestedAction : "none");
      }
    } catch {
      // Cut-off or broken JSON.
    }
    return null;
  }
  return toResult(raw, "mild", "none");
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// jsonMode false is the plain-text retry when the model can't produce JSON.
// A busy (429) answer is retried once after the wait Groq suggests.
async function callGroq(messages, jsonMode = true, attempt = 0) {
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
        temperature: 0.4,
        max_tokens: 1500,
        reasoning_effort: "low",
        ...(jsonMode ? { response_format: { type: "json_object" } } : {})
      })
    });
  } catch {
    throw createError("Could not reach the pet care assistant. Check your internet connection and try again.", "NETWORK_ERROR");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Pet care assistant error:", response.status, detail);
    if (response.status === 429 && attempt === 0) {
      const seconds = Number(response.headers.get("retry-after"));
      await wait(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2500, 8000));
      return callGroq(messages, jsonMode, 1);
    }
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
    .map(message => ({ role: message.role, content: String(message.content).trim().slice(0, message.role === "user" ? 1000 : 1200) }))
    .slice(-10);
  const latestUserMessage = history.filter(message => message.role === "user").map(message => message.content).at(-1);

  if (!latestUserMessage) {
    throw createError("Please type your question first.", "INVALID_REQUEST");
  }

  const emergency = isEmergencyText(latestUserMessage);
  const unavailable = code => (emergency
    ? EMERGENCY_REPLY
    : Promise.reject(createError(
        code === "PROVIDER_AUTH"
          ? "The pet care assistant isn't set up correctly (AI key). Please tell the clinic."
          : "The pet care assistant couldn't answer just now. Please press Retry in a moment.",
        code
      )));

  if (!GROQ_API_KEY) {
    console.error("Pet care assistant: REACT_APP_GROQ_API_KEY is missing.");
    return unavailable("PROVIDER_AUTH");
  }

  const petContext = await getPetContext(petId);
  const prompt = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(petContext ? [{ role: "system", content: petContext }] : []),
    ...history
  ];

  let result = null;
  try {
    result = parseModelOutput(await callGroq(prompt));
    // Empty or cut-off JSON: ask once more without JSON mode.
    if (!result) result = parseModelOutput(await callGroq(prompt, false));
  } catch (error) {
    if (error.code === "BAD_REQUEST") {
      try {
        result = parseModelOutput(await callGroq(prompt, false));
      } catch (retryError) {
        return unavailable(retryError.code || "PROVIDER_UNAVAILABLE");
      }
    } else if (error.code === "RATE_LIMITED") {
      if (emergency) return EMERGENCY_REPLY;
      throw error;
    } else {
      return unavailable(error.code || "PROVIDER_UNAVAILABLE");
    }
  }

  if (!result) return unavailable("PROVIDER_UNAVAILABLE");

  // Safety net: an emergency described right now is always flagged.
  if (emergency && result.urgency !== "emergency") {
    return { ...result, urgency: "emergency", suggestedAction: "emergency_vet" };
  }
  return result;
}
