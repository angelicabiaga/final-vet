import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfeff',
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
  // Medical Record Card Styles
  recordCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordDate: {
    fontSize: 13,
    color: '#777',
    fontWeight: '600',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#444',
  },
  petInfoSection: {
    marginBottom: 10,
  },
  petNameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#24566d',
  },
  ownerText: {
    fontSize: 13,
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  detailRow: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#447C99',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    marginTop: 2,
  },
  viewBtn: {
    marginTop: 10,
    backgroundColor: '#edf6f8',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewBtnText: {
    color: '#24566d',
    fontSize: 13,
    fontWeight: 'bold',
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
    fontWeight: '500',
  },
});