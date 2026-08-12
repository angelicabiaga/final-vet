import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const PATIENTS = [
  { id: '1', name: 'Buddy', breed: 'Golden Retriever', owner: 'John Doe', lastVisit: 'Feb 05, 2026', status: 'Healthy' },
  { id: '2', name: 'Luna', breed: 'Siamese Cat', owner: 'Jane Smith', lastVisit: 'Jan 20, 2026', status: 'Follow-up' },
  { id: '3', name: 'Max', breed: 'Beagle', owner: 'Mike Ross', lastVisit: 'Feb 01, 2026', status: 'Under Treatment' },
];

const VetPatients = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [search, setSearch] = React.useState('');
  const query = search.trim().toLowerCase();
  const patients = PATIENTS.filter((patient) => !query || [patient.name, patient.breed, patient.owner, patient.status].some((value) => value.toLowerCase().includes(query)));
  const openPatient = (patient) => navigation.navigate('VetMedRecDetail', currentUser ? { user: currentUser, patient } : { patient });

  return (
    <VetShell navigation={navigation} route={route} subtitle="Patient Records" caption="Patient Care" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.searchCard}>
          <TextInput style={styles.searchInput} placeholder="Search pet or owner name" placeholderTextColor="#8aa2b4" value={search} onChangeText={setSearch} />
        </View>

        {patients.length ? patients.map((patient) => (
          <TouchableOpacity key={patient.id} style={styles.patientCard} onPress={() => openPatient(patient)} activeOpacity={0.9}>
            <View style={styles.patientTopRow}>
              <View style={styles.avatarCircle}><Text style={styles.avatarText}>{patient.name.charAt(0)}</Text></View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <Text style={styles.patientBreed}>{patient.breed}</Text>
                <Text style={styles.ownerName}>Owner: {patient.owner}</Text>
              </View>
            </View>
            <View style={styles.patientFooterRow}>
              <Text style={styles.lastVisitText}>Last: {patient.lastVisit}</Text>
              <View style={[styles.statusBadge, patient.status === 'Healthy' ? styles.statusHealthy : styles.statusFollow]}><Text style={styles.statusBadgeText}>{patient.status}</Text></View>
            </View>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No patient records found</Text><Text style={styles.emptyText}>Try a different pet, owner, breed, or status.</Text></View>
        )}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  searchCard: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#fcfeff', paddingHorizontal: 14, justifyContent: 'center', marginBottom: 14 },
  searchInput: { fontSize: 14, fontWeight: '700', color: '#24566d' },
  patientCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  patientTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 54, height: 54, borderRadius: 20, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#24566d' },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 17, fontWeight: '900', color: '#24566d' },
  patientBreed: { marginTop: 4, fontSize: 12, fontWeight: '800', color: '#447C99' },
  ownerName: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#5d7b91' },
  patientFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  lastVisitText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#5d7b91', marginRight: 10 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusHealthy: { backgroundColor: '#e8f7ef' },
  statusFollow: { backgroundColor: '#fff4e6' },
  statusBadgeText: { fontSize: 11, fontWeight: '900', color: '#24566d' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  emptyText: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
});

export default VetPatients;
