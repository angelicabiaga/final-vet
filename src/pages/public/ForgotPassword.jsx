import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { sendPasswordReset } from '../../services/authService';
import { LoginLayout } from './Login';
import { focusFirstInvalidField, invalidClass } from '../../utils/formValidation';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({}).current;
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function updateIdentifier(value) {
    setIdentifier(value);
    setFieldErrors((current) => (
      current.identifier ? { ...current, identifier: value.trim() ? "" : "Email or username is required." } : current
    ));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');

    if (!identifier.trim()) {
      setFieldErrors({ identifier: "Email or username is required." });
      focusFirstInvalidField(fieldRefs, { identifier: true });
      return;
    }
    setFieldErrors({});

    setLoading(true);

    try {
      const result = await sendPasswordReset(identifier);

      navigate('/otp?purpose=forgot_password', {
        state: { email: result.email },
      });
    } catch (error) {
      setMessage(error.message || 'Unable to send reset OTP.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout
      title='Forgot password'
      subtitle='Enter your registered email address or username.'
      showBackToHome
    >
      <form onSubmit={submit} noValidate>
        <label>
          Email or Username<span className="required-mark"> *</span>
          <input
            ref={(el) => { fieldRefs.identifier = el; }}
            className={invalidClass(fieldErrors, "identifier")}
            type='text'
            placeholder='Enter your email or username'
            autoComplete='username'
            required
            value={identifier}
            onChange={(event) => updateIdentifier(event.target.value)}
          />
          {fieldErrors.identifier && <span className="field-error-text">{fieldErrors.identifier}</span>}
        </label>

        {message && (
          <div className='error' role='alert'>
            {message}
          </div>
        )}

        <button type='submit' disabled={loading}>
          {loading ? 'Sending...' : 'Send OTP'}
        </button>

        <div className='links'>
          <Link to='/login'>Back to login</Link>
        </div>
      </form>
    </LoginLayout>
  );
}
