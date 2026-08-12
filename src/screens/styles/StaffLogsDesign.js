import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e0f4f9',
  },
  topHeader: {
    backgroundColor: '#2c4760',
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
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  titleBar: {
    backgroundColor: '#5ba1a6',
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  bellIcon: {
    width: 22,
    height: 22,
    tintColor: '#2c4760',
  },
  searchSection: {
    padding: 15,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchText: {
    color: '#999',
    fontSize: 14,
  },
  logCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 8,
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  logIndicator: {
    width: 4,
    height: '100%',
    backgroundColor: '#5ba1a6',
    borderRadius: 2,
    marginRight: 12,
  },
  logContent: {
    flex: 1,
  },
  logAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  logUser: {
    fontSize: 12,
    color: '#2c4760',
    marginTop: 2,
  },
  logTime: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  bottomNav: {
    height: 70,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
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
    color: '#333',
    marginTop: 4,
  },
});