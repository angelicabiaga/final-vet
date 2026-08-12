// src/api/authService.js (Expo / React Native)

import * as SecureStore from "expo-secure-store";
import { supabase } from "../config/supabaseClient";

const SESSION_KEY = "pawcruz_session";

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function publicProfile(profile) {
  if (!profile) return null;

  const { password, ...safeProfile } = profile;
  return safeProfile;
}

export async function getStoredSession() {
  try {
    const stored = await SecureStore.getItemAsync(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    return null;
  }
}

async function saveSession(profile) {
  const session = {
    user: {
      id: profile.id,
      email: profile.email,
    },
    profile: publicProfile(profile),
    createdAt: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify(session)
  );

  return session;
}

export async function logoutUser() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/*
async function callOtpFunction(functionName, body) {
  const { data, error } = await supabase.functions.invoke(
    functionName,
    { body }
  );

  if (error) {
    console.log("Edge Function Error:", error);
    console.log("Status:", error.context?.status);

    let message = error.message;

    try {
      const responseBody = await error.context?.json();

      console.log("Response:", responseBody);

      message =
        responseBody?.error ||
        responseBody?.message ||
        error.message;
    } catch {
      console.log("Could not parse Edge Function response");
    }

    throw new Error(message);
  }

  return data;
}
*/

// ---------------------------------------------------------------------------
// Login without OTP
// ---------------------------------------------------------------------------

export async function attemptLogin({ username, password }) {
  const normalized = normalizeIdentifier(username);
  const enteredPassword = String(password || "");

  if (!normalized || !enteredPassword) {
    throw new Error(
      "Enter your username/email and password."
    );
  }

  const loginColumn = normalized.includes("@")
    ? "email"
    : "username";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq(loginColumn, normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("Login lookup error:", error);

    throw new Error(
      "Unable to validate your account."
    );
  }

  if (
    !profile ||
    String(profile.password) !== enteredPassword
  ) {
    throw new Error(
      "Invalid username/email or password."
    );
  }

  if (profile.account_status !== "active") {
    throw new Error(
      "Your account is inactive. Contact the administrator."
    );
  }

  /*
  await callOtpFunction("send-otp", {
    email: normalizeIdentifier(profile.email),
    purpose: "login",
  });

  return {
    requiresOtp: true,
    email: profile.email,
    user: publicProfile(profile),
  };
  */

  const session = await saveSession(profile);

  await supabase
    .from("activity_logs")
    .insert({
      user_id: profile.id,
      role: profile.role,
      action: "User login",
      module: "Authentication",
      description: `${profile.username || profile.email} logged in.`,
    });

  return {
    requiresOtp: false,
    email: profile.email,
    user: session.profile,
    profile: session.profile,
    session,
  };
}

/*
export async function verifyLoginOtp(email, otp) {
  const data = await callOtpFunction("verify-otp", {
    email: normalizeIdentifier(email),
    purpose: "login",
    code: String(otp || "").trim(),
    payload: {},
  });

  const session = await saveSession(data.profile);

  return {
    user: session.profile,
  };
}
*/

/*
export async function resendLoginOtp(email) {
  await callOtpFunction("send-otp", {
    email: normalizeIdentifier(email),
    purpose: "login",
  });
}
*/

// Temporary functions to prevent import errors in existing screens

export async function verifyLoginOtp() {
  throw new Error(
    "OTP verification is temporarily disabled."
  );
}

export async function resendLoginOtp() {
  return {
    success: false,
    message: "OTP sending is temporarily disabled.",
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerUser({
  username,
  email,
  password,
  role,
}) {
  const originalUsername = String(username || "").trim();
  const normalizedUsername =
    normalizeIdentifier(originalUsername);
  const normalizedEmail = normalizeIdentifier(email);
  const enteredPassword = String(password || "");

  if (!originalUsername) {
    throw new Error("Username is required.");
  }

  if (!/^[a-zA-Z0-9]+$/.test(originalUsername)) {
    throw new Error(
      "Username must contain letters and numbers only."
    );
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error("Invalid email format.");
  }

  if (!enteredPassword) {
    throw new Error("Password is required.");
  }

  const { data: existing, error: checkError } =
    await supabase
      .from("profiles")
      .select("id")
      .or(
        `username.eq.${normalizedUsername},email.eq.${normalizedEmail}`
      )
      .limit(1);

  if (checkError) {
    console.log("Account checking error:", checkError);

    throw new Error(
      "Unable to check the account details."
    );
  }

  if (existing?.length) {
    throw new Error(
      "That username or email is already registered."
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      full_name: originalUsername,
      username: normalizedUsername,
      email: normalizedEmail,
      password: enteredPassword,
      role: role || "pet_owner",
      account_status: "active",
    })
    .select("*")
    .single();

  if (error) {
    console.log("Registration error:", error);

    throw new Error(
      error.message ||
        "Registration failed. Check your Supabase policies and required columns."
    );
  }

  await supabase
    .from("activity_logs")
    .insert({
      user_id: profile.id,
      role: profile.role,
      action: "Account creation",
      module: "Authentication",
      description: `${profile.role} account created for ${normalizedUsername}.`,
    });

  return {
    success: true,
    message:
      "Registration successful! You can now log in.",
    user: publicProfile(profile),
  };
}

// ---------------------------------------------------------------------------
// Forgot password without OTP
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email) {
  const normalized = normalizeIdentifier(email);

  if (!normalized) {
    throw new Error("Enter your email address.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    console.log("Password reset lookup error:", error);

    throw new Error(
      "Unable to look up that account."
    );
  }

  /*
  if (data) {
    await callOtpFunction("send-otp", {
      email: normalized,
      purpose: "password_reset",
    });
  }
  */

  if (!data) {
    return {
      success: false,
      message:
        "No account was found using that email address.",
    };
  }

  return {
    success: false,
    message:
      "Password reset is temporarily unavailable because OTP is disabled.",
  };
}

/*
export async function confirmPasswordReset(
  email,
  code,
  newPassword
) {
  await callOtpFunction("verify-otp", {
    email: normalizeIdentifier(email),
    purpose: "password_reset",
    code: String(code || "").trim(),
    payload: {
      newPassword: String(newPassword || ""),
    },
  });

  return {
    success: true,
  };
}
*/

export async function confirmPasswordReset() {
  throw new Error(
    "Password reset verification is temporarily disabled."
  );
}

// ---------------------------------------------------------------------------
// Account unlock
// ---------------------------------------------------------------------------

export async function unlockAccount() {
  throw new Error(
    "Account unlock isn't set up yet on the Supabase backend."
  );
}

export async function sendUnlockEmail() {
  throw new Error(
    "Account unlock isn't set up yet on the Supabase backend."
  );
}