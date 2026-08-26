import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { formatMedicalDate, getMobileMedicalRecords, subscribeToMedicalRecords } from '../../../api/medicalRecordService';

const VetMedRec = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    try {
      // Medical History shows only consultations that have actually been
      // completed and finalized -- drafts stay out of this list (they're
      // still there in Supabase, just not surfaced here) until the vet
      // finishes and finalizes them.
      const rows = await getMobileMedicalRecords({ ...currentUser, role: currentUser?.role || 'veterinarian' }, { status: 'Finalized' });
      setRecords(rows);
      setError('');
    } catch (e) {
      setError(e?.message || 'Unable to load medical records.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, currentUser?.user_id, currentUser?.profile_id, currentUser?.role]);

  useEffect(() => {
    loadRecords();
    const unsubscribe = subscribeToMedicalRecords({ ...currentUser, role: currentUser?.role || 'veterinarian' }, loadRecords);
    const fallback = setInterval(loadRecords, 30000);
    return () => { unsubscribe?.(); clearInterval(fallback); };
  }, [loadRecords]);

  const openRecord = (record) => navigation.navigate('VetMedRecDetail', currentUser ? { user: currentUser, record } : { record });

  return (
    <VetShell navigation={navigation} route={route} subtitle="Medical Records" caption="Treatment Notes" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
        {loading ? <View style={styles.emptyCard}><ActivityIndicator /><Text style={styles.emptyText}>Loading medical records...</Text></View> : null}
        {!loading && error ? <View style={styles.emptyCard}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={loadRecords}><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View> : null}
        {!loading && !error && records.map((record) => (
          <View key={record.id} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <Text style={styles.recordDate}>{formatMedicalDate(record.consultation_date)}</Text>
              <View style={[styles.statusTag, record.record_status === 'Finalized' ? styles.statusClosed : styles.statusOpen]}><Text style={styles.statusTagText}>{record.record_status || 'Draft'}</Text></View>
            </View>
            <Text style={styles.petNameText}>{record.pet?.pet_name || 'Pet'}</Text>
            <Text style={styles.ownerText}>Owner: {record.owner?.full_name || record.owner?.username || 'Not listed'}</Text>
            <View style={styles.divider} />
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Diagnosis</Text><Text style={styles.detailValue}>{record.diagnosis || 'Not recorded'}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Treatment</Text><Text style={styles.detailValue}>{record.treatment || record.treatment_plan || 'Not recorded'}</Text></View>
            <TouchableOpacity style={styles.viewButton} onPress={() => openRecord(record)} activeOpacity={0.9}><Text style={styles.viewButtonText}>View Full Report</Text></TouchableOpacity>
          </View>
        ))}
        {!loading && !error && !records.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No completed medical consultations yet.</Text><Text style={styles.emptyText}>Records finalized on the web will appear here automatically.</Text></View> : null}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  recordCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  recordDate: { fontSize: 12, fontWeight: '900', color: '#447C99' }, statusTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusOpen: { backgroundColor: '#fff4e6' }, statusClosed: { backgroundColor: '#e8f7ef' }, statusTagText: { fontSize: 11, fontWeight: '900', color: '#24566d' },
  petNameText: { fontSize: 18, fontWeight: '900', color: '#24566d' }, ownerText: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#5d7b91' },
  divider: { height: 1, backgroundColor: '#edf4f8', marginVertical: 14 }, detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 4 }, detailValue: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#24566d' },
  viewButton: { minHeight: 44, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginTop: 6 }, viewButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' }, emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  emptyText: { marginTop: 8, textAlign: 'center', color: '#6a8aa0', fontWeight: '600' }, errorText: { color: '#a33b3b', fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#447C99', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 }, retryButtonText: { color: '#fff', fontWeight: '900' },
});
export default VetMedRec;
