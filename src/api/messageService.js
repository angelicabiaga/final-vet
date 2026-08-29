import { supabase } from "../config/supabaseClient";

const FALLBACK_CODES = new Set(["PGRST200", "PGRST201", "PGRST204", "PGRST205", "42P01", "42703"]);

function readableError(prefix, error) {
  const code = error?.code || "unknown";
  const message = error?.message || "Unknown Supabase error.";
  return new Error(`${prefix} (${code}): ${message}`);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function rpcArray(functionName, args, message) {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw readableError(message, error);
  return asArray(data);
}

export async function getMessageContacts(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,username,email,role,account_status")
    .neq("id", profile.id)
    .order("full_name");
  if (!error) {
    return (data || []).filter((item) => String(item.account_status || "").toLowerCase() === "active");
  }
  return rpcArray("pawcruz_get_message_contacts", { p_profile_id: profile.id }, "Unable to load messaging contacts");
}

export async function createConversation(profile, participantIds, subject) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const ids = [...new Set((participantIds || []).filter(Boolean))].filter((id) => id !== profile.id);
  if (!ids.length) throw new Error("Choose at least one recipient.");

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({ created_by: profile.id, subject: subject?.trim() || "New conversation" })
    .select("*")
    .single();

  if (!conversationError && conversation) {
    const participantRows = [profile.id, ...ids].map((id) => ({
      conversation_id: conversation.id,
      profile_id: id,
      last_read_at: id === profile.id ? new Date().toISOString() : null,
    }));
    const { error: participantError } = await supabase.from("conversation_participants").insert(participantRows);
    if (!participantError) return conversation;
    await supabase.from("conversations").delete().eq("id", conversation.id);
  }

  const { data, error } = await supabase.rpc("pawcruz_create_conversation", {
    p_created_by: profile.id,
    p_participant_ids: ids,
    p_subject: subject?.trim() || "New conversation",
  });
  if (error) throw readableError("Unable to create conversation", error);
  return data;
}

async function getConversationsNormally(profile) {
  const { data: links, error: linksError } = await supabase
    .from("conversation_participants")
    .select("conversation_id,last_read_at")
    .eq("profile_id", profile.id);
  if (linksError) return { data: null, error: linksError };
  const conversationIds = [...new Set((links || []).map((row) => row.conversation_id))];
  if (!conversationIds.length) return { data: [], error: null };

  const [conversationResult, participantResult, messageResult] = await Promise.all([
    supabase.from("conversations").select("id,subject,created_by,last_message_at,created_at").in("id", conversationIds),
    supabase.from("conversation_participants").select("conversation_id,profile_id").in("conversation_id", conversationIds),
    supabase.from("messages").select("id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }),
  ]);
  const firstError = conversationResult.error || participantResult.error || messageResult.error;
  if (firstError) return { data: null, error: firstError };

  const profileIds = [...new Set((participantResult.data || []).map((row) => row.profile_id))];
  let profiles = [];
  if (profileIds.length) {
    const result = await supabase.from("profiles").select("id,full_name,username,email,role").in("id", profileIds);
    if (result.error) return { data: null, error: result.error };
    profiles = result.data || [];
  }

  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const conversationMap = new Map((conversationResult.data || []).map((item) => [item.id, item]));
  const linkMap = new Map((links || []).map((item) => [item.conversation_id, item]));

  const rows = conversationIds.map((conversationId) => {
    const conversation = conversationMap.get(conversationId);
    if (!conversation) return null;
    const participants = (participantResult.data || [])
      .filter((item) => item.conversation_id === conversationId)
      .map((item) => profileMap.get(item.profile_id)).filter(Boolean);
    const conversationMessages = (messageResult.data || []).filter((item) => item.conversation_id === conversationId);
    const latest = conversationMessages[0] || null;
    const link = linkMap.get(conversationId);
    const unread = conversationMessages.filter((message) =>
      message.sender_id !== profile.id && (!link?.last_read_at || new Date(message.created_at) > new Date(link.last_read_at))
    ).length;
    return { ...conversation, participants, latest, unread };
  }).filter(Boolean).sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
  return { data: rows, error: null };
}

export async function getConversations(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const normalResult = await getConversationsNormally(profile);
  if (!normalResult.error) return normalResult.data;
  return rpcArray("pawcruz_get_conversations", { p_profile_id: profile.id }, "Unable to load conversations");
}

export async function getMessages(conversationId) {
  if (!conversationId) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at")
    .eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (!error) {
    const senderIds = [...new Set((data || []).map((item) => item.sender_id))];
    let profiles = [];
    if (senderIds.length) {
      const result = await supabase.from("profiles").select("id,full_name,role").in("id", senderIds);
      if (!result.error) profiles = result.data || [];
    }
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    return (data || []).map((item) => ({ ...item, sender: profileMap.get(item.sender_id) || null }));
  }
  return rpcArray("pawcruz_get_messages", { p_conversation_id: conversationId }, "Unable to load messages");
}

export async function markConversationRead(conversationId, profileId) {
  if (!conversationId || !profileId) return;
  const { error } = await supabase.from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).eq("profile_id", profileId);
  if (!error) return;
  await supabase.rpc("pawcruz_mark_conversation_read", { p_conversation_id: conversationId, p_profile_id: profileId });
}

