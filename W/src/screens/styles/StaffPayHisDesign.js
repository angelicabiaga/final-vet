import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fbfc',
  },
  topHeader: {
    backgroundColor: '#447C99',
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  headerLogo: {
    width: 35,
    height: 35,
    marginRight: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  titleBar: {
    backgroundColor: '#63B6C5',
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  bellIcon: {
    width: 22,
    height: 22,
    tintColor: '#ffffff',
  },
  searchSection: {
    padding: 15,
  },
  searchBar: {
    backgroundColor: '#fcfeff',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#dceef8',
  },
  searchText: {
    color: '#5f7f8a',
    fontSize: 14,
  },
  paymentCard: {
    backgroundColor: '#fcfeff',
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    color: '#68869c',
  },
  serviceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#24566d',
    flex: 1,
    marginLeft: 10,
  },
  amountText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#24566d',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateBadge: {
    backgroundColor: '#e8f7ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
  },
  dateBadgeText: {
    fontSize: 11,
    color: '#24566d',
  },
  paidBadge: {
    backgroundColor: '#447C99',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 15,
  },
  checkIcon: {
    width: 12,
    height: 12,
    tintColor: '#ffffff',
    marginRight: 5,
  },
  paidText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bottomNav: {
    height: 70,
    backgroundColor: '#fcfeff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#dceef8',
  },
  navItem: {
    alignItems: 'center',
  },
  navIcon: {
    width: 24,
    height: 24,
  },
  navLabel: {
    fontSize: 11,
    color: '#24566d',
    marginTop: 4,
  },
});