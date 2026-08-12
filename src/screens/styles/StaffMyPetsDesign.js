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
  topIcon: {
    width: 22,
    height: 22,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: 10,
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 8,
  },
  tabButton: {
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  activeTab: {
    backgroundColor: '#5ba1a6',
    borderColor: '#5ba1a6',
  },
  tabText: {
    fontSize: 12,
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollContent: {
    padding: 10,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 10,
    elevation: 2,
  },
  timeColumn: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  timeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  infoColumn: {
    flex: 1,
    paddingLeft: 10,
  },
  cardTypeTag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  tagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  petAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  petName: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  petDetails: {
    fontSize: 11,
    color: '#666',
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