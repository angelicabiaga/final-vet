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
  filterContainer: {
    flexDirection: 'row',
    padding: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabGroup: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 4,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  activeTab: {
    backgroundColor: '#5ba1a6',
    borderColor: '#5ba1a6',
  },
  tabText: {
    fontSize: 12,
    color: '#333',
  },
  activeTabText: {
    color: '#fff',
  },
  addItemBtn: {
    backgroundColor: '#72a0a6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  addItemText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  searchSection: {
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 14,
  },
  inventoryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  iconBox: {
    width: 45,
    height: 45,
    backgroundColor: '#5b83a6',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemIcon: {
    width: 24,
    height: 24,
    tintColor: '#fff',
  },
  infoSection: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  itemSub: {
    fontSize: 11,
    color: '#777',
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  editBtn: {
    flexDirection: 'row',
    backgroundColor: '#5b83a6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    alignItems: 'center',
  },
  editText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
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