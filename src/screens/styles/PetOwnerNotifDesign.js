import { Platform, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#f7fbfc',
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  headerBar: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },


  headerTopBand: {
    marginHorizontal: -22,
    marginTop: -18,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230, 246, 250, 0.24)',
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },

  logoWrap: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  headerLogo: {
    width: 48,
    height: 48,
  },

  backButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
  },

  backIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  brandBlock: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },

  headerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#c3ddee',
    fontWeight: '700',
    marginTop: 2,
  },

  notifButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },

  notifBadge: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#f47c6b',
    borderWidth: 2,
    borderColor: '#447C99',
  },

  notifIcon: {
    width: 21,
    height: 21,
    tintColor: '#ffffff',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    overflow: 'hidden',
  },

  profileIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  profileButtonImage: {
    width: '100%',
    height: '100%',
  },

  headerBadge: {
    minHeight: 42,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },

  headerBottomRow: {
    marginTop: 14,
    paddingTop: 0,
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerBottomRowWrap: {
    overflow: 'hidden',
  },

  ownerSummary: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },

  headerCaption: {
    fontSize: 12,
    color: '#b8d4e5',
    fontWeight: '700',
    textAlign: 'right',
  },

  ownerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
    textAlign: 'right',
  },

  menuTriggerButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  menuTriggerIcon: {
    width: 30,
    height: 30,
    tintColor: '#ffffff',
  },

  headerMenuPanel: {
    marginTop: 14,
    width: '100%',
    padding: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(68, 124, 153, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'stretch',
  },

  headerMenuItem: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  headerMenuItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  headerMenuItemIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  headerMenuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
  },

  heroCard: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  heroEyebrow: {
    fontSize: 14,
    fontWeight: '800',
    color: '#e7f4ff',
    marginBottom: 6,
  },

  heroTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },

  heroDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
  },

  sectionHeaderWrap: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#24566d',
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#5f7f8a',
    fontWeight: '600',
  },

  notificationRowWrap: {
    marginBottom: 14,
    position: 'relative',
  },

  deleteBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 116,
    borderRadius: 24,
    backgroundColor: '#cf5544',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  deleteBackgroundText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },

  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8fcff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#7da5bc',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  notifAccent: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    marginRight: 12,
  },

  notifContent: {
    flex: 1,
  },

  notifMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  notifCategory: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5c7a8f',
  },

  priorityPill: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  priorityPillText: {
    fontSize: 11,
    fontWeight: '900',
  },

  notifTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 6,
  },

  notifBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#587589',
    fontWeight: '600',
  },

  notifTime: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#86a0b1',
  },

  emptyCard: {
    backgroundColor: '#eef8ff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 18,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5d7b91',
    fontWeight: '600',
  },

  bottomNav: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#447C99',
    borderWidth: 2,
    borderColor: '#d7eef3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#7da5bc',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  navItem: {
    width: '100%',
    height: '100%',
    borderRadius: 37,
    justifyContent: 'center',
    alignItems: 'center',
  },

  activeNavItem: {
    backgroundColor: 'transparent',
  },

  navIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eaf6ff',
    borderWidth: 1,
    borderColor: '#c8e4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  navIcon: {
    width: 24,
    height: 24,
    tintColor: '#173f5c',
  },

  activeNavIconWrap: {
    backgroundColor: '#eaf6ff',
  },

  activeNavIcon: {
    tintColor: '#173f5c',
  },

  navLabel: {
    display: 'none',
  },
});
