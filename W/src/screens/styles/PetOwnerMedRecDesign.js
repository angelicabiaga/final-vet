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
    paddingBottom: 120,
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
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  backIcon: {
    width: 18,
    height: 18,
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

  ownerBadge: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    marginLeft: 12,
  },

  ownerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
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

  headerMenuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  heroCard: {
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

  heroEyebrow: {
    color: '#dbeaf5',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },

  heroTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 32,
  },

  heroDescription: {
    color: '#edf7fc',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: '96%',
    fontWeight: '500',
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
    fontSize: 12,
    color: '#5f7f8a',
    marginTop: 3,
    fontWeight: '600',
  },

  selectorCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  petChip: {
    width: '48%',
    minHeight: 74,
    borderRadius: 20,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  petChipActive: {
    backgroundColor: '#447C99',
    borderColor: '#447C99',
  },

  petChipTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 4,
  },

  petChipTitleActive: {
    color: '#ffffff',
  },

  petChipSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b7b90',
  },

  petChipSubtitleActive: {
    color: '#d8ebf7',
  },

  summaryCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  petHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  petAvatar: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: '#d9ecf8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  petAvatarImage: {
    width: 40,
    height: 40,
    tintColor: '#173f5c',
  },

  petHeaderContent: {
    flex: 1,
  },

  petName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#24566d',
  },

  petMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#68869c',
    marginTop: 5,
  },

  petId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5f7f94',
    marginTop: 8,
  },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  infoItem: {
    width: '48%',
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  infoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  dualSectionCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 12,
  },

  cardSpacing: {
    marginTop: 10,
  },

  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#55bd7a',
    marginTop: 6,
    marginRight: 12,
  },

  timelineDotBlue: {
    backgroundColor: '#3d8fbd',
  },

  timelineContent: {
    flex: 1,
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  timelineMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6a8aa0',
    marginTop: 4,
  },

  timelineNote: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5f7f94',
    fontWeight: '600',
    marginTop: 6,
  },

  dataCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  dataRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  dataRowSubtext: {
    fontSize: 12,
    fontWeight: '700',
    color: '#68869c',
    marginTop: 4,
  },

  dataRowValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
    textAlign: 'right',
    maxWidth: '42%',
  },

  resultCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1f0fa',
    padding: 14,
    marginBottom: 12,
  },

  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  resultTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
    marginRight: 10,
  },

  resultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#e8f4ff',
    borderWidth: 1,
    borderColor: '#cde5f6',
  },

  resultBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#447C99',
  },

  resultNote: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5f7f94',
    fontWeight: '600',
  },

  analysisCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf7fd',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#63B6C5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 7,
      },
    }),
  },

  analysisItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f4fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 12,
  },

  analysisScoreBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  analysisScoreText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },

  analysisContent: {
    flex: 1,
  },

  analysisTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  analysisNote: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5f7f94',
    fontWeight: '600',
    marginTop: 6,
  },

  insightBox: {
    backgroundColor: '#eef8ff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 16,
    marginTop: 4,
  },

  insightTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 8,
  },

  insightText: {
    fontSize: 12,
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

  activeNavIconWrap: {
    backgroundColor: '#eaf6ff',
  },

  navIcon: {
    width: 24,
    height: 24,
    tintColor: '#173f5c',
  },

  activeNavIcon: {
    tintColor: '#173f5c',
  },

  navLabel: {
    display: 'none',
  },

  activeNavLabel: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
