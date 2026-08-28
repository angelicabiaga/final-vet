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

  brandBlock: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#c3ddee',
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

  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  backTriggerButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
  },

  backTriggerIcon: {
    width: 24,
    height: 24,
    tintColor: '#ffffff',
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

  messagesHeaderCard: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#447C99',
    borderWidth: 1,
    borderColor: '#d7eef3',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  searchCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 16,
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

  messagesHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },

  inboxCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 18,
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

  optionsCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 18,
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

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf4f8',
  },

  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#e8f3fb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  optionIcon: {
    width: 24,
    height: 24,
    tintColor: '#173f5c',
  },

  optionContent: {
    flex: 1,
    marginRight: 10,
  },

  optionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  optionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#173f5c',
    marginRight: 10,
  },

  optionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5d7b91',
    fontWeight: '600',
  },

  optionBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#e7f4fb',
    borderWidth: 1,
    borderColor: '#cfe6f3',
  },

  optionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#447C99',
  },

  optionArrow: {
    fontSize: 22,
    fontWeight: '900',
    color: '#447C99',
    marginTop: -2,
  },

  disclaimerCard: {
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d5ebf8',
  },

  disclaimerText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 21,
    color: '#587286',
    fontWeight: '600',
  },

  chatArea: {
    flex: 1,
  },

  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 26,
    flexGrow: 1,
  },

  quickAssistMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 170,
  },

  quickAssistMessageCard: {
    flex: 1,
    maxWidth: '84%',
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
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

  quickAssistMessageText: {
    fontSize: 17,
    lineHeight: 29,
    color: '#173f5c',
    fontWeight: '600',
  },

  quickAssistActionButton: {
    marginTop: 20,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quickAssistActionButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
  },

  quickAssistSecondaryActionButton: {
    marginTop: 12,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5f9eb4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  quickAssistMessageTime: {
    marginLeft: 10,
    marginBottom: 14,
    fontSize: 12,
    color: '#5f7f8a',
    fontWeight: '700',
  },

  conversationCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 16,
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

  conversationCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  conversationCardTextWrap: {
    flex: 1,
    marginRight: 12,
  },

  conversationCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: '#173f5c',
    fontWeight: '800',
  },

  conversationCardTime: {
    fontSize: 12,
    color: '#8aa2b4',
    fontWeight: '700',
    marginTop: 3,
  },

  conversationCardPill: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#e8f4fb',
    borderWidth: 1,
    borderColor: '#d1e8f4',
  },

  conversationCardPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#447C99',
  },

  conversationCardPreview: {
    fontSize: 15,
    lineHeight: 24,
    color: '#47657a',
    fontWeight: '600',
  },

  conversationCardFooter: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  conversationCardUnread: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },

  conversationCardUnreadText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },

  conversationCardAction: {
    minWidth: 126,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  conversationCardActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: 'rgba(248, 252, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#dceef8',
  },

  input: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f8fcff',
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#173f5c',
  },

  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#447C99',
  },

  sendIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginLeft: 1,
  },

  sendImage: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  inlineInputWrap: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f8fcff',
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingLeft: 20,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  inlineInput: {
    flex: 1,
    fontSize: 16,
    color: '#173f5c',
  },

  inlineSendImage: {
    width: 20,
    height: 20,
    tintColor: '#447C99',
    marginLeft: 12,
  },

  searchInputWrap: {
    minHeight: 48,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
    paddingRight: 10,
  },

  searchIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e8f3fb',
    justifyContent: 'center',
    alignItems: 'center',
  },

  searchIcon: {
    width: 18,
    height: 18,
    tintColor: '#447C99',
  },

  searchDropdown: {
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    overflow: 'hidden',
  },

  searchDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#edf4f8',
  },

  searchDropdownTextWrap: {
    flex: 1,
    marginRight: 10,
  },

  searchDropdownTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#173f5c',
  },

  searchDropdownSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: '#5d7b91',
    fontWeight: '600',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#edf4f8',
  },

  messageRowActive: {
    backgroundColor: '#eef7fc',
    borderRadius: 16,
    borderBottomColor: 'transparent',
  },

  messageAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e2eef8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  messageAvatar: {
    width: 22,
    height: 22,
    tintColor: '#173f5c',
  },

  messageContent: {
    flex: 1,
  },

  messageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  messageDoctorName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#173f5c',
    marginRight: 8,
  },

  messageDoctorNameActive: {
    color: '#173f5c',
  },

  messageTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8098aa',
  },

  messageTimeActive: {
    color: '#5f7f94',
  },

  messagePreview: {
    fontSize: 11,
    lineHeight: 16,
    color: '#658296',
    marginTop: 4,
    fontWeight: '600',
  },

  messagePreviewActive: {
    color: '#4d6c82',
  },

  rowUnreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3d8fbd',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 10,
  },

  rowUnreadBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },

  inboxOnlyHintCard: {
    backgroundColor: '#eef8ff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 16,
    marginBottom: 20,
  },

  inboxOnlyHintTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#173f5c',
    marginBottom: 6,
  },

  inboxOnlyHintText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5d7b91',
    fontWeight: '600',
  },

  chatCard: {
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dceef8',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#7da5bc',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  chatHeader: {
    minHeight: 56,
    backgroundColor: '#447C99',
    borderBottomWidth: 1,
    borderBottomColor: '#d7eef3',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  chatHeaderProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  chatHeaderAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2eef8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  chatHeaderAvatar: {
    width: 18,
    height: 18,
    tintColor: '#173f5c',
  },

  chatHeaderTextWrap: {
    flex: 1,
  },

  chatHeaderName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },

  chatHeaderStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e5f5fb',
    marginTop: 2,
  },

  chatBody: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },

  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },

  bubbleRowUser: {
    justifyContent: 'flex-end',
  },

  bubbleAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e2eef8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },

  bubbleAvatar: {
    width: 12,
    height: 12,
    tintColor: '#173f5c',
  },

  bubbleContent: {
    maxWidth: '78%',
  },

  chatBubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  doctorBubble: {
    backgroundColor: '#24566d',
    borderBottomLeftRadius: 8,
  },

  userBubble: {
    backgroundColor: '#447C99',
    borderBottomRightRadius: 8,
    alignSelf: 'flex-end',
  },

  chatBubbleText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#ffffff',
    fontWeight: '600',
  },

  userBubbleText: {
    color: '#ffffff',
  },

  bubbleTime: {
    fontSize: 10,
    color: '#6b8798',
    fontWeight: '700',
    marginTop: 4,
    marginLeft: 4,
  },

  bubbleTimeUser: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },

  aiSuggestionsWrap: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  aiSuggestionChip: {
    backgroundColor: '#eef8ff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  aiSuggestionChipText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#173f5c',
  },

  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 14,
  },

  composerInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#173f5c',
    marginRight: 10,
    fontWeight: '600',
  },

  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d7edf9',
  },

  sendButtonText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#173f5c',
    marginTop: -2,
  },

  threadTopBar: {
    minHeight: 56,
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: '#447C99',
    borderWidth: 1,
    borderColor: '#d7eef3',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  threadBackButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  threadBackIcon: {
    width: 16,
    height: 16,
    tintColor: '#ffffff',
  },

  threadTopTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },

  threadTopSpacer: {
    width: 34,
    height: 34,
  },

  threadScrollContent: {
    paddingBottom: 6,
  },

  threadFallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#63B6C5',
    paddingHorizontal: 24,
  },

  threadFallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
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
