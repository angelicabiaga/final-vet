import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { LoginLayout } from './Login';
import {
  completeLoginOtp,
  completePasswordResetOtp,
  completeRegistrationOtp,
  getPendingOtp,
  resendAuthOtp,
  resolveLoginDestination,
  TRUSTED_DEVICE_DAYS,
} from '../../services/authService';

const PURPOSE_TITLES = {
  register: 'Verify registration',
  login: 'Verify login',
  forgot_password: 'Verify password reset',
};

const OTP_LENGTH = 6;

function OtpCodeInput({ onChange, disabled, resetKey, blockPaste = false }) {
  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(''));
  const inputsRef = useRef([]);

  useEffect(() => {
    setDigits(Array(OTP_LENGTH).fill(''));
    inputsRef.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    onChange(digits.join(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  function distribute(rawDigits, startIndex) {
    const chars = rawDigits.split('').slice(0, OTP_LENGTH - startIndex);
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => {
        next[startIndex + offset] = char;
      });
      return next;
    });
    const nextIndex = Math.min(startIndex + chars.length, OTP_LENGTH - 1);
    window.setTimeout(() => inputsRef.current[nextIndex]?.focus(), 0);
  }

  function handleChange(index, event) {
    const raw = event.target.value.replace(/\D/g, '');

    if (!raw) {
      setDigits((current) => {
        const next = [...current];
        next[index] = '';
        return next;
      });
      return;
    }

    if (raw.length > 1) {
      distribute(raw, index);
      return;
    }

    setDigits((current) => {
      const next = [...current];
      next[index] = raw;
      return next;
    });

    if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        if (next[index]) {
          next[index] = '';
        } else if (index > 0) {
          next[index - 1] = '';
        }
        return next;
      });
      if (!digits[index] && index > 0) inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    if (blockPaste) return;

    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (pasted) distribute(pasted, 0);
  }

  return (
    <div className='otp-code-boxes' role='group' aria-label='Verification code'>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          className='otp-code-box'
          type='text'
          inputMode='numeric'
          maxLength={1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
        />
      ))}
    </div>
  );
}

