import React, { useMemo, useState } from 'react';
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

  const pending = getPendingOtp();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  async function submit(event) {
    event.preventDefault();

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

        navigate(
          resolveLoginDestination(result.profile, location.state?.from),
          { replace: true },
        );
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
        <div className='error' role='alert'>
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
        .otp-code-input {
          text-align: center;
          font-size: 24px !important;
          font-weight: 800;
          letter-spacing: 10px !important;
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

        .otp-trust-device {
          display: flex !important;
          flex-direction: row;
          align-items: center;
          gap: 9px;
          text-transform: none !important;
          font-weight: 700 !important;
          font-size: 13px !important;
          color: #3d5c6c !important;
          cursor: pointer;
        }

        .otp-trust-device input[type='checkbox'] {
          width: 17px;
          height: 17px;
          flex-shrink: 0;
          accent-color: #4da8da;
          cursor: pointer;
        }

        @media (max-width: 520px) {
          .otp-code-input {
            font-size: 20px !important;
            letter-spacing: 7px !important;
          }

          .otp-expiry-note {
            font-size: 10px;
          }
        }
      `}</style>

      <form onSubmit={submit}>
        <label>
          Verification Code
          <input
            className='otp-code-input'
            inputMode='numeric'
            autoComplete='one-time-code'
            maxLength={6}
            placeholder='000000'
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value.replace(/\D/g, '').slice(0, 6),
              )
            }
            required
          />
        </label>

        {purpose === 'login' && (
          <label className='otp-trust-device'>
            <input
              type='checkbox'
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            <span>
              Don't ask again on this device for {TRUSTED_DEVICE_DAYS} days
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
