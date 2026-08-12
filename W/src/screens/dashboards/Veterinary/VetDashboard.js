import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { styles as dashboardStyles } from '../../styles/VetDashboardDesign';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const HERO_SLIDES = [
  {
    key: 'patients',
    eyebrow: 'Veterinary Care',
    title: 'Review patient activity',
    body: 'Track pets, appointments, and clinical notes from one clean workspace.',
    route: 'VetPatients',
    action: 'Open Patients',
  },
  {
    key: 'records',
    eyebrow: 'Care Records',
    title: 'Keep treatments organized',
    body: 'Jump into medical records and appointment schedules for daily clinic work.',
    route: 'VetMedRec',
    action: 'Open Records',
  },
];

const SERVICE_CARDS = [
  { key: 'patients', title: 'Patients', subtitle: 'View pet records', icon: require('../../assets/Pets_Icon.png'), route: 'VetPatients' },
  { key: 'appointments', title: 'Appointments', subtitle: 'Check daily schedule', icon: require('../../assets/Appointment_Icon.png'), route: 'VetAppointment' },
  { key: 'records', title: 'Medical Records', subtitle: 'Review treatment notes', icon: require('../../assets/Medical_Icon.png'), route: 'VetMedRec' },
  { key: 'messages', title: 'Messages', subtitle: 'Talk to pet owners', icon: require('../../assets/Message_Icon.png'), route: 'VetMessages' },
];

const VetDashboard = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const navigateVet = (screen) => navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);

  return (
    <VetShell navigation={navigation} route={route} subtitle="Veterinary Dashboard" caption="Clinical Workspace" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={localStyles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={localStyles.heroCard}>
          <Text style={localStyles.heroEyebrow}>{HERO_SLIDES[activeSlide].eyebrow}</Text>
          <Text style={localStyles.heroTitle}>{HERO_SLIDES[activeSlide].title}</Text>
          <Text style={localStyles.heroBody}>{HERO_SLIDES[activeSlide].body}</Text>
          <TouchableOpacity style={localStyles.heroButton} onPress={() => navigateVet(HERO_SLIDES[activeSlide].route)} activeOpacity={0.9}>
            <Text style={localStyles.heroButtonText}>{HERO_SLIDES[activeSlide].action}</Text>
          </TouchableOpacity>
          <View style={localStyles.slideDots}>
            {HERO_SLIDES.map((slide, index) => (
              <TouchableOpacity key={slide.key} style={[localStyles.slideDot, activeSlide === index && localStyles.slideDotActive]} onPress={() => setActiveSlide(index)} activeOpacity={0.85} />
            ))}
          </View>
        </View>

        <View style={dashboardStyles.sectionHeaderWrap}>
          <Text style={dashboardStyles.sectionTitle}>Veterinary Services</Text>
          <Text style={dashboardStyles.sectionSubtitle}>Fast access to the tools veterinarians need for patient care.</Text>
        </View>

        <View style={localStyles.serviceGrid}>
          {SERVICE_CARDS.map((item) => (
            <TouchableOpacity key={item.key} style={localStyles.serviceCard} onPress={() => navigateVet(item.route)} activeOpacity={0.9}>
              <View style={localStyles.serviceIconWrap}><Image source={item.icon} style={localStyles.serviceIcon} resizeMode="contain" /></View>
              <Text style={localStyles.serviceTitle}>{item.title}</Text>
              <Text style={localStyles.serviceSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </VetShell>
  );
};

const localStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, marginBottom: 18 },
  heroEyebrow: { fontSize: 12, fontWeight: '900', color: '#447C99', textTransform: 'uppercase', marginBottom: 8 },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: '900', color: '#24566d' },
  heroBody: { marginTop: 8, fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#5d7b91' },
  heroButton: { alignSelf: 'flex-start', minHeight: 46, borderRadius: 16, backgroundColor: '#447C99', justifyContent: 'center', paddingHorizontal: 18, marginTop: 18 },
  heroButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  slideDots: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  slideDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c8e4ee', marginRight: 7 },
  slideDotActive: { width: 24, backgroundColor: '#447C99' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  serviceCard: { width: '48%', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12, minHeight: 150 },
  serviceIconWrap: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  serviceIcon: { width: 24, height: 24, tintColor: '#24566d' },
  serviceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900', color: '#24566d' },
  serviceSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#5d7b91' },
});

export default VetDashboard;
