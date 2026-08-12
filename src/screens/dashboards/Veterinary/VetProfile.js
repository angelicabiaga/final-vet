import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CustomModal from '../../../components/CustomModal';
import VetShell, { getVetName, getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const VetProfile = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);

  return (
    <VetShell navigation={navigation} route={route} subtitle="Veterinary Profile" caption="Account Settings" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarLargeWrap}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.avatarLargeImage} resizeMode="cover" /> : <Image source={require('../../assets/Profile.png')} style={styles.avatarLargeIcon} resizeMode="contain" />}</View>
          <Text style={styles.profileName}>{getVetName(currentUser)}</Text>
          <Text style={styles.profileRole}>Veterinarian</Text>
          <Text style={styles.profileMeta}>Staff ID: {currentUser?.staffId || 'VET-2026-001'}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Account Details</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Email</Text><Text style={styles.detailValue}>{currentUser?.email || 'vet@pawcruz.com'}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Department</Text><Text style={styles.detailValue}>Veterinary Care</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Access Level</Text><Text style={styles.detailValue}>Clinical Records and Appointments</Text></View>
          <TouchableOpacity style={styles.logoutButton} onPress={() => setShowLogoutModal(true)} activeOpacity={0.9}><Text style={styles.logoutButtonText}>Logout</Text></TouchableOpacity>
        </View>
      </ScrollView>

      <CustomModal
        show={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        extraAction={
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={() => { setShowLogoutModal(false); navigation.replace('login'); }} activeOpacity={0.9}><Text style={styles.modalPrimaryText}>Logout</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowLogoutModal(false)} activeOpacity={0.9}><Text style={styles.modalSecondaryText}>Cancel</Text></TouchableOpacity>
          </View>
        }
      >
        Are you sure you want to logout?
      </CustomModal>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  profileCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center', marginBottom: 14 },
  avatarLargeWrap: { width: 94, height: 94, borderRadius: 34, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 },
  avatarLargeImage: { width: '100%', height: '100%' },
  avatarLargeIcon: { width: 42, height: 42, tintColor: '#24566d' },
  profileName: { fontSize: 22, fontWeight: '900', color: '#24566d', textAlign: 'center' },
  profileRole: { marginTop: 5, fontSize: 12, fontWeight: '900', color: '#447C99', textTransform: 'uppercase' },
  profileMeta: { marginTop: 4, fontSize: 13, fontWeight: '600', color: '#5d7b91' },
  detailCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#24566d', marginBottom: 12 },
  detailRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#edf4f8' },
  detailLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 5 },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#24566d' },
  logoutButton: { minHeight: 48, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  logoutButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  modalPrimaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  modalPrimaryText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  modalSecondaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#edf4f8', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  modalSecondaryText: { fontSize: 13, fontWeight: '900', color: '#24566d' },
});

export default VetProfile;
