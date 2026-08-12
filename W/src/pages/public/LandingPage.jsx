import React from 'react';
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
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className='landing-page'>
      <header className='landing-header'>
        <Link className='landing-brand' to='/' aria-label='PawCruz home'>
          <span className='landing-logo'>
            <img src={pawLogo} alt='' aria-hidden='true' />
          </span>
          <span>PawCruz</span>
        </Link>

        <nav className='landing-nav' aria-label='Account navigation'>
          <Link className='login-link' to='/login'>Login</Link>
          <Link className='account-link' to='/register'>Create Account</Link>
        </nav>
      </header>

      <main
        className='landing-main'
        style={{ backgroundImage: 'url(' + dogCatBackground + ')' }}
      >
        <div className='landing-content'>
          <section className='welcome-card'>
            <span className='clinic-tag'>Cruz Veterinary Clinic</span>
            <h1>Compassionate care for every paw.</h1>
            <p>
              Keep your pet&apos;s care close at hand. Manage appointments,
              queues, medical records, and clinic updates through PawCruz.
            </p>
            <div className='landing-actions'>
              <Link className='register-link' to='/register'>Register as Pet Owner</Link>
              <Link className='queue-link' to='/queue-display'>View Queue Display</Link>
            </div>
          </section>

          <section className='hours-card' aria-labelledby='clinic-hours-title'>
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
          <span>2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City</span>
        </div>
        <div className='contact-item phone-numbers'>
          <Phone size={20} aria-hidden='true' />
          <a href='tel:0938537649'>0938537649</a>
          <span aria-hidden='true'>|</span>
          <a href='tel:0917165379'>0917165379</a>
        </div>
      </footer>
    </div>
  );
}
