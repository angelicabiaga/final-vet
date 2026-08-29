import { Dropdown } from 'react-native-element-dropdown';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { registerUser } from "../api/authService";
import { Video, ResizeMode } from 'expo-av';

import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';

import CustomModal from "../components/CustomModal";
import DataPrivacyConsent from "./shared/DataPrivacyConsent";
import { CONSENT_REQUIRED_ERROR } from "../constants/privacyNotice";
import { isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, sanitizePhoneInput } from "../utils/validators";
import { scrollAndFocusFirstInvalidField } from "./shared/formValidation";

const { width, height } = Dimensions.get("window");

function isStrongPassword(password) {
  return /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&]).{8,}$/.test(password);
}

function validateRegisterField(name, value, formData) {
  switch (name) {
    case "username":
      if (!value) return "Username is required.";
      if (!/^[a-zA-Z0-9]+$/.test(value)) return "Username must contain letters and numbers only.";
      return "";
    case "email":
      if (!value) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email format.";
      return "";
    case "address":
      if (formData.role !== "pet_owner") return "";
      return value.trim() ? "" : "Address is required.";
    case "phone":
      if (formData.role !== "pet_owner") return "";
      return isValidPhMobile(value) ? "" : INVALID_PH_MOBILE_MESSAGE;
    case "password":
      if (!value) return "Password is required.";
      return isStrongPassword(value) ? "" : "Weak password format.";
    case "confirmPassword":
      if (!value) return "Please confirm your password.";
      return value === formData.password ? "" : "Passwords do not match.";
    default:
      return "";
  }
}

