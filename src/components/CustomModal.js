import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";

export default function CustomModal({ show, onClose, children, extraAction }) {
  if (!show) return null;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, StyleSheet.absoluteFillObject]}
          onPress={onClose}
          accessibilityLabel="Dismiss dialog"
          accessibilityRole="button"
        />
        <View style={styles.modalBox}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>

          <View style={styles.body}>
            <Text style={styles.modalText}>{children}</Text>
            {extraAction && <View style={styles.extraAction}>{extraAction}</View>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#f4f6f8", // light gray-blue background matching PawCruz theme
    borderRadius: 25, // match your login card rounding
    padding: 25,
    position: "relative",
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    // Shadow for Android
    elevation: 12,
    zIndex: 1,
  },
  modalText: {
    color: '#888', // PawCruz brand color
    fontSize: 16,
    textAlign: "center",
  },

  closeBtn: {
    position: "absolute",
    right: 15,
    top: 10,
    zIndex: 10,
    backgroundColor: "#fff",
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  closeText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2c7be5", // PawCruz brand color
    lineHeight: 22,
  },
  body: {
    marginTop: 20,
    alignItems: "center",
  },
  extraAction: {
    marginTop: 20,
    width: "100%",
    alignItems: "center",
  },
});
