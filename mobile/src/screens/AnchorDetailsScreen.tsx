import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing, Shadows } from '../theme';
import { AnchorResponse } from '../services/anchorService';
import { safeHaptics, safeClipboard, ImpactFeedbackStyle } from '../utils/nativeUtils';
import SecurityChip from '../components/SecurityChip';

type RootStackParamList = {
  AnchorDetails: { anchor: AnchorResponse };
};

export default function AnchorDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AnchorDetails'>>();
  const { anchor } = route.params;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `SignVerify Document Anchor\nID: ${anchor.id}\nHash: ${anchor.file_hash}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const renderInfoRow = (label: string, value: string, icon: keyof typeof MaterialIcons.glyphMap) => {
    const copyToClipboard = async () => {
      await safeClipboard.setString(value, label);
      safeHaptics.impact(ImpactFeedbackStyle.Light);
    };

    return (
      <TouchableOpacity 
        style={styles.infoRow} 
        onPress={copyToClipboard}
        activeOpacity={0.6}
      >
        <View style={styles.infoIconWrap}>
          <MaterialIcons name={icon} size={20} color={Colors.primary} />
        </View>
        <View style={styles.infoContent}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
        </View>
        <MaterialIcons name="content-copy" size={16} color={Colors.outline} style={{ marginLeft: Spacing.sm }} />
      </TouchableOpacity>
    );
  };

  const semantic = anchor.payload.semantic_content || {};

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.onBackground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signature Details</Text>
        <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
          <MaterialIcons name="share" size={24} color={Colors.onBackground} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Status Card */}
        <View style={styles.mainCard}>
          <View style={styles.statusBadgeWrap}>
            <SecurityChip variant="verified" />
          </View>
          <Text style={styles.docName}>
            {semantic.parties?.[0] ? `${semantic.parties[0]}_Doc` : `Document_${anchor.file_hash.substring(0, 8)}`}
          </Text>
          <Text style={styles.docId}>Shortcode: {anchor.reference_id || 'N/A'}</Text>
          <Text style={styles.docUuid}>UUID: {String(anchor.id)}</Text>
        </View>

        {/* Forensic Metadata */}
        <Text style={styles.sectionTitle}>Forensic Metadata</Text>
        <View style={styles.card}>
          {renderInfoRow('Reference ID', anchor.reference_id || 'N/A', 'label')}
          <View style={styles.divider} />
          {renderInfoRow('File Hash (SHA-256)', anchor.file_hash, 'fingerprint')}
          <View style={styles.divider} />
          {renderInfoRow('Hardware Key ID', anchor.payload.signer_public_key_id, 'vpn-key')}
          <View style={styles.divider} />
          {renderInfoRow('Storage Node', 'AWS S3 (Encrypted)', 'cloud-done')}
        </View>

        {/* Semantic Truth */}
        <Text style={styles.sectionTitle}>Extracted Semantic Truth</Text>
        <View style={styles.card}>
          <View style={styles.semanticRow}>
            <Text style={styles.semanticLabel}>Parties Involved</Text>
            <Text style={styles.semanticValue}>
              {semantic.parties?.join(', ') || 'N/A'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.semanticRow}>
            <Text style={styles.semanticLabel}>Date on Document</Text>
            <Text style={styles.semanticValue}>{semantic.date || 'N/A'}</Text>
          </View>
          {typeof semantic.amount !== 'undefined' && semantic.amount !== null && (
            <>
              <View style={styles.divider} />
              <View style={styles.semanticRow}>
                <Text style={styles.semanticLabel}>Total Amount</Text>
                <Text style={styles.semanticValue}>{String(semantic.amount)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Image Placeholder */}
        <Text style={styles.sectionTitle}>Original Capture</Text>
        <View style={styles.imagePlaceholder}>
          <MaterialIcons name="image" size={48} color={Colors.outline} />
          <Text style={styles.placeholderText}>Full resolution image securely stored in S3</Text>
          <Text style={styles.pathText}>{anchor.s3_uri}</Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  headerBtn: {
    padding: Spacing.sm,
  },
  headerTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  mainCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    ...Shadows.sm,
  },
  statusBadgeWrap: {
    marginBottom: Spacing.md,
  },
  docName: {
    ...Typography.headlineSmall,
    color: Colors.onBackground,
    textAlign: 'center',
  },
  docId: {
    ...Typography.titleSmall,
    color: Colors.primary,
    marginTop: Spacing.xs,
    fontWeight: 'bold',
  },
  docUuid: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
    fontSize: 10,
  },
  sectionTitle: {
    ...Typography.titleSmall,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
    marginTop: Spacing.base,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
  },
  infoValue: {
    ...Typography.bodyMedium,
    color: Colors.onBackground,
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  semanticRow: {
    paddingVertical: Spacing.lg,
  },
  semanticLabel: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  semanticValue: {
    ...Typography.bodyLarge,
    color: Colors.onBackground,
  },
  imagePlaceholder: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.outlineVariant,
  },
  placeholderText: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  pathText: {
    ...Typography.bodySmall,
    color: Colors.outline,
    marginTop: Spacing.sm,
    fontSize: 10,
  },
  spacer: {
    height: 40,
  },
});
