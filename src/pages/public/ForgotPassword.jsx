import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { sendPasswordReset } from '../../services/authService';
import { LoginLayout } from './Login';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

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
      <form onSubmit={submit}>
        <label>
          Email or Username
          <input
            type='text'
            placeholder='Enter your email or username'
            autoComplete='username'
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
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
