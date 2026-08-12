import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef9fb' },
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
  headerLogo: { width: 48, height: 48, marginRight: 16 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  
  profileHero: { 
    backgroundColor: '#5ba1a6', 
    alignItems: 'center', 
    paddingVertical: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 5
  },
  avatar: { width: 60, height: 60, tintColor: '#2c4760' },
  adminName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  adminEmail: { color: '#eef9fb', fontSize: 14, opacity: 0.9 },

  menuSection: { padding: 20 },
  sectionLabel: { color: '#2c4760', fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 10, textTransform: 'uppercase' },
  menuRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 8,
    alignItems: 'center'
  },
  menuText: { color: '#333', fontSize: 16 },
  arrow: { color: '#ccc', fontSize: 18 },

  logoutBtn: { marginTop: 10, borderLeftWidth: 5, borderLeftColor: '#d9534f' },
  logoutText: { color: '#d9534f', fontWeight: 'bold', fontSize: 16 },

  bottomNav: { 
    flexDirection: 'row', 
    height: 70, 
    backgroundColor: '#fff', 
    justifyContent: 'space-around', 
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#ddd'
  },
  navItem: { alignItems: 'center' },
  navIcon: { width: 24, height: 24 },
  navLabel: { fontSize: 12, marginTop: 4 },
  container: { flex: 1, padding: 20 },
  logoutButton: { padding: 15, backgroundColor: "#2c7be5", borderRadius: 10 },
  logoutText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  confirmBtn: { backgroundColor: "#ff4d4d", padding: 10, borderRadius: 10, marginBottom: 10, width: "80%", alignItems: "center" },
  cancelBtn: { backgroundColor: "#ccc", padding: 10, borderRadius: 10, width: "80%", alignItems: "center" },

  
});