const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    address: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "pet_owner"
  });

  const roleOptions = [
    { label: 'Pet Owner', value: 'pet_owner' },
    { label: 'Veterinarian', value: 'veterinarian' },
    { label: 'Staff', value: 'staff' },
  ];

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceConsent, setServiceConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const scrollViewRef = useRef(null);
  const consentY = useRef(0);
  const fieldPositions = useRef({});
  const fieldRefs = useRef({});

  const [modal, setModal] = useState({
    visible: false,
    message: ""
  });

  const handleChange = (name, value) => {
    const nextForm = { ...formData, [name]: value };
    setFormData(nextForm);

    // Only live-revalidate a field once it's already showing an error, so
    // we don't nag the user before they've finished typing. Editing the
    // password also re-checks Confirm Password if it currently has a
    // mismatch error, since its validity depends on the password value.
    if (fieldErrors[name] || (name === "password" && fieldErrors.confirmPassword)) {
      setFieldErrors((current) => {
        const next = { ...current, [name]: validateRegisterField(name, value, nextForm) };
        if (name === "password" && current.confirmPassword) {
          next.confirmPassword = validateRegisterField("confirmPassword", nextForm.confirmPassword, nextForm);
        }
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const fieldsToCheck = formData.role === "pet_owner"
      ? ["username", "email", "address", "phone", "password", "confirmPassword"]
      : ["username", "email", "password", "confirmPassword"];

    const errors = {};
    fieldsToCheck.forEach((name) => {
      const errorMessage = validateRegisterField(name, formData[name], formData);
      if (errorMessage) errors[name] = errorMessage;
    });

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      scrollAndFocusFirstInvalidField({ scrollViewRef, fieldPositions, fieldRefs, errors });
      return;
    }

    setConsentError("");

    if (formData.role === "pet_owner" && !serviceConsent) {
      setConsentError(CONSENT_REQUIRED_ERROR);
      scrollViewRef.current?.scrollTo({ y: Math.max(consentY.current - 40, 0), animated: true });
      return;
    }

    try {
      setLoading(true);

      const result = await registerUser({ ...formData, serviceConsent, marketingConsent });

      setModal({
        visible: true,
        message: result.message || "Registration successful!"
      });
    } catch (err) {
      setModal({
        visible: true,
        message: err.message || "Registration failed"
      });
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    const success = modal.message.includes("successful");
    setModal({ visible: false, message: "" });

    if (success) {
      navigation.navigate("login");
    }
  };

  return (
    <View style={styles.container}>
      {/* FULL SCREEN VIDEO */}
      <View style={styles.videoContainer}>
        <Video
          source={require('./assets/login.mp4')}
          style={styles.backgroundVideo}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
        />
      </View>

      {/* OVERLAY */}
      <LinearGradient
        colors={[
          'rgba(7, 18, 28, 0.45)',
          'rgba(11, 30, 46, 0.35)',
          'rgba(24, 48, 66, 0.55)'
        ]}
        style={styles.overlay}
      />

      {/* CONTENT */}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.innerContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('./assets/paw1.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandText}>PawCruz</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.topAccent} />

              <Text style={styles.titleLarge}>Create Account</Text>
              <Text style={styles.registerSubText}>
                Join our pet care platform and create your account to get started.
              </Text>

              <Text style={styles.label}>Join As</Text>
              <View style={styles.pickerContainer}>
                <Dropdown
                  activeColor="#eef6fb"
                  placeholderStyle={styles.dropdownPlaceholder}
                  selectedTextStyle={styles.dropdownSelectedText}
                  itemTextStyle={styles.dropdownItemText}
                  style={styles.dropdown}
                  containerStyle={styles.dropdownContainer}
                  data={roleOptions}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Role"
                  value={formData.role}
                  onChange={(item) => handleChange("role", item.value)}
                />
              </View>

              <View onLayout={(e) => { fieldPositions.current.username = e.nativeEvent.layout.y; }}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  ref={(el) => { fieldRefs.current.username = el; }}
                  style={[styles.input, fieldErrors.username && styles.inputInvalid]}
                  placeholder="Enter username"
                  placeholderTextColor="#8d98a5"
                  value={formData.username}
                  onChangeText={(v) => handleChange("username", v)}
                />
                {!!fieldErrors.username && <Text style={styles.fieldErrorText}>{fieldErrors.username}</Text>}
              </View>

              <View onLayout={(e) => { fieldPositions.current.email = e.nativeEvent.layout.y; }}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  ref={(el) => { fieldRefs.current.email = el; }}
                  style={[styles.input, fieldErrors.email && styles.inputInvalid]}
                  placeholder="name@gmail.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#8d98a5"
                  value={formData.email}
                  onChangeText={(v) => handleChange("email", v)}
                />
                {!!fieldErrors.email && <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>}
              </View>

              {formData.role === "pet_owner" && (
                <>
                  <View onLayout={(e) => { fieldPositions.current.address = e.nativeEvent.layout.y; }}>
                    <Text style={styles.label}>Address</Text>
                    <TextInput
                      ref={(el) => { fieldRefs.current.address = el; }}
                      style={[styles.input, fieldErrors.address && styles.inputInvalid]}
                      placeholder="Enter your home address"
                      placeholderTextColor="#8d98a5"
                      value={formData.address}
                      onChangeText={(v) => handleChange("address", v)}
                    />
                    {!!fieldErrors.address && <Text style={styles.fieldErrorText}>{fieldErrors.address}</Text>}
                  </View>

                  <View onLayout={(e) => { fieldPositions.current.phone = e.nativeEvent.layout.y; }}>
                    <Text style={styles.label}>Contact Number</Text>
                    <TextInput
                      ref={(el) => { fieldRefs.current.phone = el; }}
                      style={[styles.input, fieldErrors.phone && styles.inputInvalid]}
                      placeholder="09XXXXXXXXX"
                      keyboardType="number-pad"
                      maxLength={11}
                      placeholderTextColor="#8d98a5"
                      value={formData.phone}
                      onChangeText={(v) => handleChange("phone", sanitizePhoneInput(v))}
                    />
                    {!!fieldErrors.phone && <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text>}
                  </View>
                </>
              )}

              <View onLayout={(e) => { fieldPositions.current.password = e.nativeEvent.layout.y; }}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  ref={(el) => { fieldRefs.current.password = el; }}
                  style={[styles.input, fieldErrors.password && styles.inputInvalid]}
                  placeholder="••••••••"
                  secureTextEntry={!showPass}
                  placeholderTextColor="#8d98a5"
                  value={formData.password}
                  onChangeText={(v) => handleChange("password", v)}
                />
                {!!fieldErrors.password && <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>}
              </View>

              <View onLayout={(e) => { fieldPositions.current.confirmPassword = e.nativeEvent.layout.y; }}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  ref={(el) => { fieldRefs.current.confirmPassword = el; }}
                  style={[styles.input, fieldErrors.confirmPassword && styles.inputInvalid]}
                  placeholder="••••••••"
                  secureTextEntry={!showConfirm}
                  placeholderTextColor="#8d98a5"
                  value={formData.confirmPassword}
                  onChangeText={(v) => handleChange("confirmPassword", v)}
                />
                {!!fieldErrors.confirmPassword && <Text style={styles.fieldErrorText}>{fieldErrors.confirmPassword}</Text>}
              </View>

              {formData.role === "pet_owner" && (
                <View style={styles.consentWrap}>
                  <DataPrivacyConsent
                    serviceConsent={serviceConsent}
                    onServiceConsentChange={(checked) => { setServiceConsent(checked); if (checked) setConsentError(""); }}
                    marketingConsent={marketingConsent}
                    onMarketingConsentChange={setMarketingConsent}
                    error={consentError}
                    onLayout={(event) => { consentY.current = event.nativeEvent.layout.y; }}
                  />
                </View>
              )}

              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.9}
                onPress={handleSubmit}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#1f6d8c', '#173f5c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Processing..." : "Sign Up"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('login')}>
                <Text style={styles.footerText}>
                  Already a member? <Text style={styles.loginLink}>Log In</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <CustomModal show={modal.visible} onClose={closeModal}>
              <Text>{modal.message}</Text>
            </CustomModal>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08131d',
    position: 'relative',
  },

  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    zIndex: 3,
  },

  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 0,
    overflow: 'hidden',
  },

  backgroundVideo: {
    width: width,
    height: height,
    position: 'absolute',
    top: 0,
    left: 0,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 1,
  },

  innerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
    zIndex: 3,
  },

  headerContainer: {
    alignItems: 'center',
    marginBottom: 22,
  },

  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  logo: {
    width: 38,
    height: 38,
  },

  brandText: {
    fontSize: 30,
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  card: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: 'rgba(73, 96, 128, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.22,
        shadowRadius: 22,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 16px 42px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(14px)',
      }
    }),
  },

  topAccent: {
    width: 72,
    height: 5,
    borderRadius: 10,
    backgroundColor: '#9edcff',
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.9,
  },

  titleLarge: {
    fontSize: 29,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },

  registerSubText: {
    fontSize: 14,
    color: '#d8e9f3',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 21,
    paddingHorizontal: 6,
  },

  label: {
    color: '#f4fbff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  pickerContainer: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    marginBottom: 16,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dce8ef',
  },

  dropdown: {
    height: 54,
    paddingHorizontal: 16,
  },

  dropdownContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  dropdownPlaceholder: {
    color: '#8393a1',
    fontSize: 15,
  },

  dropdownSelectedText: {
    color: '#173f5c',
    fontSize: 15,
    fontWeight: '600',
  },

  dropdownItemText: {
    color: '#173f5c',
    fontSize: 15,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    fontSize: 15,
    color: '#243746',
    borderWidth: 1,
    borderColor: '#dce8ef',
  },

  inputInvalid: {
    borderColor: '#d9534f',
    borderWidth: 1.5,
    marginBottom: 6,
  },

  fieldErrorText: {
    color: '#ffb4ab',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
    marginLeft: 4,
  },

  consentWrap: {
    marginBottom: 16,
  },

  button: {
    marginTop: 8,
    marginBottom: 18,
    borderRadius: 16,
    overflow: 'hidden',
  },

  buttonGradient: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  footerText: {
    color: '#eef7fc',
    textAlign: 'center',
    fontSize: 14,
  },

  loginLink: {
    color: '#9edcff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});