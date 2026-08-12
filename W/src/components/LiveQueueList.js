import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const statusStyle = (status) => status === 'Serving' ? styles.serving : status === 'Completed' ? styles.completed : styles.waiting;

export default function LiveQueueList({ entries, loading, error, publicMode = false }) {
  if (loading && !entries.length) return <ActivityIndicator size="large" color="#447C99" style={{ marginTop: 36 }} />;
  if (error && !entries.length) return <View style={styles.empty}><Text style={styles.emptyTitle}>Queue unavailable</Text><Text style={styles.emptyText}>{error}</Text></View>;
  if (!entries.length) return <View style={styles.empty}><Text style={styles.emptyTitle}>No active queue</Text><Text style={styles.emptyText}>Queue entries will appear after Staff checks clients in.</Text></View>;

  const serving = entries.find((item) => item.status === 'Serving');
  return <>
    {serving ? <View style={styles.nowCard}><Text style={styles.nowLabel}>CURRENTLY SERVING</Text><Text style={styles.nowNumber}>{serving.queue_number || serving.queueNumber}</Text><Text style={styles.nowVet}>{serving.veterinarian_name || serving.veterinarian?.full_name || 'Veterinarian assigned at clinic'}</Text></View> : null}
    {entries.map((item) => <View key={item.id || item.queue_number} style={styles.card}>
      <View><Text style={styles.number}>{item.queue_number || item.queueNumber || '—'}</Text>{!publicMode && (item.pet?.pet_name || item.pet?.name) ? <Text style={styles.secondary}>{item.pet?.pet_name || item.pet?.name}</Text> : null}</View>
      <View style={[styles.badge, statusStyle(item.status)]}><Text style={styles.badgeText}>{item.status}</Text></View>
      <Text style={styles.vet}>{item.veterinarian_name || item.veterinarian?.full_name || 'Not assigned'}</Text>{!publicMode && Number.isFinite(item.clientsAhead) ? <Text style={styles.eta}>{item.clientsAhead} ahead · ~{item.estimatedWaitMinutes || 0} min</Text> : null}
    </View>)}
  </>;
}

const styles = StyleSheet.create({
  nowCard:{backgroundColor:'#24566d',borderRadius:24,padding:20,marginBottom:16,alignItems:'center'},nowLabel:{color:'#cce8f2',fontSize:11,fontWeight:'900'},nowNumber:{color:'#fff',fontSize:38,fontWeight:'900',marginVertical:5},nowVet:{color:'#fff',fontSize:13,fontWeight:'700'},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dceef8',borderRadius:20,padding:16,marginBottom:10},number:{fontSize:22,fontWeight:'900',color:'#24566d'},secondary:{fontSize:12,color:'#5d7b91',marginTop:3},badge:{position:'absolute',right:14,top:14,borderRadius:999,paddingHorizontal:11,paddingVertical:6},waiting:{backgroundColor:'#fff4d6'},serving:{backgroundColor:'#dff6e8'},completed:{backgroundColor:'#e8eef2'},badgeText:{fontSize:11,fontWeight:'900',color:'#24566d'},vet:{marginTop:10,fontSize:12,fontWeight:'700',color:'#5d7b91'},eta:{marginTop:5,fontSize:12,fontWeight:'800',color:'#447C99'},empty:{backgroundColor:'#fff',borderRadius:22,padding:24,alignItems:'center',borderWidth:1,borderColor:'#dceef8',marginTop:20},emptyTitle:{fontSize:17,fontWeight:'900',color:'#24566d'},emptyText:{marginTop:7,textAlign:'center',color:'#5d7b91',lineHeight:19}
});
