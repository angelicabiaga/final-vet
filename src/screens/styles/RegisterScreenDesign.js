import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 38,
    height: 38,
    marginRight: 10,
  },
  brandText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // Glass effect
    borderRadius: 30,
    padding: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 5 },
      web: { boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)' }
    }),
  },
  titleLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  registerSubText: {
    fontSize: 14,
    color: '#e0f2f1',
    marginBottom: 25,
    lineHeight: 20,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 18,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    height: 50,
    color: '#1a3c5a',
  },
  input: {
    backgroundColor: '#fff',
    height: 50,
    borderRadius: 15,
    paddingHorizontal: 18,
    marginBottom: 18,
    fontSize: 15,
    color: '#333',
  },
  button: {
    backgroundColor: '#1a3c5a',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
  },
  loginLink: {
    color: '#1a3c5a', // Dark blue to stand out for clicking
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});