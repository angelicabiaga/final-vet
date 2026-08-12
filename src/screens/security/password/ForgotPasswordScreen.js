import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ImageBackground,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import API from "../../../api/api";
import resetBg from "../../assets/reset.jpg";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert("Required", "Please enter your email");
      return;
    }

    setLoading(true);
    setStatus("");
    setMessage("");

    try {
      const res = await API.post("/users/forgot-password", { email });

      setMessage(res.data.message || "Reset link sent to your email.");
      setStatus("success");
    } catch (err) {
      setMessage(err.response?.data?.message || "Email not found.");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={resetBg}
      style={styles.background}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardContainer}
        >
          <View style={styles.card}>
            <View style={styles.topAccent} />

            <Text style={styles.title}>Reset Password</Text>

            <Text style={styles.subtitle}>
              Enter your email and we’ll send a reset link.
            </Text>

            {message !== "" && (
              <Text
                style={[
                  styles.message,
                  status === "success" ? styles.success : styles.error,
                ]}
              >
                {message}
              </Text>
            )}

            <TextInput
              placeholder="example@email.com"
              placeholderTextColor="#8d98a5"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              editable={!loading && status !== "success"}
            />

            {status === "success" ? (
              <TouchableOpacity
                style={styles.fullButton}
                onPress={() => navigation.navigate("login")}
              >
                <LinearGradient
                  colors={["#1f6d8c", "#173f5c"]}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Back to Login</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => navigation.goBack()}
                  disabled={loading}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={["#1f6d8c", "#173f5c"]}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.buttonText}>
                      {loading ? "Sending..." : "Send Link"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

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
    backgroundColor: "rgba(10,20,30,0.30)",
    padding: 20,
  },

  keyboardContainer: {
    flex: 1,
    justifyContent: "center",
  },

  card: {
    backgroundColor: "rgba(73, 96, 128, 0.65)",
    borderRadius: 28,
    padding: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  topAccent: {
    width: 60,
    height: 5,
    borderRadius: 10,
    backgroundColor: "#9edcff",
    alignSelf: "center",
    marginBottom: 15,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    color: "#fff",
    marginBottom: 8,
  },

  subtitle: {
    textAlign: "center",
    color: "#d8e9f3",
    marginBottom: 20,
    fontSize: 14,
  },

  input: {
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dce8ef",
    marginBottom: 15,
    color: "#243746",
  },

  message: {
    textAlign: "center",
    marginBottom: 15,
    padding: 10,
    borderRadius: 10,
    fontWeight: "600",
  },

  success: {
    backgroundColor: "#d1fae5",
    color: "#065f46",
  },

  error: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  cancelBtn: {
    flex: 1,
    padding: 15,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    alignItems: "center",
    marginRight: 5,
  },

  cancelText: {
    color: "#173f5c",
    fontWeight: "600",
  },

  button: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginLeft: 5,
  },

  fullButton: {
    borderRadius: 12,
    overflow: "hidden",
  },

  buttonGradient: {
    padding: 15,
    alignItems: "center",
    borderRadius: 12,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "800",
  },
});