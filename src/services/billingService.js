import { supabase } from "../config/supabaseClient";

const PENDING_STATUSES = ["Pending Billing", "Processing"];

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * The live "Pending Billing Queue" for staff: every queue ticket whose
 * consultation the veterinarian has finalized but that has not been paid
 * yet. This never joins medical_records -- queue_entries already carries
 * everything the queue table needs (pet, owner, veterinarian, billing
 * status, and when it was finalized).
 */
export async function getPendingBillingQueue() {
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id,queue_number,pet_id,owner_id,veterinarian_id,status,billing_status,consultation_finalized_at")
    .in("billing_status", PENDING_STATUSES)
    .order("consultation_finalized_at", { ascending: true });

  if (error) throw new Error(`Unable to load the pending billing queue: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.flatMap((row) => [row.owner_id, row.veterinarian_id]));

  const [petsResult, profilesResult] = await Promise.all([
    petIds.length ? supabase.from("pets").select("id,pet_name,species").in("id", petIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from("profiles").select("id,full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);

  const petsById = new Map((petsResult.data || []).map((pet) => [pet.id, pet]));
  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    owner: profilesById.get(row.owner_id) || null,
    veterinarian: profilesById.get(row.veterinarian_id) || null,
  }));
}

/**
 * Staff clicking "Process Payment": flips Pending Billing -> Processing.
 * Compare-and-set with an idempotent "already Processing" fallback, so a
 * staff member re-opening an in-progress checkout (or a second staff member
 * clicking at the same time) never errors out or double-transitions.
 */
export async function startBillingProcessing(queueEntryId, profile) {
  if (!queueEntryId) throw new Error("A consultation is required to start processing payment.");
  if (!profile?.id) throw new Error("A signed-in user is required to process payment.");

  const { data, error } = await supabase
    .from("queue_entries")
    .update({ billing_status: "Processing" })
    .eq("id", queueEntryId)
    .eq("billing_status", "Pending Billing")
    .select("id,billing_status");

  if (error) throw new Error(`Unable to start processing this payment: ${error.message}`);
  if (data?.[0]) return data[0];

  const { data: current, error: loadError } = await supabase
    .from("queue_entries")
    .select("id,billing_status")
    .eq("id", queueEntryId)
    .single();
  if (loadError) throw new Error(`Unable to verify billing status: ${loadError.message}`);
  if (current.billing_status === "Processing") return current;

  throw new Error(`This consultation is not awaiting payment (status: ${current.billing_status}).`);
}

/**
 * Everything the staff POS checkout screen needs to bill a consultation:
 * owner, pet, veterinarian, consultation fee, and every test/medicine/
 * vaccine the vet recorded. A visit with more than one medical-record
 * template (e.g. Health Record + Vaccination Record) shares one
 * queue_entry_id, so their inventory items are merged (de-duplicated) and
 * their diagnosis/treatment/notes are concatenated; the consultation fee is
 * taken from the first (earliest) record so it is only charged once.
 *
 * A visit can be billed here more than once in its lifetime -- a vet may
 * complete a second template (e.g. via the Drafts flow) after the first was
 * already paid, reopening billing (see markConsultationReadyForBilling).
 * When that happens this must never re-surface the checkup fee or an item
 * already sold on an earlier, still-active transaction for this same
 * queue_entry_id -- only genuinely new items get billed, and the fee comes
 * back as 0 with `alreadyBilled: true` for the caller to show accordingly.
 */
export async function getConsultationForBilling(queueEntryId) {
  if (!queueEntryId) return null;

  const { data: entry, error: entryError } = await supabase
    .from("queue_entries")
    .select("id,queue_number,pet_id,owner_id,veterinarian_id,appointment_id,status,billing_status")
    .eq("id", queueEntryId)
    .single();
  if (entryError) throw new Error(`Unable to load this consultation: ${entryError.message}`);

  const { data: records, error: recordsError } = await supabase
    .from("medical_records")
    .select("id,appointment_id,diagnosis,treatment,veterinarian_notes,consultation_fee,template_data,record_template,created_at")
    .eq("queue_entry_id", queueEntryId)
    .order("created_at", { ascending: true });
  if (recordsError) throw new Error(`Unable to load the consultation record: ${recordsError.message}`);
  if (!records?.length) throw new Error("No finalized medical record was found for this consultation.");

  const { data: priorTransactions, error: priorError } = await supabase
    .from("transactions")
    .select("id,payment_status")
    .eq("queue_entry_id", queueEntryId);
  if (priorError) throw new Error(`Unable to check this visit's billing history: ${priorError.message}`);

  // Voided/Cancelled transactions never happened financially, so they don't
  // count as "already billed" -- everything else (Paid, Partially Paid,
  // Pending, Unpaid, Refunded) does, since the fee/items were genuinely
  // charged at some point.
  const activePriorTransactionIds = (priorTransactions || [])
    .filter((transaction) => !["Voided", "Cancelled"].includes(transaction.payment_status))
    .map((transaction) => transaction.id);
  const alreadyBilled = activePriorTransactionIds.length > 0;

  let alreadyBilledItemIds = new Set();
  if (activePriorTransactionIds.length) {
    const { data: priorItems, error: priorItemsError } = await supabase
      .from("transaction_items")
      .select("inventory_item_id")
      .in("transaction_id", activePriorTransactionIds);
    if (priorItemsError) throw new Error(`Unable to check this visit's billed items: ${priorItemsError.message}`);
    alreadyBilledItemIds = new Set((priorItems || []).map((row) => row.inventory_item_id).filter(Boolean));
  }

  const [petResult, profilesResult] = await Promise.all([
    supabase.from("pets").select("id,pet_name,species").eq("id", entry.pet_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name").in("id", uniq([entry.owner_id, entry.veterinarian_id])),
  ]);
  const profilesById = new Map((profilesResult.data || []).map((row) => [row.id, row]));

  const inventoryItems = [];
  const seen = new Set();
  records.forEach((record) => {
    (record.template_data?.inventoryItems || []).forEach((item) => {
      if (item.isNA || seen.has(item.id) || alreadyBilledItemIds.has(item.id)) return;
      seen.add(item.id);
      inventoryItems.push(item);
    });
  });

  const joinField = (field) => records.map((record) => (record[field] || "").trim()).filter(Boolean).join("\n\n");

  return {
    queueEntryId: entry.id,
    queueNumber: entry.queue_number,
    petId: entry.pet_id,
    ownerId: entry.owner_id,
    veterinarianId: entry.veterinarian_id,
    appointmentId: records[0].appointment_id || entry.appointment_id || null,
    primaryMedicalRecordId: records[0].id,
    pet: petResult.data || null,
    owner: profilesById.get(entry.owner_id) || null,
    veterinarian: profilesById.get(entry.veterinarian_id) || null,
    consultationFee: alreadyBilled ? 0 : Number(records[0].consultation_fee ?? 500),
    alreadyBilled,
    diagnosis: joinField("diagnosis"),
    treatment: joinField("treatment"),
    veterinarianNotes: joinField("veterinarian_notes"),
    inventoryItems,
  };
}

let pendingBillingChannelSeq = 0;
export function subscribeToPendingBilling(callback) {
  // The counter guarantees a unique channel name even when two callers
  // mount in the same tick (e.g. AppShell's Transactions (POS) badge and
  // PendingBillingQueue's own subscription both mounting on the
  // Transactions page) -- Date.now() alone is only millisecond-precision,
  // and supabase-js reuses a channel by name, which throws if a second
  // .on() lands on a channel the first caller already .subscribe()'d.
  const channel = supabase.channel(`pending-billing-${Date.now()}-${++pendingBillingChannelSeq}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, callback)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * The first time staff opens the checkout screen for a consultation, one
 * prescriptions row is created per Medicine item, seeded with the quantity
 * the vet set on the record (falling back to 1 if it wasn't specified).
 * upsert with ignoreDuplicates so re-opening the same checkout never resets
 * progress already made on a prescription, and so a quantity typo can still
 * be corrected via updatePrescribedQuantity before any purchase is made.
 */
export async function syncPrescriptions({ queueEntryId, medicalRecordId, petId, ownerId, veterinarianId, medicineItems }, profile) {
  if (!queueEntryId || !medicineItems?.length) return getPrescriptionsForConsultation(queueEntryId);

  const rows = medicineItems.map((item) => ({
    queue_entry_id: queueEntryId,
    medical_record_id: medicalRecordId || null,
    pet_id: petId,
    owner_id: ownerId,
    veterinarian_id: veterinarianId || null,
    inventory_item_id: item.id,
    item_name: item.item_name,
    unit_price: Number(item.unit_price || 0),
    prescribed_quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    created_by: profile?.id || null,
  }));

  const { error } = await supabase
    .from("prescriptions")
    .upsert(rows, { onConflict: "queue_entry_id,inventory_item_id", ignoreDuplicates: true });
  if (error) throw new Error(`Unable to prepare prescription tracking: ${error.message}`);

  return getPrescriptionsForConsultation(queueEntryId);
}

export async function getPrescriptionsForConsultation(queueEntryId) {
  if (!queueEntryId) return [];
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,queue_entry_id,medical_record_id,pet_id,owner_id,veterinarian_id,inventory_item_id,item_name,unit_price,prescribed_quantity,total_quantity_purchased,fulfillment_status,created_at,updated_at")
    .eq("queue_entry_id", queueEntryId)
    .order("item_name", { ascending: true });
  if (error) throw new Error(`Unable to load prescriptions: ${error.message}`);
  return data || [];
}

// Only allowed before any purchase has been recorded against the
// prescription, so a partially-fulfilled baseline can never be rewritten.
export async function updatePrescribedQuantity(prescriptionId, prescribedQuantity) {
  const quantity = Number(prescribedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Enter a valid prescribed quantity.");
  }
  const { data, error } = await supabase
    .from("prescriptions")
    .update({ prescribed_quantity: quantity })
    .eq("id", prescriptionId)
    .eq("total_quantity_purchased", 0)
    .select("id");
  if (error) throw new Error(`Unable to update the prescribed quantity: ${error.message}`);
  if (!data?.[0]) throw new Error("The prescribed quantity can no longer be changed once a purchase has been made against it.");
  return data[0];
}

export async function markPrescriptionElsewhere(prescriptionId, profile) {
  const { data, error } = await supabase
    .from("prescriptions")
    .update({ fulfillment_status: "Purchasing Elsewhere" })
    .eq("id", prescriptionId)
    .neq("fulfillment_status", "Fully Purchased")
    .select("id,queue_entry_id,pet_id,owner_id,item_name,prescribed_quantity,total_quantity_purchased");
  if (error) throw new Error(`Unable to update this prescription: ${error.message}`);
  if (!data?.[0]) throw new Error("This prescription is already fully purchased.");

  const rx = data[0];
  // Best-effort: a permanent, browsable record of the declaration itself
  // (not just the mutable status field), so it stays discoverable even
  // though no money changed hands. Never blocks the actual status update.
  await supabase.from("prescription_activity_log").insert({
    prescription_id: rx.id,
    queue_entry_id: rx.queue_entry_id,
    pet_id: rx.pet_id,
    owner_id: rx.owner_id,
    item_name: rx.item_name,
    action: "Purchasing Elsewhere",
    remaining_quantity: Math.max(0, Number(rx.prescribed_quantity) - Number(rx.total_quantity_purchased)),
    performed_by: profile?.id || null,
  }).then(({ error: logError }) => {
    if (logError) console.warn("Unable to write prescription activity log:", logError.message);
  });

  return rx;
}

/**
 * Every "Purchasing Elsewhere" declaration ever made, newest first -- a
 * permanent activity trail staff can browse without opening each item.
 */
export async function getPrescriptionElsewhereLog(limit = 100) {
  const { data, error } = await supabase
    .from("prescription_activity_log")
    .select("id,prescription_id,pet_id,owner_id,item_name,remaining_quantity,performed_by,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Unable to load the purchasing-elsewhere log: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq([...rows.map((row) => row.owner_id), ...rows.map((row) => row.performed_by)]);

  const [petsResult, profilesResult] = await Promise.all([
    petIds.length ? supabase.from("pets").select("id,pet_name,species").in("id", petIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from("profiles").select("id,full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const petsById = new Map((petsResult.data || []).map((pet) => [pet.id, pet]));
  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    owner: profilesById.get(row.owner_id) || null,
    performedByProfile: profilesById.get(row.performed_by) || null,
  }));
}

/**
 * The "Outstanding Prescriptions" section on the Staff Transactions page:
 * every prescribed medicine still owed to an owner (not fully purchased,
 * not marked as being bought elsewhere), across every consultation.
 */
export async function getOutstandingPrescriptions() {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,queue_entry_id,pet_id,owner_id,veterinarian_id,inventory_item_id,item_name,unit_price,prescribed_quantity,total_quantity_purchased,fulfillment_status,created_at")
    .in("fulfillment_status", ["Not Purchased", "Partially Purchased"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load outstanding prescriptions: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.map((row) => row.owner_id));

  const [petsResult, profilesResult] = await Promise.all([
    petIds.length ? supabase.from("pets").select("id,pet_name,species").in("id", petIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from("profiles").select("id,full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const petsById = new Map((petsResult.data || []).map((pet) => [pet.id, pet]));
  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    owner: profilesById.get(row.owner_id) || null,
    remainingQuantity: Number(row.prescribed_quantity) - Number(row.total_quantity_purchased),
  }));
}

// Used by the transaction detail panel to show prescribed/purchased/
// remaining quantity for the specific medicine lines an invoice billed.
export async function getPrescriptionsByIds(ids) {
  const uniqueIds = uniq(ids);
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,item_name,prescribed_quantity,total_quantity_purchased,fulfillment_status")
    .in("id", uniqueIds);
  if (error) throw new Error(`Unable to load prescription details: ${error.message}`);
  return data || [];
}

/**
 * Purchase history for a set of prescriptions: one row per invoiced line
 * ever checked out against them (transaction_items already carries the
 * quantity + timestamp of that specific purchase), so partial buys made on
 * different visits accumulate into a real log instead of just a running
 * total.
 */
export async function getPrescriptionPurchaseHistory(prescriptionIds) {
  const ids = uniq(prescriptionIds);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("transaction_items")
    .select("id,prescription_id,quantity,unit_price,created_at")
    .in("prescription_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load purchase history: ${error.message}`);
  return data || [];
}

/**
 * Read-only prescription fulfillment list for a veterinarian: every
 * medicine they prescribed, and whether the owner has fully, partially, or
 * not yet purchased it (or is buying it elsewhere). This never touches a
 * medical record or the queue -- it is purely a status view sourced from
 * the same prescriptions table the staff POS already maintains.
 */
export async function getPrescriptionsForVeterinarian(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,pet_id,owner_id,item_name,unit_price,prescribed_quantity,total_quantity_purchased,fulfillment_status,created_at,updated_at")
    .eq("veterinarian_id", veterinarianId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load prescriptions: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.map((row) => row.owner_id));

  const [petsResult, profilesResult] = await Promise.all([
    petIds.length ? supabase.from("pets").select("id,pet_name,species").in("id", petIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from("profiles").select("id,full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const petsById = new Map((petsResult.data || []).map((pet) => [pet.id, pet]));
  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    owner: profilesById.get(row.owner_id) || null,
    remainingQuantity: Math.max(0, Number(row.prescribed_quantity) - Number(row.total_quantity_purchased)),
  }));
}

export function subscribeToPrescriptions(callback) {
  const channel = supabase.channel(`prescriptions-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, callback)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Loads everything a "Continue Purchase" follow-up checkout needs: the one
 * prescription being fulfilled plus its pet/owner/veterinarian, matching
 * the shape getConsultationForBilling returns so NewTransaction can render
 * either with the same code paths.
 */
export async function getPrescriptionForFollowUp(prescriptionId) {
  if (!prescriptionId) return null;

  const { data: rx, error: rxError } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", prescriptionId)
    .single();
  if (rxError) throw new Error(`Unable to load this prescription: ${rxError.message}`);

  const remaining = Number(rx.prescribed_quantity) - Number(rx.total_quantity_purchased);
  if (rx.fulfillment_status === "Purchasing Elsewhere" || remaining <= 0) {
    throw new Error("This prescription has no remaining quantity to purchase.");
  }

  const { data: entry } = await supabase
    .from("queue_entries")
    .select("id,queue_number,veterinarian_id")
    .eq("id", rx.queue_entry_id)
    .maybeSingle();

  const [petResult, profilesResult] = await Promise.all([
    supabase.from("pets").select("id,pet_name,species").eq("id", rx.pet_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name").in("id", uniq([rx.owner_id, rx.veterinarian_id || entry?.veterinarian_id])),
  ]);
  const profilesById = new Map((profilesResult.data || []).map((row) => [row.id, row]));
  const veterinarianId = rx.veterinarian_id || entry?.veterinarian_id || null;

  return {
    queueEntryId: rx.queue_entry_id,
    queueNumber: entry?.queue_number || null,
    petId: rx.pet_id,
    ownerId: rx.owner_id,
    veterinarianId,
    appointmentId: null,
    primaryMedicalRecordId: rx.medical_record_id,
    pet: petResult.data || null,
    owner: profilesById.get(rx.owner_id) || null,
    veterinarian: profilesById.get(veterinarianId) || null,
    consultationFee: 0,
    diagnosis: "",
    treatment: "",
    veterinarianNotes: "",
    inventoryItems: [],
    followUpPrescription: rx,
  };
}

/** Sum of every unpaid/partially-paid invoice balance an owner still owes. */
export async function getOwnerOutstandingBalance(ownerId) {
  if (!ownerId) return 0;
  const { data, error } = await supabase
    .from("transactions")
    .select("total_amount,amount_paid")
    .eq("owner_id", ownerId)
    .in("payment_status", ["Unpaid", "Partially Paid"]);
  if (error) throw new Error(`Unable to load this owner's balance: ${error.message}`);
  return (data || []).reduce((sum, row) => sum + Math.max(0, Number(row.total_amount) - Number(row.amount_paid)), 0);
}

/**
 * Every invoice an owner still owes money on -- used by the Pet Owner
 * portal so they can see the same remaining-balance figure staff sees on
 * the Payment Transaction History table, per pet/visit.
 */
export async function getOwnerInvoices(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("id,or_number,pet_id,total_amount,amount_paid,payment_status,created_at")
    .eq("owner_id", ownerId)
    .in("payment_status", ["Unpaid", "Partially Paid"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load your invoices: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const { data: pets } = petIds.length
    ? await supabase.from("pets").select("id,pet_name,species").in("id", petIds)
    : { data: [] };
  const petsById = new Map((pets || []).map((pet) => [pet.id, pet]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    remainingBalance: Math.max(0, Number(row.total_amount) - Number(row.amount_paid)),
  }));
}

/**
 * Every medicine an owner still has to pick up (not fully purchased, not
 * already marked as being bought elsewhere) -- the owner-facing mirror of
 * staff's Outstanding Prescriptions list. markPrescriptionElsewhere is the
 * same function staff use, so an owner declaring "I'll buy this elsewhere"
 * removes it from staff's list the instant it's saved, live.
 */
export async function getOwnerOutstandingPrescriptions(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,pet_id,item_name,prescribed_quantity,total_quantity_purchased,fulfillment_status,created_at")
    .eq("owner_id", ownerId)
    .in("fulfillment_status", ["Not Purchased", "Partially Purchased"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load your prescriptions: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = uniq(rows.map((row) => row.pet_id));
  const { data: pets } = petIds.length
    ? await supabase.from("pets").select("id,pet_name,species").in("id", petIds)
    : { data: [] };
  const petsById = new Map((pets || []).map((pet) => [pet.id, pet]));

  return rows.map((row) => ({
    ...row,
    pet: petsById.get(row.pet_id) || null,
    remainingQuantity: Math.max(0, Number(row.prescribed_quantity) - Number(row.total_quantity_purchased)),
  }));
}
