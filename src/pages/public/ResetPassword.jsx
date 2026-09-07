import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { updatePassword } from '../../services/authService';
import { LoginLayout } from './Login';
import PasswordInput from '../../components/PasswordInput';
import PasswordChecklist from '../../components/PasswordChecklist';
import { validatePassword, validatePasswordsMatch } from '../../utils/validators';
import { focusFirstInvalidField, invalidClass } from '../../utils/formValidation';

function validateResetField(name, value, form) {
  switch (name) {
    case 'password':
      if (!value) return 'New password is required.';
      try { validatePassword(value); return ''; } catch (error) { return error.message; }
    case 'confirm':
      if (!value) return 'Please confirm your new password.';
      try { validatePasswordsMatch(form.password, value); return ''; } catch (error) { return error.message; }
    default:
      return '';
  }
}

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({}).current;
  const registerFieldRef = (name) => (el) => { fieldRefs[name] = el; };
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function updatePasswordField(value) {
    setPassword(value);
    setFieldErrors((current) => {
      const next = { ...current };
      if (current.password) next.password = validateResetField('password', value, { password: value });
      if (current.confirm) next.confirm = validateResetField('confirm', confirm, { password: value });
      return next;
    });
  }

  function updateConfirmField(value) {
    setConfirm(value);
    setFieldErrors((current) => (
      current.confirm ? { ...current, confirm: validateResetField('confirm', value, { password }) } : current
    ));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');

    const form = { password, confirm };
    const errors = {};
    ['password', 'confirm'].forEach((name) => {
      const errorMessage = validateResetField(name, form[name], form);
      if (errorMessage) errors[name] = errorMessage;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(fieldRefs, errors);
      return;
    }

    setLoading(true);

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
      <form onSubmit={submit} noValidate>
        <label>
          New Password<span className="required-mark"> *</span>
          <PasswordInput
            ref={registerFieldRef('password')}
            className={invalidClass(fieldErrors, 'password')}
            minLength='8'
            required
            value={password}
            onChange={(event) => updatePasswordField(event.target.value)}
          />
          {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}
          <PasswordChecklist password={password} />
        </label>

        <label>
          Confirm Password<span className="required-mark"> *</span>
          <PasswordInput
            ref={registerFieldRef('confirm')}
            className={invalidClass(fieldErrors, 'confirm')}
            minLength='8'
            required
            value={confirm}
            onChange={(event) => updateConfirmField(event.target.value)}
          />
          {fieldErrors.confirm && <span className="field-error-text">{fieldErrors.confirm}</span>}
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
