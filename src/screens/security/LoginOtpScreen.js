import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { verifyLoginOtp, resendLoginOtp, resolveVeterinarianLandingRoute } from "../../api/authService";
import otpBg from "../assets/reset.jpg";

const OTP_LENGTH = 6;

const LoginOtpScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { email } = route.params;

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputsRef = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setError("");
    const otpValue = otp.join("");

    if (otpValue.length !== OTP_LENGTH) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const { user } = await verifyLoginOtp(email, otpValue);

      const role = user.role;
      if (role === "admin") navigation.replace("admin-screen");
      else if (role === "veterinarian") {
        const destination = await resolveVeterinarianLandingRoute(user?.id);
        navigation.replace(destination.route, {
          user: { ...user, email: user?.email || email },
          ...(destination.params || {}),
        });
      }
      else if (role === "staff") {
        navigation.replace("staff-screen", {
          user: { ...user, email: user?.email || email },
        });
      }
      else if (role === "pet_owner") {
        navigation.replace("petowner-screen", {
          user: { ...user, email: user?.email || email },
        });
      }
      else navigation.replace("login");
    } catch (err) {
      setError(err.message || "Invalid OTP code.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;

    try {
      await resendLoginOtp(email);
      setMessage("A new code has been sent.");
      setCooldown(60);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    }
  };

  return (
    <ImageBackground
      source={otpBg}
      style={styles.background}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.topAccent} />

              <Text style={styles.title}>OTP Verification</Text>
              <Text style={styles.subtitle}>Enter the 6-digit code sent to:</Text>
              <Text style={styles.email}>{email}</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {message ? <Text style={styles.success}>{message}</Text> : null}

              <View style={styles.otpContainer}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    style={styles.otpInput}
                    value={digit}
                    onChangeText={(val) => handleChange(val, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    autoFocus={i === 0}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.disabledButton]}
                onPress={handleVerify}
                disabled={loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={["#1f6d8c", "#173f5c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Verifying..." : "Verify & Log In"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : ""}
                </Text>

                <TouchableOpacity onPress={resendOtp} disabled={cooldown > 0}>
                  <Text style={styles.helpText}>Didn't get the code?</Text>
                  <Text
                    style={[
                      styles.resendLink,
                      cooldown > 0 && styles.disabledResend,
                    ]}
                  >
                    Resend New Code
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default LoginOtpScreen;

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  bgImage: {
    width: "100%",
    height: "100%",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 30, 0.35)",
  },

  container: {
    flex: 1,
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(73, 96, 128, 0.66)",
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },

  topAccent: {
    width: 62,
    height: 5,
    borderRadius: 10,
    backgroundColor: "#9edcff",
    alignSelf: "center",
    marginBottom: 16,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 14,
    color: "#d8e9f3",
    marginTop: 8,
    textAlign: "center",
  },

  email: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
    marginBottom: 20,
    marginTop: 4,
    textAlign: "center",
  },

  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
  },

  otpInput: {
    width: 46,
    height: 58,
    marginHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#d1dce8",
    borderRadius: 14,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#173f5c",
    backgroundColor: "rgba(255,255,255,0.96)",
  },

  button: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 18,
  },

  disabledButton: {
    opacity: 0.75,
  },

  buttonGradient: {
    width: "100%",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },

  resendContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  resendText: {
    color: "#e4edf5",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
  },

  helpText: {
    fontSize: 14,
    color: "#d8e9f3",
    textAlign: "center",
    marginBottom: 2,
  },

  resendLink: {
    color: "#9edcff",
    fontWeight: "800",
    textDecorationLine: "underline",
    textAlign: "center",
  },

  disabledResend: {
    color: "#b9c7d4",
  },

  error: {
    color: "#991b1b",
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    width: "100%",
    textAlign: "center",
    marginBottom: 12,
  },

  success: {
    color: "#065f46",
    backgroundColor: "#d1fae5",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    width: "100%",
    textAlign: "center",
    marginBottom: 12,
  },
});