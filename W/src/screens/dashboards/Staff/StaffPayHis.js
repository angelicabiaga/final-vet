import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { styles as dashboardStyles } from '../../styles/StaffDashboardDesign';
import { getStaffPets } from './StaffPetsProfile';
import {
  OTHER_OPTION_VALUE,
  VISIT_REASONS,
  buildReasonSummary,
  getReasonDetailLabel,
  getReasonDetailOptions,
} from '../PetOwner/PetOwnerAppointmentData';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const STATUS_META = { Paid: { bg: '#e8f7ef', border: '#c8ead7', text: '#1d7a4d' } };
const PAYMENT_METHOD_OPTIONS = ['Cash', 'GCash', 'Bank Transfer'];
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
  { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'StaffAppointment' },
  { key: 'mypets', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
  { key: 'inventory', label: 'Inventory', icon: require('../../assets/Inventory_Icon.png'), route: 'StaffInventory' },
  { key: 'user-management', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'StaffUserManagement' },
  { key: 'payment-history', label: 'Payment History', icon: require('../../assets/payment_icon.png'), route: 'StaffPayHis' },
  { key: 'activity-logs', label: 'Activity Logs', icon: require('../../assets/Log_Icon.png'), route: 'StaffLogs' },
];
const INITIAL_RECORDS = [
  { id: 'payment-1', transactionId: 'TXN-0001', petReferenceCode: 'PET-0001', dateOfTransaction: 'April 11, 2026', petOwnerName: 'Maria Santos', petName: 'Bella', serviceAvailed: 'Vaccination', veterinarian: 'Dr. Cruz', amountPaid: 800, paymentMethod: 'Cash', paymentStatus: 'Paid', staffInCharge: 'Staff A', notes: 'Manual payment received at the clinic cashier.' },
  { id: 'payment-2', transactionId: 'TXN-0002', petReferenceCode: 'PET-0002', dateOfTransaction: 'April 11, 2026', petOwnerName: 'Jose Ramirez', petName: 'Coco', serviceAvailed: 'Consultation', veterinarian: 'Dr. Sarah Dela Cruz', amountPaid: 500, paymentMethod: 'Cash', paymentStatus: 'Paid', staffInCharge: 'Staff B', notes: '' },
];

const formatCurrency = (amount) => `PHP ${Number(amount || 0).toLocaleString()}`;
const getTodayLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const getNextTransactionId = (records) => `TXN-${String(records.reduce((highest, record) => {
  const parsed = Number.parseInt(String(record.transactionId || '').replace(/\D/g, ''), 10);
  return Number.isNaN(parsed) ? highest : Math.max(highest, parsed);
}, 0) + 1).padStart(4, '0')}`;
const buildSeedRecords = (staffUsername) => INITIAL_RECORDS.map((record) => ({
  ...record,
  staffInCharge: staffUsername || record.staffInCharge,
}));
const buildDraft = (staffName, records) => ({ transactionId: getNextTransactionId(records), selectedPetId: '', petReferenceCode: '', dateOfTransaction: getTodayLabel(), petOwnerName: '', petName: '', serviceReason: '', serviceDetail: '', customServiceDetail: '', serviceAvailed: '', veterinarian: '', amountPaid: '', paymentMethod: 'Cash', paymentStatus: 'Paid', staffInCharge: staffName || 'Staff', notes: '' });

