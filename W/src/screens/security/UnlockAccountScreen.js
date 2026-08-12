import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { unlockAccount as unlockAccountRequest } from "../../api/authService";

export default function UnlockAccountScreen({ route, navigation }) {
  const { token } = route.params || {};

  const hasRun = useRef(false);

  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState(
    "Unlocking your account, please wait..."
  );

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const unlockAccount = async () => {
      try {
        await unlockAccountRequest(token);

        setStatus("success");
        setMessage("Account unlocked successfully! You can now log in.");

        setTimeout(() => {
          navigation.replace("login");
        }, 3000);
      } catch (err) {
        setStatus("error");
        setMessage(err.message || "Unlock link is invalid or has already expired.");
      }
    };

    if (token) {
      unlockAccount();
    } else {
      setStatus("error");
      setMessage("Invalid unlock request.");
    }
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {status === "loading" && <ActivityIndicator size="large" />}

        {status !== "loading" && (
          <Text style={styles.icon}>
            {status === "success" ? "🔓" : "⚠️"}
          </Text>
        )}

        <Text style={styles.title}>
          {status === "loading"
            ? "Processing"
            : status === "success"
            ? "Unlocked"
            : "Error"}
        </Text>

        <Text style={styles.message}>{message}</Text>

        {status !== "loading" && (
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("login")}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6f8",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 30,
    alignItems: "center",
    elevation: 4,
  },

  icon: {
    fontSize: 50,
    marginBottom: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
  },

  message: {
    textAlign: "center",
    color: "#666",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#2c7be5",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
