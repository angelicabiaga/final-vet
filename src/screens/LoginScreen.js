import React, { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { attemptLogin as loginUser, sendUnlockEmail, resolveVeterinarianLandingRoute } from "../api/authService";
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
} from "react-native";

import CustomModal from "../components/CustomModal";
import eyeShow from "./assets/eye-show.png";
import eyeHide from "./assets/eye-hide.png";

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [alertModal, setAlertModal] = useState({
    show: false,
    message: "",
    extraAction: null,
  });

  const contentTranslateY = useRef(new Animated.Value(100)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentTranslateY, contentOpacity, logoScale]);

  const player = useVideoPlayer(require("./assets/login.mp4"), (playerInstance) => {
    playerInstance.loop = true;
    playerInstance.muted = true;
    playerInstance.play();
  });

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleSendUnlock = async () => {
    try {
      if (!username) {
        setAlertModal({
          show: true,
          message: "Please enter your username first to send the unlock email.",
          extraAction: null,
        });
        return;
      }

      await sendUnlockEmail(username);
    } catch (err) {
      setAlertModal({
        show: true,
        message: err.message || "Could not send email.",
        extraAction: null,
      });
    }
  };

const handleOtpSuccess = async (user) => {
  const role = user?.role;

  if (role === "veterinarian") {
    const destination = await resolveVeterinarianLandingRoute(user?.id);
    navigation.replace(destination.route, {
      user,
      ...(destination.params || {}),
    });
  } else if (role === "pet_owner") {
    navigation.replace("petowner-screen", {
      user,
    });
  } else {
    navigation.replace("login");
  }
};

const handleLogin = async () => {
  try {
    const response = await loginUser({
      username,
      password,
    });

    await handleOtpSuccess(response.user);
  } catch (error) {
    setAlertModal({
      show: true,
      message: error.message || "Something went wrong",
      extraAction: null,
    });
  }
};

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.videoBackground}
        player={player}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      <LinearGradient
        colors={[
          "rgba(4, 10, 20, 0.10)",
          "rgba(4, 10, 20, 0.18)",
          "rgba(4, 10, 20, 0.28)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.overlay}
      >
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={styles.innerContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View
                style={[
                  styles.contentWrapper,
                  {
                    opacity: contentOpacity,
                    transform: [
                      { translateY: contentTranslateY },
                      { scale: logoScale },
                    ],
                  },
                ]}
              >
                <View style={styles.headerContainer}>
                  <View style={styles.logoWrapper}>
                    <Image
                      source={require("./assets/paw1.png")}
                      style={styles.logo}
                    />
                  </View>

                  <Text style={styles.brandText}>PawCruz</Text>
                  <Text style={styles.brandSubText}>
                   
                  </Text>
                </View>

                <View style={styles.card}>
                  <View style={styles.shine} />

                  <View style={styles.titleSection}>
                    <Text style={styles.loginTitle}>Welcome Back</Text>
                    <Text style={styles.subText}>
                      Sign in to continue to your account
                    </Text>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Username</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        value={username}
                        onChangeText={setUsername}
                        placeholder="Enter your username"
                        placeholderTextColor="rgba(255,255,255,0.62)"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        placeholder="Enter your password"
                        placeholderTextColor="rgba(255,255,255,0.62)"
                      />
                      <TouchableOpacity
                        style={styles.eyeIcon}
                        onPress={togglePasswordVisibility}
                        activeOpacity={0.7}
                      >
                        <Image
                          source={showPassword ? eyeHide : eyeShow}
                          style={styles.eyeImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.forgotPasswordButton}
                    onPress={() => navigation.navigate("forgot")}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleLogin}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={["#F8FCFF", "#DCEEFF", "#B7D9FF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Login</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Text style={styles.footerText}>
                    Don’t have an account yet?{" "}
                    <Text
                      style={styles.registerText}
                      onPress={() => navigation.navigate("register")}
                    >
                      Register
                    </Text>
                  </Text>
                </View>
              </Animated.View>

              <CustomModal
                show={alertModal.show}
                onClose={() =>
                  setAlertModal({
                    show: false,
                    message: "",
                    extraAction: null,
                  })
                }
                extraAction={alertModal.extraAction}
              >
                <Text>{alertModal.message}</Text>
              </CustomModal>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },

  videoBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },

  overlay: {
    flex: 1,
  },

  innerContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 32,
  },

  contentWrapper: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },

  headerContainer: {
    alignItems: "center",
    marginBottom: 24,
  },

  logoWrapper: {
    width: 108,
    height: 108,
    borderRadius: 54,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    backgroundColor: "rgba(134, 189, 241, 0.46)",
    borderWidth: 1.2,
    borderColor: "rgba(45, 208, 237, 0.28)",
    shadowColor: "#1d26cb",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 8,
  },

  logo: {
    width: 70,
    height: 70,
  },

  brandText: {
    fontSize: 38,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.20)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  brandSubText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
  },

  card: {
    width: "100%",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    backgroundColor: "rgba(7, 18, 30, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 12,
  },

  shine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  titleSection: {
    alignItems: "center",
    marginBottom: 24,
  },

  loginTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 6,
  },

  subText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    lineHeight: 20,
  },

  inputContainer: {
    width: "100%",
    marginBottom: 16,
  },

  label: {
    color: "#FFFFFF",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "800",
    alignSelf: "flex-start",
  },

  inputWrapper: {
    position: "relative",
    width: "100%",
  },

  input: {
    width: "100%",
    height: 56,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingRight: 48,
    backgroundColor: "rgba(255,255,255,0.10)",
    fontSize: 15,
    color: "#FFFFFF",
  },

  eyeIcon: {
    position: "absolute",
    right: 15,
    top: 17,
    zIndex: 5,
  },

  eyeImage: {
    width: 22,
    height: 22,
    tintColor: "#FFFFFF",
  },

  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginTop: 2,
    marginBottom: 18,
  },

  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E2F1FF",
  },

  button: {
    width: "100%",
    height: 58,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 18,
    shadowColor: "#A9D1FF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 7,
  },

  buttonGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  buttonText: {
    color: "#16324F",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  dividerText: {
    marginHorizontal: 10,
    color: "rgba(255,255,255,0.76)",
    fontSize: 13,
    fontWeight: "600",
  },

  footerText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    lineHeight: 22,
  },

  registerText: {
    color: "#D4EAFF",
    fontWeight: "900",
  },

  modalButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
  },

  modalButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700",
  },
});
