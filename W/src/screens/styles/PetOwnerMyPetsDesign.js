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

  headerNotificationToast: {
    position: 'absolute',
    top: 72,
    right: 22,
    width: 210,
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dceef8',
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  headerNotificationText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#24566d',
  },

  headerNotificationPointer: {
    position: 'absolute',
    top: -8,
    right: 16,
    width: 16,
    height: 16,
    backgroundColor: '#f8fcff',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#dceef8',
    transform: [{ rotate: '45deg' }],
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
    borderColor: 'rgba(222, 242, 247, 0.34)',
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
    maxWidth: '95%',
    fontWeight: '500',
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

  petListCard: {
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

  searchBarWrap: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  searchBarIcon: {
    width: 19,
    height: 19,
    tintColor: '#5f7f94',
    marginRight: 10,
  },

  searchBarInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },

  searchEmptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 12,
  },

  searchEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 6,
  },

  searchEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#5f7f94',
  },

  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  petRowActive: {
    backgroundColor: '#447C99',
    borderColor: '#447C99',
  },

  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  petAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#24566d',
  },

  petAvatarImage: {
    width: 28,
    height: 28,
    tintColor: '#24566d',
  },

  petAvatarImageCustom: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    tintColor: undefined,
  },

  petRowContent: {
    flex: 1,
  },

  petRowName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24566d',
  },

  petRowNameActive: {
    color: '#ffffff',
  },

  petRowBreed: {
    fontSize: 12,
    fontWeight: '700',
    color: '#68869c',
    marginTop: 4,
  },

  petRowBreedActive: {
    color: '#d6eaf7',
  },

  petStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e8f4fb',
    borderWidth: 1,
    borderColor: '#d4e9f6',
  },

  petStatusPillActive: {
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderColor: 'rgba(222, 242, 247, 0.3)',
  },

  petStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
  },

  petStatusTextActive: {
    color: '#ffffff',
  },

  addPetButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b7d9eb',
    backgroundColor: '#eef8ff',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },

  addPetPlus: {
    fontSize: 20,
    fontWeight: '900',
    color: '#24566d',
    marginRight: 8,
  },

  addPetText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#24566d',
  },

  emptyModeCard: {
    backgroundColor: '#eef8ff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d5ebf8',
    marginBottom: 20,
  },

  emptyModeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 6,
  },

  emptyModeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5f7f94',
    fontWeight: '600',
  },

  detailCard: {
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

  detailTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  secondaryActionButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#e8eef3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  secondaryActionButtonWide: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#e8eef3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  secondaryActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#49687a',
  },

  primaryActionButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryActionButtonWide: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },

  editActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  viewProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  largePetAvatar: {
    width: 82,
    height: 82,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  largePetAvatarText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#24566d',
  },

  largePetAvatarImage: {
    width: 48,
    height: 48,
    tintColor: '#24566d',
  },

  largePetAvatarImageCustom: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    tintColor: undefined,
  },

  viewProfileInfo: {
    flex: 1,
  },

  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#24566d',
  },

  profileBreed: {
    fontSize: 13,
    fontWeight: '700',
    color: '#67869b',
    marginTop: 4,
  },

  referenceCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5f7f94',
    marginTop: 8,
  },

  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  profileInfoItem: {
    width: '48%',
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  profileInfoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  profileInfoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  innerSectionCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e3f2fb',
    marginTop: 12,
  },

  recordCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#24566d',
    marginBottom: 10,
  },

  recordCardSectionSpacing: {
    marginTop: 10,
  },

  recordListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  recordBullet: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#447C99',
    marginTop: 6,
    marginRight: 10,
  },

  recordItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#5f7f94',
    fontWeight: '600',
  },

  emptyRecordText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7a95a7',
    fontWeight: '600',
  },

  visitTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  visitTimelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#447C99',
    marginTop: 5,
    marginRight: 12,
  },

  visitTimelineContent: {
    flex: 1,
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  visitTimelineText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#24566d',
    fontWeight: '700',
  },

  editPhotoSection: {
    alignItems: 'center',
    marginBottom: 18,
  },

  editAvatarWrap: {
    position: 'relative',
    marginBottom: 4,
  },

  photoPickerLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  avatarAddButton: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#447C99',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarAddButtonText: {
    fontSize: 21,
    lineHeight: 21,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: -1,
  },

  formCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e3f2fb',
  },

  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6a8aa0',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  requiredMark: {
    color: '#d84343',
    fontWeight: '900',
  },

  readOnlyField: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#edf5fa',
    borderWidth: 1,
    borderColor: '#dae8f0',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  readOnlyFieldText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#49687a',
  },

  inputField: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },

  textAreaField: {
    minHeight: 108,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 14,
    paddingTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },

  pickerFieldWrap: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  enhancedFieldCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 12,
  },

  dropdownShell: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  searchableDropdown: {
    minHeight: 50,
  },

  searchableDropdownContainer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },

  dropdownPlaceholder: {
    fontSize: 14,
    fontWeight: '700',
    color: '#87a0b1',
  },

  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  dropdownItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },

  dropdownIcon: {
    width: 18,
    height: 18,
  },

  inlineFieldHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5f7f94',
  },

  stackedInputField: {
    marginTop: 12,
  },

  birthdayFieldCard: {
    backgroundColor: '#eff8ff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfe6f5',
    padding: 14,
  },

  birthdayInfoText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5f7f94',
    marginBottom: 12,
  },

  calendarTriggerButton: {
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  calendarTriggerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  calendarTriggerValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#24566d',
  },

  calendarTriggerIconImage: {
    width: 26,
    height: 26,
    tintColor: '#24566d',
  },

  birthdayAgeSummary: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  birthdayAgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  birthdayAgeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#24566d',
  },

  birthdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  birthdayPickerWrap: {
    width: '44%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  birthdayPickerWrapSmall: {
    width: '26%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  birthdayPicker: {
    color: '#24566d',
  },

  photoOptionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },

  photoOptionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#24566d',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 18, 28, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  modalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dbeef8',
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  calendarModalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dbeef8',
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 10,
    textAlign: 'center',
  },

  modalMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5d7b91',
    fontWeight: '600',
    textAlign: 'center',
  },

  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },

  modalSecondaryButton: {
    width: '48%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eaf1f6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f6a7b',
  },

  modalPrimaryButton: {
    width: '48%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },

  modalSingleButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },

  modalSingleButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },

  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 2,
  },

  calendarNavButton: {
    minWidth: 82,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#e8f2f9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  calendarNavButtonDisabled: {
    opacity: 0.45,
  },

  calendarNavButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
  },

  calendarTitleWrap: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },

  calendarActiveMonth: {
    fontSize: 15,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 8,
    textAlign: 'center',
  },

  calendarPickerWrapYear: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  calendarPickerDropdown: {
    minHeight: 46,
  },

  calendarWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  calendarWeekLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },

  calendarDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  calendarDayCellEmpty: {
    backgroundColor: 'transparent',
  },

  calendarDayCellDisabled: {
    backgroundColor: '#eef3f7',
  },

  calendarDayCellSelected: {
    backgroundColor: '#447C99',
  },

  calendarDayText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24566d',
  },

  calendarDayTextEmpty: {
    color: 'transparent',
  },

  calendarDayTextDisabled: {
    color: '#aabac6',
  },

  calendarDayTextSelected: {
    color: '#ffffff',
  },

  calendarDonePlaceholder: {
    width: '48%',
    minHeight: 48,
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
        shadowColor: '#447C99',
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

  navLabel: {
    display: 'none',
  },

  activeNavLabel: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
