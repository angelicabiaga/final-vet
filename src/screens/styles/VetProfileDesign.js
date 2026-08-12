import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fbfc',
  },
  topHeader: {
    backgroundColor: '#63B6C5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#447C99',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  calendarHeader: {
    backgroundColor: '#447C99',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calendarHeaderText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  profileContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    zIndex: 1, // Ensures content is above background
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#447C99',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#24566d',
  },
  userRole: {
    fontSize: 14,
    color: '#555',
    marginBottom: 40,
  },
  logoutButton: {
    backgroundColor: '#d9534f',
    paddingVertical: 15,
    paddingHorizontal: 60,
    borderRadius: 30,
    elevation: 5, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 10, // Forces button to the top layer
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#fff',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: 10,
    zIndex: 5, // Ensures nav stays on top
  },
  navItem: {
    alignItems: 'center',
    padding: 10, // Larger hit area
  },
  navIcon: {
    width: 24,
    height: 24,
    tintColor: '#24566d',
  },
  navLabel: {
    fontSize: 12,
    color: '#24566d',
    marginTop: 4,
  },
  container: { flex: 1, padding: 20 },
  logoutButton: { padding: 15, backgroundColor: "#2c7be5", borderRadius: 10 },
  logoutText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  confirmBtn: { backgroundColor: "#ff4d4d", padding: 10, borderRadius: 10, marginBottom: 10, width: "80%", alignItems: "center" },
  cancelBtn: { backgroundColor: "#ccc", padding: 10, borderRadius: 10, width: "80%", alignItems: "center" },

});