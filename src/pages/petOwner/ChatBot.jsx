import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock3,
  PawPrint,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";

import chatbotImage from "../../assets/reference/chatbot.png";

import {
  askPetAssistant,
} from "../../services/chatbotService";

import {
  getPetOptions,
} from "../../services/petService";

const SUGGESTED_PROMPTS = [
  "My dog has no appetite. What should I check?",
  "What are your clinic hours?",
  "How do I book an appointment?",
  "What warning signs need urgent veterinary care?",
];

const CHAT_STORAGE_VERSION = "v1";

function formatTime(date) {
  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function getChatStorageKey(profileId) {
  if (!profileId) {
    return null;
  }

  return `pawcruz_chat_history_${CHAT_STORAGE_VERSION}_${profileId}`;
}

function createMessage(
  sender,
  text,
  id,
  details = {}
) {
  const createdAt = new Date();

  return {
    id,
    sender,
    text,
    createdAt:
      createdAt.toISOString(),
    time:
      formatTime(createdAt),
    ...details,
  };
}

function createWelcomeMessage(
  firstName
) {
  return createMessage(
    "assistant",
    `Hi, ${firstName}! I'm the PawCruz Pet Care Assistant. I can offer educational guidance and help you decide when to contact a veterinarian. How can I help today?`,
    "welcome-message"
  );
}

function normalizeStoredMessage(
  message
) {
  if (
    !message ||
    !message.id ||
    !message.sender ||
    !message.text
  ) {
    return null;
  }

  let createdAt =
    message.createdAt;

  let createdDate =
    createdAt
      ? new Date(createdAt)
      : new Date();

  if (
    Number.isNaN(
      createdDate.getTime()
    )
  ) {
    createdDate =
      new Date();

    createdAt =
      createdDate.toISOString();
  }

  return {
    ...message,

    createdAt:
      createdAt ||
      createdDate.toISOString(),

    time:
      message.time ||
      formatTime(
        createdDate
      ),
  };
}

function loadStoredMessages(
  profileId,
  firstName
) {
  const fallback = [
    createWelcomeMessage(
      firstName
    ),
  ];

  if (
    typeof window ===
      "undefined" ||
    !profileId
  ) {
    return fallback;
  }

  try {
    const storageKey =
      getChatStorageKey(
        profileId
      );

    const stored =
      window.localStorage.getItem(
        storageKey
      );

    if (!stored) {
      return fallback;
    }

    const parsed =
      JSON.parse(stored);

    if (
      !Array.isArray(parsed) ||
      parsed.length === 0
    ) {
      return fallback;
    }

    const validMessages =
      parsed
        .map(
          normalizeStoredMessage
        )
        .filter(Boolean);

    if (
      validMessages.length ===
      0
    ) {
      return fallback;
    }

    return validMessages;
  } catch (error) {
    console.error(
      "Unable to restore PawCruz chatbot history:",
      error
    );

    return fallback;
  }
}

function getHighestMessageNumber(
  messages
) {
  return (
    messages.reduce(
      (
        highest,
        message
      ) => {
        const match =
          String(
            message?.id || ""
          ).match(
            /(?:user|assistant)-message-(\d+)/
          );

        if (!match) {
          return highest;
        }

        const number =
          Number(
            match[1]
          );

        if (
          !Number.isFinite(
            number
          )
        ) {
          return highest;
        }

        return Math.max(
          highest,
          number
        );
      },
      0
    ) + 1
  );
}

function getLocalReply(
  message
) {
  const normalizedMessage =
    message.toLowerCase();

  const asksAboutClinicHours =
    normalizedMessage.includes(
      "clinic hours"
    ) ||
    normalizedMessage.includes(
      "opening hours"
    ) ||
    normalizedMessage.includes(
      "closing hours"
    ) ||
    /what time.+(open|close)/.test(
      normalizedMessage
    ) ||
    /when (is|are).+(open|closed)/.test(
      normalizedMessage
    ) ||
    /\b(?:are you|is the clinic|is pawcruz) open\b/.test(
      normalizedMessage
    ) ||
    /\bopen on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalizedMessage
    );

  if (asksAboutClinicHours) {
    return {
      reply:
        "Cruz Veterinary Clinic is open Monday through Sunday, from 9:00 AM to 7:00 PM. You can book a visit any day that works for you.",

      urgency:
        "routine",

      suggestedAction:
        "book_appointment",
    };
  }

  if (
    normalizedMessage.includes(
      "book an appointment"
    ) ||
    normalizedMessage.includes(
      "book appointment"
    ) ||
    normalizedMessage.includes(
      "make an appointment"
    ) ||
    normalizedMessage.includes(
      "schedule an appointment"
    ) ||
    normalizedMessage.includes(
      "schedule a visit"
    ) ||
    /\b(?:can i |could i )?(?:get|book|make|schedule) (?:an? )?appointment\b/.test(
      normalizedMessage
    )
  ) {
    return {
      reply:
        "You can schedule a General Consultation from the Book Appointment page. Choose your registered pet, preferred veterinarian, appointment date, and an available time.",

      urgency:
        "routine",

      suggestedAction:
        "book_appointment",
    };
  }

  if (
    normalizedMessage.includes(
      "what should i bring"
    ) ||
    normalizedMessage.includes(
      "what do i bring"
    ) ||
    /bring.+(appointment|visit)/.test(
      normalizedMessage
    ) ||
    /prepare.+(appointment|visit)/.test(
      normalizedMessage
    ) ||
    normalizedMessage.includes(
      "first visit"
    )
  ) {
    return {
      reply:
        "Please bring any previous medical or vaccination records, a list of current medicines, and your pet's usual leash or carrier. It also helps to note any recent changes in behavior or appetite.",

      urgency:
        "routine",

      suggestedAction:
        "none",
    };
  }

  if (
    normalizedMessage.includes(
      "medical record"
    ) ||
    normalizedMessage.includes(
      "health record"
    ) ||
    normalizedMessage.includes(
      "visit history"
    ) ||
    normalizedMessage.includes(
      "vaccination record"
    ) ||
    normalizedMessage.includes(
      "past visit"
    ) ||
    normalizedMessage.includes(
      "previous visit"
    )
  ) {
    return {
      reply:
        "Open Medical Records from your pet-owner menu to review your pet's available visit history, diagnoses, treatments, and vaccination information.",

      urgency:
        "routine",

      suggestedAction:
        "none",
    };
  }

  if (
    normalizedMessage.includes(
      "my queue"
    ) ||
    normalizedMessage.includes(
      "clinic queue"
    ) ||
    normalizedMessage.includes(
      "queue position"
    ) ||
    normalizedMessage.includes(
      "waiting list"
    ) ||
    /\bhow many (?:people|pets|patients) are ahead of me\b/.test(
      normalizedMessage
    ) ||
    /\bwhere am i in (?:the )?queue\b/.test(
      normalizedMessage
    )
  ) {
    return {
      reply:
        "You can check your current position and queue updates from My Queue in the pet-owner menu.",

      urgency:
        "routine",

      suggestedAction:
        "none",
    };
  }

  return null;
}

