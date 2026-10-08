import React, { useState } from "react";
import {
  Sparkles,
  LayoutDashboard,
  PawPrint,
  CalendarPlus,
  CalendarDays,
  Clock3,
  MessageCircle,
  Bot,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  X,
} from "lucide-react";
import chatbotIcon from "../assets/reference/chatbot.png";

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to PawCruz!",
    body: "Here's a quick tour of what you can do as a pet owner -- registering your pets, booking appointments, and staying in touch with the clinic. It only takes a minute.",
  },
  {
    icon: LayoutDashboard,
    title: "Your Dashboard",
    body: "This is home base. See your upcoming appointments, registered pets, and recent activity as soon as you sign in.",
  },
  {
    icon: PawPrint,
    title: "Animal Patients",
    body: "Register your pets here -- species, breed, birthday, allergies, and conditions -- so the clinic always has accurate records on file before your visit.",
  },
  {
    icon: CalendarPlus,
    title: "Book Appointment",
    body: "Pick a date, time, and veterinarian, then book online in a few taps -- no need to call the clinic.",
  },
  {
    icon: CalendarDays,
    title: "Appointments",
    body: "Track every booking you've made here -- upcoming, completed, or cancelled -- and reschedule or cancel right from the list.",
  },
  {
    icon: Clock3,
    title: "Queue",
    body: "Once you check in at the clinic, your live queue number and status show up here so you always know where you stand.",
  },
  {
    icon: MessageCircle,
    title: "Messages",
    body: "Message the clinic directly if you have a question about your pet or an upcoming visit.",
  },
  {
    icon: Bot,
    // The same picture as the chat bubble it describes.
    image: chatbotIcon,
    title: "PawCruz Assistant",
    body: "The chat bubble in the bottom-right corner is a quick AI assistant -- tap it any time for help finding your way around.",
  },
  {
    icon: CheckCircle2,
    title: "You're all set!",
    body: "That covers the basics. A good place to start is registering your first pet or booking your next appointment.",
  },
];

const STORAGE_PREFIX = "pawcruz_pet_owner_tutorial_seen_";

// Fails closed (treats storage errors as "already seen") so a private
// window or storage-blocking browser setting never traps a user behind a
// tutorial they can't dismiss -- worst case they just don't see it.
export function hasSeenPetOwnerTutorial(profileId) {
  if (!profileId) return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + profileId) === "1";
  } catch {
    return true;
  }
}

function markPetOwnerTutorialSeen(profileId) {
  if (!profileId) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + profileId, "1");
  } catch {
    // Storage unavailable -- nothing to persist, tutorial just reappears
    // next visit, which is harmless.
  }
}

export default function PetOwnerTutorial({ profileId, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const StepIcon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  function finish() {
    markPetOwnerTutorialSeen(profileId);
    onClose();
  }

  return (
    <div
      className="tutorialOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) finish();
      }}
    >
      <section
        className="tutorialDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pet-owner-tutorial-title"
      >
        <button
          type="button"
          className="tutorialClose"
          onClick={finish}
          aria-label="Close tutorial"
        >
          <X size={18} />
        </button>

        <span className={`tutorialIcon${step.image ? " tutorialIconImage" : ""}`} aria-hidden="true">
          {step.image ? <img src={step.image} alt="" /> : <StepIcon size={30} strokeWidth={2.1} />}
        </span>

        <p className="tutorialEyebrow">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <h2 id="pet-owner-tutorial-title">{step.title}</h2>
        <p className="tutorialBody">{step.body}</p>

        <div className="tutorialDots" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={index === stepIndex ? "tutorialDot active" : "tutorialDot"}
            />
          ))}
        </div>

        <div className={isFirst ? "tutorialActions single" : "tutorialActions"}>
          {!isFirst && (
            <button
              type="button"
              className="tutorialBack"
              onClick={() => setStepIndex((current) => current - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button
            type="button"
            className="tutorialNext"
            onClick={() => (isLast ? finish() : setStepIndex((current) => current + 1))}
          >
            {isLast ? "Get Started" : "Next"} {!isLast && <ArrowRight size={16} />}
          </button>
        </div>

        {!isLast && (
          <button type="button" className="tutorialSkip" onClick={finish}>
            Skip tutorial
          </button>
        )}
      </section>

      <style>{`
        .tutorialOverlay {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(11, 35, 49, 0.58);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        .tutorialDialog {
          position: relative;
          width: min(440px, 100%);
          padding: 34px 30px 28px;
          color: #18394c;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(235, 247, 252, 0.97));
          border: 1px solid rgba(255, 255, 255, 0.92);
          border-radius: 24px;
          box-shadow: 0 24px 70px rgba(4, 31, 45, 0.34);
          text-align: center;
        }

        .tutorialClose {
          position: absolute;
          top: 16px;
          right: 16px;
          border: 0;
          background: #eef7fa;
          color: #45606c;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .tutorialClose:hover {
          background: #dcecf3;
        }

        .tutorialIcon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          margin: 0 auto 16px;
          color: #237da4;
          background: #e1f3fa;
          border: 1px solid #bfe3f1;
          border-radius: 19px;
        }

        /* Real PawCruz assistant picture (round, like the chat bubble). */
        .tutorialIconImage {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          border: 6px solid transparent;
          background: #fff padding-box, linear-gradient(135deg, #4da8da, #2c6ba3) border-box;
          box-shadow: 0 0 0 6px rgba(77, 168, 218, 0.16), 0 10px 22px rgba(44, 107, 163, 0.25);
        }

        .tutorialIconImage img {
          width: 50px;
          height: 50px;
          object-fit: contain;
        }

        .tutorialEyebrow {
          margin: 0 0 6px;
          color: #7594a0;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .tutorialDialog h2 {
          margin: 0;
          color: #17394b;
          font-size: 22px;
          line-height: 1.25;
        }

        .tutorialBody {
          margin: 10px auto 4px;
          color: #556f7c;
          font-size: 14px;
          line-height: 1.6;
          max-width: 360px;
        }

        .tutorialDots {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin: 20px 0 22px;
        }

        .tutorialDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #cde3ec;
          transition: background 0.18s ease, transform 0.18s ease;
        }

        .tutorialDot.active {
          background: #237da4;
          transform: scale(1.25);
        }

        .tutorialActions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .tutorialActions.single {
          grid-template-columns: 1fr;
        }

        .tutorialActions button {
          min-width: 0;
          min-height: 45px;
          padding: 10px 15px;
          border-radius: 11px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
        }

        .tutorialBack {
          color: #315a6e;
          background: #ffffff;
          border: 1px solid #bcd7e2;
        }

        .tutorialBack:hover {
          background: #eef8fc;
        }

        .tutorialNext {
          color: #ffffff;
          background: linear-gradient(115deg, #4da8da, #237da4);
          border: 1px solid #2f8fb8;
          box-shadow: 0 8px 18px rgba(35, 125, 164, 0.28);
        }

        .tutorialNext:hover {
          background: linear-gradient(115deg, #3f9bcb, #1f6d90);
        }

        .tutorialSkip {
          display: block;
          margin: 16px auto 0;
          border: 0;
          background: none;
          color: #7594a0;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .tutorialSkip:hover {
          color: #45606c;
        }

        @media (max-width: 480px) {
          .tutorialDialog {
            padding: 28px 20px 22px;
            border-radius: 20px;
          }

          .tutorialDialog h2 {
            font-size: 19px;
          }
        }
      `}</style>
    </div>
  );
}
