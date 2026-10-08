import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  validateOutgoingMessage,
  MESSAGE_MAX_LENGTH,
  createConversation,
  getConversations,
  getMessageContacts,
  getMessages,
  markConversationRead,
  participantKey,
  sendMessage,
  subscribeToMessages,
  subscribeToMessagingOverview,
} from "../services/messageService";
import chatbotIcon from "../assets/reference/chatbot.png";
import { pushToast } from "./GlobalToastCenter";

// Messages from every conversation in a thread, oldest first.
async function getThreadMessages(conversationIds) {
  const groups = await Promise.all(conversationIds.map((id) => getMessages(id)));
  return groups
    .flat()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

// Separator between days in a conversation: "Today", "Yesterday", or the date.
function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// Time under each bubble, e.g. "9:31 AM".
function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Initials ("Neil Norrman A. Cruz" -> "NC") for anyone without a photo.
function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Consistent default avatar whenever a profile photo isn't on file.
function Avatar({ src, alt, size = 38 }) {
  return src ? (
    <img className="msgAvatar" src={src} alt={alt} style={{ width: size, height: size }} />
  ) : (
    <span
      className="msgAvatar msgAvatarFallback"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      role="img"
      aria-label={alt}
    >
      {initialsOf(alt)}
    </span>
  );
}

export default function MessagingModule({ profile }) {
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  // Participant key of the open thread (see participantKey).
  const [activeKey, setActiveKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [subject, setSubject] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const endRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const previousConversationIdRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);

  function threadKeyOf(conversation) {
    return participantKey([
      profile.id,
      ...(conversation.participants || []).map((participant) => participant.id),
    ]);
  }

  // A conversation with nobody else in it (left over from older data) is just
  // you talking to yourself -- keep it out of the list. Nothing is deleted.
  const inboxConversations = conversations.filter(
    (conversation) => getOtherParticipants(conversation).length > 0
  );

  // Older data can hold several conversations with the same person. Show them
  // as one thread with the combined history; new messages go to the most
  // recently active one.
  const threadMap = new Map();
  inboxConversations.forEach((conversation) => {
    const key = threadKeyOf(conversation);
    const thread = threadMap.get(key);
    if (!thread) {
      threadMap.set(key, { ...conversation, key, conversationIds: [conversation.id] });
      return;
    }
    thread.conversationIds.push(conversation.id);
    thread.unread = (thread.unread || 0) + (conversation.unread || 0);
    if (
      conversation.latest &&
      (!thread.latest ||
        new Date(conversation.latest.created_at) > new Date(thread.latest.created_at))
    ) {
      thread.latest = conversation.latest;
    }
  });
  const threads = [...threadMap.values()].sort(
    (a, b) =>
      new Date(b.latest?.created_at || b.created_at) -
      new Date(a.latest?.created_at || a.created_at)
  );
  const activeConversation = threads.find((thread) => thread.key === activeKey) || null;
  const activeConversationIds = activeConversation ? activeConversation.conversationIds.join(",") : "";

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
      return conversationRows || [];
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
    const unsubscribe = subscribeToMessagingOverview(profile.id, () => {
      if (active) loadConversations();
    });
    const fallbackTimer = setInterval(() => {
      if (active) loadConversations();
    }, 5000);
    return () => {
      active = false;
      clearInterval(fallbackTimer);
      unsubscribe?.();
    };
  }, [profile?.id]);


  useEffect(() => {
    let cancelled = false;
    const conversationIds = activeConversationIds ? activeConversationIds.split(",") : [];

    async function loadActiveConversation() {
      if (!conversationIds.length || !profile?.id) {
        setMessages([]);
        return;
      }

      try {
        setError("");
        const rows = await getThreadMessages(conversationIds);

        if (!cancelled) {
          setMessages(rows || []);
        }

        await Promise.all(
          conversationIds.map((id) => markConversationRead(id, profile.id))
        );

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
      if (cancelled || !conversationIds.length) return;

      try {
        const rows = await getThreadMessages(conversationIds);
        if (!cancelled) {
          setMessages(rows || []);
          await loadConversations();
        }
      } catch (realtimeError) {
        console.error("Unable to refresh realtime messages:", realtimeError);
      }
    }

    loadActiveConversation();

    const channels = conversationIds.map((id) =>
      subscribeToMessages(id, handleRealtimeChange)
    );

    return () => {
      cancelled = true;

      channels.forEach((channel) => {
        if (channel && typeof channel.unsubscribe === "function") {
          channel.unsubscribe();
        }
      });
    };
  }, [activeConversationIds, profile?.id]);

  // Only auto-scrolls to the newest message when the reader was already
  // at (or near) the bottom -- either because they just opened this
  // conversation, or because they haven't scrolled up to read older
  // messages. Scrolling up to read history is never interrupted by a
  // newly arriving message.
  useEffect(() => {
    const isNewConversation = previousConversationIdRef.current !== activeKey;
    previousConversationIdRef.current = activeKey;
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
  }, [messages, activeKey]);

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
      const recipients = selectedContacts;
      // Reuses the existing conversation with these people when there is one.
      const conversation = await createConversation(
        profile,
        recipients,
        subject
      );

      setShowNewConversation(false);
      setSelectedContacts([]);
      setSubject("");
      setContactSearch("");
      const rows = await loadConversations();
      const opened = (rows || []).find((row) => row.id === conversation?.id);
      setActiveKey(
        opened
          ? threadKeyOf(opened)
          : participantKey([profile.id, ...recipients])
      );
    } catch (createError) {
      console.error("Unable to create conversation:", createError);
      setError(createError.message || "Unable to create conversation.");
    }
  }

  async function submitMessage(event) {
    event.preventDefault();

    if (sending) return;

    // Validate first: nothing is uploaded or stored for an invalid message.
    const problem = !activeConversation?.id
      ? "Select a conversation first."
      : validateOutgoingMessage(body, file);
    if (problem) {
      pushToast(problem, "error", "Message not sent");
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

      const rows = await getThreadMessages(activeConversation.conversationIds);
      setMessages(rows || []);
      await loadConversations();
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      // The typed text and attachment stay so the user can retry.
      pushToast(sendError.message || "The message couldn't be sent. Please try again.", "error", "Message not sent");
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

        {String(profile?.role || "").toLowerCase() === "pet_owner" && (
          <Link to="/pet-owner/chatbot" className="aiEntry" aria-label="Chat with the PawCruz Pet Care Assistant">
            <span className="aiEntryAvatar" aria-hidden="true">
              <img src={chatbotIcon} alt="" />
              <i className="aiEntryDot" />
            </span>
            <span className="aiEntryText">
              <b>Pet Care Assistant <em><Sparkles size={11} /> AI</em></b>
              <small>Ask about pet care, symptoms or booking</small>
            </span>
            <span className="aiEntryGo" aria-hidden="true"><ChevronRight size={18} /></span>
          </Link>
        )}

        {loading ? (
          <p className="muted">Loading conversations...</p>
        ) : threads.length === 0 ? (
          <p className="muted">No conversations yet.</p>
        ) : (
          threads.map((conversation) => (
            <button
              type="button"
              className={`conv ${
                activeKey === conversation.key ? "active" : ""
              }`}
              key={conversation.key}
              onClick={() => setActiveKey(conversation.key)}
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
              {messages.map((message, index) => {
                const mine = message.sender_id === profile.id;
                const previous = messages[index - 1];
                const newDay = !previous ||
                  new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return (
                  <React.Fragment key={message.id}>
                  {newDay && (
                    <div className="msgDay" role="separator">
                      <span>{formatDayLabel(message.created_at)}</span>
                    </div>
                  )}
                  <div className={`bubbleRow ${mine ? "mine" : ""}`}>
                    <Avatar
                      src={mine ? profile.avatar_url : message.sender?.avatar_url}
                      alt={mine ? (profile.full_name || profile.username || "You") : (message.sender?.full_name || "PawCruz User")}
                      size={28}
                    />
                    <div className="bubbleStack">
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
                    </div>
                    <time className="bubbleTime" dateTime={message.created_at}>{formatClock(message.created_at)}</time>
                    </div>
                  </div>
                  </React.Fragment>
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
                maxLength={MESSAGE_MAX_LENGTH}
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

      {/* Rendered on <body> so the fixed top bar and sidebar can't cover it. */}
      {showNewConversation && createPortal(
        <div className="modal">
          <div className="new">
            <button
              type="button"
              className="x"
              onClick={() => { setShowNewConversation(false); setContactSearch(""); }}
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
            <label className="contactSearch">
              <Search size={17} />
              <input
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search by name, role or email"
                aria-label="Search recipients"
              />
              {contactSearch && (
                <button type="button" aria-label="Clear search" onClick={() => setContactSearch("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="contacts">
              {/* Ticked recipients stay selected while the list is filtered. */}
              {contacts
                .filter((contact) => {
                  const term = contactSearch.trim().toLowerCase();
                  if (!term) return true;
                  return [contact.full_name, contact.username, contact.email, contact.role]
                    .join(" ")
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .includes(term);
                })
                .map((contact) => (
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
        </div>,
        document.body
      )}

      <style>{`
        .msg{height:calc(100vh - 138px);min-height:570px;background:#fff;border-radius:20px;display:grid;grid-template-columns:minmax(280px,28%) minmax(0,1fr);overflow:hidden;box-shadow:0 10px 30px rgba(47,117,150,.10);border:1px solid #e6f0f4;color:#1d3a4a}.left{min-height:0;border-right:1px solid #e6f0f4;overflow-y:auto;background:#fff;scrollbar-width:thin;scrollbar-color:#cfe6f0 transparent}.lefthead{position:sticky;top:0;z-index:2;box-sizing:border-box;min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;background:#fff;border-bottom:1px solid #e6f0f4}.lefthead h3{margin:0;font-size:21px;font-weight:800;color:#1d3a4a;letter-spacing:-.01em}.lefthead button,.composer button{border:0;background:#4DA8DA;color:white;border-radius:12px;padding:8px;cursor:pointer}.lefthead button{width:44px;height:44px;display:grid;place-items:center;box-shadow:0 6px 16px rgba(77,168,218,.32);transition:background .15s ease,transform .15s ease}.lefthead button:hover{background:#3d97c9;transform:translateY(-1px)}.composer button:disabled{opacity:.6;cursor:not-allowed}.conv{position:relative;width:100%;border:0;border-bottom:1px solid #eef4f7;background:white;padding:16px 22px;text-align:left;display:flex;align-items:center;gap:14px;justify-content:space-between;cursor:pointer;transition:background .15s ease}.conv:hover{background:#f6fbfd}.conv.active{background:#eaf6fc;box-shadow:inset 3px 0 0 #4DA8DA}.conv div{flex:1;display:grid;gap:3px;min-width:0}.conv b{font-size:15px;font-weight:700;color:#1d3a4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.conv .msgAvatar{width:44px!important;height:44px!important}.msgAvatar{flex-shrink:0;box-sizing:border-box;border-radius:30%;object-fit:cover;display:grid;place-items:center}.msgAvatarFallback{background:#e3f2fa;color:#2c7fb8;font-weight:800;letter-spacing:.02em;line-height:1;user-select:none}.conv .msgAvatarFallback,.chathead .msgAvatarFallback{font-size:15px!important}.bubbleRow .msgAvatarFallback{font-size:11px!important}.conversationRole{font-style:normal;color:#2c7fb8;font-size:11.5px;font-weight:700;text-transform:capitalize}.conv small{color:#7b8e97;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.conv span{flex-shrink:0;min-width:22px;height:22px;box-sizing:border-box;display:grid;place-items:center;background:#2c7fb8;color:#fff;border-radius:999px;padding:0 7px;font-size:11.5px;font-weight:700}.chat{display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}.chathead{flex-shrink:0;box-sizing:border-box;min-height:78px;display:flex;align-items:center;gap:13px;padding:16px 24px;background:#fff;border-bottom:1px solid #e3eff4}.chathead .msgAvatar{width:44px!important;height:44px!important}.chathead div{display:grid;gap:2px;min-width:0}.chathead b{font-size:16.5px;font-weight:700;color:#1d3a4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chathead small{color:#7b8e97;font-size:13px}.messages{flex:1;min-height:0;overflow-y:auto;padding:26px 30px;background:#f8fcfe;scrollbar-width:thin;scrollbar-color:#b8dcec transparent}.messages::-webkit-scrollbar{width:8px}.messages::-webkit-scrollbar-track{background:transparent}.messages::-webkit-scrollbar-thumb{background:#b8dcec;border-radius:999px}.messages::-webkit-scrollbar-thumb:hover{background:#8fc4de}.msgDay{display:flex;align-items:center;gap:14px;margin:6px 0 20px;color:#8a9ca5;font-size:12px}.msgDay::before,.msgDay::after{content:"";flex:1;height:1px;background:#e3eff4}.bubbleRow{display:flex;align-items:flex-end;gap:10px;margin-bottom:16px}.bubbleStack{display:flex;flex-direction:column;align-items:flex-start;gap:5px;max-width:58%;min-width:0}.bubbleRow.mine .bubbleStack{align-items:flex-end}.bubbleStack .bubble{max-width:100%}.bubbleRow .msgAvatar{margin-bottom:21px}.bubbleTime{font-size:11px;color:#8a9ca5;padding:0 4px}.bubbleRow.mine{flex-direction:row-reverse}.bubbleRow .msgAvatar{width:32px!important;height:32px!important}.bubble{max-width:58%;background:#fff;padding:12px 16px;border:1px solid #e1edf2;border-radius:6px 18px 18px 18px;box-shadow:0 2px 10px rgba(47,117,150,.06);display:grid;gap:4px;min-width:0}.bubble.mine{background:#d4ecf8;border-color:#c2e2f2;border-radius:18px 6px 18px 18px;box-shadow:0 4px 14px rgba(77,168,218,.18)}.bubble p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.5;color:#1d3a4a}.bubble small,.bubble time{font-size:10.5px;color:#7b8e97}.bubble .senderName{font-weight:600;color:#2c7fb8;font-size:11.5px}.bubble.mine .senderName{text-align:right;color:#1f6f9f}.bubble time{margin-top:2px}.bubble.mine time{text-align:right;color:#5f7f8f}.bubble a{color:#217ba7;font-weight:600;overflow-wrap:anywhere}.composer{flex-shrink:0;display:flex;align-items:center;gap:12px;padding:15px 20px;background:#fff;border-top:1px solid #e3eff4}.composer>input{flex:1;min-width:0;height:46px;box-sizing:border-box;border:1px solid #d6e7ee;border-radius:12px;padding:0 16px;background:#fff;font-size:14.5px;color:#1d3a4a;outline:0;transition:border-color .15s ease,box-shadow .15s ease}.composer>input:focus{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.14)}.composer label{width:42px;height:42px;flex-shrink:0;border-radius:12px;display:grid;place-items:center;cursor:pointer;color:#5f7f8f;transition:background .15s ease,color .15s ease}.composer label:hover{background:#f0f8fc;color:#2c7fb8}.composer label input{display:none}.composer button{width:46px;height:46px;flex-shrink:0;display:grid;place-items:center;border-radius:12px;box-shadow:0 6px 16px rgba(77,168,218,.30);transition:background .15s ease}.composer button:hover:not(:disabled){background:#3d97c9}.empty{margin:auto;text-align:center;color:#7b8e97}.empty h3{color:#1d3a4a;margin:12px 0 6px}.empty svg{color:#9fcbe0}.muted{padding:16px 22px;color:#7b8e97}.modal{position:fixed;inset:0;background:#20313b99;z-index:1300;display:grid;place-items:center;padding:20px}.new{background:#fff;border-radius:20px;padding:24px;width:min(520px,100%);max-height:calc(100dvh - 40px);overflow-y:auto;box-sizing:border-box;position:relative;display:grid;gap:12px}.new h2{margin:0;color:#1d3a4a;font-size:21px}.new p{margin:0;font-weight:600;color:#2c7fb8;font-size:13px}.x{position:absolute;right:15px;top:15px;border:0;background:#eef6f9;border-radius:50%;padding:6px;cursor:pointer}.new>label{display:grid;gap:6px;font-weight:600;color:#2c7fb8;font-size:13px}.new input[type=text],.new>label input{padding:11px 13px;border:1px solid #d6e7ee;border-radius:12px;font-size:14.5px}.new .contactSearch{display:flex;align-items:center;gap:10px;height:46px;box-sizing:border-box;padding:0 14px;border:1px solid #d6e7ee;border-radius:12px;background:#fff;color:#7b8e97;font-weight:400;cursor:text}.contactSearch:focus-within{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.14)}.new .contactSearch input{flex:1;min-width:0;height:100%;padding:0!important;border-radius:0!important;border:0!important;outline:0;background:transparent!important;box-shadow:none!important;font-size:14.5px;color:#1d3a4a}.contactSearch button{width:24px;height:24px;flex-shrink:0;border:0;border-radius:50%;display:grid;place-items:center;background:#eaf6fc;color:#2c7fb8;cursor:pointer}.contacts{max-height:min(300px,40dvh);overflow:auto;border:1px solid #e1edf2;border-radius:14px}.contacts label{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid #eef4f7;cursor:pointer}.contacts label:last-child{border-bottom:0}.contacts span{display:grid;color:#1d3a4a;font-weight:600}.contacts small{color:#7b8e97;font-weight:400}.create{width:100%;margin-top:4px;border:0;background:#4DA8DA;color:white;padding:13px;border-radius:12px;font-weight:700;cursor:pointer}.toast{position:fixed;right:20px;bottom:20px;background:#fff0f0;color:#a33;padding:12px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 26px rgba(25,64,82,.14)}.toast button{border:0;background:none;cursor:pointer}.aiEntry{position:relative;display:flex;align-items:center;gap:12px;margin:0 12px 12px;padding:12px 12px;border-radius:16px;text-decoration:none;color:#fff;background:linear-gradient(120deg,#2c6ba3 0%,#3b8fc4 55%,#4DA8DA 100%);background-size:200% 200%;box-shadow:0 10px 22px rgba(44,107,163,.28);overflow:hidden;isolation:isolate;animation:aiEntryShift 8s ease-in-out infinite;transition:transform .2s ease,box-shadow .2s ease}
.aiEntry::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.28) 48%,transparent 66%);transform:translateX(-120%);animation:aiEntryShine 4.5s ease-in-out infinite}
.aiEntry:hover{transform:translateY(-2px);box-shadow:0 14px 28px rgba(44,107,163,.36)}
.aiEntry:focus-visible{outline:3px solid #173e52;outline-offset:3px}
.aiEntryAvatar{position:relative;flex-shrink:0;width:46px;height:46px;border-radius:14px;background:#fff;display:grid;place-items:center;box-shadow:0 0 0 3px rgba(255,255,255,.28)}
.aiEntryAvatar::after{content:"";position:absolute;inset:-5px;border-radius:17px;border:2px solid rgba(255,255,255,.55);animation:aiEntryRing 2.4s ease-out infinite}
.aiEntryAvatar img{width:36px;height:36px;object-fit:contain;animation:aiEntryBob 3s ease-in-out infinite}
.aiEntryDot{position:absolute;right:-3px;bottom:-3px;width:12px;height:12px;border-radius:50%;background:#35d07f;border:2px solid #fff}
.aiEntryText{flex:1;display:grid;gap:3px;min-width:0}
.aiEntryText b{display:flex;align-items:center;gap:6px;font-size:14px}
.aiEntryText em{display:inline-flex;align-items:center;gap:3px;font-style:normal;font-size:10px;font-weight:800;letter-spacing:.04em;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:2px 7px}
.aiEntryText small{color:rgba(255,255,255,.88);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aiEntryGo{flex-shrink:0;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.18);transition:transform .2s ease}
.aiEntry:hover .aiEntryGo{transform:translateX(3px)}
@keyframes aiEntryShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes aiEntryShine{0%,55%{transform:translateX(-120%)}85%,100%{transform:translateX(120%)}}
@keyframes aiEntryRing{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.18);opacity:0}}
@keyframes aiEntryBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@media(prefers-reduced-motion:reduce){.aiEntry,.aiEntry::before,.aiEntryAvatar::after,.aiEntryAvatar img{animation:none}}
@media(max-width:750px){.msg{grid-template-columns:1fr;height:auto}.left{max-height:300px;border-right:0;border-bottom:1px solid #e6f0f4}.chat{min-height:520px}.bubble{max-width:82%}.lefthead,.chathead{padding:14px 16px;min-height:68px}.conv{padding:14px 16px}.messages{padding:18px 14px}.composer{padding:12px 14px}}
      `}</style>
    </div>
  );
}
