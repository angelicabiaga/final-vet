import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerAppointmentDesign';
import { formatMedicalDate, getMobileMedicalRecords, subscribeToMedicalRecords } from '../../../api/medicalRecordService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

export default function PetOwnerMedRec({ navigation, route }) {
  const user = route?.params?.user;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || user?.full_name || 'Pet Owner';
  const [records, setRecords] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
    { key: 'notifications', label: 'Notifications', icon: require('../../assets/Bell_Icon.png'), route: 'PetOwnerNotif' },
    { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'PetOwnerProfile' },
  ];

  const loadRecords = useCallback(async () => {
    try {
      const rows = await getMobileMedicalRecords({ ...user, role: user?.role || 'pet_owner' });
      setRecords(rows);
      if (!selectedPetId && rows.length) setSelectedPetId(String(rows[0].pet_id || ''));
      if (selectedPetId && !rows.some((r) => String(r.pet_id) === String(selectedPetId))) {
        setSelectedPetId(rows.length ? String(rows[0].pet_id || '') : '');
      }
      setError('');
    } catch (e) {
      setError(e?.message || 'Unable to load your pet medical records.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.user_id, user?.profile_id, user?.role, selectedPetId]);

  useEffect(() => {
    loadRecords();
    const unsubscribe = subscribeToMedicalRecords({ ...user, role: user?.role || 'pet_owner' }, loadRecords);
    const fallback = setInterval(loadRecords, 30000);
    return () => { unsubscribe?.(); clearInterval(fallback); };
  }, [loadRecords]);

  const pets = Object.values(records.reduce((acc, record) => {
    const id = String(record.pet_id || '');
    if (id && !acc[id]) acc[id] = record.pet || { id, pet_name: 'Pet' };
    return acc;
  }, {}));
  const visibleRecords = selectedPetId ? records.filter((r) => String(r.pet_id) === String(selectedPetId)) : records;

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) return;
    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    Animated.timing(headerMenuAnimation, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => { isHeaderMenuAnimating.current = false; });
  };
  const closeHeaderMenu = (after) => {
    if (isHeaderMenuAnimating.current) return;
    if (!isHeaderMenuVisible) { after?.(); return; }
    isHeaderMenuAnimating.current = true;
    Animated.timing(headerMenuAnimation, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      after?.();
    });
  };
  const goTo = (screen) => closeHeaderMenu(() => navigation.navigate(screen, { user }));

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>Medical Records</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user })} activeOpacity={0.85}><View style={styles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" /></TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user })} activeOpacity={0.85}><Image source={profileImageUri ? { uri: profileImageUri } : DEFAULT_PROFILE_IMAGE} style={profileImageUri ? styles.profileButtonImage : styles.profileIcon} resizeMode={profileImageUri ? 'cover' : 'contain'} /></TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={() => isHeaderMenuVisible ? closeHeaderMenu() : openHeaderMenu()} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            <View style={styles.ownerSummary}><Text style={styles.headerCaption}>Finalized records from your veterinarian</Text><Text style={styles.ownerName}>{headerDisplayName}</Text></View>
          </View>
          {isHeaderMenuVisible ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }] }>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={[styles.headerMenuItem, item.key === 'medical' && localStyles.activeMenuItem]} onPress={() => goTo(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}><Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={localStyles.scrollContent}>
          <View style={localStyles.heroCard}>
            <View style={localStyles.heroIconWrap}><Image source={require('../../assets/Medical_Icon.png')} style={localStyles.heroIcon} resizeMode="contain" /></View>
            <View style={localStyles.heroText}><Text style={localStyles.eyebrow}>MY PET MEDICAL RECORDS</Text><Text style={localStyles.heroTitle}>Clinical History</Text><Text style={localStyles.heroBody}>Records finalized by your veterinarian on the web appear here automatically.</Text></View>
          </View>

          {loading ? <View style={localStyles.stateCard}><ActivityIndicator /><Text style={localStyles.stateText}>Loading medical records...</Text></View> : null}
          {!loading && error ? <View style={localStyles.stateCard}><Text style={localStyles.errorText}>{error}</Text><TouchableOpacity style={localStyles.retryButton} onPress={loadRecords}><Text style={localStyles.retryText}>Retry</Text></TouchableOpacity></View> : null}

          {!loading && !error && pets.length ? (
            <View style={localStyles.petSelectorWrap}>
              <Text style={localStyles.sectionTitle}>Select Pet</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.petSelectorContent}>
                {pets.map((pet) => {
                  const id = String(pet.id || '');
                  const active = id === String(selectedPetId);
                  return <TouchableOpacity key={id} style={[localStyles.petChip, active && localStyles.petChipActive]} onPress={() => setSelectedPetId(id)}><Text style={[localStyles.petChipText, active && localStyles.petChipTextActive]}>{pet.pet_name || 'Pet'}</Text></TouchableOpacity>;
                })}
              </ScrollView>
            </View>
          ) : null}

          {!loading && !error && visibleRecords.map((record) => (
            <View key={record.id} style={localStyles.recordCard}>
              <View style={localStyles.recordTopRow}>
                <View><Text style={localStyles.petName}>{record.pet?.pet_name || 'Pet'}</Text><Text style={localStyles.recordDate}>{formatMedicalDate(record.consultation_date)}</Text></View>
                <View style={localStyles.finalizedBadge}><Text style={localStyles.finalizedText}>{record.record_status || 'Finalized'}</Text></View>
              </View>
              <View style={localStyles.divider} />
              <Text style={localStyles.label}>Veterinarian</Text><Text style={localStyles.value}>{record.veterinarian?.full_name || record.veterinarian?.username || 'Not recorded'}</Text>
              <Text style={localStyles.label}>Chief Complaint</Text><Text style={localStyles.value}>{record.chief_complaint || 'Not recorded'}</Text>
              <Text style={localStyles.label}>Diagnosis</Text><Text style={localStyles.value}>{record.diagnosis || 'Not recorded'}</Text>
              <Text style={localStyles.label}>Treatment</Text><Text style={localStyles.value}>{record.treatment || record.treatment_plan || 'Not recorded'}</Text>
              {record.medication ? <><Text style={localStyles.label}>Medication</Text><Text style={localStyles.value}>{[record.medication, record.dosage, record.frequency, record.duration].filter(Boolean).join(' • ')}</Text></> : null}
              {record.laboratory_result ? <><Text style={localStyles.label}>Laboratory Result</Text><Text style={localStyles.value}>{record.laboratory_result}</Text></> : null}
              {record.vaccination ? <><Text style={localStyles.label}>Vaccination</Text><Text style={localStyles.value}>{record.vaccination}</Text></> : null}
              {record.follow_up_date ? <><Text style={localStyles.label}>Follow-up Date</Text><Text style={localStyles.value}>{formatMedicalDate(record.follow_up_date)}</Text></> : null}
              {record.veterinarian_notes ? <><Text style={localStyles.label}>Veterinarian Notes</Text><Text style={localStyles.value}>{record.veterinarian_notes}</Text></> : null}
            </View>
          ))}

          {!loading && !error && !records.length ? <View style={localStyles.stateCard}><Text style={localStyles.emptyTitle}>No completed medical consultations yet.</Text><Text style={localStyles.stateText}>When your veterinarian finalizes a record on the web, it will appear here automatically.</Text></View> : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const localStyles = StyleSheet.create({
  activeMenuItem: { backgroundColor: '#eaf6fa' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120 },
  heroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#d9edf2', marginBottom: 18 },
  heroIconWrap: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#e8f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 14 }, heroIcon: { width: 30, height: 30 }, heroText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '900', color: '#5f8da2', letterSpacing: 1 }, heroTitle: { marginTop: 4, fontSize: 21, fontWeight: '900', color: '#24566d' }, heroBody: { marginTop: 5, fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#67889a' },
  stateCard: { backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 22, alignItems: 'center', marginBottom: 16 }, stateText: { marginTop: 10, color: '#67889a', fontWeight: '600', textAlign: 'center', lineHeight: 19 }, errorText: { color: '#a33b3b', fontWeight: '800', textAlign: 'center' }, retryButton: { marginTop: 12, backgroundColor: '#447C99', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20 }, retryText: { color: '#fff', fontWeight: '900' }, emptyTitle: { color: '#24566d', fontSize: 17, fontWeight: '900' },
  petSelectorWrap: { marginBottom: 14 }, sectionTitle: { color: '#24566d', fontSize: 15, fontWeight: '900', marginBottom: 10 }, petSelectorContent: { paddingRight: 12 }, petChip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8eaf1', marginRight: 9 }, petChipActive: { backgroundColor: '#447C99', borderColor: '#447C99' }, petChipText: { color: '#447C99', fontWeight: '900' }, petChipTextActive: { color: '#fff' },
  recordCard: { backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#dceef8', marginBottom: 14 }, recordTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, petName: { fontSize: 20, fontWeight: '900', color: '#24566d' }, recordDate: { marginTop: 4, color: '#64869a', fontSize: 12, fontWeight: '700' }, finalizedBadge: { backgroundColor: '#e8f7ef', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10 }, finalizedText: { color: '#347055', fontSize: 11, fontWeight: '900' }, divider: { height: 1, backgroundColor: '#edf4f8', marginVertical: 14 }, label: { color: '#6a8aa0', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginTop: 9, marginBottom: 4 }, value: { color: '#24566d', fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
