import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../config/supabaseClient";
import {
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  UserCircle,
  X,
} from "lucide-react";
import {
  createConversation,
  getConversations,
  getMessageContacts,
  getMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
  subscribeToMessagingOverview,
} from "../services/messageService";
import { formatDateTime12h } from "../utils/timeFormat";

// Consistent default avatar whenever a profile photo isn't on file.
function Avatar({ src, alt, size = 38 }) {
  return src ? (
    <img className="msgAvatar" src={src} alt={alt} style={{ width: size, height: size }} />
  ) : (
    <span className="msgAvatar msgAvatarFallback" style={{ width: size, height: size }}>
      <UserCircle size={Math.round(size * 0.72)} />
    </span>
  );
}

export default function MessagingModule({ profile }) {
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const endRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const previousConversationIdRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);

  async function loadConversations() {
    if (!profile?.id) return;

    try {
      setError("");
      const [conversationRows, contactRows] = await Promise.all([
        getConversations(profile),
        getMessageContacts(profile),
      ]);

      setConversations(conversationRows || []);
      setContacts(contactRows || []);
    } catch (loadError) {
      console.error("Unable to load messaging data:", loadError);
      setError(loadError.message || "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeMessaging() {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [conversationRows, contactRows] = await Promise.all([
          getConversations(profile),
          getMessageContacts(profile),
        ]);

        if (!cancelled) {
          setConversations(conversationRows || []);
          setContacts(contactRows || []);
        }
      } catch (loadError) {
        console.error("Unable to initialize messaging:", loadError);
        if (!cancelled) {
          setError(loadError.message || "Unable to load messages.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initializeMessaging();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    const channel = subscribeToMessagingOverview(profile.id, () => {
      if (active) loadConversations();
    });
    const fallbackTimer = setInterval(() => {
      if (active) loadConversations();
    }, 5000);
    return () => {
      active = false;
      clearInterval(fallbackTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile?.id]);


  useEffect(() => {
    let cancelled = false;
    let channel = null;

    async function loadActiveConversation() {
      if (!activeConversation?.id || !profile?.id) {
        setMessages([]);
        return;
      }

      try {
        setError("");
        const rows = await getMessages(activeConversation.id);

        if (!cancelled) {
          setMessages(rows || []);
        }

        await markConversationRead(activeConversation.id, profile.id);

        if (!cancelled) {
          await loadConversations();
        }
      } catch (loadError) {
        console.error("Unable to load conversation messages:", loadError);
        if (!cancelled) {
          setError(loadError.message || "Unable to load conversation messages.");
        }
      }
    }

    async function handleRealtimeChange() {
      if (cancelled || !activeConversation?.id) return;

      try {
        const rows = await getMessages(activeConversation.id);
        if (!cancelled) {
          setMessages(rows || []);
          await loadConversations();
        }
      } catch (realtimeError) {
        console.error("Unable to refresh realtime messages:", realtimeError);
      }
    }

    loadActiveConversation();

    if (activeConversation?.id) {
      channel = subscribeToMessages(
        activeConversation.id,
        handleRealtimeChange
      );
    }

    return () => {
      cancelled = true;

      if (channel && typeof channel.unsubscribe === "function") {
        channel.unsubscribe();
      }
    };
  }, [activeConversation?.id, profile?.id]);

  // Only auto-scrolls to the newest message when the reader was already
  // at (or near) the bottom -- either because they just opened this
  // conversation, or because they haven't scrolled up to read older
  // messages. Scrolling up to read history is never interrupted by a
  // newly arriving message.
  useEffect(() => {
    const isNewConversation = previousConversationIdRef.current !== activeConversation?.id;
    previousConversationIdRef.current = activeConversation?.id;
    if (isNewConversation) shouldAutoScrollRef.current = true;

    if (shouldAutoScrollRef.current && endRef.current) {
      // scrollIntoView (especially "smooth") fires its own scroll events
      // while it animates -- without this guard, handleMessagesScroll reads
      // those as the reader manually scrolling and can flip
      // shouldAutoScrollRef off mid-animation, which is what made scrolling
      // up feel like it kept getting fought/reset on a busy conversation.
      isProgrammaticScrollRef.current = true;
      endRef.current.scrollIntoView({ behavior: isNewConversation ? "auto" : "smooth" });
      const clearGuard = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, isNewConversation ? 50 : 500);
      return () => clearTimeout(clearGuard);
    }
  }, [messages, activeConversation?.id]);

  function handleMessagesScroll() {
    if (isProgrammaticScrollRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  }

  useEffect(() => {
    if (!showNewConversation) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [showNewConversation]);

  async function createNewConversation() {
    if (!selectedContacts.length) {
      setError("Please select at least one recipient.");
      return;
    }

    try {
      setError("");
      const conversation = await createConversation(
        profile,
        selectedContacts,
        subject
      );

      setShowNewConversation(false);
      setSelectedContacts([]);
      setSubject("");
      await loadConversations();
      setActiveConversation(conversation);
    } catch (createError) {
      console.error("Unable to create conversation:", createError);
      setError(createError.message || "Unable to create conversation.");
    }
  }

  async function submitMessage(event) {
    event.preventDefault();

    if (!activeConversation?.id || (!body.trim() && !file) || sending) {
      return;
    }

    try {
      setSending(true);
      setError("");

      await sendMessage(
        activeConversation.id,
        profile,
        body,
        file
      );

      setBody("");
      setFile(null);

      const rows = await getMessages(activeConversation.id);
      setMessages(rows || []);
      await loadConversations();
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      setError(sendError.message || "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  function normalizeRole(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function roleLabel(role) {
    const value = normalizeRole(role);
    if (value === "veterinarian") return "Veterinarian";
    if (value === "pet_owner" || value === "petowner") return "Pet Owner";
    if (value === "admin" || value === "administrator") return "Administrator";
    if (value === "staff") return "Staff";
    return String(role || "PawCruz User");
  }

  function getOtherParticipants(conversation) {
    return (conversation?.participants || []).filter(
      (participant) => participant.id !== profile.id
    );
  }

  function getConversationTitle(conversation) {
    const names = getOtherParticipants(conversation)
      .map((participant) => participant.full_name || participant.username || participant.email)
      .filter(Boolean);
    return names.join(", ") || "PawCruz Conversation";
  }

  function getConversationRole(conversation) {
    return getOtherParticipants(conversation)
      .map((participant) => roleLabel(participant.role))
      .filter(Boolean)
      .join(" • ") || "PawCruz";
  }

  function getConversationAvatar(conversation) {
    return getOtherParticipants(conversation).find((participant) => participant.avatar_url)?.avatar_url || "";
  }

  function getConversationPreview(conversation) {
    const latest = conversation?.latest;
    if (!latest) return "No messages yet";
    const content = latest.body || latest.attachment_name || "Attachment";
    if (latest.sender_id === profile.id) return `You: ${content}`;
    const sender = (conversation.participants || []).find(
      (participant) => participant.id === latest.sender_id
    );
    const senderName = sender?.full_name || sender?.username || "PawCruz User";
    return `${senderName}: ${content}`;
  }

  return (
    <div className="msg">
      <div className="left">
        <div className="lefthead">
          <h3>Messages</h3>
          <button
            type="button"
            aria-label="Create conversation"
            onClick={() => setShowNewConversation(true)}
          >
            <Plus />
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading conversations...</p>
        ) : conversations.length === 0 ? (
          <p className="muted">No conversations yet.</p>
        ) : (
          conversations.map((conversation) => (
            <button
              type="button"
              className={`conv ${
                activeConversation?.id === conversation.id ? "active" : ""
              }`}
              key={conversation.id}
              onClick={() => setActiveConversation(conversation)}
            >
              <Avatar src={getConversationAvatar(conversation)} alt={getConversationTitle(conversation)} />
              <div>
                <b>{getConversationTitle(conversation)}</b>
                <em className="conversationRole">{getConversationRole(conversation)}</em>
                <small>{getConversationPreview(conversation)}</small>
              </div>
              {conversation.unread > 0 && <span>{conversation.unread}</span>}
            </button>
          ))
        )}
      </div>

      <div className="chat">
        {!activeConversation ? (
          <div className="empty">
            <MessageCircle size={54} />
            <h3>Select a conversation</h3>
            <p>Choose an existing conversation or create a new one.</p>
          </div>
        ) : (
          <>
            <div className="chathead">
              <Avatar src={getConversationAvatar(activeConversation)} alt={getConversationTitle(activeConversation)} size={40} />
              <div>
                <b>{getConversationTitle(activeConversation)}</b>
                <small>{getConversationRole(activeConversation)}</small>
              </div>
            </div>

            <div className="messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
              {messages.map((message) => {
                const mine = message.sender_id === profile.id;
                return (
                  <div key={message.id} className={`bubbleRow ${mine ? "mine" : ""}`}>
                    <Avatar
                      src={mine ? profile.avatar_url : message.sender?.avatar_url}
                      alt={mine ? (profile.full_name || profile.username || "You") : (message.sender?.full_name || "PawCruz User")}
                      size={28}
                    />
                    <div className={`bubble ${mine ? "mine" : ""}`}>
                      <small className="senderName">{mine ? (profile.full_name || profile.username || "You") : (message.sender?.full_name || "PawCruz User")}</small>
                      {message.body && <p>{message.body}</p>}
                      {message.attachment_url && (
                        <a
                          href={message.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📎 {message.attachment_name || "Attachment"}
                        </a>
                      )}
                      <time>{formatDateTime12h(message.created_at)}</time>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form className="composer" onSubmit={submitMessage}>
              <label aria-label="Attach file">
                <Paperclip />
                <input
                  type="file"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] || null)
                  }
                />
              </label>
              <input
                placeholder={file ? `Attached: ${file.name}` : "Type a message..."}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <button type="submit" disabled={sending}>
                <Send />
              </button>
            </form>
          </>
        )}
      </div>

      {error && (
        <div className="toast">
          {error}
          <button type="button" onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}

      {showNewConversation && (
        <div className="modal">
          <div className="new">
            <button
              type="button"
              className="x"
              onClick={() => setShowNewConversation(false)}
            >
              <X />
            </button>
            <h2>New Conversation</h2>
            <label>
              Subject
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Example: Follow-up for Bella"
              />
            </label>
            <p>Select recipient(s)</p>
            <div className="contacts">
              {contacts.map((contact) => (
                <label key={contact.id}>
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(contact.id)}
                    onChange={(event) =>
                      setSelectedContacts((current) =>
                        event.target.checked
                          ? [...current, contact.id]
                          : current.filter((id) => id !== contact.id)
                      )
                    }
                  />
                  <Avatar src={contact.avatar_url} alt={contact.full_name} size={32} />
                  <span>
                    {contact.full_name}
                    <small>
                      {contact.role}{contact.email ? ` • ${contact.email}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="create"
              onClick={createNewConversation}
            >
              Create Conversation
            </button>
          </div>
        </div>
      )}

      <style>{`
        .msg{height:calc(100vh - 138px);min-height:570px;background:#fff;border-radius:18px;display:grid;grid-template-columns:320px 1fr;overflow:hidden;box-shadow:0 8px 24px #2f759616}.left{min-height:0;border-right:1px solid #deedf2;overflow-y:auto}.lefthead{display:flex;align-items:center;justify-content:space-between;padding:18px}.lefthead h3{margin:0}.lefthead button,.composer button{border:0;background:#4DA8DA;color:white;border-radius:10px;padding:8px}.composer button:disabled{opacity:.6;cursor:not-allowed}.conv{width:100%;border:0;border-top:1px solid #edf5f7;background:white;padding:14px;text-align:left;display:flex;align-items:center;gap:11px;justify-content:space-between;cursor:pointer}.conv.active{background:#eaf7fc}.conv div{flex:1;display:grid;gap:4px;min-width:0}.msgAvatar{flex-shrink:0;border-radius:50%;object-fit:cover;display:grid;place-items:center}.msgAvatarFallback{background:#e6f6fc;color:#4DA8DA}.conversationRole{font-style:normal;color:#397d9d;font-size:11px;font-weight:700;text-transform:capitalize}.conv small{color:#73858e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}.conv span{background:#4DA8DA;color:#fff;border-radius:20px;padding:4px 8px;height:max-content}.chat{display:flex;flex-direction:column;min-width:0;min-height:0}.chathead{flex-shrink:0;display:flex;align-items:center;gap:11px;padding:17px;border-bottom:1px solid #deedf2}.chathead div{display:grid;gap:4px;min-width:0}.chathead small{color:#73858e}.messages{flex:1;min-height:0;overflow-y:auto;padding:20px;background:#f7fcfe;scrollbar-width:thin;scrollbar-color:#b8dcec transparent}.messages::-webkit-scrollbar{width:8px}.messages::-webkit-scrollbar-track{background:transparent}.messages::-webkit-scrollbar-thumb{background:#b8dcec;border-radius:999px}.messages::-webkit-scrollbar-thumb:hover{background:#8fc4de}.bubbleRow{display:flex;align-items:flex-end;gap:8px;margin-bottom:12px}.bubbleRow.mine{flex-direction:row-reverse}.bubble{max-width:72%;background:#fff;padding:11px 13px;border-radius:4px 14px 14px 14px;box-shadow:0 3px 12px #2f759610;display:grid;gap:5px;min-width:0}.bubble.mine{background:#dff3fb;border-radius:14px 4px 14px 14px}.bubble p{margin:0;white-space:pre-wrap}.bubble small,.bubble time{font-size:10px;color:#758790}.bubble .senderName{font-weight:800;color:#315f76;font-size:11px}.bubble.mine .senderName{text-align:right;color:#2b6f8d}.bubble a{color:#217ba7}.composer{flex-shrink:0;display:flex;gap:8px;padding:13px;border-top:1px solid #deedf2}.composer>input{flex:1;border:1px solid #cfe2e9;border-radius:12px;padding:12px}.composer label{display:grid;place-items:center;cursor:pointer}.composer label input{display:none}.empty{margin:auto;text-align:center;color:#789}.muted{padding:15px;color:#789}.modal{position:fixed;inset:0;background:#20313b99;z-index:60;display:grid;place-items:center;padding:20px}.new{background:#fff;border-radius:18px;padding:24px;width:min(520px,100%);max-height:90vh;overflow-y:auto;box-sizing:border-box;position:relative}.x{position:absolute;right:15px;top:15px;border:0;background:#eef6f9;border-radius:50%;padding:6px}.new>label{display:grid;gap:6px}.new input[type=text],.new>label input{padding:11px;border:1px solid #cee2e9;border-radius:9px}.contacts{max-height:300px;overflow:auto;border:1px solid #e0edf1;border-radius:10px}.contacts label{display:flex;gap:10px;padding:11px;border-bottom:1px solid #edf3f5}.contacts span{display:grid}.contacts small{color:#789}.create{width:100%;margin-top:14px;border:0;background:#4DA8DA;color:white;padding:12px;border-radius:10px}.toast{position:fixed;right:20px;bottom:20px;background:#fff0f0;color:#a33;padding:12px;border-radius:10px;display:flex;gap:10px}.toast button{border:0;background:none}@media(max-width:750px){.msg{grid-template-columns:1fr;height:auto}.left{max-height:260px;border-right:0;border-bottom:1px solid #deedf2}.chat{min-height:500px}.bubble{max-width:88%}}
      `}</style>
    </div>
  );
}
