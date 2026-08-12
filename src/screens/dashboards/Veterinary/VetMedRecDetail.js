import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import VetShell from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { formatMedicalDate } from '../../../api/medicalRecordService';

const Row = ({ label, value }) => <View style={styles.infoCard}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value || 'Not recorded'}</Text></View>;

export default function VetMedRecDetail({ navigation, route }) {
  const record = route?.params?.record || {};
  const title = record?.pet?.pet_name || record?.petName || 'Medical Record';
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  return (
    <VetShell navigation={navigation} route={route} subtitle="Record Detail" caption="Clinical Detail" showBack lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
        <View style={styles.detailCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{record?.owner?.full_name || record?.owner?.username || 'Owner not listed'}</Text>
          <View style={styles.infoGrid}>
            <Row label="Consultation Date" value={formatMedicalDate(record.consultation_date)} />
            <Row label="Status" value={record.record_status} />
            <Row label="Chief Complaint" value={record.chief_complaint} />
            <Row label="Symptoms" value={record.symptoms} />
            <Row label="Vital Signs" value={record.vital_signs} />
            <Row label="Weight" value={record.weight != null ? `${record.weight} kg` : ''} />
            <Row label="Temperature" value={record.temperature != null ? `${record.temperature} °C` : ''} />
            <Row label="Diagnosis" value={record.diagnosis} />
            <Row label="Treatment" value={record.treatment} />
            <Row label="Treatment Plan" value={record.treatment_plan} />
            <Row label="Medication" value={record.medication} />
            <Row label="Dosage" value={record.dosage} />
            <Row label="Frequency" value={record.frequency} />
            <Row label="Duration" value={record.duration} />
            <Row label="Laboratory Request" value={record.laboratory_request} />
            <Row label="Laboratory Result" value={record.laboratory_result} />
            <Row label="Vaccination" value={record.vaccination} />
            <Row label="Follow-up Date" value={record.follow_up_date ? formatMedicalDate(record.follow_up_date) : ''} />
            <Row label="Veterinarian Notes" value={record.veterinarian_notes} />
            <Row label="Veterinarian" value={record?.veterinarian?.full_name || record?.veterinarian?.username} />
          </View>
        </View>
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 }, detailCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18 },
  title: { fontSize: 24, fontWeight: '900', color: '#24566d' }, subtitle: { marginTop: 5, fontSize: 13, fontWeight: '700', color: '#5d7b91' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 18 }, infoCard: { width: '48.5%', backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#e4f1f8', padding: 12, marginBottom: 12 },
  infoLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 6 }, infoValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#24566d' },
});
