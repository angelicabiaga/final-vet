import { Dimensions, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfeff',
  },
  // Dark Blue Header (PawCruz Brand)
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
  // Teal Sub-header
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

  // --- Date Scroller Styles (The "Normal" Calendar replacement) ---
  dateSelectorContainer: {
    backgroundColor: '#FFF',
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 5,
  },
  monthText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#24566d',
    marginLeft: 20,
    marginBottom: 12,
  },
  dateCard: {
    width: 60,
    height: 75,
    backgroundColor: '#edf6f8',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  selectedDateCard: {
    backgroundColor: '#447C99', // Teal highlight
  },
  dayLabel: {
    fontSize: 12,
    color: '#777',
    marginBottom: 4,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24566d',
  },
  selectedText: {
    color: '#fcfeff', // White text when background is teal
  },

  // --- Appointment List Section ---
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24566d',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 15,
  },
  appointmentCard: {
    backgroundColor: '#fcfeff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#447C99', // Teal accent line on the side
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  timeText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#555',
  },
  petNameText: {
    fontSize: 17,
    color: '#24566d',
    fontWeight: '700',
  },
  ownerText: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
  },
  typeBadge: {
    backgroundColor: '#e8f6f8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 11,
    color: '#447C99',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },

  // --- Bottom Navigation ---
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