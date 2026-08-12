import { Dimensions, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfeff',
  },
  // Dark Blue Brand Header
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
  // Teal Patients Sub-header
  calendarHeader: {
    backgroundColor: '#447C99',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  calendarHeaderText: {
    color: '#fcfeff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Search Bar Section
  searchSection: {
    padding: 15,
    backgroundColor: '#fcfeff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#edf6f8',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    color: '#24566d',
    fontSize: 14,
  },
  // Patient Card Styling
  patientCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Shadow/Elevation
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  patientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  patientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24566d',
  },
  patientBreed: {
    fontSize: 14,
    color: '#666',
  },
  ownerName: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  // Right side of card
  statusSection: {
    alignItems: 'flex-end',
  },
  lastVisitText: {
    fontSize: 11,
    color: '#777',
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    textTransform: 'uppercase',
  },
  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#fcfeff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  navItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navIcon: {
    width: 24,
    height: 24,
  },
  navLabel: {
    fontSize: 11,
    marginTop: 4,
    color: '#666',
  },
});