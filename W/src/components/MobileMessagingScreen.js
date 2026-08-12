import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform,
  SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  createConversation, getConversations, getMessageContacts, getMessages,
  markConversationRead, sendMessage, subscribeToMessages,
} from "../api/messageService";

const normalizeRole = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

export default function MobileMessagingScreen({ navigation, route, allowedRoles = [], title = "Messages", backRoute }) {
  const profile = route?.params?.user || {};
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [subject, setSubject] = useState("");

  const allowedKey = allowedRoles.map(normalizeRole).join("|");
  const allowed = useMemo(() => allowedKey ? allowedKey.split("|") : [], [allowedKey]);
  const roleAllowed = useCallback((role) => !allowed.length || allowed.includes(normalizeRole(role)), [allowed]);

  const conversationMatches = useCallback((conversation) => {
    if (!allowed.length) return true;
    return (conversation.participants || []).some((p) => p.id !== profile.id && roleAllowed(p.role));
  }, [allowed.length, profile.id, roleAllowed]);

  const loadOverview = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [conversationRows, contactRows] = await Promise.all([getConversations(profile), getMessageContacts(profile)]);
      setConversations((conversationRows || []).filter(conversationMatches));
      setContacts((contactRows || []).filter((contact) => roleAllowed(contact.role)));
    } catch (error) {
      Alert.alert("Messages", error.message || "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id, conversationMatches, roleAllowed]);

  useEffect(() => { setLoading(true); loadOverview(); }, [loadOverview]);

  const loadActive = useCallback(async () => {
    if (!activeConversation?.id || !profile?.id) return;
    try {
      setMessagesLoading(true);
      const rows = await getMessages(activeConversation.id);
      setMessages(rows || []);
      await markConversationRead(activeConversation.id, profile.id);
      await loadOverview();
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (error) {
      Alert.alert("Messages", error.message || "Unable to load the conversation.");
    } finally {
      setMessagesLoading(false);
    }
  }, [activeConversation?.id, profile?.id, loadOverview]);

  useEffect(() => {
    if (!activeConversation?.id) { setMessages([]); return undefined; }
    loadActive();
    const channel = subscribeToMessages(activeConversation.id, async () => { await loadActive(); });
    return () => { if (channel?.unsubscribe) channel.unsubscribe(); };
  }, [activeConversation?.id, loadActive]);

  const titleFor = (conversation) => {
    const others = (conversation.participants || []).filter((p) => p.id !== profile.id);
    const generated = others.map((p) => p.full_name || p.username || p.email).filter(Boolean).join(", ");
    if (conversation.subject && conversation.subject !== "New conversation") return conversation.subject;
    return generated || conversation.subject || "Conversation";
  };

  const createNew = async () => {
    if (!selectedContact?.id) return Alert.alert("New Conversation", "Choose a recipient first.");
    try {
      const conversation = await createConversation(profile, [selectedContact.id], subject || `Chat with ${selectedContact.full_name || "PawCruz"}`);
      setShowNew(false); setSelectedContact(null); setSubject("");
      await loadOverview();
      const refreshed = await getConversations(profile);
      setActiveConversation((refreshed || []).find((c) => c.id === conversation.id) || conversation);
    } catch (error) {
      Alert.alert("New Conversation", error.message || "Unable to create conversation.");
    }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (!result.canceled && result.assets?.[0]) setFile(result.assets[0]);
    } catch (error) { Alert.alert("Attachment", "Unable to select that file."); }
  };

  const submit = async () => {
    if (!activeConversation?.id || sending || (!body.trim() && !file)) return;
    try {
      setSending(true);
      await sendMessage(activeConversation.id, profile, body, file);
      setBody(""); setFile(null);
      await loadActive();
    } catch (error) {
      Alert.alert("Send Message", error.message || "Unable to send message.");
    } finally { setSending(false); }
  };

  const back = () => {
    if (activeConversation) { setActiveConversation(null); return; }
    if (backRoute) navigation.navigate(backRoute, { user: profile }); else navigation.goBack();
  };

  if (!profile?.id) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errorText}>Your login session is incomplete. Please log in again.</Text></View></SafeAreaView>;
  }

  return (
    <LinearGradient colors={["#eef9fb", "#f8fcfd", "#ffffff"]} style={styles.safe}>
      <SafeAreaView style={styles.safe}>
        <LinearGradient colors={["#214f67", "#447C99", "#63B6C5"]} style={styles.header}>
          <TouchableOpacity onPress={back} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{activeConversation ? titleFor(activeConversation) : title}</Text>
            <Text style={styles.headerSubtitle}>{activeConversation ? "Live conversation" : "PawCruz Message Center"}</Text>
          </View>
          {!activeConversation ? <TouchableOpacity onPress={() => setShowNew(true)} style={styles.newButton}><Text style={styles.newButtonText}>＋</Text></TouchableOpacity> : <View style={styles.headerSpacer} />}
        </LinearGradient>

        {!activeConversation ? (
          loading ? <View style={styles.center}><ActivityIndicator size="large" color="#447C99" /></View> :
          <FlatList
            data={conversations}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={conversations.length ? styles.listContent : styles.emptyContent}
            refreshing={loading}
            onRefresh={() => { setLoading(true); loadOverview(); }}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.emptyText}>Tap + to start a conversation.</Text><TouchableOpacity style={styles.primary} onPress={() => setShowNew(true)}><Text style={styles.primaryText}>Start Conversation</Text></TouchableOpacity></View>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.conversationCard} onPress={() => setActiveConversation(item)} activeOpacity={0.88}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{titleFor(item).charAt(0).toUpperCase()}</Text></View>
                <View style={styles.conversationBody}>
                  <View style={styles.row}><Text style={styles.conversationTitle} numberOfLines={1}>{titleFor(item)}</Text>{item.unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View> : null}</View>
                  <Text style={styles.preview} numberOfLines={1}>{item.latest?.body || item.latest?.attachment_name || "No messages yet"}</Text>
                  <Text style={styles.time}>{new Date(item.last_message_at || item.created_at).toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        ) : (
          <KeyboardAvoidingView
            style={styles.chatWrap}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            {messagesLoading ? <ActivityIndicator style={{ marginTop: 20 }} color="#447C99" /> : null}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                const mine = item.sender_id === profile.id;
                return <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  {!mine ? <Text style={styles.sender}>{item.sender?.full_name || "PawCruz User"}</Text> : null}
                  {item.body ? <Text style={styles.messageText}>{item.body}</Text> : null}
                  {item.attachment_url ? <TouchableOpacity onPress={() => Linking.openURL(item.attachment_url)}><Text style={styles.attachment}>📎 {item.attachment_name || "Attachment"}</Text></TouchableOpacity> : null}
                  <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>;
              }}
              ListEmptyComponent={!messagesLoading ? <View style={styles.emptyChat}><Text style={styles.emptyText}>No messages yet. Say hello.</Text></View> : null}
            />
            {file ? <View style={styles.fileBar}><Text style={styles.fileName} numberOfLines={1}>Attached: {file.name}</Text><TouchableOpacity onPress={() => setFile(null)}><Text style={styles.removeFile}>×</Text></TouchableOpacity></View> : null}
            <View style={styles.composer}>
              <TouchableOpacity style={styles.attachButton} onPress={pickAttachment} activeOpacity={0.8}>
                <Text style={styles.attachText}>＋</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                style={styles.inputTouchArea}
                onPress={() => inputRef.current?.focus()}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Type a message..."
                  placeholderTextColor="#8aa0af"
                  multiline
                  editable={!sending}
                  selectTextOnFocus={false}
                  blurOnSubmit={false}
                  textAlignVertical="top"
                  autoCorrect
                  autoCapitalize="sentences"
                  returnKeyType="default"
                  onFocus={() => requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }))}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendButton, (sending || (!body.trim() && !file)) && styles.sendButtonDisabled]}
                onPress={submit}
                disabled={sending || (!body.trim() && !file)}
                activeOpacity={0.8}
              >
                <Text style={styles.sendText}>{sending ? "…" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        <Modal visible={showNew} transparent animationType="fade" onRequestClose={() => setShowNew(false)}>
          <View style={styles.modalOverlay}><View style={styles.modalCard}>
            <View style={styles.row}><Text style={styles.modalTitle}>New Conversation</Text><TouchableOpacity onPress={() => setShowNew(false)}><Text style={styles.close}>×</Text></TouchableOpacity></View>
            <TextInput style={styles.subjectInput} value={subject} onChangeText={setSubject} placeholder="Subject (optional)" placeholderTextColor="#8aa0af" />
            <Text style={styles.recipientLabel}>Choose recipient</Text>
            <FlatList data={contacts} keyExtractor={(item) => String(item.id)} style={styles.contactsList}
              ListEmptyComponent={<Text style={styles.emptyText}>No active recipients found.</Text>}
              renderItem={({ item }) => <TouchableOpacity style={[styles.contactRow, selectedContact?.id === item.id && styles.contactSelected]} onPress={() => setSelectedContact(item)}>
                <View style={styles.avatarSmall}><Text style={styles.avatarSmallText}>{(item.full_name || item.username || "U").charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.contactName}>{item.full_name || item.username || item.email}</Text><Text style={styles.contactRole}>{String(item.role || "").replace(/_/g, " ")}{item.email ? ` • ${item.email}` : ""}</Text></View>
              </TouchableOpacity>}
            />
            <TouchableOpacity style={[styles.primary, !selectedContact && { opacity: 0.5 }]} onPress={createNew} disabled={!selectedContact}><Text style={styles.primaryText}>Create Conversation</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1}, header:{minHeight:92,paddingHorizontal:16,paddingVertical:14,flexDirection:"row",alignItems:"center"},
  headerButton:{width:44,height:44,borderRadius:16,borderWidth:1,borderColor:"#ffffff55",alignItems:"center",justifyContent:"center"},headerButtonText:{fontSize:36,lineHeight:38,color:"#fff",fontWeight:"500"},
  headerTextWrap:{flex:1,marginHorizontal:12},headerTitle:{fontSize:20,fontWeight:"900",color:"#fff"},headerSubtitle:{fontSize:12,fontWeight:"700",color:"#d9eef5",marginTop:3},
  newButton:{width:44,height:44,borderRadius:16,backgroundColor:"#ffffff22",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#ffffff55"},newButtonText:{fontSize:28,color:"#fff",fontWeight:"700"},headerSpacer:{width:44},
  center:{flex:1,alignItems:"center",justifyContent:"center",padding:25},errorText:{textAlign:"center",color:"#9b4242",fontWeight:"700"},listContent:{padding:16,paddingBottom:40},emptyContent:{flexGrow:1,padding:24,justifyContent:"center"},
  conversationCard:{flexDirection:"row",backgroundColor:"#fcfeff",borderRadius:22,borderWidth:1,borderColor:"#d9eaf1",padding:14,marginBottom:12,shadowColor:"#214f67",shadowOpacity:.05,shadowRadius:10,elevation:2},avatar:{width:50,height:50,borderRadius:18,backgroundColor:"#e2f3f6",alignItems:"center",justifyContent:"center",marginRight:12},avatarText:{fontSize:20,fontWeight:"900",color:"#2f6f86"},conversationBody:{flex:1},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},conversationTitle:{flex:1,fontSize:15,fontWeight:"900",color:"#244f64",marginRight:8},preview:{fontSize:13,color:"#668092",fontWeight:"600",marginTop:5},time:{fontSize:10,color:"#8da1ad",fontWeight:"700",marginTop:7},badge:{minWidth:24,height:24,borderRadius:12,backgroundColor:"#447C99",alignItems:"center",justifyContent:"center",paddingHorizontal:6},badgeText:{color:"#fff",fontSize:11,fontWeight:"900"},
  empty:{alignItems:"center"},emptyTitle:{fontSize:20,fontWeight:"900",color:"#24566d"},emptyText:{fontSize:13,color:"#728a99",fontWeight:"600",textAlign:"center",marginTop:7,marginBottom:16},primary:{backgroundColor:"#447C99",paddingVertical:13,paddingHorizontal:20,borderRadius:14,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},
  chatWrap:{flex:1},messagesContent:{padding:16,paddingBottom:20},bubble:{alignSelf:"flex-start",maxWidth:"82%",backgroundColor:"#fcfeff",borderRadius:18,borderTopLeftRadius:5,padding:12,marginBottom:10,borderWidth:1,borderColor:"#dfedf2"},bubbleMine:{alignSelf:"flex-end",backgroundColor:"#dff3f8",borderTopLeftRadius:18,borderTopRightRadius:5,borderColor:"#c6e5ed"},sender:{fontSize:10,fontWeight:"900",color:"#447C99",marginBottom:4},messageText:{fontSize:14,lineHeight:20,color:"#294b5d",fontWeight:"600"},messageTime:{fontSize:9,color:"#8499a5",marginTop:6},attachment:{fontSize:13,color:"#217ba7",fontWeight:"800",marginTop:4},emptyChat:{paddingTop:80,alignItems:"center"},
  composer:{flexDirection:"row",alignItems:"flex-end",paddingHorizontal:14,paddingTop:10,paddingBottom:Platform.OS === "ios" ? 10 : 12,borderTopWidth:1,borderColor:"#dbeaf0",backgroundColor:"#fcfeff",gap:8,zIndex:20,elevation:20},attachButton:{width:42,height:42,borderRadius:14,backgroundColor:"#edf6f8",alignItems:"center",justifyContent:"center"},attachText:{fontSize:25,color:"#447C99",fontWeight:"700"},inputTouchArea:{flex:1,minHeight:44,maxHeight:112,borderWidth:1,borderColor:"#cfe1e8",borderRadius:14,backgroundColor:"#fbfdfe",justifyContent:"center"},input:{width:"100%",minHeight:42,maxHeight:110,paddingHorizontal:12,paddingTop:11,paddingBottom:9,color:"#294b5d",fontSize:14,fontWeight:"600",backgroundColor:"transparent"},sendButton:{height:42,paddingHorizontal:15,borderRadius:14,backgroundColor:"#447C99",alignItems:"center",justifyContent:"center"},sendButtonDisabled:{opacity:.45},sendText:{color:"#fff",fontWeight:"900"},fileBar:{flexDirection:"row",alignItems:"center",paddingHorizontal:14,paddingVertical:8,backgroundColor:"#edf6f8"},fileName:{flex:1,fontSize:11,color:"#527489",fontWeight:"700"},removeFile:{fontSize:22,color:"#7b5960",fontWeight:"900",paddingHorizontal:8},
  modalOverlay:{flex:1,backgroundColor:"#17334499",justifyContent:"center",padding:20},modalCard:{backgroundColor:"#fcfeff",borderRadius:22,padding:18,maxHeight:"78%"},modalTitle:{fontSize:20,fontWeight:"900",color:"#24566d"},close:{fontSize:30,color:"#587687",fontWeight:"600",paddingHorizontal:6},subjectInput:{borderWidth:1,borderColor:"#cee2e9",borderRadius:12,padding:12,marginTop:14,color:"#294b5d"},recipientLabel:{fontSize:12,fontWeight:"900",color:"#567487",marginTop:15,marginBottom:7,textTransform:"uppercase"},contactsList:{maxHeight:340,marginBottom:14},contactRow:{flexDirection:"row",alignItems:"center",padding:10,borderRadius:14,borderWidth:1,borderColor:"#e1edf1",marginBottom:8},contactSelected:{backgroundColor:"#e8f6fa",borderColor:"#69aec1"},avatarSmall:{width:40,height:40,borderRadius:14,backgroundColor:"#e3f2f5",alignItems:"center",justifyContent:"center",marginRight:10},avatarSmallText:{fontWeight:"900",color:"#2d6b82"},contactName:{fontSize:14,fontWeight:"900",color:"#294f62"},contactRole:{fontSize:10,color:"#78909d",fontWeight:"700",marginTop:3,textTransform:"capitalize"},
});
