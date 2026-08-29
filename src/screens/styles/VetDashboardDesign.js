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

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 110,
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
    fontWeight: '700',
    color: '#c3ddee',
    marginTop: 3,
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

  headerMenuItemLast: {
    marginBottom: 0,
  },

  headerMenuItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  headerMenuItemIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  menuBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: '#e53935',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },

  menuBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },

  headerMenuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  welcomeCard: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 22,
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  welcomeDesc: {
    color: '#edf7fc',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: '95%',
    fontWeight: '500',
  },

  heroSlideCard: {
    marginTop: 4,
    minHeight: 210,
    backgroundColor: '#447C99',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },

  heroSlideBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },

  heroSlideOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 32, 50, 0.66)',
  },

  heroSlideContent: {
    minHeight: 210,
    paddingHorizontal: 18,
    paddingVertical: 18,
    justifyContent: 'center',
  },

  heroSlideTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  heroSlideLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#dbeaf5',
    textTransform: 'uppercase',
  },

  heroDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 6,
  },

  heroDotActive: {
    width: 18,
    backgroundColor: '#ffffff',
  },

  heroSlideTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },

  heroQuoteMark: {
    fontSize: 42,
    lineHeight: 42,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.74)',
    marginTop: 8,
    marginBottom: -6,
  },

  sectionHeaderWrap: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#24566d',
  },

  sectionSubtitle: {
    fontSize: 12,
    color: '#5f7f8a',
    marginTop: 3,
    fontWeight: '600',
  },

  activityPanel: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#b7e6ff',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  activityStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  activityStatCard: {
    width: '48%',
    minHeight: 126,
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingHorizontal: 12,
    paddingTop: 26,
    paddingBottom: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#88bddf',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: {
        elevation: 5,
      },
    }),
  },

  activityStatAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
  },

  activityTrackAccentBlue: {
    backgroundColor: '#3d8fbd',
  },

  activityTrackAccentGreen: {
    backgroundColor: '#55bd7a',
  },

  activityTrackAccentGold: {
    backgroundColor: '#e7bf49',
  },

  activityTrackAccentTeal: {
    backgroundColor: '#63B6C5',
  },

  activityStatLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#587286',
    textTransform: 'uppercase',
  },

  activityStatValue: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    color: '#24566d',
    marginTop: 6,
  },

  activityStatDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#68869c',
    marginTop: 4,
  },

  activityTrackNote: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#5d7b91',
    paddingHorizontal: 2,
  },

  servicesSlideshowCard: {
    height: 180,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 18,
    marginBottom: 18,
    padding: 14,
    backgroundColor: 'rgba(127, 211, 255, 0.16)',
    ...Platform.select({
      ios: {
        shadowColor: '#88bddf',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  servicesSlideshowFrame: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(222, 242, 247, 0.3)',
    backgroundColor: 'rgba(143, 199, 232, 0.18)',
  },

  servicesSlideshowImage: {
    width: '100%',
    height: '100%',
  },

  servicesSlideshowDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  servicesSlideshowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.52)',
    marginHorizontal: 4,
  },

  servicesSlideshowDotActive: {
    width: 20,
    backgroundColor: '#ffffff',
  },

  aiCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#88bddf',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  aiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  aiScoreBox: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#245f8e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  aiScoreNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },

  aiSummaryContent: {
    flex: 1,
  },

  aiMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#173f5c',
    marginBottom: 4,
  },

  aiMainSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5d7b91',
  },

  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  scoreItem: {
    width: '48%',
    backgroundColor: '#f1f8fd',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d5e8f4',
  },

  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  greenCircle: {
    backgroundColor: '#e8f3fb',
    borderWidth: 3,
    borderColor: '#2f78ad',
  },

  yellowCircle: {
    backgroundColor: '#fff8e2',
    borderWidth: 3,
    borderColor: '#e0b400',
  },

  scoreLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: '#173f5c',
  },

  scoreItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#173f5c',
    marginBottom: 3,
  },

  scoreItemDesc: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b8798',
    textAlign: 'center',
  },

  highlightBox: {
    backgroundColor: '#eef8ff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d5ebf8',
  },

  highlightTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#173f5c',
    marginBottom: 8,
  },

  highlightText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#587286',
    fontWeight: '600',
    marginBottom: 4,
  },

  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 2,
  },

  menuCard: {
    width: '48%',
    minHeight: 142,
    backgroundColor: '#fcfeff',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e3f3fb',
    ...Platform.select({
      ios: {
        shadowColor: '#b8e7ff',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#e8f7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d4ebf8',
  },

  iconImage: {
    width: 26,
    height: 26,
    tintColor: '#24566d',
  },

  menuLabel: {
    fontSize: 12,
    textAlign: 'center',
    color: '#173f5c',
    fontWeight: '800',
    lineHeight: 16,
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
    backgroundColor: '#e7f6f8',
    borderWidth: 1,
    borderColor: '#c8e4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  activeNavIconWrap: {
    backgroundColor: '#e7f6f8',
  },

  navIcon: {
    width: 24,
    height: 24,
    tintColor: '#24566d',
  },

  activeNavIcon: {
    tintColor: '#24566d',
  },
});


