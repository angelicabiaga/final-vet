import React from 'react';
import { Text, View } from 'react-native';
import { appointmentStyles } from './StaffAppointmentStyles';

const StatusPill = ({ label, backgroundColor, borderColor, color }) => (
  <View
    style={[
      appointmentStyles.statusPill,
      {
        backgroundColor,
        borderColor,
      },
    ]}
  >
    <Text style={[appointmentStyles.statusPillText, { color }]}>{label}</Text>
  </View>
);

const SummaryMetricCard = ({ title, value, statusMeta, style }) => (
  <View
    style={[
      style,
      {
        backgroundColor: statusMeta.background,
        borderColor: statusMeta.border,
      },
    ]}
  >
    <Text style={[appointmentStyles.summaryValue, { color: statusMeta.color }]}>
      {value}
    </Text>
    <Text style={appointmentStyles.summaryLabel}>{title}</Text>
  </View>
);

const DayMetricCard = ({ title, value, statusMeta }) => (
  <View
    style={[
      appointmentStyles.dayMetricCard,
      {
        backgroundColor: statusMeta.background,
        borderColor: statusMeta.border,
      },
    ]}
  >
    <Text style={[appointmentStyles.dayMetricValue, { color: statusMeta.color }]}>
      {value}
    </Text>
    <Text style={appointmentStyles.dayMetricLabel}>{title}</Text>
  </View>
);

const NotificationChip = ({ active, activeLabel, inactiveLabel }) => (
  <View
    style={[
      appointmentStyles.notificationChip,
      active
        ? appointmentStyles.notificationChipPositive
        : appointmentStyles.notificationChipMuted,
    ]}
  >
    <Text
      style={[
        appointmentStyles.notificationChipText,
        active
          ? appointmentStyles.notificationChipTextPositive
          : appointmentStyles.notificationChipTextMuted,
      ]}
    >
      {active ? activeLabel : inactiveLabel}
    </Text>
  </View>
);

const DetailRow = ({ label, value }) => (
  <View style={appointmentStyles.detailRow}>
    <Text style={appointmentStyles.detailLabel}>{label}</Text>
    <Text style={appointmentStyles.detailValue}>{value}</Text>
  </View>
);

const DetailNotificationCard = ({ title, text, active }) => (
  <View
    style={[
      appointmentStyles.detailNotificationCard,
      active
        ? appointmentStyles.notificationCardPositive
        : appointmentStyles.notificationCardMuted,
    ]}
  >
    <Text style={appointmentStyles.detailNotificationTitle}>{title}</Text>
    <Text style={appointmentStyles.detailNotificationText}>{text}</Text>
  </View>
);

export {
  StatusPill,
  SummaryMetricCard,
  DayMetricCard,
  NotificationChip,
  DetailRow,
  DetailNotificationCard,
};
