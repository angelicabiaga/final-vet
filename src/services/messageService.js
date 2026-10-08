import { supabase } from "../config/supabaseClient";

const FALLBACK_CODES = new Set([
  "PGRST200",
  "PGRST201",
  "PGRST204",
  "PGRST205",
  "42P01",
  "42703",
]);

function readableError(prefix, error) {
  const code = error?.code || "unknown";
  const message = error?.message || "Unknown Supabase error.";
  return new Error(`${prefix} (${code}): ${message}`);
}

function shouldUseRpc(error) {
  return Boolean(error && FALLBACK_CODES.has(error.code));
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
  if (error) {
    console.error(`${functionName} error:`, error);
    throw readableError(message, error);
  }
  return asArray(data);
}

function allowedContactRoles(profile) {
  const role = String(profile?.role || "").toLowerCase();
  if (role === "pet_owner") return ["staff", "veterinarian"];
  return null;
}

export async function getMessageContacts(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");

  const roleFilter = allowedContactRoles(profile);

  let query = supabase
    .from("profiles")
    .select("id,full_name,username,email,role,account_status,avatar_url")
    .neq("id", profile.id)
    .order("full_name");

  if (roleFilter) query = query.in("role", roleFilter);

  const { data, error } = await query;

  if (!error) {
    return (data || []).filter(
      (item) => String(item.account_status || "").toLowerCase() === "active"
    );
  }

  console.warn("Normal contact query failed; using RPC fallback:", error);
  const rows = await rpcArray(
    "pawcruz_get_message_contacts",
    { p_profile_id: profile.id },
    "Unable to load messaging contacts"
  );
  if (!roleFilter) return rows;
  return rows.filter((item) => roleFilter.includes(String(item.role || "").toLowerCase()));
}

// Same set of people (in any order) -> same key. Used to treat every
// conversation between the same participants as one thread.
export function participantKey(profileIds) {
  return [...new Set((profileIds || []).filter(Boolean))].sort().join(",");
}