export async function uploadMessageAttachment(file, profileId) {
  if (!file) return null;
  if (!profileId) throw new Error("Your login session is incomplete.");
  const originalName = file.name || "attachment";
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${profileId}/${Date.now()}-${safeName}`;
  const response = await fetch(file.uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from("message-attachments").upload(path, arrayBuffer, {
    contentType: file.mimeType || "application/octet-stream", cacheControl: "3600", upsert: false,
  });
  if (error) throw readableError("Unable to upload attachment", error);
  const { data } = supabase.storage.from("message-attachments").getPublicUrl(path);
  return { path, url: data.publicUrl, name: originalName };
}

export async function sendMessage(conversationId, profile, body, file) {
  if (!conversationId) throw new Error("Select a conversation first.");
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  let attachment = null;
  if (file) attachment = await uploadMessageAttachment(file, profile.id);
  const payload = {
    conversation_id: conversationId, sender_id: profile.id, body: body?.trim() || null,
    attachment_url: attachment?.url || null, attachment_name: attachment?.name || null,
  };
  const { data, error } = await supabase.from("messages").insert(payload).select("*").single();
  if (!error) {
    await markConversationRead(conversationId, profile.id);
    return data;
  }
  const { data: rpcData, error: rpcError } = await supabase.rpc("pawcruz_send_message", {
    p_conversation_id: conversationId, p_sender_id: profile.id, p_body: payload.body,
    p_attachment_url: payload.attachment_url, p_attachment_name: payload.attachment_name,
  });
  if (rpcError) throw readableError("Unable to send message", rpcError);
  return rpcData;
}

export function subscribeToMessages(conversationId, onChange) {
  if (!conversationId) return null;
  return supabase.channel(`pawcruz-mobile-messages-${conversationId}-${Date.now()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, onChange)
    .subscribe();
}

let mobileMessagingOverviewChannelSeq = 0;
export function subscribeToMessagingOverview(profileId, onChange) {
  if (!profileId) return null;
  // The counter guarantees a unique channel name even if more than one
  // caller for the same profile mounts in the same tick -- Date.now()
  // alone is only millisecond-precision, and supabase-js reuses a channel
  // by name, which throws if a second .on() lands on a channel the first
  // caller already .subscribe()'d.
  const channel = supabase
    .channel(`pawcruz-mobile-message-overview-${profileId}-${Date.now()}-${++mobileMessagingOverviewChannelSeq}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `profile_id=eq.${profileId}` }, onChange)
    .subscribe();

  // Return a cleanup function, matching subscribeToQueue's contract, instead
  // of the raw channel object -- callers treat the return value as unsubscribe().
  return () => { supabase.removeChannel(channel); };
}
