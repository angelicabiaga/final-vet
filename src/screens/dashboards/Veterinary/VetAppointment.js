import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { formatTime, getVeterinarianAppointments, todayLocal } from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';
import { formatDateTime12h } from '../../../utils/timeFormat';

const ALLOWED = ['Confirmed', 'Completed', 'Cancelled'];
const label = (value) => value || '—';
const getId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const formatDate = (value) => {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};
const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime12h(date);
};

export default function VetAppointment({ navigation, route }) {
  const user = getVetUser(route);
  const veterinarianId = getId(user);
  // Set when this screen is opened via the Appointments badge/menu item --
  // puts today's consultations first instead of the default recency order.
  const focusToday = Boolean(route?.params?.focusToday);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const displayItems = React.useMemo(() => {
    if (!focusToday) return items;
    const today = todayLocal();
    return [...items].sort((a, b) => {
      const todayA = a.appointment_date === today;
      const todayB = b.appointment_date === today;
      if (todayA !== todayB) return todayA ? -1 : 1;
      return 0;
    });
  }, [items, focusToday]);

  const load = React.useCallback(async () => {
    try {
      setError('');
      const data = await getVeterinarianAppointments(veterinarianId);
      setItems(data.filter((item) => ALLOWED.includes(item.status)));
    } catch (e) {
      setError(e.message || 'Unable to load assigned appointments.');
    } finally {
      setLoading(false);
    }
  }, [veterinarianId]);

  React.useEffect(() => {
    load();
    if (!veterinarianId) return undefined;
    const channel = supabase
      .channel(`mobile-vet-appointments-${veterinarianId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `veterinarian_id=eq.${veterinarianId}` },
        load
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, veterinarianId]);

  return <VetShell navigation={navigation} route={route} subtitle="My Appointments" caption="Assigned clinic schedule">
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.helper}>Appointments use the same PawCruz web data and 10-minute scheduling flow. This veterinarian view is read-only; Staff controls appointment status and clinic check-in.</Text>
      {loading && !items.length ? <ActivityIndicator size="large" color="#447C99" /> : null}
      {error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Appointments unavailable</Text><Text style={styles.emptyText}>{error}</Text></View> : null}
      {!loading && !error && !items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>No assigned appointments</Text><Text style={styles.emptyText}>Assigned appointments will appear here automatically.</Text></View> : null}
      {displayItems.map((item) => <View key={item.id} style={styles.card}>
        <View style={styles.row}><Text style={styles.pet}>{label(item.pet?.pet_name)}</Text><Text style={[styles.status, item.status === 'Cancelled' && styles.cancelled, item.status === 'Completed' && styles.completed]}>{item.status}</Text></View>
        <Info label="Pet Owner" value={label(item.owner?.full_name)} />
        <Info label="Veterinarian" value={label(item.veterinarian?.full_name)} />
        <Info label="Date" value={formatDate(item.appointment_date)} />
        <Info label="Start Time" value={formatTime(item.start_time)} />
        <Info label="End Time" value={formatTime(item.end_time)} />
        <Info label="Appointment Source" value={label(item.appointment_source)} />
        <Info label="Consultation Type" value={label(item.consultation_type)} />
        <Info label="Visit Reason" value={label(item.visit_reason)} />
        <Info label="Notes" value={label(item.notes)} />
        <Info label="Status" value={label(item.status)} />
        <Info label="Created By" value={label(item.creator?.full_name || item.creator?.username || item.created_by)} />
        <Info label="Created Date" value={formatTimestamp(item.created_at)} />
        <Info label="Updated Date" value={formatTimestamp(item.updated_at)} />
      </View>)}
    </ScrollView>
  </VetShell>;
}

function Info({ label: title, value }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{title}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content:{padding:18,paddingBottom:110},
  helper:{backgroundColor:'#e9f6fa',borderRadius:18,padding:14,color:'#466d80',fontSize:12,lineHeight:18,fontWeight:'700',marginBottom:14},
  card:{backgroundColor:'#fff',borderRadius:22,borderWidth:1,borderColor:'#dceef8',padding:16,marginBottom:12},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  pet:{fontSize:18,fontWeight:'900',color:'#24566d',flex:1},
  status:{backgroundColor:'#e7f6f8',color:'#447C99',fontWeight:'900',fontSize:11,paddingHorizontal:10,paddingVertical:6,borderRadius:999},
  cancelled:{backgroundColor:'#fde8e8',color:'#a74646'}, completed:{backgroundColor:'#e8eefc',color:'#4567a6'},
  infoRow:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingVertical:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#e6eef2'},
  infoLabel:{flex:.42,color:'#78909b',fontSize:12,fontWeight:'600'}, infoValue:{flex:.58,color:'#365f72',fontSize:12,fontWeight:'800',textAlign:'right'},
  empty:{backgroundColor:'#fff',borderRadius:22,padding:24,alignItems:'center',borderWidth:1,borderColor:'#dceef8'},
  emptyTitle:{fontSize:17,fontWeight:'900',color:'#24566d'}, emptyText:{marginTop:7,textAlign:'center',color:'#5d7b91'}
});
