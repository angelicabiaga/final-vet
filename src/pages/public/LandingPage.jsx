import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Clock3,
  HeartPulse,
  MapPin,
  Phone,
  Stethoscope,
} from 'lucide-react';

import pawLogo from '../../assets/reference/paw.png';
import dogCatBackground from '../../assets/reference/dog_cat.jpg';

export default function LandingPage() {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <>
      <style>{`
        .landing-page,
        .landing-page * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          width: 100%;
          height: 100%;
          min-height: 100%;
          margin: 0;
        }

        body {
          margin: 0;
        }

        html:has(.landing-page),
        body:has(.landing-page),
        #root:has(.landing-page) {
          width: 100%;
          height: 100%;
          max-height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden !important;
        }

        .landing-page {
          --deep-blue: #102f40;
          --accent-blue: #4da8da;

          width: 100%;
          height: auto;
          min-height: 0;

          display: grid;
          grid-template-rows: 92px minmax(0, 1fr) 70px;

          color: #18394c;
          background-color: #dceef4;
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;

          font-family: Arial, Helvetica, sans-serif;
          position: fixed;
          inset: 0;
          max-height: 100vh;
          max-height: 100dvh;
          overflow: hidden;
        }

        /* Header */
        .landing-header {
          width: min(1600px, calc(100% - clamp(30px, 8vw, 310px)));
          min-height: 78px;

          display: flex;
          align-items: center;

          margin: 14px auto 0;
          padding: 0 clamp(20px, 3vw, 36px);

          border: 1px solid rgba(185, 225, 240, 0.45);
          border-radius: 24px;
          background: linear-gradient(
            115deg,
            rgba(20, 61, 78, 0.72),
            rgba(31, 76, 92, 0.68)
          );
          box-shadow:
            0 10px 30px rgba(3, 24, 37, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);

          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);

          position: relative;
          z-index: 2;
        }

        .landing-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;

          position: absolute;
          top: 50%;
          left: 50%;

          color: #ffffff;
          text-decoration: none;
          transform: translate(-50%, -50%);
        }

        .landing-logo {
          width: 54px;
          height: 54px;

          display: grid;
          place-items: center;
          flex: 0 0 auto;

          border: 1px solid rgba(255, 255, 255, 0.75);
          border-radius: 17px;
          background: rgba(248, 253, 255, 0.94);
          box-shadow: 0 8px 20px rgba(5, 34, 48, 0.18);
        }

        .landing-logo img {
          width: 31px;
          height: 37px;
          object-fit: contain;
        }

        .landing-brand-copy {
          display: grid;
          gap: 2px;
          line-height: 1;
        }

        .landing-brand-copy strong {
          font-size: 28px;
          letter-spacing: -0.5px;
        }

        .landing-brand-copy small {
          color: #d8f0fa;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .landing-nav,
        .landing-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .landing-nav {
          margin-left: auto;
        }

        .landing-nav a,
        .landing-actions a {
          min-height: 42px;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          padding: 10px 18px;
          border-radius: 12px;

          font-weight: 800;
          text-decoration: none;

          transition:
            transform 160ms ease,
            box-shadow 160ms ease;
        }

        .landing-nav a:hover,
        .landing-actions a:hover {
          transform: translateY(-2px);
        }

        .login-link {
          color: #f1fbff;
          border: 1px solid rgba(255, 255, 255, 0.65);
          background: rgba(255, 255, 255, 0.08);
        }

        .account-link {
          color: #17455c;
          background: rgba(248, 252, 254, 0.96);
          box-shadow: 0 7px 18px rgba(4, 31, 45, 0.2);
        }

        /* Main section
           No dark overlay is applied to the background image. */
        .landing-main {
          min-height: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: clamp(24px, 4vh, 44px) clamp(24px, 6vw, 110px);
          background: transparent;
          overflow: hidden;
        }

        .landing-content {
          width: min(1320px, 100%);

          display: grid;
          grid-template-columns:
            minmax(0, 1.08fr)
            minmax(340px, 0.78fr);
          align-items: center;

          gap: clamp(24px, 4vw, 64px);
        }

        .welcome-card,
        .hours-card {
          position: relative;
          overflow: hidden;

          border: 1px solid rgba(255, 255, 255, 0.92);
          border-radius: 28px;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.96),
            rgba(235, 247, 252, 0.92)
          );

          box-shadow: 0 24px 60px rgba(4, 31, 45, 0.25);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .welcome-card::before,
        .hours-card::before {
          content: '';
          position: absolute;
          top: 29px;
          left: 50%;

          width: 82px;
          height: 6px;

          border-radius: 999px;
          background: linear-gradient(90deg, #4ba9d6, #23627e);
          transform: translateX(-50%);
        }

        .welcome-card {
          max-width: 720px;
          padding:
            clamp(52px, 5vw, 68px)
            clamp(32px, 4.2vw, 58px)
            clamp(32px, 4vw, 48px);
        }

        .clinic-tag {
          display: inline-flex;
          align-items: center;

          padding: 8px 13px;

          color: #187fac;
          background: #e4f5fb;
          border: 1px solid #c6e8f5;
          border-radius: 999px;

          font-size: 14px;
          font-weight: 800;
        }

        .welcome-card h1 {
          max-width: 650px;
          margin: 18px 0 14px;

          color: #183747;
          font-size: clamp(40px, 4.2vw, 58px);
          line-height: 1.03;
          letter-spacing: -1.8px;
        }

        .welcome-card p {
          max-width: 620px;
          margin: 0;

          color: #627d8d;
          font-size: clamp(16px, 1.35vw, 18px);
          line-height: 1.6;
        }

        .landing-actions {
          margin-top: 25px;
        }

        .landing-actions .queue-link {
          min-width: 205px;

          color: #ffffff;
          background: linear-gradient(115deg, #237da4, #174e69);
          border: 1px solid rgba(29, 95, 125, 0.36);
          box-shadow: 0 10px 24px rgba(18, 74, 101, 0.24);
        }

        /* Clinic hours card */
        .hours-card {
          width: min(100%, 500px);
          justify-self: end;

          padding:
            clamp(52px, 4vw, 62px)
            clamp(28px, 3.5vw, 46px)
            clamp(30px, 3.5vw, 42px);

          text-align: center;
        }

        .hours-icon {
          width: 68px;
          height: 68px;

          display: grid;
          place-items: center;

          margin: 0 auto 15px;

          color: #267fa9;
          background: #e5f5fb;
          border: 1px solid #c5e8f5;
          border-radius: 22px;
        }

        .hours-eyebrow {
          color: #2588b5;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 1.7px;
          text-transform: uppercase;
        }

        .hours-card h2 {
          margin: 8px 0 11px;

          color: #17394b;
          font-size: clamp(28px, 2.8vw, 38px);
        }

        .hours-time {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          color: #547585;
          font-size: 19px;
          font-weight: 800;
        }

        .hours-details {
          display: grid;
          gap: 12px;
          margin-top: 25px;
        }

        .hours-details > div {
          min-height: 56px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          padding: 12px 16px;

          color: #315b70;
          background: rgba(225, 243, 250, 0.88);
          border: 1px solid #cde8f3;
          border-radius: 13px;

          font-weight: 700;
        }

        .hours-details svg {
          flex: 0 0 auto;
          color: #2588b5;
        }

        /* Bottom contact bar */
        .contact-bar {
          width: 100%;
          min-height: 70px;

          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;

          gap: 12px clamp(30px, 5vw, 64px);
          padding: 12px 5%;
          margin: 0;

          color: #f5fbfe;
          background: linear-gradient(
            100deg,
            rgba(8, 31, 43, 0.92),
            rgba(9, 48, 54, 0.9)
          );
          border-top: 1px solid rgba(111, 198, 235, 0.35);
          box-shadow: 0 -8px 26px rgba(3, 24, 35, 0.16);

          font-size: 16px;
          font-weight: 700;

          /* Keeps the bar at the bottom of the page. */
          align-self: end;
        }

        .contact-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .contact-item svg {
          flex: 0 0 auto;
          color: #70c7ee;
        }

        .phone-numbers {
          gap: 8px;
          white-space: nowrap;
        }

        .phone-numbers a {
          color: #ffffff;
          text-decoration: none;
        }

        .phone-numbers a:hover {
          text-decoration: underline;
        }

        @media (max-width: 980px) {
          .landing-header {
            width: calc(100% - 36px);
          }

          .landing-main {
            padding-right: 30px;
            padding-left: 30px;
          }

          .landing-content {
            grid-template-columns:
              minmax(0, 1.02fr)
              minmax(300px, 0.78fr);
            gap: 22px;
          }

          .welcome-card {
            padding-right: 34px;
            padding-left: 34px;
          }
        }

        @media (max-width: 760px) {
          .landing-page {
            grid-template-rows: 76px minmax(0, 1fr) 72px;
            background-position: 58% center;
          }

          .landing-header {
            width: calc(100% - 20px);
            min-height: 66px;

            margin-top: 10px;
            padding: 0 16px;
            border-radius: 18px;
          }

          .landing-brand {
            position: static;
            margin-right: auto;
            transform: none;
          }

          .landing-logo {
            width: 42px;
            height: 42px;
            border-radius: 13px;
          }

          .landing-logo img {
            width: 25px;
            height: 30px;
          }

          .landing-brand-copy strong {
            font-size: 22px;
          }

          .landing-brand-copy small {
            display: none;
          }

          .landing-nav {
            gap: 7px;
          }

          .landing-nav a {
            min-height: 38px;
            padding: 8px 11px;
            font-size: 13px;
          }

          .landing-main {
            padding: 18px 16px;
          }

          .landing-content {
            grid-template-columns: 1fr;
            align-content: center;
            gap: 14px;
          }

          .welcome-card,
          .hours-card {
            width: min(100%, 600px);
            justify-self: center;
            border-radius: 20px;
          }

          .welcome-card::before,
          .hours-card::before {
            top: 17px;
            width: 62px;
            height: 4px;
          }

          .welcome-card {
            padding: 34px 24px 20px;
          }

          .clinic-tag {
            padding: 6px 10px;
            font-size: 12px;
          }

          .welcome-card h1 {
            margin: 10px 0 8px;
            font-size: clamp(28px, 7vw, 38px);
            letter-spacing: -0.8px;
          }

          .welcome-card p {
            font-size: 14px;
            line-height: 1.45;
          }

          .landing-actions {
            margin-top: 14px;
          }

          .landing-actions .queue-link {
            min-width: 180px;
            min-height: 40px;
            padding: 8px 15px;
            font-size: 14px;
          }

          .hours-card {
            padding: 34px 20px 20px;
          }

          .hours-icon {
            width: 47px;
            height: 47px;
            margin-bottom: 8px;
            border-radius: 15px;
          }

          .hours-icon svg {
            width: 28px;
            height: 28px;
          }

          .hours-card h2 {
            margin: 4px 0 5px;
            font-size: 25px;
          }

          .hours-time {
            font-size: 15px;
          }

          .hours-details {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 12px;
          }

          .hours-details > div {
            min-height: 44px;
            padding: 8px;
            font-size: 12px;
          }

          .contact-bar {
            min-height: 72px;
            padding: 10px 16px;
            gap: 7px 18px;
            font-size: 12px;
          }
        }

        @media (max-width: 520px) {
          .account-link {
            display: none;
          }

          .contact-bar {
            flex-direction: column;
            justify-content: center;
          }

          .contact-item {
            text-align: center;
          }
        }

        @media (max-height: 700px) and (min-width: 761px) {
          .landing-page {
            grid-template-rows: 76px minmax(0, 1fr) 62px;
          }

          .landing-header {
            min-height: 68px;
            margin-top: 8px;
          }

          .landing-main {
            padding-top: 16px;
            padding-bottom: 16px;
          }

          .welcome-card,
          .hours-card {
            padding-top: 47px;
            padding-bottom: 25px;
          }

          .welcome-card h1 {
            font-size: 40px;
          }

          .contact-bar {
            min-height: 62px;
          }
        }
      `}</style>

      <div
        className='landing-page'
        style={{ backgroundImage: `url(${dogCatBackground})` }}
      >
        <header className='landing-header'>
          <Link
            className='landing-brand'
            to='/'
            aria-label='PawCruz home'
          >
            <span className='landing-logo'>
              <img src={pawLogo} alt='' aria-hidden='true' />
            </span>

            <span className='landing-brand-copy'>
              <strong>PawCruz</strong>
              <small>Cruz Veterinary Clinic</small>
            </span>
          </Link>

          <nav
            className='landing-nav'
            aria-label='Account navigation'
          >
            <Link className='login-link' to='/login'>
              Login
            </Link>

            <Link className='account-link' to='/register'>
              Create Account
            </Link>
          </nav>
        </header>

        <main className='landing-main'>
          <div className='landing-content'>
            <section className='welcome-card'>
              <span className='clinic-tag'>
                Cruz Veterinary Clinic
              </span>

              <h1>Compassionate care for every paw.</h1>

              <p>
                Keep your pet&apos;s care close at hand. Manage
                appointments, queues, medical records, and clinic updates
                through PawCruz.
              </p>

              <div className='landing-actions'>
                <Link className='queue-link' to='/queue-display'>
                  View Queue Display
                </Link>
              </div>
            </section>

            <section
              className='hours-card'
              aria-labelledby='clinic-hours-title'
            >
              <div className='hours-icon' aria-hidden='true'>
                <HeartPulse size={38} strokeWidth={2.2} />
              </div>

              <span className='hours-eyebrow'>Clinic hours</span>

              <h2 id='clinic-hours-title'>Monday–Sunday</h2>

              <div className='hours-time'>
                <Clock3 size={20} aria-hidden='true' />
                <span>9:00 AM–7:00 PM</span>
              </div>

              <div className='hours-details'>
                <div>
                  <CalendarDays size={21} aria-hidden='true' />
                  <span>10-minute appointment intervals</span>
                </div>

                <div>
                  <Stethoscope size={21} aria-hidden='true' />
                  <span>Two veterinarian queue lanes</span>
                </div>
              </div>
            </section>
          </div>
        </main>

        <footer className='contact-bar'>
          <div className='contact-item'>
            <MapPin size={21} aria-hidden='true' />
            <span>
              2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City
            </span>
          </div>

          <div className='contact-item phone-numbers'>
            <Phone size={20} aria-hidden='true' />
            <a href='tel:0938537649'>0938537649</a>
            <span aria-hidden='true'>|</span>
            <a href='tel:0917165379'>0917165379</a>
          </div>
        </footer>
      </div>
    </>
  );
}