// The user's existing conversation with exactly these participants, most
// recently active first -- so "Create Conversation" reopens it instead of
// starting a duplicate thread with the same person.
async function findExistingConversation(profile, ids) {
  const { data: links, error: linksError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", profile.id);
  if (linksError || !links?.length) return null;

  const conversationIds = [...new Set(links.map((row) => row.conversation_id))];
  const { data: participantRows, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id,profile_id")
    .in("conversation_id", conversationIds);
  if (participantError) return null;

  const members = new Map();
  (participantRows || []).forEach((row) => {
    if (!members.has(row.conversation_id)) members.set(row.conversation_id, []);
    members.get(row.conversation_id).push(row.profile_id);
  });

  const wanted = participantKey([profile.id, ...ids]);
  const matches = [...members]
    .filter(([, profileIds]) => participantKey(profileIds) === wanted)
    .map(([conversationId]) => conversationId);
  if (!matches.length) return null;

  const { data: rows, error } = await supabase
    .from("conversations")
    .select("*")
    .in("id", matches);
  if (error || !rows?.length) return null;

  return rows.sort(
    (a, b) =>
      new Date(b.last_message_at || b.created_at) -
      new Date(a.last_message_at || a.created_at)
  )[0];
}

export async function createConversation(profile, participantIds, subject) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");

  const ids = [...new Set((participantIds || []).filter(Boolean))].filter(
    (id) => id !== profile.id
  );
  if (!ids.length) throw new Error("Choose at least one recipient.");

  const existing = await findExistingConversation(profile, ids);
  if (existing) return existing;

  const roleFilter = allowedContactRoles(profile);
  if (roleFilter) {
    const { data: recipients, error: recipientError } = await supabase
      .from("profiles")
      .select("id,role")
      .in("id", ids);

    if (recipientError) {
      throw readableError("Unable to verify recipients", recipientError);
    }

    const disallowed = (recipients || []).some(
      (row) => !roleFilter.includes(String(row.role || "").toLowerCase())
    );
    if (disallowed || (recipients || []).length !== ids.length) {
      throw new Error("Pet owners can only message clinic staff or a veterinarian.");
    }
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({
      created_by: profile.id,
      subject: subject?.trim() || "New conversation",
    })
    .select("*")
    .single();

  if (!conversationError && conversation) {
    const participantRows = [profile.id, ...ids].map((id) => ({
      conversation_id: conversation.id,
      profile_id: id,
      last_read_at: id === profile.id ? new Date().toISOString() : null,
    }));

    const { error: participantError } = await supabase
      .from("conversation_participants")
      .insert(participantRows);

    if (!participantError) return conversation;

    console.warn("Participant insert failed; cleaning up and using RPC:", participantError);
    await supabase.from("conversations").delete().eq("id", conversation.id);
  } else if (conversationError) {
    console.warn("Normal conversation creation failed; using RPC:", conversationError);
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
    supabase
      .from("conversations")
      .select("id,subject,created_by,last_message_at,created_at")
      .in("id", conversationIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id,profile_id")
      .in("conversation_id", conversationIds),
    supabase
      .from("messages")
      .select(
        "id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at"
      )
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  const firstError =
    conversationResult.error || participantResult.error || messageResult.error;
  if (firstError) return { data: null, error: firstError };

  const profileIds = [
    ...new Set((participantResult.data || []).map((row) => row.profile_id)),
  ];

  let profiles = [];
  if (profileIds.length) {
    const profileResult = await supabase
      .from("profiles")
      .select("id,full_name,username,email,role,avatar_url")
      .in("id", profileIds);
    if (profileResult.error) return { data: null, error: profileResult.error };
    profiles = profileResult.data || [];
  }

  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const conversationMap = new Map(
    (conversationResult.data || []).map((item) => [item.id, item])
  );
  const linkMap = new Map((links || []).map((item) => [item.conversation_id, item]));

  const rows = conversationIds
    .map((conversationId) => {
      const conversation = conversationMap.get(conversationId);
      if (!conversation) return null;

      const participants = (participantResult.data || [])
        .filter((item) => item.conversation_id === conversationId)
        .map((item) => profileMap.get(item.profile_id))
        .filter(Boolean);

      const conversationMessages = (messageResult.data || []).filter(
        (item) => item.conversation_id === conversationId
      );
      const latest = conversationMessages[0] || null;
      const link = linkMap.get(conversationId);
      const unread = conversationMessages.filter(
        (message) =>
          message.sender_id !== profile.id &&
          (!link?.last_read_at ||
            new Date(message.created_at) > new Date(link.last_read_at))
      ).length;

      return { ...conversation, participants, latest, unread };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.last_message_at || b.created_at) -
        new Date(a.last_message_at || a.created_at)
    );

  return { data: rows, error: null };
}

export async function getConversations(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");

  const normalResult = await getConversationsNormally(profile);
  if (!normalResult.error) return normalResult.data;

  console.warn(
    "Normal conversation query failed; using RPC fallback:",
    normalResult.error
  );

  return rpcArray(
    "pawcruz_get_conversations",
    { p_profile_id: profile.id },
    "Unable to load conversations"
  );
}

export async function getMessages(conversationId) {
  if (!conversationId) return [];

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (!error) {
    const senderIds = [...new Set((data || []).map((item) => item.sender_id))];
    let profiles = [];

    if (senderIds.length) {
      const profileResult = await supabase
        .from("profiles")
        .select("id,full_name,role,avatar_url")
        .in("id", senderIds);
      if (profileResult.error) {
        console.warn("Unable to attach message senders:", profileResult.error);
      } else {
        profiles = profileResult.data || [];
      }
    }

    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    return (data || []).map((item) => ({
      ...item,
      sender: profileMap.get(item.sender_id) || null,
    }));
  }

  console.warn("Normal message query failed; using RPC fallback:", error);
  return rpcArray(
    "pawcruz_get_messages",
    { p_conversation_id: conversationId },
    "Unable to load messages"
  );
}

export async function markConversationRead(conversationId, profileId) {
  if (!conversationId || !profileId) return;

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId);

  if (!error) return;

  const { error: rpcError } = await supabase.rpc(
    "pawcruz_mark_conversation_read",
    {
      p_conversation_id: conversationId,
      p_profile_id: profileId,
    }
  );

  if (rpcError) console.warn("Unable to mark conversation as read:", rpcError);
}

export async function uploadMessageAttachment(file, profileId) {
  if (!file) return null;
  if (!profileId) throw new Error("Your login session is incomplete.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${profileId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from("message-attachments")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw readableError("Unable to upload attachment", error);

  const { data } = supabase.storage
    .from("message-attachments")
    .getPublicUrl(path);

  return { path, url: data.publicUrl, name: file.name };
}

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_MAX_FILE_MB = 10;
const BLOCKED_FILE = /\.(exe|bat|cmd|com|msi|sh|ps1|vbs|js|jar|apk|scr|dll)$/i;

function sendFailure(message) {
  const error = new Error(message);
  error.code = "SEND_FAILED";
  return error;
}

// Checks a message before anything is uploaded or stored. Returns the
// problem as text, or "" when the message can be sent.
export function validateOutgoingMessage(body, file) {
  const text = String(body ?? "").trim();
  if (!text && !file) return "Type a message or attach a file before sending.";
  if (text.length > MESSAGE_MAX_LENGTH) return `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString()} characters (yours has ${text.length.toLocaleString()}).`;
  if (file) {
    if (!file.size) return "The attached file is empty. Choose another file.";
    if (file.size > MESSAGE_MAX_FILE_MB * 1024 * 1024) return `Attachments can be up to ${MESSAGE_MAX_FILE_MB} MB.`;
    if (BLOCKED_FILE.test(file.name || "")) return "This file type can't be sent. Attach a photo, PDF or document instead.";
  }
  return "";
}

export async function sendMessage(conversationId, profile, body, file) {
  if (!conversationId) throw sendFailure("Select a conversation first.");
  if (!profile?.id) throw sendFailure("Your login session is incomplete. Please log in again.");

  const problem = validateOutgoingMessage(body, file);
  if (problem) throw sendFailure(problem);

  // The sender must belong to the selected conversation thread.
  const { data: membership, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .limit(1);
  if (!membershipError && !membership?.length) {
    throw sendFailure("You're not part of this conversation, so the message wasn't sent.");
  }

  let attachment = null;
  if (file) {
    try {
      attachment = await uploadMessageAttachment(file, profile.id);
    } catch {
      throw sendFailure("The attachment couldn't be uploaded, so the message wasn't sent. Please try again.");
    }
  }
  // If the message itself isn't stored, don't leave its file behind.
  const discardAttachment = async () => {
    if (attachment?.path) await supabase.storage.from("message-attachments").remove([attachment.path]).catch(() => {});
  };

  const payload = {
    conversation_id: conversationId,
    sender_id: profile.id,
    body: body?.trim() || null,
    attachment_url: attachment?.url || null,
    attachment_name: attachment?.name || null,
  };

  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select("*")
    .single();

  if (!error && data?.id) {
    await markConversationRead(conversationId, profile.id);
    return data;
  }

  console.warn("Normal message insert failed; using RPC fallback:", error);

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "pawcruz_send_message",
    {
      p_conversation_id: conversationId,
      p_sender_id: profile.id,
      p_body: payload.body,
      p_attachment_url: payload.attachment_url,
      p_attachment_name: payload.attachment_name,
    }
  );

  if (rpcError || !rpcData) {
    await discardAttachment();
    console.error("Message send failed:", rpcError);
    throw sendFailure("The message couldn't be sent. Check your connection and try again.");
  }
  return rpcData;
}

export function subscribeToMessages(conversationId, onChange) {
  if (!conversationId) return null;

  return supabase
    .channel(`pawcruz-messages-${conversationId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Messaging Realtime status:", status);
      }
    });
}

let messagingOverviewChannelSeq = 0;
export function subscribeToMessagingOverview(profileId, onChange) {
  if (!profileId) return null;

  // The counter guarantees a unique channel name even when two callers
  // for the same profile mount in the same tick (e.g. AppShell's Messages
  // badge and MessagingModule both mounting on the Messages page) --
  // Date.now() alone is only millisecond-precision, and supabase-js
  // reuses a channel by name, which throws if a second .on() lands on a
  // channel the first caller already .subscribe()'d.
  const channel = supabase
    .channel(`pawcruz-web-message-overview-${profileId}-${Date.now()}-${++messagingOverviewChannelSeq}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      onChange
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_participants",
        filter: `profile_id=eq.${profileId}`,
      },
      onChange
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Messaging overview Realtime status:", status);
      }
    });

  // Return a cleanup function, matching subscribeToQueue/subscribeToTransactions'
  // contract, instead of the raw channel object -- the previous version
  // returned the channel itself, which callers treating it like the other
  // subscribeToX helpers' return value (calling it as a function) crashed
  // on with "channel is not a function".
  return () => { supabase.removeChannel(channel); };
}
