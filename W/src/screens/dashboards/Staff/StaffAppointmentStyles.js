import { StyleSheet } from 'react-native';

export const appointmentStyles = StyleSheet.create({
  activityCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d5ebf8',
    marginBottom: 18,
  },

  activityTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  activityText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#55748a',
    fontWeight: '700',
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  summaryCard: {
    width: '48.5%',
    minHeight: 108,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },

  summaryValue: {
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
  },

  summaryLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#173f5c',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  calendarNavButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#173f5c',
  },

  calendarTitleWrap: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },

  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 8,
    textAlign: 'center',
  },

  calendarYearPickerWrap: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  calendarYearDropdown: {
    minHeight: 46,
  },

  calendarYearDropdownContainer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },

  calendarYearDropdownPlaceholder: {
    fontSize: 14,
    fontWeight: '700',
    color: '#87a0b1',
  },

  calendarYearDropdownSelectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#173f5c',
  },

  calendarYearDropdownItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
  },

  calendarYearDropdownIcon: {
    width: 18,
    height: 18,
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
    marginBottom: 8,
  },

  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },

  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5d7b91',
  },

  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  calendarWeekText: {
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

  calendarDayEmpty: {
    width: '14.28%',
    aspectRatio: 1,
    marginBottom: 8,
  },

  calendarDayCard: {
    width: '14.28%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: 'transparent',
  },

  calendarDayCardSelected: {
    backgroundColor: '#eef3f7',
  },

  calendarDayNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#173f5c',
  },

  calendarDayNumberSelected: {
    color: '#173f5c',
  },

  calendarDayCardAvailable: {
    backgroundColor: '#2fa866',
  },

  calendarDayCardAvailableSelected: {
    backgroundColor: '#23824f',
  },

  calendarDayNumberAvailable: {
    color: '#ffffff',
  },

  calendarDayNumberAvailableSelected: {
    color: '#ffffff',
  },

  pendingBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f0b429',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },

  selectedDateBanner: {
    backgroundColor: '#eef8ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d4eaf7',
    padding: 16,
    marginTop: 12,
  },

  selectedDateLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  selectedDateValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 4,
  },

  selectedDateMeta: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#5a788e',
  },

  selectedDatePendingText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    color: '#2f8d59',
    marginTop: 8,
  },

  manageDateButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#173f5c',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },

  manageDateButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  daySummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  dayMetricCard: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },

  dayMetricValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },

  dayMetricLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#173f5c',
  },

  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  slotCard: {
    width: '48.5%',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    minHeight: 136,
  },

  slotCardHeader: {
    marginBottom: 10,
  },

  slotTime: {
    fontSize: 18,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 8,
  },

  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  statusPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  slotPrimaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#173f5c',
    marginBottom: 8,
  },

  slotSecondaryText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5e7d92',
  },

  addTimeCard: {
    width: '48.5%',
    minHeight: 136,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#bcd8ea',
    backgroundColor: '#f6fbff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  addTimePlus: {
    fontSize: 30,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 4,
  },

  addTimeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
  },

  addTimeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5d7b91',
    textAlign: 'center',
  },

  bookingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  bookingHeaderContent: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },

  bookingHeaderMeta: {
    flexShrink: 1,
    lineHeight: 18,
  },

  pendingRequestSummaryCard: {
    borderRadius: 20,
    backgroundColor: '#eef5fb',
    borderWidth: 1,
    borderColor: '#d7e4ef',
    padding: 14,
    marginBottom: 14,
  },

  pendingRequestSummaryTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 10,
  },

  pendingRequestSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  pendingRequestSummaryLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#58778f',
    width: 122,
    lineHeight: 18,
  },

  pendingRequestSummaryValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    color: '#385973',
  },

  cancellationNote: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f4c7c4',
    backgroundColor: '#fff1f0',
    padding: 14,
    marginBottom: 12,
  },

  cancellationNoteTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#b64b48',
    marginBottom: 6,
    textTransform: 'uppercase',
  },

  cancellationNoteText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#7e5a59',
  },

  bookingNotificationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },

  notificationChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },

  notificationChipPositive: {
    backgroundColor: '#eaf8f0',
  },

  notificationChipMuted: {
    backgroundColor: '#eef3f6',
  },

  notificationChipText: {
    fontSize: 11,
    fontWeight: '800',
  },

  notificationChipTextPositive: {
    color: '#2b8859',
  },

  notificationChipTextMuted: {
    color: '#708392',
  },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },

  confirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#2f80ed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  confirmButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#ffeceb',
    borderWidth: 1,
    borderColor: '#f4c2bf',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#c94f4b',
  },

  reviewButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  reviewButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#173f5c',
  },

  dateActionModalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },

  dateActionModalScroll: {
    flexGrow: 0,
  },

  dateActionModalContent: {
    paddingBottom: 12,
  },

  dateActionSummaryCard: {
    borderRadius: 20,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginTop: 16,
    marginBottom: 12,
  },

  dateActionSummaryTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
  },

  dateActionSummaryText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5d7b91',
  },

  dateActionPendingCard: {
    borderRadius: 20,
    backgroundColor: '#e9f8ef',
    borderWidth: 1,
    borderColor: '#bfe8cf',
    padding: 14,
    marginBottom: 14,
  },

  dateActionPendingTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2f8d59',
    marginBottom: 6,
    textTransform: 'uppercase',
  },

  dateActionPendingText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#39684f',
    marginBottom: 2,
  },

  dateActionPendingRow: {
    marginBottom: 6,
  },

  dateActionPendingLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2f8d59',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },

  makeDateAvailableButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#2fa866',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },

  makeDateAvailableButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  dateActionHelperText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5d7b91',
    marginTop: 4,
    textAlign: 'center',
  },

  dateActionCloseButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eaf1f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },

  dateActionCloseButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f6a7b',
  },

  detailModalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#f8fcff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },

  detailModalScroll: {
    flexGrow: 0,
  },

  detailModalContent: {
    paddingBottom: 16,
  },

  modalStatusBanner: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
    marginBottom: 16,
  },

  modalStatusText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  detailInfoCard: {
    backgroundColor: '#eef8ff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d6ebf7',
    padding: 16,
    marginBottom: 14,
  },

  detailRow: {
    marginBottom: 12,
  },

  detailLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },

  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#173f5c',
  },

  detailNotificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  detailNotificationCard: {
    width: '48.5%',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },

  notificationCardPositive: {
    backgroundColor: '#eaf8f0',
    borderColor: '#caead6',
  },

  notificationCardMuted: {
    backgroundColor: '#eef3f6',
    borderColor: '#dde6ec',
  },

  detailNotificationTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
  },

  detailNotificationText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#59788e',
  },

  lastUpdateCard: {
    borderRadius: 20,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 14,
  },

  lastUpdateTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
    textTransform: 'uppercase',
  },

  lastUpdateText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#5a788e',
  },

  cancellationDetailCard: {
    borderRadius: 20,
    backgroundColor: '#fff1f0',
    borderWidth: 1,
    borderColor: '#f4c7c4',
    padding: 14,
    marginBottom: 14,
  },

  cancellationDetailTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#b64b48',
    marginBottom: 6,
    textTransform: 'uppercase',
  },

  cancellationDetailText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#7d5b59',
  },

  textAreaCard: {
    borderRadius: 20,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 14,
  },

  textAreaLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 8,
  },

  textAreaInput: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
    textAlignVertical: 'top',
  },

  rescheduleCard: {
    borderRadius: 22,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 14,
  },

  rescheduleTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
  },

  rescheduleText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5c7b90',
    marginBottom: 12,
  },

  rescheduleTargetCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 12,
    marginBottom: 12,
  },

  rescheduleTargetLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    marginBottom: 5,
  },

  rescheduleTargetValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#173f5c',
  },

  rescheduleSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  rescheduleSlotChip: {
    width: '48.5%',
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 10,
  },

  rescheduleSlotChipActive: {
    backgroundColor: '#173f5c',
    borderColor: '#173f5c',
  },

  rescheduleSlotChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
  },

  rescheduleSlotChipTextActive: {
    color: '#ffffff',
  },

  saveRescheduleButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#173f5c',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },

  saveRescheduleButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  slotControlsCard: {
    borderRadius: 22,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 14,
  },

  slotControlsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 6,
  },

  slotControlsText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5d7b91',
    marginBottom: 12,
  },

  slotControlButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  slotControlButton: {
    width: '48.5%',
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 10,
  },

  slotControlButtonText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  detailErrorText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    color: '#c94f4b',
    marginBottom: 12,
  },

  modalActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  secondaryActionButton: {
    width: '48.5%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  secondaryActionButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#173f5c',
  },

  completeButton: {
    width: '48.5%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#e7f8f7',
    borderWidth: 1,
    borderColor: '#c4e8e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  completeButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#179c97',
  },

  closeModalButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#173f5c',
    justifyContent: 'center',
    alignItems: 'center',
  },

  closeModalButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  customTimeModalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 22,
  },

  customTimeInputCard: {
    borderRadius: 20,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginTop: 16,
    marginBottom: 14,
  },

  customTimeInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
  },
});