export default function ChatBot({
  profile,
}) {
  const firstName =
    profile?.full_name
      ?.trim()
      ?.split(/\s+/)[0] ||
    "there";

  const [
    messages,
    setMessages,
  ] = useState(() =>
    loadStoredMessages(
      profile?.id,
      firstName
    )
  );

  const [
    draft,
    setDraft,
  ] = useState("");

  const [
    isTyping,
    setIsTyping,
  ] = useState(false);

  const [
    pets,
    setPets,
  ] = useState([]);

  const [
    selectedPetId,
    setSelectedPetId,
  ] = useState("");

  const [
    petsLoading,
    setPetsLoading,
  ] = useState(true);

  const [
    petLoadError,
    setPetLoadError,
  ] = useState("");

  const [
    requestError,
    setRequestError,
  ] = useState(null);

  const [
    showClearConfirm,
    setShowClearConfirm,
  ] = useState(false);

  const messageListRef =
    useRef(null);

  const inputRef =
    useRef(null);

  const nextMessageIdRef =
    useRef(
      getHighestMessageNumber(
        messages
      )
    );

  const activeRequestRef =
    useRef(0);

  const inFlightRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  const profileIdRef =
    useRef(
      profile?.id || null
    );

  useEffect(() => {
    const currentProfileId =
      profile?.id || null;

    if (
      profileIdRef.current ===
      currentProfileId
    ) {
      return;
    }

    profileIdRef.current =
      currentProfileId;

    const restored =
      loadStoredMessages(
        currentProfileId,
        firstName
      );

    setMessages(
      restored
    );

    nextMessageIdRef.current =
      getHighestMessageNumber(
        restored
      );

    setDraft("");

    setRequestError(
      null
    );

    setSelectedPetId(
      ""
    );
  }, [
    profile?.id,
    firstName,
  ]);

  useEffect(() => {
    if (
      !profile?.id ||
      typeof window ===
        "undefined"
    ) {
      return;
    }

    try {
      const storageKey =
        getChatStorageKey(
          profile.id
        );

      window.localStorage.setItem(
        storageKey,
        JSON.stringify(
          messages
        )
      );
    } catch (error) {
      console.error(
        "Unable to save PawCruz chatbot history:",
        error
      );
    }
  }, [
    messages,
    profile?.id,
  ]);

  useEffect(() => {
    const messageList =
      messageListRef.current;

    if (messageList) {
      messageList.scrollTo({
        top:
          messageList.scrollHeight,

        behavior:
          messages.length >
          1
            ? "smooth"
            : "auto",
      });
    }
  }, [
    messages,
    isTyping,
  ]);

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;

      activeRequestRef.current +=
        1;

      inFlightRef.current =
        false;
    };
  }, []);

  useEffect(() => {
    let isCurrent =
      true;

    async function loadPets() {
      if (!profile?.id) {
        if (isCurrent) {
          setPets([]);

          setPetsLoading(
            false
          );
        }

        return;
      }

      setPetsLoading(true);

      setPetLoadError(
        ""
      );

      try {
        const petOptions =
          await getPetOptions(
            profile.id
          );

        if (!isCurrent) {
          return;
        }

        setPets(
          petOptions
        );

        setSelectedPetId(
          (currentId) =>
            petOptions.some(
              (pet) =>
                pet.id ===
                currentId
            )
              ? currentId
              : ""
        );
      } catch (error) {
        if (!isCurrent) {
          return;
        }

        setPets([]);

        setSelectedPetId(
          ""
        );

        setPetLoadError(
          error.message ||
            "Unable to load your pets."
        );
      } finally {
        if (isCurrent) {
          setPetsLoading(
            false
          );
        }
      }
    }

    loadPets();

    return () => {
      isCurrent = false;
    };
  }, [profile?.id]);

  function getConversationHistory(
    userText
  ) {
    return [
      ...messages
        .filter(
          (message) =>
            message.id !==
            "welcome-message"
        )
        .map(
          (message) => ({
            role:
              message.sender ===
              "user"
                ? "user"
                : "assistant",

            content:
              message.text,
          })
        ),

      {
        role: "user",
        content:
          userText,
      },
    ].slice(-8);
  }

  function appendAssistantMessage(
    response
  ) {
    const assistantMessageId =
      nextMessageIdRef.current;

    nextMessageIdRef.current +=
      1;

    setMessages(
      (
        currentMessages
      ) => [
        ...currentMessages,

        createMessage(
          "assistant",
          response.reply,
          `assistant-message-${assistantMessageId}`,
          {
            urgency:
              response.urgency,

            suggestedAction:
              response.suggestedAction,
          }
        ),
      ]
    );
  }

  async function requestAssistant(
    history,
    petId =
      selectedPetId ||
      null
  ) {
    if (
      inFlightRef.current
    ) {
      return;
    }

    inFlightRef.current =
      true;

    const requestId =
      activeRequestRef.current +
      1;

    activeRequestRef.current =
      requestId;

    setRequestError(
      null
    );

    setIsTyping(true);

    try {
      const response =
        await askPetAssistant(
          {
            messages:
              history,

            petId,
          }
        );

      if (
        !mountedRef.current ||
        activeRequestRef.current !==
          requestId
      ) {
        return;
      }

      appendAssistantMessage(
        response
      );
    } catch (error) {
      if (
        !mountedRef.current ||
        activeRequestRef.current !==
          requestId
      ) {
        return;
      }

      setRequestError({
        code:
          error.code ||
          "PROVIDER_UNAVAILABLE",

        message:
          error.message ||
          "The pet care assistant is temporarily unavailable. Please try again later.",

        history,

        petId,
      });
    } finally {
      if (
        mountedRef.current &&
        activeRequestRef.current ===
          requestId
      ) {
        inFlightRef.current =
          false;

        setIsTyping(
          false
        );

        inputRef.current?.focus();
      }
    }
  }

  function sendMessage(
    value
  ) {
    const trimmedMessage =
      String(
        value || ""
      ).trim();

    if (
      !trimmedMessage ||
      inFlightRef.current
    ) {
      return;
    }

    const messageId =
      nextMessageIdRef.current;

    nextMessageIdRef.current +=
      1;

    const userMessage =
      createMessage(
        "user",
        trimmedMessage,
        `user-message-${messageId}`
      );

    const localReply =
      getLocalReply(
        trimmedMessage
      );

    const history =
      getConversationHistory(
        trimmedMessage
      );

    setDraft("");

    setRequestError(
      null
    );

    if (localReply) {
      const assistantMessageId =
        nextMessageIdRef.current;

      nextMessageIdRef.current +=
        1;

      setMessages(
        (
          currentMessages
        ) => [
          ...currentMessages,

          userMessage,

          createMessage(
            "assistant",
            localReply.reply,
            `assistant-message-${assistantMessageId}`,
            localReply
          ),
        ]
      );

      inputRef.current?.focus();

      return;
    }

    setMessages(
      (
        currentMessages
      ) => [
        ...currentMessages,
        userMessage,
      ]
    );

    requestAssistant(
      history,
      selectedPetId ||
        null
    );
  }

  function handleSubmit(
    event
  ) {
    event.preventDefault();

    sendMessage(
      draft
    );
  }

  function retryLastRequest() {
    if (
      !requestError?.history ||
      inFlightRef.current
    ) {
      return;
    }

    requestAssistant(
      requestError.history,
      requestError.petId
    );
  }

  function clearConversation() {
    if (
      isTyping ||
      inFlightRef.current
    ) {
      return;
    }

    setShowClearConfirm(true);
  }

  function confirmClearConversation() {
    setShowClearConfirm(false);

    if (profile?.id) {
      try {
        const storageKey =
          getChatStorageKey(
            profile.id
          );

        window.localStorage.removeItem(
          storageKey
        );
      } catch (error) {
        console.error(
          "Unable to remove PawCruz chatbot history:",
          error
        );
      }
    }

    const welcomeMessage =
      createWelcomeMessage(
        firstName
      );

    setMessages([
      welcomeMessage,
    ]);

    setDraft("");

    setRequestError(
      null
    );

    nextMessageIdRef.current =
      1;

    activeRequestRef.current +=
      1;

    inFlightRef.current =
      false;

    setIsTyping(
      false
    );

    window.setTimeout(
      () => {
        inputRef.current?.focus();
      },
      0
    );
  }

  return (
    <AppShell
      profile={profile}
      title="Pet Care Assistant"
    >
      <div className="chatbotPage">
        <section
          className="chatbotWorkspace"
          aria-labelledby="chatbot-title"
        >
          <header className="chatbotHeader">
            <div className="assistantIdentity">
              <span
                className="assistantAvatar assistantAvatarLarge"
                aria-hidden="true"
              >
                <img
                  src={
                    chatbotImage
                  }
                  alt=""
                />
              </span>

              <div>
                <h2 id="chatbot-title">
                  PawCruz Pet
                  Care Assistant
                </h2>

                <p className="assistantStatus">
                  <span
                    className="onlineDot"
                    aria-hidden="true"
                  />

                  Online

                  <span
                    aria-hidden="true"
                  >
                    &middot;
                  </span>

                  Responses may
                  take a moment
                </p>
              </div>
            </div>

            <div className="chatbotHeaderActions">
              <button
                type="button"
                className="clearChatButton"
                onClick={
                  clearConversation
                }
                disabled={
                  isTyping
                }
                title="Clear conversation"
              >
                <Trash2
                  size={15}
                  aria-hidden="true"
                />

                <span>
                  Clear
                </span>
              </button>

              <div
                className="demoBadge"
                aria-label="AI pet assistant"
              >
                <Sparkles
                  size={16}
                  aria-hidden="true"
                />

                AI pet assistant
              </div>
            </div>
          </header>

          <div className="chatbotBody">
            <aside
              className="chatbotSidebar"
              aria-label="Chat shortcuts"
            >
              <div className="welcomePanel">
                <span className="welcomeEyebrow">
                  Welcome back
                </span>

                <h3>
                  Hi, {firstName}!
                </h3>

                <p>
                  Ask general
                  questions or
                  select a pet for
                  more relevant,
                  safety-focused
                  guidance.
                </p>
              </div>

              <div className="petContext">
                <label htmlFor="chatbot-pet-desktop">
                  Question about
                </label>

                <div className="petSelectWrap">
                  <PawPrint
                    size={17}
                    aria-hidden="true"
                  />

                  <select
                    id="chatbot-pet-desktop"
                    value={
                      selectedPetId
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedPetId(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      petsLoading ||
                      isTyping
                    }
                  >
                    <option value="">
                      {petsLoading
                        ? "Loading pets..."
                        : "General question"}
                    </option>

                    {pets.map(
                      (pet) => (
                        <option
                          key={
                            pet.id
                          }
                          value={
                            pet.id
                          }
                        >
                          {
                            pet.pet_name
                          }{" "}
                          (
                          {pet.species ||
                            "Pet"}
                          )
                        </option>
                      )
                    )}
                  </select>
                </div>

                <small>
                  {petLoadError ||
                    "Only basic health context is sent; your pet's name and records are excluded."}
                </small>
              </div>

              <div className="shortcutGroup">
                <span className="shortcutLabel">
                  Quick actions
                </span>

                <Link
                  className="shortcutCard"
                  to="/pet-owner/book-appointment"
                >
                  <span
                    className="shortcutIcon calendarIcon"
                    aria-hidden="true"
                  >
                    <CalendarDays
                      size={20}
                    />
                  </span>

                  <span className="shortcutCopy">
                    <strong>
                      Book an
                      appointment
                    </strong>

                    <small>
                      Choose an
                      available
                      schedule
                    </small>
                  </span>

                  <ArrowRight
                    className="shortcutArrow"
                    size={18}
                    aria-hidden="true"
                  />
                </Link>

                <button
                  className="shortcutCard shortcutButton"
                  type="button"
                  onClick={() =>
                    sendMessage(
                      "What are your clinic hours?"
                    )
                  }
                  disabled={
                    isTyping
                  }
                >
                  <span
                    className="shortcutIcon clockIcon"
                    aria-hidden="true"
                  >
                    <Clock3
                      size={20}
                    />
                  </span>

                  <span className="shortcutCopy">
                    <strong>
                      View clinic
                      hours
                    </strong>

                    <small>
                      See today's
                      availability
                    </small>
                  </span>

                  <ArrowRight
                    className="shortcutArrow"
                    size={18}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div className="privacyNote">
                <ShieldCheck
                  size={18}
                  aria-hidden="true"
                />

                <p>
                  <strong>
                    Educational
                    guidance, not
                    a diagnosis
                  </strong>

                  The assistant
                  cannot prescribe
                  or provide
                  medication
                  doses. Contact
                  a veterinarian
                  for medical
                  advice or
                  urgent
                  concerns.
                </p>
              </div>
            </aside>

            <div className="chatPanel">
              <div className="mobilePetContext">
                <label htmlFor="chatbot-pet-mobile">
                  Question about
                </label>

                <div className="petSelectWrap">
                  <PawPrint
                    size={16}
                    aria-hidden="true"
                  />

                  <select
                    id="chatbot-pet-mobile"
                    value={
                      selectedPetId
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedPetId(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      petsLoading ||
                      isTyping
                    }
                  >
                    <option value="">
                      {petsLoading
                        ? "Loading pets..."
                        : "General question"}
                    </option>

                    {pets.map(
                      (pet) => (
                        <option
                          key={
                            pet.id
                          }
                          value={
                            pet.id
                          }
                        >
                          {
                            pet.pet_name
                          }{" "}
                          (
                          {pet.species ||
                            "Pet"}
                          )
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div
                className="messageList"
                ref={
                  messageListRef
                }
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversation with PawCruz Pet Care Assistant"
              >
                <div className="conversationDate">
                  <span>
                    Today
                  </span>
                </div>

                {messages.map(
                  (message) => (
                    <div
                      className={`messageRow ${
                        message.sender ===
                        "user"
                          ? "userMessage"
                          : "assistantMessage"
                      }`}
                      key={
                        message.id
                      }
                    >
                      {message.sender ===
                        "assistant" && (
                        <span
                          className="assistantAvatar messageAvatar"
                          aria-hidden="true"
                        >
                          <img
                            src={
                              chatbotImage
                            }
                            alt=""
                          />
                        </span>
                      )}

                      <div className="messageContent">
                        <div className="messageBubble">
                          {
                            message.text
                          }
                        </div>

                        {message.sender ===
                          "assistant" &&
                          [
                            "emergency",
                            "same_day",
                          ].includes(
                            message.urgency
                          ) && (
                            <div
                              className={`urgencyNotice ${message.urgency}`}
                            >
                              <AlertTriangle
                                size={
                                  15
                                }
                                aria-hidden="true"
                              />

                              {message.urgency ===
                              "emergency"
                                ? "Emergency veterinary care recommended"
                                : "Same-day veterinary contact recommended"}
                            </div>
                          )}

                        {message.sender ===
                          "assistant" &&
                          message.suggestedAction ===
                            "book_appointment" && (
                            <Link
                              className="messageAction"
                              to="/pet-owner/book-appointment"
                            >
                              Book an
                              appointment

                              <ArrowRight
                                size={
                                  15
                                }
                                aria-hidden="true"
                              />
                            </Link>
                          )}

                        {message.sender ===
                          "assistant" &&
                          message.suggestedAction ===
                            "contact_clinic" && (
                            <Link
                              className="messageAction"
                              to="/pet-owner/messages"
                            >
                              Contact the
                              clinic

                              <ArrowRight
                                size={
                                  15
                                }
                                aria-hidden="true"
                              />
                            </Link>
                          )}

                        {message.sender ===
                          "assistant" &&
                          message.suggestedAction ===
                            "emergency_vet" && (
                            <div className="messageAction emergencyAction">
                              Seek the
                              nearest
                              emergency
                              veterinary
                              facility now
                            </div>
                          )}

                        <time
                          dateTime={
                            message.createdAt
                          }
                        >
                          {
                            message.time
                          }
                        </time>
                      </div>
                    </div>
                  )
                )}

                {isTyping && (
                  <div
                    className="messageRow assistantMessage typingRow"
                    role="status"
                  >
                    <span
                      className="assistantAvatar messageAvatar"
                      aria-hidden="true"
                    >
                      <img
                        src={
                          chatbotImage
                        }
                        alt=""
                      />
                    </span>

                    <div
                      className="typingBubble"
                      aria-label="PawCruz assistant is typing"
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}

                {requestError &&
                  !isTyping && (
                    <div
                      className="assistantError"
                      role="alert"
                    >
                      <AlertTriangle
                        size={19}
                        aria-hidden="true"
                      />

                      <div>
                        <strong>
                          AI assistant
                          unavailable
                        </strong>

                        <p>
                          {
                            requestError.message
                          }
                        </p>

                        <small>
                          If your pet
                          may be in
                          danger,
                          contact a
                          veterinarian
                          or the
                          nearest
                          emergency
                          facility
                          now.
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={
                          retryLastRequest
                        }
                      >
                        <RotateCcw
                          size={
                            15
                          }
                          aria-hidden="true"
                        />

                        Retry
                      </button>
                    </div>
                  )}
              </div>

              <div
                className="suggestionArea"
                aria-label="Suggested questions"
              >
                <span className="suggestionLabel">
                  You can ask
                </span>

                <div className="suggestionList">
                  {SUGGESTED_PROMPTS.map(
                    (
                      prompt
                    ) => (
                      <button
                        type="button"
                        key={
                          prompt
                        }
                        onClick={() =>
                          sendMessage(
                            prompt
                          )
                        }
                        disabled={
                          isTyping
                        }
                      >
                        {
                          prompt
                        }
                      </button>
                    )
                  )}
                </div>
              </div>

              <form
                className="messageComposer"
                onSubmit={
                  handleSubmit
                }
              >
                <label
                  className="visuallyHidden"
                  htmlFor="chatbot-message"
                >
                  Type your
                  message
                </label>

                <input
                  id="chatbot-message"
                  ref={
                    inputRef
                  }
                  type="text"
                  value={
                    draft
                  }
                  onChange={(
                    event
                  ) =>
                    setDraft(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="Ask about appointments, hours, or pet care..."
                  autoComplete="off"
                  maxLength={
                    500
                  }
                  disabled={
                    isTyping
                  }
                />

                <button
                  className="sendButton"
                  type="submit"
                  disabled={
                    !draft.trim() ||
                    isTyping
                  }
                  aria-label="Send message"
                >
                  <Send
                    size={19}
                    aria-hidden="true"
                  />
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .chatbotPage {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          color: #244758;
        }

        .chatbotWorkspace {
          height: calc(100dvh - 145px);
          min-height: 590px;
          max-height: 900px;
          background: #fff;
          border: 1px solid #dcebf0;
          border-radius: 24px;
          box-shadow: 0 14px 40px rgba(37,80,101,.11);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chatbotHeader {
          min-height: 88px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          background: linear-gradient(
            115deg,
            #f3fbfc 0%,
            #e5f5f8 55%,
            #f8fcfd 100%
          );
          border-bottom: 1px solid #d9eaee;
        }

        .assistantIdentity {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }

        .assistantIdentity h2 {
          margin: 0 0 5px;
          font-size: 19px;
          line-height: 1.2;
          color: #214b60;
        }

        .assistantAvatar {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          overflow: hidden;
          background: #fff;
          border: 1px solid #cde6eb;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(54,137,157,.13);
        }

        .assistantAvatar img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 4px;
        }

        .assistantAvatarLarge {
          width: 54px;
          height: 54px;
        }

        .assistantStatus {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
          color: #65818d;
          font-size: 12px;
        }

        .onlineDot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #32b879;
          box-shadow: 0 0 0 3px rgba(50,184,121,.14);
        }

        .chatbotHeaderActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          flex: 0 0 auto;
        }

        .clearChatButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border: 1px solid #d3e5e9;
          border-radius: 999px;
          background: rgba(255,255,255,.82);
          color: #647f89;
          font: inherit;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background .2s,
            border-color .2s,
            color .2s,
            transform .2s;
        }

        .clearChatButton:hover:not(:disabled) {
          color: #9a4642;
          background: #fff5f4;
          border-color: #e9c4c1;
          transform: translateY(-1px);
        }

        .clearChatButton:focus-visible {
          outline: 3px solid rgba(67,143,181,.28);
          outline-offset: 2px;
        }

        .clearChatButton:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .demoBadge {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          color: #307a91;
          background: rgba(255,255,255,.82);
          border: 1px solid #cce5ea;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
        }

        .chatbotBody {
          display: grid;
          grid-template-columns: 290px minmax(0,1fr);
          flex: 1;
          min-height: 0;
        }

        .chatbotSidebar {
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-height: 0;
          padding: 24px 20px;
          background: #f7fbfc;
          border-right: 1px solid #e2edf0;
          overflow-y: auto;
        }

        .welcomePanel {
          padding: 19px;
          border-radius: 17px;
          background: linear-gradient(145deg,#347e9c,#55aabb);
          color: #fff;
          box-shadow: 0 9px 24px rgba(50,126,156,.18);
        }

        .welcomeEyebrow {
          display: block;
          margin-bottom: 8px;
          color: rgba(255,255,255,.78);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .09em;
          text-transform: uppercase;
        }

        .welcomePanel h3 {
          margin: 0 0 7px;
          color: #fff;
          font-size: 22px;
        }

        .welcomePanel p {
          margin: 0;
          color: rgba(255,255,255,.9);
          font-size: 13px;
          line-height: 1.55;
        }

        .petContext {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .petContext label,
        .mobilePetContext label {
          color: #5d7c89;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .petSelectWrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .petSelectWrap svg {
          position: absolute;
          left: 12px;
          color: #438ba1;
          pointer-events: none;
        }

        .petSelectWrap select {
          width: 100%;
          height: 43px;
          padding: 0 34px 0 37px;
          border: 1px solid #cfe1e6;
          border-radius: 12px;
          background: #fff;
          color: #315767;
          font: inherit;
          font-size: 12px;
          outline: none;
          cursor: pointer;
        }

        .petSelectWrap select:focus-visible {
          border-color: #69adbd;
          box-shadow: 0 0 0 3px rgba(99,182,197,.15);
        }

        .petSelectWrap select:disabled {
          cursor: not-allowed;
          opacity: .65;
        }

        .petContext small {
          color: #7a929c;
          font-size: 10px;
          line-height: 1.45;
        }

        .mobilePetContext {
          display: none;
        }

        .shortcutGroup {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .shortcutLabel,
        .suggestionLabel {
          color: #77909a;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .shortcutCard {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 12px;
          background: #fff;
          border: 1px solid #dce9ed;
          border-radius: 13px;
          color: #2c5669;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          transition:
            border-color .2s,
            box-shadow .2s,
            transform .2s;
        }

        .shortcutCard:hover {
          color: #2c5669;
          border-color: #8fc8d3;
          box-shadow: 0 6px 16px rgba(54,116,137,.09);
          transform: translateY(-1px);
        }

        .shortcutCard:focus-visible {
          outline: 3px solid rgba(67,143,181,.3);
          outline-offset: 2px;
        }

        .shortcutCard:disabled {
          cursor: not-allowed;
          opacity: .58;
          transform: none;
          box-shadow: none;
        }

        .shortcutButton {
          font: inherit;
        }

        .shortcutIcon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 11px;
        }

        .calendarIcon {
          color: #398aa2;
          background: #e2f3f6;
        }

        .clockIcon {
          color: #ad7b31;
          background: #fff1d7;
        }

        .shortcutCopy {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 2px;
        }

        .shortcutCopy strong {
          font-size: 12.5px;
        }

        .shortcutCopy small {
          color: #78919b;
          font-size: 10.5px;
        }

        .shortcutArrow {
          flex: 0 0 auto;
          color: #81a3af;
        }

        .privacyNote {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-top: auto;
          padding: 12px;
          color: #6c858f;
          background: #edf6f7;
          border-radius: 12px;
          font-size: 10.5px;
          line-height: 1.45;
        }

        .privacyNote svg {
          flex: 0 0 auto;
          color: #3b8a9f;
        }

        .privacyNote p {
          margin: 0;
        }

        .privacyNote strong {
          display: block;
          margin-bottom: 2px;
          color: #3f6879;
          font-size: 11px;
        }

        .chatPanel {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          background: #fff;
        }

        .messageList {
          flex: 1;
          min-height: 0;
          padding: 24px 28px 18px;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #bfd8de transparent;
        }

        .messageList::-webkit-scrollbar {
          width: 6px;
        }

        .messageList::-webkit-scrollbar-thumb {
          background: #bfd8de;
          border-radius: 999px;
        }

        .conversationDate {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 22px;
          color: #94a8b0;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .conversationDate::before,
        .conversationDate::after {
          height: 1px;
          content: "";
          flex: 1;
          background: #e8f0f2;
        }

        .messageRow {
          display: flex;
          align-items: flex-end;
          gap: 9px;
          margin-bottom: 17px;
        }

        .userMessage {
          justify-content: flex-end;
        }

        .messageAvatar {
          width: 34px;
          height: 34px;
          margin-bottom: 19px;
        }

        .messageContent {
          display: flex;
          max-width: min(76%,620px);
          flex-direction: column;
          align-items: flex-start;
          gap: 5px;
        }

        .userMessage .messageContent {
          align-items: flex-end;
        }

        .messageBubble {
          padding: 12px 15px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .assistantMessage .messageBubble {
          color: #315564;
          background: #eff6f8;
          border: 1px solid #dfedef;
          border-bottom-left-radius: 5px;
        }

        .userMessage .messageBubble {
          color: #fff;
          background: linear-gradient(135deg,#438fb5,#367a98);
          border-bottom-right-radius: 5px;
          box-shadow: 0 5px 14px rgba(54,122,152,.16);
        }

        .messageContent time {
          padding: 0 4px;
          color: #91a4ab;
          font-size: 9.5px;
        }

        .userMessage time {
          text-align: right;
        }

        .urgencyNotice {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 9px;
          border-radius: 8px;
          font-size: 10.5px;
          font-weight: 800;
        }

        .urgencyNotice.emergency {
          color: #9e302c;
          background: #fff0ee;
          border: 1px solid #f1c1bc;
        }

        .urgencyNotice.same_day {
          color: #886019;
          background: #fff7df;
          border: 1px solid #efd99d;
        }

        .messageAction {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border: 1px solid #b9dbe2;
          border-radius: 9px;
          background: #f5fbfc;
          color: #2f758b;
          text-decoration: none;
          font-size: 11px;
          font-weight: 800;
        }

        .messageAction:hover {
          background: #e7f5f7;
          color: #245f73;
        }

        .messageAction:focus-visible,
        .assistantError button:focus-visible {
          outline: 3px solid rgba(67,143,181,.28);
          outline-offset: 2px;
        }

        .emergencyAction {
          color: #99342f;
          background: #fff1ef;
          border-color: #edbeb9;
        }

        .typingRow {
          align-items: center;
        }

        .typingBubble {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 58px;
          height: 38px;
          padding: 0 14px;
          background: #eff6f8;
          border: 1px solid #dfedef;
          border-radius: 16px;
          border-bottom-left-radius: 5px;
        }

        .typingBubble span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6f9eaa;
          animation: chatTyping 1.2s infinite ease-in-out;
        }

        .typingBubble span:nth-child(2) {
          animation-delay: .16s;
        }

        .typingBubble span:nth-child(3) {
          animation-delay: .32s;
        }

        @keyframes chatTyping {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: .45;
          }

          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        .assistantError {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: start;
          gap: 10px;
          margin: 4px 0 17px 43px;
          padding: 12px 13px;
          border: 1px solid #efc3bd;
          border-radius: 12px;
          background: #fff5f3;
          color: #7e3d38;
        }

        .assistantError > svg {
          margin-top: 2px;
        }

        .assistantError strong {
          display: block;
          margin-bottom: 3px;
          font-size: 12px;
        }

        .assistantError p {
          margin: 0 0 3px;
          font-size: 11.5px;
          line-height: 1.45;
        }

        .assistantError small {
          display: block;
          color: #96635e;
          font-size: 10px;
          line-height: 1.4;
        }

        .assistantError button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 9px;
          border: 1px solid #db9b94;
          border-radius: 8px;
          background: #fff;
          color: #8d3c36;
          font: inherit;
          font-size: 10.5px;
          font-weight: 800;
          cursor: pointer;
        }

        .suggestionArea {
          padding: 12px 22px 13px;
          border-top: 1px solid #edf2f4;
          background: #fbfdfd;
        }

        .suggestionLabel {
          display: block;
          margin-bottom: 8px;
        }

        .suggestionList {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 2px 5px;
          scrollbar-width: thin;
        }

        .suggestionList button {
          flex: 0 0 auto;
          padding: 8px 11px;
          border: 1px solid #cfe3e8;
          border-radius: 999px;
          background: #fff;
          color: #3b7082;
          font: inherit;
          font-size: 11px;
          cursor: pointer;
          transition:
            background .2s,
            border-color .2s,
            color .2s;
        }

        .suggestionList button:hover {
          background: #eaf6f8;
          border-color: #8fc4cf;
          color: #286276;
        }

        .suggestionList button:focus-visible {
          outline: 3px solid rgba(67,143,181,.28);
          outline-offset: 2px;
        }

        .suggestionList button:disabled {
          cursor: not-allowed;
          opacity: .5;
        }

        .messageComposer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 18px 17px;
          background: #fff;
        }

        .messageComposer input {
          width: 100%;
          height: 46px;
          padding: 0 17px;
          border: 1px solid #cddfe4;
          border-radius: 14px;
          background: #f9fcfc;
          color: #274e5f;
          font: inherit;
          font-size: 13px;
          outline: none;
          transition:
            border-color .2s,
            box-shadow .2s,
            background .2s;
        }

        .messageComposer input::placeholder {
          color: #91a6ae;
        }

        .messageComposer input:focus {
          background: #fff;
          border-color: #69adbd;
          box-shadow: 0 0 0 3px rgba(99,182,197,.15);
        }

        .messageComposer input:disabled {
          cursor: not-allowed;
          opacity: .65;
        }

        .sendButton {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg,#438fb5,#367a98);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 6px 15px rgba(54,122,152,.2);
          transition:
            transform .2s,
            box-shadow .2s,
            opacity .2s;
        }

        .sendButton:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(54,122,152,.27);
        }

        .sendButton:focus-visible {
          outline: 3px solid rgba(67,143,181,.32);
          outline-offset: 2px;
        }

        .sendButton:disabled {
          cursor: not-allowed;
          box-shadow: none;
          opacity: .42;
        }

        .visuallyHidden {
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          padding: 0 !important;
          margin: -1px !important;
          overflow: hidden !important;
          clip: rect(0,0,0,0) !important;
          white-space: nowrap !important;
          border: 0 !important;
        }

        @media(max-width:1180px) {
          .chatbotBody {
            grid-template-columns: 1fr;
          }

          .chatbotSidebar {
            display: none;
          }

          .mobilePetContext {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 22px;
            border-bottom: 1px solid #e5eef1;
            background: #f9fcfc;
          }

          .mobilePetContext .petSelectWrap {
            flex: 1;
            max-width: 330px;
          }

          .messageContent {
            max-width: min(82%,620px);
          }
        }

        @media(max-width:800px) {
          .chatbotWorkspace {
            height: calc(100dvh - 117px);
            min-height: 550px;
            border-radius: 18px;
          }

          .chatbotHeader {
            min-height: 78px;
            padding: 12px 16px;
          }

          .assistantAvatarLarge {
            width: 48px;
            height: 48px;
          }

          .assistantIdentity h2 {
            font-size: 16px;
          }

          .mobilePetContext {
            padding: 9px 15px;
          }

          .messageList {
            padding: 19px 17px 12px;
          }

          .suggestionArea {
            padding: 10px 14px 9px;
          }

          .messageComposer {
            padding: 10px 12px 13px;
          }

          .messageContent {
            max-width: 85%;
          }

          .assistantError {
            margin-left: 39px;
          }
        }

        @media(max-width:520px) {
          .demoBadge {
            display: none;
          }

          .clearChatButton span {
            display: none;
          }

          .clearChatButton {
            width: 38px;
            height: 38px;
            padding: 0;
          }

          .assistantStatus {
            font-size: 10.5px;
          }

          .mobilePetContext label {
            display: none;
          }

          .mobilePetContext .petSelectWrap {
            max-width: none;
          }

          .messageBubble {
            padding: 11px 13px;
            font-size: 12.5px;
          }

          .messageAvatar {
            width: 30px;
            height: 30px;
          }

          .suggestionList button {
            font-size: 10.5px;
          }

          .messageComposer input {
            padding: 0 13px;
            font-size: 12px;
          }

          .sendButton {
            width: 44px;
            height: 44px;
          }

          .conversationDate {
            margin-bottom: 17px;
          }

          .assistantError {
            grid-template-columns: auto 1fr;
            margin-left: 0;
          }

          .assistantError button {
            grid-column: 2;
            justify-self: start;
          }
        }

        @media(prefers-reduced-motion:reduce) {
          .typingBubble span {
            animation: none;
          }

          .shortcutCard,
          .suggestionList button,
          .messageComposer input,
          .sendButton,
          .clearChatButton {
            transition: none;
          }

          .messageList {
            scroll-behavior: auto;
          }
        }
      `}</style>

      <ConfirmDialog
        open={showClearConfirm}
        tone="danger"
        title="Clear Conversation?"
        description="Clear your conversation with the PawCruz Pet Care Assistant? This cannot be undone."
        confirmLabel="Yes, Clear Conversation"
        cancelLabel="Keep Conversation"
        onConfirm={confirmClearConversation}
        onCancel={() => setShowClearConfirm(false)}
      />
    </AppShell>
  );
}