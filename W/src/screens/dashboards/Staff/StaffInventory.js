import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/StaffDashboardDesign';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const CATEGORY_OPTIONS = ['All', 'Vaccines', 'Test Kits', 'Medicines', 'Supplements', 'Others'];
const ITEM_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((category) => category !== 'All');
const EXPIRING_SOON_DAYS = 30;
const HEADER_MENU_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: require('../../assets/Dashboard_Icon.png'),
    route: 'staff-screen',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    icon: require('../../assets/Appointment_Icon.png'),
    route: 'StaffAppointment',
  },
  {
    key: 'mypets',
    label: 'Pets Profile',
    icon: require('../../assets/Pets_Icon.png'),
    route: 'StaffPetsProfile',
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: require('../../assets/Message_Icon.png'),
    route: 'StaffMessages',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: require('../../assets/Inventory_Icon.png'),
    route: 'StaffInventory',
  },
  {
    key: 'user-management',
    label: 'User Management',
    icon: require('../../assets/UserManagement_Icon.png'),
    route: 'StaffUserManagement',
  },
  {
    key: 'payment-history',
    label: 'Payment History',
    icon: require('../../assets/payment_icon.png'),
    route: 'StaffPayHis',
  },
  {
    key: 'activity-logs',
    label: 'Activity Logs',
    icon: require('../../assets/Log_Icon.png'),
    route: 'StaffActivityLogs',
  },
];

const INVENTORY_ITEMS = [
  { id: 'inv-1', itemName: 'Vanguard 5 in 1', category: 'Vaccines', stockQuantity: 3, unit: 'vials', expirationDate: '2026-07-18', status: 'Available', supplier: 'Zoetis Philippines' },
  { id: 'inv-2', itemName: 'Anti-Rabies Vaccine', category: 'Vaccines', stockQuantity: 0, unit: 'vials', expirationDate: '2026-10-24', status: 'Out of Stock', supplier: 'Boehringer Ingelheim' },
  { id: 'inv-3', itemName: 'Feline 4 in 1 Vaccine', category: 'Vaccines', stockQuantity: 8, unit: 'vials', expirationDate: '2026-04-22', status: 'Available', supplier: 'Merial Animal Health' },
  { id: 'inv-4', itemName: 'Canine Parvo Test Kit', category: 'Test Kits', stockQuantity: 2, unit: 'kits', expirationDate: '2026-08-30', status: 'Low Stock', supplier: 'Vet Diagnostix' },
  { id: 'inv-5', itemName: 'Heartworm Rapid Test', category: 'Test Kits', stockQuantity: 7, unit: 'kits', expirationDate: '2026-03-15', status: 'Expired', supplier: 'SNAP Diagnostics' },
  { id: 'inv-6', itemName: 'Bravecto', category: 'Medicines', stockQuantity: 18, unit: 'tablets', expirationDate: '2026-11-12', status: 'Available', supplier: 'MSD Animal Health' },
  { id: 'inv-7', itemName: 'Amoxicillin Suspension', category: 'Medicines', stockQuantity: 4, unit: 'bottles', expirationDate: '2026-07-02', status: 'Low Stock', supplier: 'Univet Pharma' },
  { id: 'inv-8', itemName: 'Doxycycline', category: 'Medicines', stockQuantity: 0, unit: 'tablets', expirationDate: '2026-12-01', status: 'Out of Stock', supplier: 'Vetoquinol' },
  { id: 'inv-9', itemName: 'Multivitamin Syrup', category: 'Supplements', stockQuantity: 5, unit: 'bottles', expirationDate: '2026-04-24', status: 'Low Stock', supplier: 'NutriPets Supply' },
  { id: 'inv-10', itemName: 'Calcium Chews', category: 'Supplements', stockQuantity: 11, unit: 'packs', expirationDate: '2026-10-19', status: 'Available', supplier: 'PetWell Distribution' },
  { id: 'inv-11', itemName: 'Syringes 3mL', category: 'Others', stockQuantity: 14, unit: 'boxes', expirationDate: '2027-01-30', status: 'Available', supplier: 'Medline Vet Supply' },
  { id: 'inv-12', itemName: 'IV Catheter 22G', category: 'Others', stockQuantity: 1, unit: 'packs', expirationDate: '2026-06-08', status: 'Low Stock', supplier: 'Petline Essentials' },
];