export default function OtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();

  const purpose = useMemo(
    () =>
      new URLSearchParams(location.search).get('purpose') ||
      getPendingOtp()?.purpose ||
      'login',
    [location.search],
  );

  // Captured once at mount instead of re-read on every render: completing
  // login clears this same localStorage key (see completeLoginOtp) and
  // then fires a "pawcruz-auth-change" event that App.jsx listens for --
  // that event updates App's own state and re-renders its whole tree,
  // including this still-mounted screen, *before* the subsequent
  // navigate() away from /otp actually happens. Re-reading storage on
  // that stray render would find the OTP already gone and flash this
  // screen's "No active verification request was found" fallback right
  // after a successful, correct verification. Freezing the value at
  // mount means a login that already succeeded can't un-render itself.
  const [pending] = useState(() => getPendingOtp());
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [trustDevice, setTrustDevice] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;

    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the 6-digit OTP sent to your email.');
      return;
    }

    setLoading(true);
    setMessage('');
    setResent(false);

    try {
      if (purpose === 'register') {
        await completeRegistrationOtp(code);
        navigate('/register', {
          replace: true,
          state: { registered: true },
        });
      } else if (purpose === 'forgot_password') {
        completePasswordResetOtp(code);
        navigate('/reset-password', { replace: true });
      } else {
        const result = await completeLoginOtp(code, trustDevice);

        const destination = await resolveLoginDestination(result.profile, location.state?.from);
        navigate(destination.pathname, { replace: true, state: destination.state });
      }
    } catch (error) {
      setMessage(error.message || 'Unable to verify OTP.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setMessage('');
    setResent(false);

    try {
      await resendAuthOtp(purpose);
      setCode('');
      setResetToken((token) => token + 1);
      setResent(true);
    } catch (error) {
      setMessage(error.message || 'Unable to resend OTP.');
    } finally {
      setLoading(false);
    }
  }

  if (!pending || pending.purpose !== purpose) {
    return (
      <LoginLayout
        title='OTP verification'
        subtitle='No active verification request was found.'
        showBackToHome
      >
        {/* otp-blocked-card keeps this out of GlobalToastCenter's
           auto-toast scan (see its EXCLUDED_SELECTOR) -- this message IS
           the whole page's content here, not a transient form error, so
           it must stay visible in place instead of being turned into a
           toast that both disappears after 5s and permanently hides this
           div (aria-hidden + display:none) once converted. */}
        <div className='error otp-blocked-card' role='alert'>
          Please start the request again.
        </div>

        <div className='links'>
          <Link to='/login'>Back to login</Link>
        </div>
      </LoginLayout>
    );
  }

  return (
    <LoginLayout
      title={PURPOSE_TITLES[purpose] || 'OTP verification'}
      subtitle={`Enter the 6-digit code sent to ${pending.email}.`}
      showBackToHome
    >
      <style>{`
        .otp-code-boxes {
          display: flex;
          justify-content: center;
          gap: 10px;
        }

        .otp-code-box {
          width: 50px !important;
          min-height: 58px !important;
          padding: 0 !important;
          text-align: center;
          font-size: 24px !important;
          font-weight: 800;
          letter-spacing: normal !important;
        }

        .otp-resend-button {
          color: #267fa9 !important;
          background: #e7f6fc !important;
          border: 1px solid #c5e8f5 !important;
          box-shadow: none !important;
        }

        .otp-expiry-note {
          color: #6b8796;
          font-weight: 700;
          white-space: nowrap;
        }

        /* .login-screen-card label (Login.jsx) sets display:grid, gap:6px,
           uppercase, bold text, etc. on every <label> in this card, and
           that selector (.login-screen-card label) is more specific than
           a bare .otp-trust-device class -- so without !important here,
           its rules would silently win over the ones below. Every
           property it also sets is repeated here with !important so this
           block can't be overridden by it again.

           This is a real two-column grid -- a fixed-width checkbox column
           next to a flexible text column -- rather than an unconstrained
           flex row, so the checkbox's column always starts exactly at the
           grid's own align-items: flex-start line (the top of the first
           text line) instead of depending on flex-grow/shrink defaults
           that a plain flex row would otherwise leave ambiguous. */
        .otp-trust-device {
          display: grid !important;
          grid-template-columns: 17px 1fr !important;
          column-gap: 10px !important;
          row-gap: 0 !important;
          align-items: flex-start !important;
          width: 100%;
          margin: 0 !important;
          padding: 0 !important;
          text-transform: none !important;
          font-weight: 400 !important;
          letter-spacing: normal !important;
          cursor: pointer;
        }

        .otp-trust-device input[type='checkbox'] {
          width: 17px;
          height: 17px;
          margin: 1px 0 0 !important;
          padding: 0;
          accent-color: #4da8da;
          cursor: pointer;
        }

        .otp-trust-device-copy {
          display: grid !important;
          gap: 3px !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .otp-trust-device-copy strong {
          font-weight: 600 !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
          color: #3d5c6c !important;
        }

        .otp-trust-device-copy small {
          font-weight: 500 !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
          color: #7c94a1 !important;
          letter-spacing: normal !important;
          text-transform: none !important;
        }

        @media (max-width: 520px) {
          .otp-code-boxes {
            gap: 7px;
          }

          .otp-code-box {
            width: 40px !important;
            min-height: 48px !important;
            font-size: 19px !important;
          }

          .otp-expiry-note {
            font-size: 10px;
          }

          .otp-trust-device {
            column-gap: 8px !important;
          }

          .otp-trust-device-copy strong {
            font-size: 12.5px !important;
          }

          .otp-trust-device-copy small {
            font-size: 10.5px !important;
          }
        }
      `}</style>

      <form onSubmit={submit}>
        <label>
          Verification Code
          <OtpCodeInput
            onChange={setCode}
            disabled={loading}
            resetKey={resetToken}
            blockPaste={purpose === 'login'}
          />
        </label>

        {purpose === 'login' && (
          <label className='otp-trust-device'>
            <input
              type='checkbox'
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            <span className='otp-trust-device-copy'>
              <strong>Trust this device for {TRUSTED_DEVICE_DAYS} days</strong>
              <small>Do not ask for OTP again on this device for the next {TRUSTED_DEVICE_DAYS} days.</small>
            </span>
          </label>
        )}

        {message && (
          <div className='error' role='alert'>
            {message}
          </div>
        )}

        {resent && (
          <div className='success' role='status'>
            A new OTP was sent. The previous code is no longer valid.
          </div>
        )}

        <button type='submit' disabled={loading}>
          {loading ? 'Please wait...' : 'Verify OTP'}
        </button>

        <button
          className='otp-resend-button'
          type='button'
          disabled={loading}
          onClick={resend}
        >
          Resend OTP
        </button>

        <div className='links'>
          <Link to='/login'>Back to login</Link>
          <span className='otp-expiry-note'>
            Code expires in 10 minutes
          </span>
        </div>
      </form>
    </LoginLayout>
  );
}
