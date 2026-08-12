import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VetShell from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const INVENTORY_ALERTS = [
  { key: 'vaccines', title: 'Vaccines', subtitle: '8 items available', icon: require('../../assets/Inventory_Icon.png') },
  { key: 'medicine', title: 'Medicines', subtitle: '3 low-stock items', icon: require('../../assets/Medical_Icon.png') },
  { key: 'kits', title: 'Test Kits', subtitle: '2 expiring soon', icon: require('../../assets/Log_Icon.png') },
];

export default function VetInventory({ navigation, route }) {
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  return (
    <VetShell navigation={navigation} route={route} subtitle="Inventory" caption="Clinical Supplies" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Supply overview</Text>
          <Text style={styles.heroText}>Quickly review clinical supplies that may affect appointments and patient care.</Text>
        </View>
        {INVENTORY_ALERTS.map((item) => (
          <TouchableOpacity key={item.key} style={styles.itemCard} activeOpacity={0.9}>
            <View style={styles.iconWrap}><Image source={item.icon} style={styles.icon} resizeMode="contain" /></View>
            <View style={styles.itemTextWrap}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemSubtitle}>{item.subtitle}</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, marginBottom: 14 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#24566d' },
  heroText: { marginTop: 6, fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#5d7b91' },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12 },
  iconWrap: { width: 50, height: 50, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  icon: { width: 24, height: 24, tintColor: '#24566d' },
  itemTextWrap: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '900', color: '#24566d' },
  itemSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#5d7b91' },
});
