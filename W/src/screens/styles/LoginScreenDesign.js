import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  innerContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  headerContainer: {
    alignItems: 'center', // Centers the logo and text vertically
    marginBottom: 40,
    width: '100%',
  },
  logo: {
    width: 100, // Made the paw much bigger
    height: 100,
    marginBottom: 10, // Space between paw and "PawCruz"
  },
  brandText: {
    fontSize: 42, // Increased for a bolder look
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: '#fff',
    width: '88%',
    maxWidth: 400,
    borderRadius: 35,
    padding: 30,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 10px 25px rgba(0,0,0,0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 10,
      }
    }),
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#5b7a8c',
    marginBottom: 5,
  },
  subText: {
    fontSize: 14,
    color: '#7da0b1',
    marginBottom: 25,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 15,
  },
  label: {
    color: '#5b7a8c',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#e1edf3',
    borderRadius: 12,
    paddingHorizontal: 15,
    backgroundColor: '#fbfdfe',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  forgotText: {
    color: '#8da9b9',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#6a89a1',
    width: '100%',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerText: {
    color: '#888',
    fontSize: 14,
  },
  registerText: {
    color: '#8da9b9',
    fontWeight: 'bold',
  },
});