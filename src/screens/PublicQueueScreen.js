import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LiveQueueList from '../components/LiveQueueList';
import { getLiveQueue } from '../api/clinicService';

export default function PublicQueueScreen({ navigation }) {
  const [entries,setEntries]=React.useState([]); const [loading,setLoading]=React.useState(true); const [error,setError]=React.useState('');
  const load=React.useCallback(async()=>{try{setError('');setEntries(await getLiveQueue({publicOnly:true}));}catch(e){setError(e.response?.data?.message||'Unable to load the clinic queue.');}finally{setLoading(false);}},[]);
  React.useEffect(()=>{load();const timer=setInterval(load,5000);return()=>clearInterval(timer);},[load]);
  return <LinearGradient colors={['#f7fbfc','#eef7f8','#fff']} style={{flex:1}}><SafeAreaView style={{flex:1}}><View style={styles.header}><Text style={styles.brand}>PawCruz</Text><Text style={styles.title}>Public Queue</Text><Text style={styles.caption}>Read-only live clinic queue</Text></View><ScrollView contentContainerStyle={styles.content}><LiveQueueList entries={entries} loading={loading} error={error} publicMode/><TouchableOpacity style={styles.login} onPress={()=>navigation.navigate('login')}><Text style={styles.loginText}>Pet Owner / Veterinarian Login</Text></TouchableOpacity></ScrollView></SafeAreaView></LinearGradient>;
}
const styles=StyleSheet.create({header:{backgroundColor:'#447C99',padding:22},brand:{color:'#fff',fontSize:25,fontWeight:'900'},title:{color:'#fff',fontSize:18,fontWeight:'900',marginTop:10},caption:{color:'#e5f4f8',marginTop:3},content:{padding:18,paddingBottom:60},login:{borderWidth:1,borderColor:'#447C99',borderRadius:16,padding:14,alignItems:'center',marginTop:10},loginText:{fontWeight:'900',color:'#447C99'}});
