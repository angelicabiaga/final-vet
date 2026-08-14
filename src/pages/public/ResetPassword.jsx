import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { updatePassword } from '../../services/authService';
import { LoginLayout } from './Login';
import PasswordInput from '../../components/PasswordInput';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();

    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await updatePassword(password);
      setMessage('Password updated successfully.');
    } catch (error) {
      setMessage(error.message || 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout
      title='Set a new password'
      subtitle='Choose a secure password for your account.'
      showBackToHome
    >
      <form onSubmit={submit}>
        <label>
          New Password
          <PasswordInput
            minLength='6'
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          Confirm Password
          <PasswordInput
            minLength='6'
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>

        {message && (
          <div
            className={
              message === 'Password updated successfully.'
                ? 'success'
                : 'error'
            }
            role='alert'
          >
            {message}
          </div>
        )}

        <button type='submit' disabled={loading}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>

        <div className='links'>
          <Link to='/login'>Go to login</Link>
        </div>
      </form>
    </LoginLayout>
  );
}
