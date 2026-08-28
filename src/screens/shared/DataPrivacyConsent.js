import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CONSENT_CHECKBOX_LINK_TEXT,
  CONSENT_CHECKBOX_PREFIX,
  CONSENT_CHECKBOX_SUFFIX,
  MARKETING_CONSENT_TEXT,
  PRIVACY_NOTICE_SECTIONS,
} from '../../constants/privacyNotice';

/**
 * Compact Data Privacy Consent block for new Pet Owner account creation
 * only (mobile self-registration). Not a card -- a required checkbox with
 * an inline link that opens the full notice in a modal, plus a separate
 * optional marketing checkbox. `error`, when set, draws a red border
 * around the container and shows a message directly below the required
 * checkbox. `onLayout` is forwarded so the parent screen can measure this
 * block's position and scroll to it when validation fails.
 */
export default function DataPrivacyConsent({
  serviceConsent,
  onServiceConsentChange,
  marketingConsent,
  onMarketingConsentChange,
  error,
  onLayout,
}) {
  const [noticeVisible, setNoticeVisible] = useState(false);

  return (
    <View style={[styles.block, error ? styles.blockError : null]} onLayout={onLayout}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => onServiceConsentChange(!serviceConsent)}
      >
        <View style={[styles.checkbox, serviceConsent && styles.checkboxChecked]}>
          {serviceConsent && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.rowText}>
          {CONSENT_CHECKBOX_PREFIX}
          <Text style={styles.link} onPress={() => setNoticeVisible(true)}>
            {CONSENT_CHECKBOX_LINK_TEXT}
          </Text>
          {CONSENT_CHECKBOX_SUFFIX}
          <Text style={styles.required}> *</Text>
        </Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.row, styles.marketingRow]}
        activeOpacity={0.8}
        onPress={() => onMarketingConsentChange(!marketingConsent)}
      >
        <View style={[styles.checkbox, marketingConsent && styles.checkboxChecked]}>
          {marketingConsent && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.rowText}>{MARKETING_CONSENT_TEXT}</Text>
      </TouchableOpacity>

      <Modal
        visible={noticeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoticeVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoticeVisible(false)} />
          <View style={styles.modalBox}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setNoticeVisible(false)}>
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>PawCruz Privacy Notice</Text>
            <ScrollView style={styles.modalScroll}>
              {PRIVACY_NOTICE_SECTIONS.map((section) => (
                <View key={section.heading} style={styles.modalSection}>
                  <Text style={styles.modalHeading}>{section.heading}</Text>
                  <Text style={styles.modalBody}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNoticeVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  blockError: {
    borderColor: '#d9534f',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  marketingRow: {
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#9db6c1',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#4da8da',
    borderColor: '#4da8da',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 14,
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    color: '#eef7fc',
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    color: '#9edcff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  required: {
    color: '#ff8a80',
    fontWeight: '800',
  },
  errorText: {
    marginLeft: 30,
    color: '#ffb4ab',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,20,30,0.55)',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#edf5f8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#456472',
    lineHeight: 20,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#183747',
    marginBottom: 12,
    paddingRight: 28,
  },
  modalScroll: {
    maxHeight: 380,
  },
  modalSection: {
    marginBottom: 14,
  },
  modalHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#237da4',
    marginBottom: 4,
  },
  modalBody: {
    fontSize: 13,
    color: '#445b66',
    lineHeight: 19,
  },
  modalCloseBtn: {
    marginTop: 14,
    backgroundColor: '#237da4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