const REORDER_BASE = {
  Vaccines: 20,
  'Test Kits': 12,
  Medicines: 30,
  Supplements: 24,
  Others: 15,
};

const STATUS_META = {
  Available: { bg: '#e8f7ef', border: '#c8ead7', text: '#1d7a4d' },
  'Low Stock': { bg: '#fff4e6', border: '#ffd6ab', text: '#a05a00' },
  'Out of Stock': { bg: '#ffe9e7', border: '#f4c3be', text: '#b54234' },
  Expired: { bg: '#fdecef', border: '#f0c6d0', text: '#b03d63' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const getDaysUntilExpiration = (expirationDate) =>
  Math.floor((startOfDay(new Date(expirationDate)) - startOfDay(new Date())) / (1000 * 60 * 60 * 24));
const formatDateLabel = (expirationDate) => {
  const date = new Date(expirationDate);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};
const formatShortDateLabel = (expirationDate) => {
  const date = new Date(expirationDate);
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const getComputedStatus = (item) => {
  const days = getDaysUntilExpiration(item.expirationDate);
  if (days < 0) return 'Expired';
  if (item.stockQuantity === 0) return 'Out of Stock';
  if (item.stockQuantity <= 5) return 'Low Stock';
  return 'Available';
};

const enrichItem = (item) => {
  const daysUntilExpiration = getDaysUntilExpiration(item.expirationDate);
  return {
    ...item,
    computedStatus: getComputedStatus(item),
    daysUntilExpiration,
    isNearExpiry: daysUntilExpiration >= 0 && daysUntilExpiration <= EXPIRING_SOON_DAYS,
  };
};

const getSuggestionQuantity = (item) => REORDER_BASE[item.category] || 15;

const getItemNote = (item) => {
  if (item.computedStatus === 'Expired') return `Expired on ${formatDateLabel(item.expirationDate)}. Review replacement.`;
  if (item.computedStatus === 'Out of Stock') return 'Currently unavailable. Restocking is recommended.';
  if (item.computedStatus === 'Low Stock') return `${item.stockQuantity} ${item.unit} remaining. Plan a reorder soon.`;
  if (item.isNearExpiry) return `Near expiry on ${formatDateLabel(item.expirationDate)}. Prioritize review.`;
  return 'Stock is stable for routine clinic use.';
};

const getCompactItemNote = (item) => {
  if (item.computedStatus === 'Expired') return 'Expired. Replace soon.';
  if (item.computedStatus === 'Out of Stock') return 'Out of stock. Reorder now.';
  if (item.computedStatus === 'Low Stock') return 'Low stock. Refill soon.';
  if (item.isNearExpiry) return 'Near expiry. Use first.';
  return 'Stock looks okay.';
};

const getItemPriority = (item) => {
  if (item.computedStatus === 'Expired') return 0;
  if (item.computedStatus === 'Out of Stock') return 1;
  if (item.computedStatus === 'Low Stock') return 2;
  if (item.isNearExpiry) return 3;
  return 4;
};

const buildEditorForm = (item) => ({
  itemName: item?.itemName || '',
  category: item?.category || ITEM_CATEGORY_OPTIONS[0],
  stockQuantity: item ? String(item.stockQuantity) : '',
  unit: item?.unit || '',
  expirationDate: item?.expirationDate || '',
  supplier: item?.supplier || '',
});

const isValidDateInput = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00`);

  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
};

const StaffInventory = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const scrollViewRef = useRef(null);
  const manageItemsOffset = useRef(0);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [inventoryItems, setInventoryItems] = useState(INVENTORY_ITEMS);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeQuickFilter, setActiveQuickFilter] = useState('total');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryListVisible, setIsCategoryListVisible] = useState(false);
  const [viewedItem, setViewedItem] = useState(null);
  const [editorMode, setEditorMode] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editorForm, setEditorForm] = useState(() => buildEditorForm());
  const [editorError, setEditorError] = useState('');

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: currentUser });
  };

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) {
      return;
    }

    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
    });
  };

  const closeHeaderMenu = (onClosed) => {
    if (isHeaderMenuAnimating.current) {
      return;
    }

    if (!isHeaderMenuVisible) {
      onClosed?.();
      return;
    }

    isHeaderMenuAnimating.current = true;
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
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

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;

    if (isLowerHeaderVisible.current === shouldBeVisible) {
      return;
    }

    isLowerHeaderVisible.current = shouldBeVisible;
    lowerHeaderAnimation.stopAnimation();
    Animated.timing(lowerHeaderAnimation, {
      toValue,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;

    if (currentScrollY > lastScrollY.current + 4 && currentScrollY > 8) {
      if (isHeaderMenuVisible) {
        closeHeaderMenu(() => animateLowerHeader(0));
        lastScrollY.current = currentScrollY;
        return;
      }

      animateLowerHeader(0);
    } else if (currentScrollY < lastScrollY.current - 4 || currentScrollY <= 0) {
      animateLowerHeader(1);
    }

    lastScrollY.current = currentScrollY;
  };

  const handleManageItemsLayout = (event) => {
    manageItemsOffset.current = event.nativeEvent.layout.y;
  };

  const scrollToManageItems = () => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(manageItemsOffset.current - 12, 0),
      animated: true,
    });
  };

  const handleQuickFilterPress = (filterKey) => {
    setActiveQuickFilter(filterKey);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToManageItems();
      });
    });
  };

  const openAddItemModal = () => {
    setIsCategoryListVisible(false);
    setEditorMode('add');
    setEditingItemId(null);
    setEditorForm(buildEditorForm());
    setEditorError('');
  };

  const openEditItemModal = (item) => {
    if (!item) {
      return;
    }

    setIsCategoryListVisible(false);
    setViewedItem(null);
    setEditorMode('edit');
    setEditingItemId(item.id);
    setEditorForm(buildEditorForm(item));
    setEditorError('');
  };

  const closeEditorModal = () => {
    setEditorMode(null);
    setEditingItemId(null);
    setEditorForm(buildEditorForm());
    setEditorError('');
  };

  const handleEditorFieldChange = (field, value) => {
    setEditorForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (editorError) {
      setEditorError('');
    }
  };

  const handleSaveItem = () => {
    const itemName = editorForm.itemName.trim();
    const unit = editorForm.unit.trim();
    const expirationDate = editorForm.expirationDate.trim();
    const supplier = editorForm.supplier.trim();

    if (!itemName) {
      setEditorError('Item name is required.');
      return;
    }

    if (!editorForm.category) {
      setEditorError('Please choose a category.');
      return;
    }

    if (editorForm.stockQuantity === '') {
      setEditorError('Stock quantity is required.');
      return;
    }

    const stockQuantity = Number.parseInt(editorForm.stockQuantity, 10);

    if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
      setEditorError('Stock quantity must be 0 or higher.');
      return;
    }

    if (!unit) {
      setEditorError('Unit is required.');
      return;
    }

    if (!isValidDateInput(expirationDate)) {
      setEditorError('Expiration date must use YYYY-MM-DD.');
      return;
    }

    const savedItem = {
      id: editingItemId || `inv-${Date.now()}`,
      itemName,
      category: editorForm.category,
      stockQuantity,
      unit,
      expirationDate,
      status: getComputedStatus({ stockQuantity, expirationDate }),
      supplier,
    };

    setInventoryItems((current) => (
      editorMode === 'edit'
        ? current.map((item) => (item.id === editingItemId ? savedItem : item))
        : [savedItem, ...current]
    ));
    setActiveCategory('All');
    setActiveQuickFilter('total');
    setSearchQuery('');
    const savedItemPreview = editorMode === 'edit' ? enrichItem(savedItem) : null;
    closeEditorModal();

    if (savedItemPreview) {
      setViewedItem(savedItemPreview);
    }
  };

  const handleCategorySelect = (category) => {
    setActiveCategory(category);
    setIsCategoryListVisible(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToManageItems();
      });
    });
  };

  const allItems = useMemo(() => inventoryItems.map(enrichItem), [inventoryItems]);
  const items = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...allItems]
      .filter((item) => {
        const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
        const matchesQuickFilter =
          activeQuickFilter === 'total'
          || (activeQuickFilter === 'in-stock' && item.computedStatus === 'Available')
          || (activeQuickFilter === 'low' && item.computedStatus === 'Low Stock')
          || (activeQuickFilter === 'out' && item.computedStatus === 'Out of Stock');

        if (!matchesCategory || !matchesQuickFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return [
          item.itemName,
          item.category,
          item.computedStatus,
          item.supplier || '',
          item.unit,
        ].some((value) => String(value).toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        const priorityDifference = getItemPriority(left) - getItemPriority(right);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        if (left.daysUntilExpiration !== right.daysUntilExpiration) {
          return left.daysUntilExpiration - right.daysUntilExpiration;
        }

        return left.itemName.localeCompare(right.itemName);
      });
  }, [activeCategory, activeQuickFilter, allItems, searchQuery]);

  const summaryCards = useMemo(() => {
    const counts = allItems.reduce(
      (totals, item) => {
        totals.totalProducts += 1;

        if (item.computedStatus === 'Available') {
          totals.inStock += 1;
        }

        if (item.computedStatus === 'Low Stock') {
          totals.lowStock += 1;
        }

        if (item.computedStatus === 'Out of Stock') {
          totals.outOfStock += 1;
        }

        return totals;
      },
      {
        totalProducts: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
      },
    );

    return [
      { key: 'total', label: 'Total Products', value: counts.totalProducts, color: '#2d7fb3' },
      { key: 'in-stock', label: 'In Stock', value: counts.inStock, color: '#1d7a4d' },
      { key: 'low', label: 'Low Stock', value: counts.lowStock, color: '#c78632' },
      { key: 'out', label: 'Out of Stock', value: counts.outOfStock, color: '#b54234' },
    ];
  }, [allItems]);
  const closeViewedItem = () => setViewedItem(null);

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dashboardStyles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dashboardStyles.headerTopBand}
          >
            <View style={dashboardStyles.headerTopRow}>
            <TouchableOpacity
              style={dashboardStyles.brandSection}
              onPress={() => navigateWithUser('staff-screen')}
              activeOpacity={0.85}
            >
              <View style={dashboardStyles.logoWrap}>
                <Image
                  source={require('../../assets/paw1.png')}
                  style={dashboardStyles.headerLogo}
                  resizeMode="contain"
                />
              </View>

              <View style={dashboardStyles.brandBlock}>
                <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                <Text style={dashboardStyles.headerSubtitle}>Inventory</Text>
              </View>
            </TouchableOpacity>

            <View style={dashboardStyles.headerActions}>
              <TouchableOpacity
                style={dashboardStyles.notifButton}
                onPress={() => navigateWithUser('StaffNotif')}
                activeOpacity={0.85}
              >
                <View style={dashboardStyles.notifBadge} />
                <Image
                  source={require('../../assets/Bell_Icon.png')}
                  style={dashboardStyles.notifIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={dashboardStyles.profileButton}
                onPress={() => navigateWithUser('StaffProfile')}
                activeOpacity={0.85}
              >
                {profileImageUri ? (
                  <Image
                    source={{ uri: profileImageUri }}
                    style={styles.profileButtonImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={DEFAULT_PROFILE_IMAGE}
                    style={dashboardStyles.profileIcon}
                    resizeMode="contain"
                  />
                )}
              </TouchableOpacity>
            </View>
            </View>
          </LinearGradient>

          <Animated.View
            style={[
              dashboardStyles.headerBottomRowWrap,
              {
                maxHeight: lowerHeaderAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 96],
                }),
                opacity: lowerHeaderAnimation,
                transform: [
                  {
                    translateY: lowerHeaderAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity
                style={dashboardStyles.menuTriggerButton}
                onPress={toggleHeaderMenu}
                activeOpacity={0.85}
              >
                <Image
                  source={require('../../assets/List.png')}
                  style={dashboardStyles.menuTriggerIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>Inventory Monitoring</Text>
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
                        index === HEADER_MENU_ITEMS.length - 1 &&
                          dashboardStyles.headerMenuItemLast,
                      ]}
                      onPress={() => handleHeaderMenuPress(item.route)}
                      activeOpacity={0.88}
                    >
                      <View style={dashboardStyles.headerMenuItemIconWrap}>
                        <Image
                          source={item.icon}
                          style={dashboardStyles.headerMenuItemIcon}
                          resizeMode="contain"
                        />
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
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Quick View</Text>
          </View>

          <View style={styles.overviewCard}>
            
            <View style={styles.summaryGrid}>
              {summaryCards.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.summaryCard,
                    activeQuickFilter === item.key && styles.summaryCardActive,
                  ]}
                  onPress={() => handleQuickFilterPress(item.key)}
                  activeOpacity={0.9}
                >
                  <View style={[styles.summaryAccent, { backgroundColor: item.color }]} />
                  <Text style={styles.summaryValue}>{item.value}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlsCard}>
            <View style={styles.controlsHeaderRow}>
              <View style={styles.controlsTitleWrap}>
                <Text style={[styles.panelTitle, styles.controlsTitle]}>Find Items</Text>
              </View>

              <View style={styles.categoryFilterWrap}>
                <Text style={styles.categoryFilterLabel}>Category</Text>
                <TouchableOpacity
                  style={styles.categoryDropdownButton}
                  onPress={() => setIsCategoryListVisible((current) => !current)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.categoryDropdownText}>{activeCategory}</Text>
                  <Text style={styles.categoryDropdownIcon}>
                    {isCategoryListVisible ? '^' : 'v'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isCategoryListVisible ? (
              <View style={styles.categoryDropdownList}>
                {CATEGORY_OPTIONS.map((category) => {
                  const isActive = activeCategory === category;

                  return (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryDropdownItem,
                        isActive && styles.categoryDropdownItemActive,
                      ]}
                      onPress={() => handleCategorySelect(category)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.categoryDropdownItemText,
                          isActive && styles.categoryDropdownItemTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.searchBarWrap, styles.searchBarWrapSpaced]}>
              <Image source={require('../../assets/Search.png')} style={styles.searchIcon} resizeMode="contain" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholder="Search item or supplier"
                placeholderTextColor="#8aa2b4"
                onFocus={() => setIsCategoryListVisible(false)}
              />
            </View>

            <TouchableOpacity
              style={styles.addItemButtonTouchArea}
              onPress={openAddItemModal}
              activeOpacity={0.92}
            >
              <LinearGradient
                colors={['#1f4e66', '#447C99', '#63B6C5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.addItemButton}
              >
                <View style={styles.addItemIconWrap}>
                  <Text style={styles.addItemPlus}>+</Text>
                </View>
                <Text style={styles.addItemButtonText}>Add Item</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View onLayout={handleManageItemsLayout}>
            {items.length ? (
              <View style={styles.listWrap}>
                <Text style={styles.listWrapTitle}>Manage Items</Text>
                <Text style={styles.listWrapSubtitle}>Short list now. Full info in View.</Text>

                {items.map((item) => {
                  const statusMeta = STATUS_META[item.computedStatus];

                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        <View style={styles.itemTextWrap}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {item.itemName}
                          </Text>
                          <Text style={styles.itemSub} numberOfLines={1}>
                            {item.category} - {item.supplier || 'No supplier'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: statusMeta.bg,
                              borderColor: statusMeta.border,
                            },
                          ]}
                        >
                          <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>
                            {item.computedStatus}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.itemMetaRow}>
                        <View style={styles.itemMetaCard}>
                          <Text style={styles.itemMetaLabel}>Qty</Text>
                          <Text style={styles.itemMetaValue}>
                            {item.stockQuantity} {item.unit}
                          </Text>
                        </View>

                        <View style={styles.itemMetaCard}>
                          <Text style={styles.itemMetaLabel}>Exp</Text>
                          <Text style={styles.itemMetaValue}>
                            {formatShortDateLabel(item.expirationDate)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.itemFooterRow}>
                        <Text style={styles.itemNote} numberOfLines={2}>
                          {getCompactItemNote(item)}
                        </Text>

                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() => setViewedItem(item)}
                          activeOpacity={0.88}
                        >
                          <Text style={styles.viewButtonText}>View</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No items found</Text>
                <Text style={styles.emptyText}>Try another search or category.</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Modal visible={Boolean(viewedItem)} transparent animationType="fade" onRequestClose={closeViewedItem}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>{viewedItem?.itemName}</Text>
                  <Text style={styles.modalSubtitle}>{viewedItem?.category}</Text>
                </View>
                <View style={styles.modalHeaderActions}>
                  <TouchableOpacity
                    style={styles.modalEditButton}
                    onPress={() => openEditItemModal(viewedItem)}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.modalEditText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={closeViewedItem}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
                {viewedItem ? (
                  <>
                    <View style={styles.modalBadgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: STATUS_META[viewedItem.computedStatus].bg,
                            borderColor: STATUS_META[viewedItem.computedStatus].border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: STATUS_META[viewedItem.computedStatus].text },
                          ]}
                        >
                          {viewedItem.computedStatus}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalInfoGrid}>
                      <View style={styles.modalInfoCard}>
                        <Text style={styles.modalInfoLabel}>Qty</Text>
                        <Text style={styles.modalInfoValue}>
                          {viewedItem.stockQuantity} {viewedItem.unit}
                        </Text>
                      </View>
                      <View style={styles.modalInfoCard}>
                        <Text style={styles.modalInfoLabel}>Exp</Text>
                        <Text style={styles.modalInfoValue}>
                          {formatDateLabel(viewedItem.expirationDate)}
                        </Text>
                      </View>
                      <View style={styles.modalInfoCard}>
                        <Text style={styles.modalInfoLabel}>Category</Text>
                        <Text style={styles.modalInfoValue}>{viewedItem.category}</Text>
                      </View>
                      <View style={styles.modalInfoCard}>
                        <Text style={styles.modalInfoLabel}>Supplier</Text>
                        <Text style={styles.modalInfoValue}>{viewedItem.supplier || 'Not listed'}</Text>
                      </View>
                    </View>

                    <View style={styles.modalPanel}>
                      <Text style={styles.modalPanelTitle}>Note</Text>
                      <Text style={styles.modalPanelText}>{getItemNote(viewedItem)}</Text>
                    </View>

                    {(viewedItem.computedStatus === 'Low Stock' || viewedItem.computedStatus === 'Out of Stock') ? (
                      <View style={styles.modalPanel}>
                        <Text style={styles.modalPanelTitle}>Suggested Reorder</Text>
                        <Text style={styles.modalPanelText}>
                          {getSuggestionQuantity(viewedItem)} {viewedItem.unit}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={Boolean(editorMode)} transparent animationType="slide" onRequestClose={closeEditorModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>
                    {editorMode === 'edit' ? 'Edit Item' : 'Add Item'}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {editorMode === 'edit'
                      ? 'Update this inventory entry.'
                      : 'Add a new inventory item for the team.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={closeEditorModal}
                  activeOpacity={0.88}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
                <View style={styles.editorForm}>
                  <Text style={styles.editorLabel}>Item Name</Text>
                  <TextInput
                    value={editorForm.itemName}
                    onChangeText={(value) => handleEditorFieldChange('itemName', value)}
                    style={styles.editorInput}
                    placeholder="Enter item name"
                    placeholderTextColor="#8aa2b4"
                  />

                  <Text style={styles.editorLabel}>Category</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.editorCategoryRow}
                  >
                    {ITEM_CATEGORY_OPTIONS.map((category) => {
                      const isSelected = editorForm.category === category;

                      return (
                        <TouchableOpacity
                          key={category}
                          style={[
                            styles.editorCategoryChip,
                            isSelected && styles.editorCategoryChipActive,
                          ]}
                          onPress={() => handleEditorFieldChange('category', category)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.editorCategoryChipText,
                              isSelected && styles.editorCategoryChipTextActive,
                            ]}
                          >
                            {category}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.editorFieldRow}>
                    <View style={styles.editorHalfField}>
                      <Text style={styles.editorLabel}>Stock Qty</Text>
                      <TextInput
                        value={editorForm.stockQuantity}
                        onChangeText={(value) => handleEditorFieldChange('stockQuantity', value.replace(/[^0-9]/g, ''))}
                        style={styles.editorInput}
                        placeholder="0"
                        placeholderTextColor="#8aa2b4"
                        keyboardType="number-pad"
                      />
                    </View>

                    <View style={styles.editorHalfField}>
                      <Text style={styles.editorLabel}>Unit</Text>
                      <TextInput
                        value={editorForm.unit}
                        onChangeText={(value) => handleEditorFieldChange('unit', value)}
                        style={styles.editorInput}
                        placeholder="vials, packs, tablets"
                        placeholderTextColor="#8aa2b4"
                      />
                    </View>
                  </View>

                  <Text style={styles.editorLabel}>Expiration Date</Text>
                  <TextInput
                    value={editorForm.expirationDate}
                    onChangeText={(value) => handleEditorFieldChange('expirationDate', value)}
                    style={styles.editorInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#8aa2b4"
                    autoCapitalize="none"
                  />

                  <Text style={styles.editorHelperText}>Use YYYY-MM-DD for the expiration date.</Text>

                  <Text style={styles.editorLabel}>Supplier</Text>
                  <TextInput
                    value={editorForm.supplier}
                    onChangeText={(value) => handleEditorFieldChange('supplier', value)}
                    style={styles.editorInput}
                    placeholder="Supplier name"
                    placeholderTextColor="#8aa2b4"
                  />

                  {editorError ? <Text style={styles.editorErrorText}>{editorError}</Text> : null}

                  <View style={styles.editorActionRow}>
                    <TouchableOpacity
                      style={styles.editorSecondaryButton}
                      onPress={closeEditorModal}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.editorSecondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editorPrimaryButton}
                      onPress={handleSaveItem}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.editorPrimaryButtonText}>
                        {editorMode === 'edit' ? 'Save Changes' : 'Add Item'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  profileButtonImage: {
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
  },
  sectionHeaderWrap: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#24566d',
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#5d7b91',
    fontWeight: '600',
  },
  overviewCard: {
    paddingVertical: 2,
    marginBottom: 14,
  },
  overviewTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5d7b91',
    marginBottom: 12,
  },
  controlsCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    marginBottom: 14,
  },
  controlsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  controlsTitleWrap: {
    flex: 1,
    marginRight: 12,
    minHeight: 54,
    justifyContent: 'center',
  },
  controlsTitle: {
    marginBottom: 0,
    lineHeight: 20,
  },
  categoryFilterWrap: {
    width: 170,
    maxWidth: '48%',
  },
  categoryFilterLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  categoryDropdownButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d5e7f2',
    backgroundColor: '#eef6fb',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryDropdownText: {
    flex: 1,
    marginRight: 10,
    fontSize: 13,
    fontWeight: '800',
    color: '#24566d',
  },
  categoryDropdownIcon: {
    fontSize: 11,
    fontWeight: '900',
    color: '#24566d',
  },
  categoryDropdownList: {
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 8,
  },
  categoryDropdownItem: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDropdownItemActive: {
    backgroundColor: '#447C99',
  },
  categoryDropdownItemText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#24566d',
  },
  categoryDropdownItemTextActive: {
    color: '#ffffff',
  },
  addItemButtonTouchArea: {
    width: '100%',
    marginTop: 14,
    borderRadius: 20,
    shadowColor: '#0d3e5c',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  addItemButton: {
    minHeight: 58,
    width: '100%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  addItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  addItemPlus: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  addItemButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 12,
  },
  panelSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6d8798',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#f7fcff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e3f1f8',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
  },
  summaryCardActive: {
    borderColor: '#447C99',
    backgroundColor: '#eef8ff',
  },
  summaryAccent: {
    width: 30,
    height: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#24566d',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#638095',
  },
  searchBarWrap: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    width: 19,
    height: 19,
    tintColor: '#5f7f94',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },
  searchBarWrapSpaced: {
    marginTop: 14,
  },
  listWrap: {
    marginBottom: 18,
  },
  listWrapTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#24566d',
  },
  listWrapSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#5d7b91',
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    marginBottom: 12,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#24566d',
  },
  itemSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#648398',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  itemMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  itemMetaCard: {
    width: '48.5%',
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4f1f8',
    padding: 12,
  },
  itemMetaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  itemMetaValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#24566d',
  },
  itemFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemNote: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#5d7b91',
    fontWeight: '700',
    marginRight: 12,
  },
  viewButton: {
    minWidth: 84,
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 25, 39, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  modalCard: {
    maxHeight: '82%',
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dceef8',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#f4fbff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1eff8',
  },
  modalTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#24566d',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#648398',
  },
  modalCloseButton: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  modalEditButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c8dce9',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginRight: 8,
  },
  modalEditText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#24566d',
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  modalScrollContent: {
    padding: 18,
    paddingBottom: 24,
  },
  modalBadgeRow: {
    marginBottom: 14,
  },
  modalInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalInfoCard: {
    width: '48%',
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4f1f8',
    padding: 12,
    marginBottom: 12,
  },
  modalInfoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalInfoValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#24566d',
  },
  modalPanel: {
    backgroundColor: '#eef8ff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d4e9f6',
    padding: 14,
    marginTop: 10,
  },
  modalPanelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 6,
  },
  modalPanelText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5d7b91',
    fontWeight: '600',
  },
  editorForm: {
    paddingBottom: 6,
  },
  editorLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 8,
  },
  editorInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
    marginBottom: 14,
  },
  editorCategoryRow: {
    paddingBottom: 8,
    paddingRight: 18,
  },
  editorCategoryChip: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#eef6fb',
    borderWidth: 1,
    borderColor: '#d5e7f2',
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  editorCategoryChipActive: {
    backgroundColor: '#447C99',
    borderColor: '#447C99',
  },
  editorCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
  },
  editorCategoryChipTextActive: {
    color: '#ffffff',
  },
  editorFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editorHalfField: {
    width: '48.5%',
  },
  editorHelperText: {
    marginTop: -6,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#6d8798',
    fontWeight: '600',
  },
  editorErrorText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#b54234',
    fontWeight: '700',
    marginBottom: 14,
  },
  editorActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  editorSecondaryButton: {
    width: '48%',
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c8dce9',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorSecondaryButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#24566d',
  },
  editorPrimaryButton: {
    width: '48%',
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorPrimaryButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  emptyCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d9ecf7',
    padding: 18,
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#648398',
  },
});

export default StaffInventory;


