import { Dropdown } from 'react-native-element-dropdown';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
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

const { width, height } = Dimensions.get("window");

const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
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

  const [modal, setModal] = useState({
    visible: false,
    message: ""
  });

  const handleChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const isStrongPassword = (password) => {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&]).{8,}$/;
    return regex.test(password);
  };

  const validate = () => {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword)
      return "All fields are required";

    if (!/^[a-zA-Z0-9]+$/.test(formData.username))
      return "Username must contain letters and numbers only";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      return "Invalid email format";

    if (!isStrongPassword(formData.password))
      return "Weak password format";

    if (formData.password !== formData.confirmPassword)
      return "Passwords do not match";

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();

    if (validationError) {
      setModal({ visible: true, message: validationError });
      return;
    }

    try {
      setLoading(true);

      const result = await registerUser(formData);

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

              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                placeholderTextColor="#8d98a5"
                value={formData.username}
                onChangeText={(v) => handleChange("username", v)}
              />

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#8d98a5"
                value={formData.email}
                onChangeText={(v) => handleChange("email", v)}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry={!showPass}
                placeholderTextColor="#8d98a5"
                value={formData.password}
                onChangeText={(v) => handleChange("password", v)}
              />

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry={!showConfirm}
                placeholderTextColor="#8d98a5"
                value={formData.confirmPassword}
                onChangeText={(v) => handleChange("confirmPassword", v)}
              />

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