const StaffPayHis = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const staffUsername = loggedInUser?.username || loggedInUser?.fullName || loggedInUser?.name || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);
  const [paymentRecords, setPaymentRecords] = useState(() => buildSeedRecords(staffUsername));
  const [searchQuery, setSearchQuery] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [isRecordModalVisible, setIsRecordModalVisible] = useState(false);
  const [recordSearchQuery, setRecordSearchQuery] = useState('');
  const [isPetPickerVisible, setIsPetPickerVisible] = useState(false);
  const [isServicePickerVisible, setIsServicePickerVisible] = useState(false);
  const [isServiceDetailPickerVisible, setIsServiceDetailPickerVisible] = useState(false);
  const [isVetPickerVisible, setIsVetPickerVisible] = useState(false);
  const [vetSearchQuery, setVetSearchQuery] = useState('');
  const [isPaymentMethodPickerVisible, setIsPaymentMethodPickerVisible] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState(() => buildDraft(staffUsername, buildSeedRecords(staffUsername)));
  const [draftError, setDraftError] = useState('');

  const availablePets = useMemo(() => getStaffPets(), [isRecordModalVisible]);
  const selectedServiceReason = useMemo(
    () => VISIT_REASONS.find((item) => item.value === paymentDraft.serviceReason) || null,
    [paymentDraft.serviceReason]
  );
  const serviceDetailOptions = useMemo(
    () => getReasonDetailOptions(paymentDraft.serviceReason),
    [paymentDraft.serviceReason]
  );
  const serviceDetailLabel = useMemo(
    () => getReasonDetailLabel(paymentDraft.serviceReason),
    [paymentDraft.serviceReason]
  );
  const selectedServiceDetail = useMemo(
    () => serviceDetailOptions.find((item) => item.value === paymentDraft.serviceDetail) || null,
    [paymentDraft.serviceDetail, serviceDetailOptions]
  );
  const isCustomServiceDetail = paymentDraft.serviceReason === 'consultation' && paymentDraft.serviceDetail === OTHER_OPTION_VALUE;
  const servicePreview = useMemo(() => {
    if (!paymentDraft.serviceReason) return '';
    const detailValue = isCustomServiceDetail ? paymentDraft.customServiceDetail.trim() : selectedServiceDetail?.label || '';
    return buildReasonSummary(paymentDraft.serviceReason, detailValue);
  }, [isCustomServiceDetail, paymentDraft.customServiceDetail, paymentDraft.serviceReason, selectedServiceDetail]);
  const filteredPetOptions = useMemo(() => {
    const query = recordSearchQuery.trim().toLowerCase();
    if (!query) return availablePets;
    return availablePets.filter((pet) => [pet.ownerName, pet.referenceCode, pet.name, pet.breed].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [availablePets, recordSearchQuery]);
  const veterinarianOptions = useMemo(() => {
    const derived = Array.from(new Set(
      availablePets
        .map((pet) => pet.veterinarianAssigned)
        .filter((value) => value && value !== 'Not yet assigned')
    ));
    return derived.length ? derived : ['Dr. Cruz', 'Dr. Sarah Dela Cruz', 'Dr. Michael Cruz'];
  }, [availablePets]);
  const filteredVeterinarianOptions = useMemo(() => {
    const query = vetSearchQuery.trim().toLowerCase();
    if (!query) return veterinarianOptions;
    return veterinarianOptions.filter((value) => String(value).toLowerCase().includes(query));
  }, [veterinarianOptions, vetSearchQuery]);
  const filteredPayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return paymentRecords;
    return paymentRecords.filter((payment) => [payment.transactionId, payment.petReferenceCode, payment.dateOfTransaction, payment.petOwnerName, payment.petName, payment.serviceAvailed, payment.veterinarian, payment.staffInCharge, payment.paymentMethod].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [paymentRecords, searchQuery]);
  const summaryCards = useMemo(() => {
    const totalCollected = paymentRecords.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const todayRecords = paymentRecords.filter((payment) => payment.dateOfTransaction === getTodayLabel()).length;
    return [
      { key: 'records', label: 'Total Records', value: paymentRecords.length, color: '#3d8fbd' },
      { key: 'collected', label: 'Cash Collected', value: formatCurrency(totalCollected), color: '#1d7a4d' },
      { key: 'today', label: 'Today', value: todayRecords, color: '#c78632' },
      { key: 'average', label: 'Average Sale', value: paymentRecords.length ? formatCurrency(Math.round(totalCollected / paymentRecords.length)) : formatCurrency(0), color: '#245f8e' },
    ];
  }, [paymentRecords]);

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: loggedInUser });
  };
  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) return;
    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      isHeaderMenuAnimating.current = false;
    });
  };
  const closeHeaderMenu = (onClosed) => {
    if (isHeaderMenuAnimating.current) return;
    if (!isHeaderMenuVisible) {
      onClosed?.();
      return;
    }
    isHeaderMenuAnimating.current = true;
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      onClosed?.();
    });
  };
  const toggleHeaderMenu = () => {
    if (isHeaderMenuVisible) {
      closeHeaderMenu();
      return;
    }
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    openHeaderMenu();
  };
  const handleHeaderMenuPress = (screenName) => {
    closeHeaderMenu(() => navigateWithUser(screenName));
  };
  const openRecordModal = () => { closeHeaderMenu(); setDraftError(''); setRecordSearchQuery(''); setIsPetPickerVisible(false); setIsServicePickerVisible(false); setIsServiceDetailPickerVisible(false); setIsVetPickerVisible(false); setVetSearchQuery(''); setIsPaymentMethodPickerVisible(false); setPaymentDraft(buildDraft(staffUsername, paymentRecords)); setIsRecordModalVisible(true); };
  const closeRecordModal = () => { setIsRecordModalVisible(false); setRecordSearchQuery(''); setIsPetPickerVisible(false); setIsServicePickerVisible(false); setIsServiceDetailPickerVisible(false); setIsVetPickerVisible(false); setVetSearchQuery(''); setIsPaymentMethodPickerVisible(false); setDraftError(''); };
  const handleDraftChange = (field, value) => { setPaymentDraft((current) => ({ ...current, [field]: value })); if (draftError) setDraftError(''); };
  const handleSelectPet = (pet) => { setPaymentDraft((current) => ({ ...current, selectedPetId: pet.id, petReferenceCode: pet.referenceCode || '', petOwnerName: pet.ownerName || current.petOwnerName, petName: pet.name || current.petName, veterinarian: pet.veterinarianAssigned && pet.veterinarianAssigned !== 'Not yet assigned' ? pet.veterinarianAssigned : current.veterinarian })); setRecordSearchQuery(`${pet.ownerName || 'Owner'} - ${pet.name || 'Pet'}${pet.referenceCode ? ` (${pet.referenceCode})` : ''}`); setVetSearchQuery(pet.veterinarianAssigned && pet.veterinarianAssigned !== 'Not yet assigned' ? pet.veterinarianAssigned : ''); setIsPetPickerVisible(false); };
  const handleSelectServiceReason = (reason) => {
    setPaymentDraft((current) => ({ ...current, serviceReason: reason.value, serviceDetail: '', customServiceDetail: '', serviceAvailed: reason.label }));
    setIsServicePickerVisible(false);
    setIsServiceDetailPickerVisible(false);
    if (draftError) setDraftError('');
  };
  const handleSelectServiceDetail = (detail) => {
    setPaymentDraft((current) => ({
      ...current,
      serviceDetail: detail.value,
      customServiceDetail: detail.value === OTHER_OPTION_VALUE ? current.customServiceDetail : '',
      serviceAvailed: current.serviceReason ? buildReasonSummary(current.serviceReason, detail.value === OTHER_OPTION_VALUE ? current.customServiceDetail.trim() : detail.label) : current.serviceAvailed,
    }));
    setIsServiceDetailPickerVisible(false);
    if (draftError) setDraftError('');
  };
  const handleSavePayment = () => {
    const amountPaid = Number.parseFloat(paymentDraft.amountPaid);
    const selectedDetail = getReasonDetailOptions(paymentDraft.serviceReason).find((item) => item.value === paymentDraft.serviceDetail) || null;
    const requiresDetail = Boolean(paymentDraft.serviceReason) && getReasonDetailOptions(paymentDraft.serviceReason).length > 0;
    const customServiceValue = paymentDraft.customServiceDetail.trim();
    const serviceDetailValue = isCustomServiceDetail ? customServiceValue : selectedDetail?.label || '';
    const serviceAvailed = paymentDraft.serviceReason ? buildReasonSummary(paymentDraft.serviceReason, serviceDetailValue) : '';
    if (!paymentDraft.dateOfTransaction.trim()) return setDraftError('Date of transaction is required.');
    if (!paymentDraft.petOwnerName.trim()) return setDraftError('Pet owner name is required.');
    if (!paymentDraft.petName.trim()) return setDraftError('Pet name is required.');
    if (!paymentDraft.serviceReason.trim()) return setDraftError('Service availed is required.');
    if (requiresDetail && !paymentDraft.serviceDetail.trim()) return setDraftError(`${serviceDetailLabel} is required.`);
    if (isCustomServiceDetail && !customServiceValue) return setDraftError('Please enter the consultation concern.');
    if (!paymentDraft.veterinarian.trim()) return setDraftError('Veterinarian is required.');
    if (Number.isNaN(amountPaid) || amountPaid <= 0) return setDraftError('Amount paid must be greater than 0.');
    if (!paymentDraft.staffInCharge.trim()) return setDraftError('Staff in charge is required.');
    setPaymentRecords((current) => [{ id: `payment-${Date.now()}`, transactionId: paymentDraft.transactionId, petReferenceCode: paymentDraft.petReferenceCode.trim(), dateOfTransaction: paymentDraft.dateOfTransaction.trim(), petOwnerName: paymentDraft.petOwnerName.trim(), petName: paymentDraft.petName.trim(), serviceAvailed: serviceAvailed.trim(), veterinarian: paymentDraft.veterinarian.trim(), amountPaid, paymentMethod: paymentDraft.paymentMethod.trim(), paymentStatus: 'Paid', staffInCharge: paymentDraft.staffInCharge.trim(), notes: paymentDraft.notes.trim() }, ...current]);
    closeRecordModal();
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
          <View style={dashboardStyles.headerTopRow}>
            <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigation.navigate('staff-screen', { user: loggedInUser })} activeOpacity={0.85}>
              <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
              <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Payment History</Text></View>
            </TouchableOpacity>
            <View style={dashboardStyles.headerActions}>
              <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigation.navigate('StaffNotif', { user: loggedInUser })} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
              <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigation.navigate('StaffProfile', { user: loggedInUser })} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
            </View>
          </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
                <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>
              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>Payment history</Text>
                <Text style={dashboardStyles.ownerName}>{displayName}</Text>
              </View>
            </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View
              style={[
                dashboardStyles.headerMenuPanel,
                {
                  opacity: headerMenuAnimation,
                  transform: [
                    {
                      translateY: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 0],
                      }),
                    },
                    {
                      scale: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {HEADER_MENU_ITEMS.map((item, index) => {
                const itemEnterStart = index * 0.08;
                const itemEnterMid = Math.min(itemEnterStart + 0.45, 0.99);
                const itemOpacity = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, itemEnterMid, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                });
                const itemTranslateY = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [14, 0],
                  extrapolate: 'clamp',
                });
                const itemScale = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [0.97, 1],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={item.key}
                    style={{
                      opacity: itemOpacity,
                      transform: [{ translateY: itemTranslateY }, { scale: itemScale }],
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        dashboardStyles.headerMenuItem,
                        index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast,
                      ]}
                      onPress={() => handleHeaderMenuPress(item.route)}
                      activeOpacity={0.88}
                    >
                      <View style={dashboardStyles.headerMenuItemIconWrap}>
                        <Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" />
                      </View>
                      <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.sectionHeaderWrap}><Text style={styles.sectionTitle}>Quick Overview</Text></View>
          <View style={styles.summaryGrid}>{summaryCards.map((item) => <View key={item.key} style={styles.summaryCard}><View style={[styles.summaryAccent, { backgroundColor: item.color }]} /><Text style={styles.summaryValue} numberOfLines={1}>{item.value}</Text><Text style={styles.summaryLabel}>{item.label}</Text></View>)}</View>
          <View style={styles.controlsCard}>
            <Text style={styles.controlsTitle}>Find Transactions</Text>
            <View style={styles.searchBarWrap}><Image source={require('../../assets/Search.png')} style={styles.searchIcon} resizeMode="contain" /><TextInput value={searchQuery} onChangeText={setSearchQuery} style={styles.searchInput} placeholder="Search transaction, pet ref, owner, pet, or staff" placeholderTextColor="#8aa2b4" /></View>
            <TouchableOpacity style={styles.recordButtonTouchArea} onPress={openRecordModal} activeOpacity={0.92}><LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recordButton}><View style={styles.recordButtonIconWrap}><Text style={styles.recordButtonPlus}>+</Text></View><Text style={styles.recordButtonText}>Record Paid Service</Text></LinearGradient></TouchableOpacity>
          </View>

          {filteredPayments.length ? <View style={styles.listWrap}><Text style={styles.listWrapTitle}>Service Transaction History</Text>{filteredPayments.map((payment) => {
            const statusMeta = STATUS_META[payment.paymentStatus];
            return <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentTopRow}>
                <View style={styles.paymentTextWrap}><Text style={styles.paymentTxnId}>{payment.transactionId}</Text><Text style={styles.paymentOwner}>{payment.petOwnerName}</Text><Text style={styles.paymentPet}>Pet: {payment.petName}</Text></View>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}><Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>{payment.paymentStatus}</Text></View>
              </View>
              <View style={styles.metaRow}><View style={styles.metaCard}><Text style={styles.metaLabel}>Pet Ref</Text><Text style={styles.metaValue}>{payment.petReferenceCode || 'No pet ref'}</Text></View><View style={styles.metaCard}><Text style={styles.metaLabel}>Date</Text><Text style={styles.metaValue}>{payment.dateOfTransaction}</Text></View></View>
              <View style={styles.metaRow}><View style={styles.metaCard}><Text style={styles.metaLabel}>Service</Text><Text style={styles.metaValue}>{payment.serviceAvailed}</Text></View><View style={styles.metaCard}><Text style={styles.metaLabel}>Veterinarian</Text><Text style={styles.metaValue}>{payment.veterinarian}</Text></View></View>
              <View style={styles.metaRow}><View style={styles.metaCard}><Text style={styles.metaLabel}>Amount Paid</Text><Text style={styles.metaValue}>{formatCurrency(payment.amountPaid)}</Text></View><View style={styles.metaCard}><Text style={styles.metaLabel}>Payment Method</Text><Text style={styles.metaValue}>{payment.paymentMethod}</Text></View></View>
              <View style={styles.metaRow}><View style={styles.metaCard}><Text style={styles.metaLabel}>Staff In Charge</Text><Text style={styles.metaValue}>{payment.staffInCharge}</Text></View><View style={styles.metaCard}><Text style={styles.metaLabel}>Status</Text><Text style={styles.metaValue}>{payment.paymentStatus}</Text></View></View>
              <View style={styles.noteCard}><Text style={styles.metaLabel}>Notes</Text><Text style={styles.noteText}>{payment.notes || 'No additional note recorded.'}</Text></View>
            </View>;
          })}</View> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No transaction found</Text><Text style={styles.emptyText}>Try another transaction ID, pet reference, owner, pet, or staff name.</Text></View>}
        </ScrollView>

        <Modal visible={isRecordModalVisible} transparent animationType="slide" onRequestClose={closeRecordModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}><View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Record Payment</Text><Text style={styles.modalSubtitle}>Manual cashier entry for a completed service payment.</Text></View><TouchableOpacity style={styles.modalCloseButton} onPress={closeRecordModal} activeOpacity={0.88}><Text style={styles.modalCloseText}>Close</Text></TouchableOpacity></View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.editorLabel}>Transaction ID</Text><TextInput value={paymentDraft.transactionId} editable={false} style={[styles.editorInput, styles.editorInputDisabled]} />
                <View style={styles.petLookupRow}>
                  <View style={styles.petLookupSearchField}><Text style={styles.editorLabel}>Search Pet / Owner</Text><TextInput value={recordSearchQuery} onChangeText={(value) => { setRecordSearchQuery(value); setIsPetPickerVisible(true); }} style={styles.editorInput} placeholder="Owner, pet reference, pet name" placeholderTextColor="#8aa2b4" onFocus={() => setIsPetPickerVisible(true)} /></View>
                  <View style={styles.petLookupSelectField}><Text style={styles.editorLabel}>Select Pet</Text><TouchableOpacity style={styles.petSelectButton} onPress={() => setIsPetPickerVisible((current) => !current)} activeOpacity={0.9}><Text style={styles.petSelectButtonText} numberOfLines={1}>{paymentDraft.petName || 'Choose'}</Text><Text style={styles.petSelectButtonIcon}>{isPetPickerVisible ? '^' : 'v'}</Text></TouchableOpacity></View>
                </View>
                {isPetPickerVisible ? <View style={styles.petPickerList}>{filteredPetOptions.length ? filteredPetOptions.map((pet) => <TouchableOpacity key={pet.id} style={[styles.petPickerItem, paymentDraft.selectedPetId === pet.id && styles.petPickerItemActive]} onPress={() => handleSelectPet(pet)} activeOpacity={0.9}><Text style={[styles.petPickerItemTitle, paymentDraft.selectedPetId === pet.id && styles.petPickerItemTitleActive]}>{pet.name || 'Unnamed Pet'}</Text><Text style={[styles.petPickerItemMeta, paymentDraft.selectedPetId === pet.id && styles.petPickerItemMetaActive]}>{pet.ownerName || 'No owner'}{pet.referenceCode ? ` - ${pet.referenceCode}` : ''}</Text></TouchableOpacity>) : <Text style={styles.petPickerEmpty}>No pet matched your search.</Text>}</View> : null}
                <Text style={styles.editorLabel}>Pet Reference No.</Text><TextInput value={paymentDraft.petReferenceCode} editable={false} style={[styles.editorInput, styles.editorInputDisabled]} />
                <Text style={styles.editorLabel}>Date of Transaction</Text><TextInput value={paymentDraft.dateOfTransaction} onChangeText={(value) => handleDraftChange('dateOfTransaction', value)} style={styles.editorInput} placeholder="April 11, 2026" placeholderTextColor="#8aa2b4" />
                <Text style={styles.editorLabel}>Pet Owner Name</Text><TextInput value={paymentDraft.petOwnerName} onChangeText={(value) => handleDraftChange('petOwnerName', value)} style={styles.editorInput} placeholder="Maria Santos" placeholderTextColor="#8aa2b4" />
                <Text style={styles.editorLabel}>Pet Name</Text><TextInput value={paymentDraft.petName} onChangeText={(value) => handleDraftChange('petName', value)} style={styles.editorInput} placeholder="Bella" placeholderTextColor="#8aa2b4" />
                <Text style={styles.editorLabel}>Service Availed</Text>
                <TouchableOpacity style={styles.selectorButton} onPress={() => { setIsServicePickerVisible((current) => !current); setIsServiceDetailPickerVisible(false); setIsVetPickerVisible(false); setIsPaymentMethodPickerVisible(false); }} activeOpacity={0.9}>
                  <Text style={styles.selectorButtonText}>{selectedServiceReason?.label || 'Choose service'}</Text>
                  <Text style={styles.selectorButtonIcon}>{isServicePickerVisible ? '^' : 'v'}</Text>
                </TouchableOpacity>
                {isServicePickerVisible ? (
                  <View style={styles.selectorList}>
                    {VISIT_REASONS.map((reason) => (
                      <TouchableOpacity key={reason.value} style={[styles.selectorListItem, paymentDraft.serviceReason === reason.value && styles.selectorListItemActive]} onPress={() => handleSelectServiceReason(reason)} activeOpacity={0.9}>
                        <Text style={[styles.selectorListItemText, paymentDraft.serviceReason === reason.value && styles.selectorListItemTextActive]}>{reason.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {paymentDraft.serviceReason ? (
                  <>
                    <Text style={styles.editorLabel}>{serviceDetailLabel}</Text>
                    <TouchableOpacity style={styles.selectorButton} onPress={() => { setIsServiceDetailPickerVisible((current) => !current); setIsServicePickerVisible(false); setIsVetPickerVisible(false); setIsPaymentMethodPickerVisible(false); }} activeOpacity={0.9}>
                      <Text style={styles.selectorButtonText}>
                        {isCustomServiceDetail
                          ? paymentDraft.customServiceDetail || `Select ${serviceDetailLabel.toLowerCase()}`
                          : selectedServiceDetail?.label || `Select ${serviceDetailLabel.toLowerCase()}`}
                      </Text>
                      <Text style={styles.selectorButtonIcon}>{isServiceDetailPickerVisible ? '^' : 'v'}</Text>
                    </TouchableOpacity>
                    {isServiceDetailPickerVisible ? (
                      <View style={styles.selectorList}>
                        {serviceDetailOptions.map((detail) => (
                          <TouchableOpacity key={detail.value} style={[styles.selectorListItem, paymentDraft.serviceDetail === detail.value && styles.selectorListItemActive]} onPress={() => handleSelectServiceDetail(detail)} activeOpacity={0.9}>
                            <Text style={[styles.selectorListItemText, paymentDraft.serviceDetail === detail.value && styles.selectorListItemTextActive]}>{detail.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    {isCustomServiceDetail ? <TextInput value={paymentDraft.customServiceDetail} onChangeText={(value) => handleDraftChange('customServiceDetail', value)} style={styles.editorInput} placeholder="Type consultation concern" placeholderTextColor="#8aa2b4" /> : null}
                    {servicePreview ? <View style={styles.servicePreviewCard}><Text style={styles.servicePreviewLabel}>Selected Service</Text><Text style={styles.servicePreviewValue}>{servicePreview}</Text></View> : null}
                  </>
                ) : null}
                <Text style={styles.editorLabel}>Veterinarian</Text>
                <TouchableOpacity style={styles.selectorButton} onPress={() => { setIsVetPickerVisible((current) => !current); setIsServicePickerVisible(false); setIsServiceDetailPickerVisible(false); setIsPaymentMethodPickerVisible(false); }} activeOpacity={0.9}>
                  <Text style={styles.selectorButtonText}>{paymentDraft.veterinarian || 'Choose veterinarian'}</Text>
                  <Text style={styles.selectorButtonIcon}>{isVetPickerVisible ? '^' : 'v'}</Text>
                </TouchableOpacity>
                {isVetPickerVisible ? (
                  <View style={styles.selectorList}>
                    <TextInput value={vetSearchQuery} onChangeText={setVetSearchQuery} style={styles.selectorSearchInput} placeholder="Search veterinarian" placeholderTextColor="#8aa2b4" />
                    {filteredVeterinarianOptions.length ? filteredVeterinarianOptions.map((value) => (
                      <TouchableOpacity key={value} style={[styles.selectorListItem, paymentDraft.veterinarian === value && styles.selectorListItemActive]} onPress={() => { handleDraftChange('veterinarian', value); setVetSearchQuery(value); setIsVetPickerVisible(false); }} activeOpacity={0.9}>
                        <Text style={[styles.selectorListItemText, paymentDraft.veterinarian === value && styles.selectorListItemTextActive]}>{value}</Text>
                      </TouchableOpacity>
                    )) : <Text style={styles.selectorEmptyText}>No veterinarian matched your search.</Text>}
                  </View>
                ) : null}
                <Text style={styles.editorLabel}>Amount Paid</Text><TextInput value={paymentDraft.amountPaid} onChangeText={(value) => handleDraftChange('amountPaid', value.replace(/[^0-9.]/g, ''))} style={styles.editorInput} placeholder="800" placeholderTextColor="#8aa2b4" keyboardType="decimal-pad" />
                <Text style={styles.editorLabel}>Payment Method</Text>
                <TouchableOpacity style={styles.selectorButton} onPress={() => { setIsPaymentMethodPickerVisible((current) => !current); setIsServicePickerVisible(false); setIsServiceDetailPickerVisible(false); setIsVetPickerVisible(false); }} activeOpacity={0.9}>
                  <Text style={styles.selectorButtonText}>{paymentDraft.paymentMethod || 'Choose payment method'}</Text>
                  <Text style={styles.selectorButtonIcon}>{isPaymentMethodPickerVisible ? '^' : 'v'}</Text>
                </TouchableOpacity>
                {isPaymentMethodPickerVisible ? (
                  <View style={styles.selectorList}>
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <TouchableOpacity key={method} style={[styles.selectorListItem, paymentDraft.paymentMethod === method && styles.selectorListItemActive]} onPress={() => { handleDraftChange('paymentMethod', method); setIsPaymentMethodPickerVisible(false); }} activeOpacity={0.9}>
                        <Text style={[styles.selectorListItemText, paymentDraft.paymentMethod === method && styles.selectorListItemTextActive]}>{method}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.editorLabel}>Payment Status</Text><TextInput value={paymentDraft.paymentStatus} editable={false} style={[styles.editorInput, styles.editorInputDisabled]} />
                <Text style={styles.editorLabel}>Staff In Charge</Text><TextInput value={paymentDraft.staffInCharge} editable={false} style={[styles.editorInput, styles.editorInputDisabled]} />
                <Text style={styles.editorLabel}>Notes (optional)</Text><TextInput value={paymentDraft.notes} onChangeText={(value) => handleDraftChange('notes', value)} style={[styles.editorInput, styles.editorInputMultiline]} placeholder="Optional cashier note" placeholderTextColor="#8aa2b4" multiline textAlignVertical="top" />
                {draftError ? <Text style={styles.editorErrorText}>{draftError}</Text> : null}
                <View style={styles.editorActionRow}><TouchableOpacity style={styles.editorSecondaryButton} onPress={closeRecordModal} activeOpacity={0.88}><Text style={styles.editorSecondaryButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.editorPrimaryButton} onPress={handleSavePayment} activeOpacity={0.88}><Text style={styles.editorPrimaryButtonText}>Save Record</Text></TouchableOpacity></View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1 }, container: { flex: 1, backgroundColor: 'transparent' }, profileButtonImage: { width: '100%', height: '100%' }, headerSummaryWrap: { flex: 1, alignItems: 'flex-end' }, scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 40 },
  sectionHeaderWrap: { marginBottom: 12, paddingHorizontal: 2 }, sectionTitle: { fontSize: 20, fontWeight: '800', color: '#24566d' }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 }, summaryCard: { width: '48%', backgroundColor: '#f8fcff', borderRadius: 20, borderWidth: 1, borderColor: '#dceef8', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, marginBottom: 12 }, summaryAccent: { width: 30, height: 5, borderRadius: 999, marginBottom: 10 }, summaryValue: { fontSize: 22, fontWeight: '900', color: '#24566d' }, summaryLabel: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#68869c' },
  controlsCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 14 }, controlsTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 12 }, searchBarWrap: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }, searchIcon: { width: 19, height: 19, tintColor: '#5f7f94', marginRight: 10 }, searchInput: { flex: 1, minHeight: 48, fontSize: 14, fontWeight: '700', color: '#24566d' },
  recordButtonTouchArea: { width: '100%', marginTop: 14, borderRadius: 20, shadowColor: '#88bddf', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 4 }, recordButton: { minHeight: 58, width: '100%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }, recordButtonIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, recordButtonPlus: { fontSize: 22, lineHeight: 24, fontWeight: '900', color: '#ffffff' }, recordButtonText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  listWrap: { marginTop: 8, marginBottom: 18 }, listWrapTitle: { fontSize: 18, fontWeight: '900', color: '#24566d', marginBottom: 12 }, paymentCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 }, paymentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }, paymentTextWrap: { flex: 1, marginRight: 12 }, paymentTxnId: { fontSize: 12, fontWeight: '900', color: '#3d8fbd' }, paymentOwner: { marginTop: 4, fontSize: 16, fontWeight: '900', color: '#24566d' }, paymentPet: { marginTop: 4, fontSize: 12, lineHeight: 18, color: '#68869c', fontWeight: '700' }, statusBadge: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' }, statusBadgeText: { fontSize: 11, fontWeight: '900' }, metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, metaCard: { width: '48.5%', backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', padding: 12 }, metaLabel: { fontSize: 11, fontWeight: '800', color: '#587286', textTransform: 'uppercase', marginBottom: 6 }, metaValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#24566d' }, noteCard: { backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', padding: 12 }, noteText: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
  emptyCard: { backgroundColor: '#f8fcff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 18, marginBottom: 18 }, emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 6 }, emptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#68869c' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(3, 25, 39, 0.55)', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 28 }, modalCard: { maxHeight: '84%', backgroundColor: '#fcfeff', borderRadius: 28, borderWidth: 1, borderColor: '#dceef8', overflow: 'hidden' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, backgroundColor: '#f8fcff', borderBottomWidth: 1, borderBottomColor: '#e1eff8' }, modalTitleWrap: { flex: 1, marginRight: 12 }, modalTitle: { fontSize: 18, fontWeight: '900', color: '#24566d' }, modalSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#68869c' }, modalCloseButton: { minHeight: 36, borderRadius: 999, backgroundColor: '#24566d', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 }, modalCloseText: { fontSize: 12, fontWeight: '900', color: '#ffffff' }, modalScrollContent: { padding: 18, paddingBottom: 24 },
  petLookupRow: { flexDirection: 'row', justifyContent: 'space-between' }, petLookupSearchField: { width: '64%' }, petLookupSelectField: { width: '33%' }, petSelectButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, petSelectButtonText: { flex: 1, marginRight: 8, fontSize: 13, fontWeight: '800', color: '#24566d' }, petSelectButtonIcon: { fontSize: 11, fontWeight: '900', color: '#24566d' }, petPickerList: { marginTop: -2, marginBottom: 14, backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', padding: 8 }, petPickerItem: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }, petPickerItemActive: { backgroundColor: '#24566d' }, petPickerItemTitle: { fontSize: 13, fontWeight: '900', color: '#24566d' }, petPickerItemTitleActive: { color: '#ffffff' }, petPickerItemMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#68869c' }, petPickerItemMetaActive: { color: '#d7ebf8' }, petPickerEmpty: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#68869c', paddingHorizontal: 10, paddingVertical: 8 },
  editorLabel: { fontSize: 12, fontWeight: '900', color: '#24566d', marginBottom: 8 }, editorInput: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#24566d', marginBottom: 14 }, editorInputDisabled: { backgroundColor: '#eef5fa', color: '#68869c' }, editorInputMultiline: { minHeight: 96, paddingTop: 14, paddingBottom: 14 },
  selectorButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, selectorButtonText: { flex: 1, marginRight: 8, fontSize: 14, fontWeight: '700', color: '#24566d' }, selectorButtonIcon: { fontSize: 11, fontWeight: '900', color: '#24566d' }, selectorList: { marginTop: -2, marginBottom: 14, backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', padding: 8 }, selectorListItem: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }, selectorListItemActive: { backgroundColor: '#24566d' }, selectorListItemText: { fontSize: 13, fontWeight: '800', color: '#24566d' }, selectorListItemTextActive: { color: '#ffffff' }, selectorSearchInput: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 12, fontSize: 13, fontWeight: '700', color: '#24566d', marginBottom: 8 }, selectorEmptyText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#68869c', paddingHorizontal: 10, paddingVertical: 8 }, servicePreviewCard: { marginBottom: 14, borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', backgroundColor: '#f8fcff', paddingHorizontal: 14, paddingVertical: 12 }, servicePreviewLabel: { fontSize: 11, fontWeight: '800', color: '#587286', textTransform: 'uppercase', marginBottom: 6 }, servicePreviewValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#24566d' },
  editorErrorText: { fontSize: 12, lineHeight: 18, color: '#b54234', fontWeight: '700', marginBottom: 14 }, editorActionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }, editorSecondaryButton: { width: '48%', minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: '#c8dce9', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }, editorSecondaryButtonText: { fontSize: 12, fontWeight: '900', color: '#24566d' }, editorPrimaryButton: { width: '48%', minHeight: 44, borderRadius: 16, backgroundColor: '#24566d', alignItems: 'center', justifyContent: 'center' }, editorPrimaryButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
});

export default StaffPayHis;
