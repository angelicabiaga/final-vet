import { supabase } from "../config/supabaseClient";

const GROQ_API_KEY =
  process.env.REACT_APP_GROQ_API_KEY;

const GROQ_MODEL = "openai/gpt-oss-20b";

const GROQ_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function mapById(rows = []) {
  return new Map(
    rows.map((row) => [row.id, row])
  );
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

const OPTIONAL_TEMPLATE_COLUMNS = new Set([
  "parasite_treatments",
  "heartworm_tests",
  "vaccination_records",
  "record_template",
  "template_data",
]);

function missingOptionalTemplateColumn(error) {
  if (!error || !["PGRST204", "42703"].includes(error.code)) {
    return "";
  }

  const message = [
    error.message,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(" ");

  return [...OPTIONAL_TEMPLATE_COLUMNS].find((column) =>
    message.includes(column)
  ) || "";
}

function templateBackup(record, columns) {
  return `[pawcruz-template-backup]${JSON.stringify(
    Object.fromEntries(
      columns.map((column) => [column, record[column]])
    )
  )}`;
}

function cleanAiResponse(text) {
  if (!text) return "";

  return String(text)
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safe(value, fallback = "Not recorded") {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value).trim();
}

function formatMedicalRecordForAi(
  record,
  label = "Medical Record"
) {
  return `
${label}

Consultation Date: ${safe(
    record.consultation_date
  )}

Chief Complaint: ${safe(
    record.chief_complaint
  )}

Symptoms: ${safe(record.symptoms)}

Vital Signs: ${safe(record.vital_signs)}

Weight: ${
    record.weight !== null &&
    record.weight !== undefined
      ? `${record.weight} kg`
      : "Not recorded"
  }

Temperature: ${
    record.temperature !== null &&
    record.temperature !== undefined
      ? `${record.temperature} °C`
      : "Not recorded"
  }

Diagnosis: ${safe(record.diagnosis)}

Treatment: ${safe(record.treatment)}

Treatment Plan: ${safe(
    record.treatment_plan
  )}

Medication: ${safe(record.medication)}

Dosage: ${safe(record.dosage)}

Frequency: ${safe(record.frequency)}

Duration: ${safe(record.duration)}

Laboratory Request: ${safe(
    record.laboratory_request
  )}

Laboratory Result: ${safe(
    record.laboratory_result
  )}

Vaccination: ${safe(record.vaccination)}

Follow-up Date: ${safe(
    record.follow_up_date
  )}

Veterinarian Notes: ${safe(
    record.veterinarian_notes
  )}

Record Status: ${safe(
    record.record_status
  )}
`;
}

async function loadRelatedRecords(
  records = []
) {
  if (!records.length) {
    return [];
  }

  const petIds = unique(
    records.map(
      (record) => record.pet_id
    )
  );

  const profileIds = unique(
    records.flatMap((record) => [
      record.owner_id,
      record.veterinarian_id,
      record.created_by,
      record.updated_by,
    ])
  );

  const appointmentIds = unique(
    records.map(
      (record) =>
        record.appointment_id
    )
  );

  const petsPromise =
    petIds.length
      ? supabase
          .from("pets")
          .select("*")
          .in("id", petIds)
      : Promise.resolve({
          data: [],
          error: null,
        });

  const profilesPromise =
    profileIds.length
      ? supabase
          .from("profiles")
          .select(
            "id, full_name, username, email, phone, address, role, account_status"
          )
          .in("id", profileIds)
      : Promise.resolve({
          data: [],
          error: null,
        });

  const appointmentsPromise =
    appointmentIds.length
      ? supabase
          .from("appointments")
          .select("*")
          .in(
            "id",
            appointmentIds
          )
      : Promise.resolve({
          data: [],
          error: null,
        });

  const [
    petsResult,
    profilesResult,
    appointmentsResult,
  ] = await Promise.all([
    petsPromise,
    profilesPromise,
    appointmentsPromise,
  ]);

  if (petsResult.error) {
    console.warn(
      "Unable to load pets connected to medical records:",
      petsResult.error
    );
  }

  if (profilesResult.error) {
    console.warn(
      "Unable to load profiles connected to medical records:",
      profilesResult.error
    );
  }

  if (appointmentsResult.error) {
    console.warn(
      "Unable to load appointments connected to medical records:",
      appointmentsResult.error
    );
  }

  const petsById = mapById(
    petsResult.data || []
  );

  const profilesById = mapById(
    profilesResult.data || []
  );

  const appointmentsById = mapById(
    appointmentsResult.data || []
  );

  return records.map(
    (record) => ({
      ...record,

      pet:
        petsById.get(
          record.pet_id
        ) || null,

      owner:
        profilesById.get(
          record.owner_id
        ) || null,

      veterinarian:
        profilesById.get(
          record.veterinarian_id
        ) || null,

      creator:
        profilesById.get(
          record.created_by
        ) || null,

      updater:
        profilesById.get(
          record.updated_by
        ) || null,

      appointment:
        appointmentsById.get(
          record.appointment_id
        ) || null,
    })
  );
}

export async function getMedicalRecords(
  profile,
  {
    petId = "",
    status = "",
    search = "",
    allVeterinarians = false,
  } = {}
) {
  if (
    !profile?.id ||
    !profile?.role
  ) {
    throw new Error(
      "Your login session is incomplete. Please log out and log in again."
    );
  }

  const role =
    normalizeRole(
      profile.role
    );

  let query = supabase
    .from("medical_records")
    .select("*")
    .order(
      "consultation_date",
      {
        ascending: false,
      }
    )
    .order("created_at", {
      ascending: false,
    });

  if (
    role === "pet_owner"
  ) {
    query = query
      .eq(
        "owner_id",
        profile.id
      )
      .eq(
        "record_status",
        "Finalized"
      );
  }

  if (
    role === "veterinarian"
  ) {
    if (allVeterinarians) {
      // Cross-vet visibility for clinical context (e.g. the record-creation
      // page's history panel) only ever shows finalized records, never
      // another vet's in-progress draft.
      query = query.eq(
        "record_status",
        "Finalized"
      );
    } else {
      query = query.eq(
        "veterinarian_id",
        profile.id
      );
    }
  }

  if (petId) {
    query = query.eq(
      "pet_id",
      petId
    );
  }

  if (
    status &&
    role !== "pet_owner"
  ) {
    query = query.eq(
      "record_status",
      status
    );
  }

  let {
    data,
    error,
  } = await query;

  if (
    error?.code ===
      "PGRST205" ||
    error?.code === "42P01"
  ) {
    console.warn(
      "Direct medical_records query failed; trying RPC fallback:",
      error
    );

    const rpcResult =
      await supabase.rpc(
        "pawcruz_get_medical_records"
      );

    if (!rpcResult.error) {
      data =
        rpcResult.data || [];

      error = null;
    } else {
      console.error(
        "Medical-record RPC fallback failed:",
        rpcResult.error
      );

      throw new Error(
        "Medical Records API is not installed yet. Run supabase/FINAL_REPAIR_medical_records_api.sql in the same Supabase project used by your .env, then restart npm start."
      );
    }
  }

  if (error) {
    console.error(
      "Medical records Supabase error:",
      {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      }
    );

    if (
      error.code === "42703" ||
      error.code === "PGRST204"
    ) {
      throw new Error(
        `A medical-record column used by the frontend is missing. Error: ${error.message}`
      );
    }

    if (
      error.code === "42501"
    ) {
      throw new Error(
        `The medical_records table exists, but its permissions blocked access. Error: ${error.message}`
      );
    }

    throw new Error(
      `Unable to load medical records (${
        error.code || "unknown"
      }): ${error.message}`
    );
  }

  let filteredData =
    data || [];

  if (
    role === "pet_owner"
  ) {
    filteredData =
      filteredData.filter(
        (record) =>
          record.owner_id ===
            profile.id &&
          record.record_status ===
            "Finalized"
      );
  } else if (
    role === "veterinarian"
  ) {
    filteredData =
      filteredData.filter(
        (record) =>
          record.veterinarian_id ===
          profile.id
      );
  }

  if (petId) {
    filteredData =
      filteredData.filter(
        (record) =>
          record.pet_id ===
          petId
      );
  }

  if (
    status &&
    role !== "pet_owner"
  ) {
    filteredData =
      filteredData.filter(
        (record) =>
          record.record_status ===
          status
      );
  }

  const recordsWithRelations =
    await loadRelatedRecords(
      filteredData
    );

  if (!search.trim()) {
    return recordsWithRelations;
  }

  const searchTerm =
    search
      .trim()
      .toLowerCase();

  return recordsWithRelations.filter(
    (record) => {
      const searchableValues = [
        record.pet?.pet_name,
        record.pet?.species,
        record.pet?.breed,
        record.owner?.full_name,
        record.owner?.username,
        record.veterinarian
          ?.full_name,
        record.chief_complaint,
        record.symptoms,
        record.diagnosis,
        record.treatment,
        record.medication,
        record.vaccination,
      ];

      return searchableValues.some(
        (value) =>
          String(value || "")
            .toLowerCase()
            .includes(
              searchTerm
            )
      );
    }
  );
}

export async function getActiveVeterinarians() {
  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select(
      "id, full_name, username, email, phone, license_number, role, account_status"
    )
    .order("full_name", {
      ascending: true,
    });

  if (error) {
    console.error(
      "Veterinarian profile query error:",
      error
    );

    throw new Error(
      `Unable to load veterinarians: ${error.message}`
    );
  }

  return (
    data || []
  ).filter((profile) => {
    const role =
      normalizeRole(
        profile.role
      );

    const status =
      String(
        profile.account_status ||
          ""
      )
        .trim()
        .toLowerCase();

    return (
      role ===
        "veterinarian" &&
      status === "active"
    );
  });
}

export async function saveMedicalRecord(
  values,
  profile
) {
  if (!profile?.id) {
    throw new Error(
      "Your login session is missing. Please log in again."
    );
  }

  if (!values.petId) {
    throw new Error(
      "Please select a pet."
    );
  }

  if (!values.ownerId) {
    throw new Error(
      "The selected pet does not have an owner."
    );
  }

  if (
    !values.veterinarianId
  ) {
    throw new Error(
      "Please select a veterinarian."
    );
  }

  const normalizedTemplate =
    values.recordTemplate ||
    "health-record";

  // A "Complete" click that fires twice for the same consultation -- a
  // refreshed tab, a re-opened queue link, a slow request retried by hand --
  // must update the already-finalized record for this queue visit +
  // template instead of inserting a duplicate one. queue_entry_id +
  // record_template together identify one completed consultation.
  let targetId = values.id || null;

  if (!targetId && values.queueEntryId) {
    const { data: existingRows } = await supabase
      .from("medical_records")
      .select("id")
      .eq("queue_entry_id", values.queueEntryId)
      .eq("record_template", normalizedTemplate)
      .eq("record_status", "Finalized")
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingRows?.[0]?.id) {
      targetId = existingRows[0].id;
    }
  }

  const record = {
    pet_id:
      values.petId,

    owner_id:
      values.ownerId,

    veterinarian_id:
      values.veterinarianId,

    appointment_id:
      values.appointmentId ||
      null,

    queue_entry_id:
      values.queueEntryId ||
      null,

    consultation_fee:
      values.consultationFee === "" ||
      values.consultationFee == null
        ? 500
        : Number(
            values.consultationFee
          ),

    consultation_date:
      values.consultationDate ||
      new Date()
        .toISOString()
        .slice(0, 10),

    chief_complaint:
      values.chiefComplaint
        ?.trim() || null,

    symptoms:
      values.symptoms
        ?.trim() || null,

    vital_signs:
      values.vitalSigns
        ?.trim() || null,

    weight:
      values.weight === "" ||
      values.weight == null
        ? null
        : Number(
            values.weight
          ),

    temperature:
      values.temperature ===
        "" ||
      values.temperature ==
        null
        ? null
        : Number(
            values.temperature
          ),

    diagnosis:
      values.diagnosis
        ?.trim() || null,

    treatment:
      values.treatment
        ?.trim() || null,

    treatment_plan:
      values.treatmentPlan
        ?.trim() || null,

    medication:
      values.medication
        ?.trim() || null,

    dosage:
      values.dosage
        ?.trim() || null,

    frequency:
      values.frequency
        ?.trim() || null,

    duration:
      values.duration
        ?.trim() || null,

    laboratory_request:
      values.laboratoryRequest
        ?.trim() || null,

    laboratory_result:
      values.laboratoryResult
        ?.trim() || null,

    vaccination:
      values.vaccination
        ?.trim() || null,

    parasite_treatments:
      values.parasiteTreatments ||
      [],

    heartworm_tests:
      values.heartwormTests ||
      [],

    vaccination_records:
      values.vaccinationRecords ||
      [],

    record_template:
      normalizedTemplate,

    template_data:
      values.templateData ||
      {},

    follow_up_date:
      values.followUpDate ||
      null,

    veterinarian_notes:
      values.veterinarianNotes
        ?.trim() || null,

    attachment_url:
      values.attachmentUrl ||
      null,

    record_status:
      values.recordStatus ||
      "Draft",

    updated_by:
      profile.id,
  };

  async function directSave(payload) {
    if (targetId) {
      return supabase
        .from("medical_records")
        .update(payload)
        .eq("id", targetId)
        .select("*")
        .single();
    }

    return supabase
      .from("medical_records")
      .insert({
        ...payload,
        created_by: profile.id,
      })
      .select("*")
      .single();
  }

  let payload = { ...record };
  const removedTemplateColumns = [];
  let result = await directSave(payload);
  let missingColumn = missingOptionalTemplateColumn(result.error);

  // The app remains usable before the additive template migration is run.
  // Retry only missing optional columns, retaining every column supported by
  // the deployed database and preserving stripped values in existing notes.
  while (missingColumn) {
    removedTemplateColumns.push(missingColumn);
    delete payload[missingColumn];

    payload = {
      ...payload,
      veterinarian_notes: [
        payload.veterinarian_notes,
        templateBackup(record, removedTemplateColumns),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };

    result = await directSave(payload);
    missingColumn = missingOptionalTemplateColumn(result.error);
  }

  if (
    result.error?.code ===
      "PGRST205" ||
    result.error?.code ===
      "42P01"
  ) {
    console.warn(
      "Direct medical record save failed; trying RPC fallback:",
      result.error
    );

    const payload = {
      id:
        targetId || null,
      ...record,
      created_by:
        targetId
          ? undefined
          : profile.id,
    };

    const rpcResult =
      await supabase.rpc(
        "pawcruz_save_medical_record",
        {
          payload,
        }
      );

    if (rpcResult.error) {
      console.error(
        "Save medical record RPC error:",
        rpcResult.error
      );

      throw new Error(
        "Unable to save the medical record. Run supabase/FINAL_REPAIR_medical_records_api.sql, then try again."
      );
    }

    return rpcResult.data;
  }

  if (result.error) {
    console.error(
      "Save medical record error:",
      result.error
    );

    throw new Error(
      `Unable to save medical record: ${result.error.message}`
    );
  }

  return result.data;
}

// Persists an AI-generated per-consultation insight onto the finalized
// record it describes, inside the existing template_data JSON column (no
// schema change). Makes the insight a retained fact of that consultation
// instead of something silently regenerated -- and possibly failing, or
// drifting -- on every later view. Best-effort: never throws, since it must
// not be able to break consultation completion or billing hand-off.
export async function saveConsultationInsight(recordId, insightText) {
  if (!recordId || !insightText) return;

  try {
    const { data: current, error: fetchError } = await supabase
      .from("medical_records")
      .select("template_data")
      .eq("id", recordId)
      .single();

    if (fetchError) {
      console.warn("Unable to load the record to persist its AI health insight:", fetchError);
      return;
    }

    const { error } = await supabase
      .from("medical_records")
      .update({
        template_data: {
          ...(current?.template_data || {}),
          aiHealthInsight: insightText,
        },
      })
      .eq("id", recordId);

    if (error) {
      console.warn("Unable to persist the AI health insight:", error);
    }
  } catch (error) {
    console.warn("Unable to persist the AI health insight:", error);
  }
}

export async function uploadMedicalAttachment(
  file,
  profileId
) {
  if (!file) {
    return null;
  }

  if (!profileId) {
    throw new Error(
      "The current profile is unavailable."
    );
  }

  const safeFileName =
    file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

  const filePath =
    `${profileId}/` +
    `${Date.now()}-` +
    `${safeFileName}`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from(
      "medical-attachments"
    )
    .upload(
      filePath,
      file,
      {
        cacheControl:
          "3600",
        upsert: false,
      }
    );

  if (uploadError) {
    console.error(
      "Medical attachment upload error:",
      uploadError
    );

    throw new Error(
      `Unable to upload attachment: ${uploadError.message}`
    );
  }

  const { data } =
    supabase.storage
      .from(
        "medical-attachments"
      )
      .getPublicUrl(
        filePath
      );

  return data.publicUrl;
}

export async function getLatestMedicalRecordForPet(
  petId
) {
  if (!petId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("medical_records")
    .select(
      "id,pet_id,appointment_id,consultation_date,created_at,record_status,template_data"
    )
    .eq("pet_id", petId)
    .eq("record_status", "Finalized")
    .order("consultation_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      "Unable to load the latest medical record for this pet:",
      error
    );

    return null;
  }

  return data || null;
}

export async function getAppointmentsForPet(
  petId
) {
  if (!petId) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("appointments")
    .select("*")
    .eq("pet_id", petId)
    .order(
      "appointment_date",
      {
        ascending: false,
      }
    )
    .order("start_time", {
      ascending: false,
    });

  if (error) {
    console.warn(
      "Unable to load pet appointments:",
      error
    );

    return [];
  }

  return data || [];
}

export async function getPreviousMedicalRecordsForAi(
  petId,
  currentRecordId
) {
  if (!petId) {
    return [];
  }

  let query = supabase
    .from(
      "medical_records"
    )
    .select(
      "id,pet_id,consultation_date,chief_complaint,symptoms,vital_signs,weight,temperature,diagnosis,treatment,treatment_plan,medication,dosage,frequency,duration,laboratory_request,laboratory_result,vaccination,follow_up_date,veterinarian_notes,record_status"
    )
    .eq(
      "pet_id",
      petId
    )
    .eq(
      "record_status",
      "Finalized"
    )
    .order(
      "consultation_date",
      {
        ascending: false,
      }
    )
    .limit(8);

  if (currentRecordId) {
    query = query.neq(
      "id",
      currentRecordId
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    console.warn(
      "Unable to load previous medical records for AI analysis:",
      error
    );

    return [];
  }

  return data || [];
}

export async function generatePredictiveHealthAnalysis(
  record
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "Groq API key is not configured. Set REACT_APP_GROQ_API_KEY in your .env file and restart npm start."
    );
  }

  if (!record?.pet_id) {
    throw new Error(
      "The selected medical record does not contain a valid pet."
    );
  }

  const previousRecords =
    await getPreviousMedicalRecordsForAi(
      record.pet_id,
      record.id
    );

  const pet = record.pet || {};

  const petInformation = `
PET INFORMATION

Pet Name: ${safe(
    pet.pet_name
  )}

Species: ${safe(
    pet.species
  )}

Breed: ${safe(
    pet.breed
  )}

Sex: ${safe(
    pet.sex || pet.gender
  )}

Date of Birth: ${safe(
    pet.date_of_birth ||
      pet.birth_date
  )}
`;

  const currentRecord =
    formatMedicalRecordForAi(
      record,
      "CURRENT MEDICAL RECORD"
    );

  const historyText =
    previousRecords.length
      ? previousRecords
          .map(
            (
              previous,
              index
            ) =>
              formatMedicalRecordForAi(
                previous,
                `PREVIOUS RECORD ${
                  index + 1
                }`
              )
          )
          .join("\n")
      : "No previous finalized medical records are available for this pet.";

  const prompt = `
You are the AI Predictive Health Analysis assistant for PawCruz Veterinary Clinic.

Analyze ONLY the medical information supplied below.

The current medical record was entered by a veterinarian or authorized clinic personnel. Previous finalized records are included only when they are available.

Your job is to identify medically relevant patterns in the available records and provide decision-support information.

This is NOT an independent diagnosis system.

STRICT RULES

Use only the supplied medical record data.

Do not invent symptoms, diagnoses, laboratory values, medications, diseases, causes, probabilities, percentages, or medical history.

Do not state that a pet definitely has or will develop a disease unless the veterinarian's record already states that diagnosis.

Do not replace the veterinarian's diagnosis.

Do not recommend changing or stopping prescribed medication.

Do not prescribe new medication or dosage.

If the available information is insufficient, clearly say that more clinical information may be needed.

Distinguish information directly recorded by the veterinarian from AI-observed patterns.

When previous medical records exist, compare the current record with previous records and identify recurring complaints, diagnoses, medications, laboratory findings, weight changes, temperature changes, or follow-up patterns only when the supplied records support them.

If no previous medical records are available, explain that the analysis is based only on the current consultation and therefore cannot establish a long-term health trend.

Do not use markdown.

Do not use asterisks.

Do not use hashtags.

Do not use markdown tables.

Use professional but understandable language.

${petInformation}

${currentRecord}

PREVIOUS FINALIZED MEDICAL RECORDS

${historyText}

Write the analysis using exactly these section headings:

CLINICAL RECORD SUMMARY

Summarize the important information documented in the current medical record.

Focus on the complaint, symptoms, veterinarian diagnosis, treatment, medication, laboratory findings, vital signs, and follow-up information that are actually present.

OBSERVED HEALTH PATTERNS

Compare the current medical information with available previous records.

Identify recurring or changing health information only if supported by the records.

If historical information is insufficient, clearly state that no reliable long-term pattern can yet be identified.

POTENTIAL HEALTH RISKS TO MONITOR

Identify possible areas that may deserve monitoring based on the recorded symptoms, diagnosis, laboratory results, repeated conditions, or changes across medical records.

Use cautious wording such as may, could, warrants monitoring, or should be reviewed.

Do not present a possible risk as a confirmed diagnosis.

FOLLOW-UP CONSIDERATIONS

Identify relevant follow-up considerations based on the veterinarian's current treatment plan, follow-up date, laboratory requests, medication, and previous history.

Do not create a new treatment plan.

SUGGESTED CLINICAL ACTIONS

Provide 3 to 5 practical decision-support actions.

These actions may include reviewing a repeated symptom, checking requested laboratory results, monitoring documented changes, following the veterinarian's scheduled follow-up, or comparing the next consultation with previous findings.

Do not prescribe treatment.

Finish with this exact statement:

AI predictive health analysis is based only on available PawCruz medical records and is intended to support, not replace, the veterinarian's diagnosis, treatment decisions, or clinical judgment.
`;

  let response;

  try {
    response = await fetch(
      GROQ_ENDPOINT,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`,
        },

        body: JSON.stringify({
          model:
            GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are a veterinary clinical decision-support assistant. Analyze only the supplied pet medical records, identify documented patterns carefully, never fabricate medical information, and never replace a veterinarian's clinical judgment. Do not use markdown or asterisks.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.15,
          max_tokens: 1500,
        }),
      }
    );
  } catch (networkError) {
    console.error(
      "Predictive health AI network error:",
      networkError
    );

    throw new Error(
      "Could not reach the AI predictive health analysis service. Check your internet connection and try again."
    );
  }

  if (!response.ok) {
    const errorText =
      await response
        .text()
        .catch(() => "");

    console.error(
      "Predictive health AI error:",
      response.status,
      errorText
    );

    if (
      response.status === 401
    ) {
      throw new Error(
        "The Groq API key is invalid or missing. Check REACT_APP_GROQ_API_KEY."
      );
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        "The AI request is not authorized. Check the Groq API key permissions."
      );
    }

    if (
      response.status === 404
    ) {
      throw new Error(
        "The configured AI model is unavailable."
      );
    }

    if (
      response.status === 429
    ) {
      throw new Error(
        "The AI predictive health service has reached its request limit. Please wait and try again."
      );
    }

    throw new Error(
      "Unable to generate the AI predictive health analysis right now."
    );
  }

  const data =
    await response.json();

  const text =
    data?.choices?.[0]
      ?.message?.content
      ?.trim();

  if (!text) {
    throw new Error(
      "The AI predictive health analysis returned an empty response."
    );
  }

  return cleanAiResponse(
    text
  );
}

// Separate from generatePredictiveHealthAnalysis above (left untouched) --
// this scopes the analysis to exactly one consultation instead of the
// pet's whole history, for the per-consultation "AI Health Insight" shown
// on each Medical History card. Nothing here is persisted to the
// database; it is generated on demand and never creates a record.
export async function generateConsultationHealthInsight(record, previousRecords = []) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "Groq API key is not configured. Set REACT_APP_GROQ_API_KEY in your .env file and restart npm start."
    );
  }

  if (!record?.id) {
    throw new Error("A finalized consultation is required for an AI health insight.");
  }

  const pet = record.pet || {};

  const petInformation = `
PET INFORMATION

Pet Name: ${safe(pet.pet_name)}
Species: ${safe(pet.species)}
Breed: ${safe(pet.breed)}
Sex: ${safe(pet.sex || pet.gender)}
Date of Birth: ${safe(pet.date_of_birth || pet.birth_date)}
`;

  const consultationText = formatMedicalRecordForAi(record, "THIS CONSULTATION");

  const historyText = previousRecords.length
    ? previousRecords
        .map((previous, index) => formatMedicalRecordForAi(previous, `PREVIOUS FINALIZED CONSULTATION ${index + 1}`))
        .join("\n")
    : "No previous finalized consultations are available for this pet.";

  const prompt = `
You are the AI Predictive Health Analysis assistant for PawCruz Veterinary Clinic.

Analyze ONLY the information supplied below for this ONE consultation. Previous finalized consultations are supplied only for the comparison section -- everything else must describe this consultation alone. Long-term or recurring pattern analysis across the pet's full history is handled separately and is not your job here.

This is NOT an independent diagnosis system.

STRICT RULES

Use only the supplied medical record data and the pet's basic profile (age/date of birth, breed, weight).

Do not invent symptoms, diagnoses, laboratory values, medications, diseases, causes, probabilities, percentages, or medical history that are not present in what is supplied.

Do not state that a pet definitely has or will develop a disease unless the veterinarian's record already states that diagnosis.

Do not replace the veterinarian's diagnosis.

Do not recommend changing or stopping prescribed medication.

Do not prescribe new medication or dosage.

If the available information is insufficient for a section, clearly say so instead of guessing.

When comparing with previous consultations, reference only information present in the supplied previous records. If none were supplied, say there are no previous finalized consultations to compare.

Do not use markdown.

Do not use asterisks.

Do not use hashtags.

Do not use markdown tables.

Use professional but understandable language.

${petInformation}

${consultationText}

PREVIOUS FINALIZED CONSULTATIONS

${historyText}

Write the analysis using exactly these section headings:

CONSULTATION RISK LEVEL

State exactly one word on its own line: Low, Moderate, or High. Base this only on the severity and combination of findings recorded in this consultation.

RECORDED HEALTH FINDINGS

List the symptoms, vital signs, diagnosis, and laboratory results actually documented in this consultation.

POTENTIAL HEALTH RISKS TO MONITOR

Identify possible risks suggested by this consultation's own findings. Use cautious wording such as may, could, warrants monitoring. Do not present a possible risk as a confirmed diagnosis.

WARNING SIGNS

List specific signs the pet owner or clinic staff should watch for that would indicate this condition is worsening, based only on what was recorded in this consultation.

RECOMMENDED MONITORING AND FOLLOW-UP

Provide practical, decision-support monitoring and follow-up steps based on this consultation's treatment plan, medication, and follow-up date. Do not create a new treatment plan.

COMPARISON WITH PREVIOUS CONSULTATIONS

If previous finalized consultations were supplied, compare this visit's findings with them and note anything recurring or new. If none were supplied, state plainly that there are no previous finalized consultations to compare.

Finish with this exact statement:

This AI health insight is based only on this consultation's recorded information and is intended to support, not replace, the veterinarian's diagnosis, treatment decisions, or clinical judgment.
`;

  let response;

  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a veterinary clinical decision-support assistant. Analyze only the supplied single consultation record, never fabricate medical information, and never replace a veterinarian's clinical judgment. Do not use markdown or asterisks.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.15,
        max_tokens: 900,
      }),
    });
  } catch (networkError) {
    console.error("Consultation health insight network error:", networkError);
    throw new Error("Could not reach the AI health insight service. Check your internet connection and try again.");
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Consultation health insight error:", response.status, errorText);

    if (response.status === 401) throw new Error("The Groq API key is invalid or missing. Check REACT_APP_GROQ_API_KEY.");
    if (response.status === 403) throw new Error("The AI request is not authorized. Check the Groq API key permissions.");
    if (response.status === 404) throw new Error("The configured AI model is unavailable.");
    if (response.status === 429) throw new Error("The AI health insight service has reached its request limit. Please wait and try again.");
    throw new Error("Unable to generate the AI health insight right now.");
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("The AI health insight returned an empty response.");
  }

  return cleanAiResponse(text);
}
