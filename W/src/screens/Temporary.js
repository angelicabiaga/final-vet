import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export default function Temporary({ navigation }) {
  const roles = [
    { name: 'Pet Owner', route: 'petOwnerDashboard', color: ['#FF6B6B', '#FF8E72'] },
    { name: 'Veterinarian', route: 'vetDashboard', color: ['#A8DADC', '#457B9D'] },
  ];

  const handleNavigation = (route) => {
    navigation.navigate(route);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Temporary Navigation</Text>
          <Text style={styles.subtitle}>Select a role to test</Text>
        </View>

        <View style={styles.buttonContainer}>
          {roles.map((role, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleNavigation(role.route)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={role.color}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>{role.name}</Text>
                <Text style={styles.buttonSubtext}>{role.route}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Testing Navigation Screen</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 40,
  },
  button: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});
