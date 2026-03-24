import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { safeHaptics, ImpactFeedbackStyle } from '../utils/nativeUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityCard, BottomNavBar, LanguageSelector } from '../components';
import { Colors, Typography, Radius, Spacing, Gradients, Shadows } from '../theme';
import { anchorService, AnchorResponse } from '../services/anchorService';
import { authService } from '../services/authService';
import { i18n, Language } from '../i18n/i18n';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTimeAgo(dateString: any) {
  if (!dateString) return 'Unknown';
  
  // 2026 Normalization: Ensure string and ISO 8601 format
  const isoString = String(dateString).replace(' ', 'T');
  const now = new Date();
  const past = new Date(isoString);
  const diffMs = now.getTime() - past.getTime();
  
  // Guard against future-skew (e.g., server clock slightly ahead)
  if (diffMs < 0 && Math.abs(diffMs) < 60000) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString();
}

function getDocName(anchor: AnchorResponse) {
  if (anchor.payload.semantic_content?.parties?.length) {
    return `${anchor.payload.semantic_content.parties[0]}_Doc`;
  }
  return `Document_${anchor.file_hash.substring(0, 6)}`;
}

// ── Sub-Views ─────────────────────────────────────────────────────────────

function HomeView({ 
  navigation, 
  onNavigateTab, 
  anchors, 
  loading, 
  onRefresh 
}: { 
  navigation: any, 
  onNavigateTab: (tab: any) => void,
  anchors: AnchorResponse[],
  loading: boolean,
  onRefresh: () => void
}) {
  return (
    <ScrollView 
      style={styles.scroll} 
      contentContainerStyle={styles.content} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={loading} 
          onRefresh={onRefresh} 
          tintColor={Colors.primary}
          progressViewOffset={Spacing.base}
        />
      }
    >
      <View style={{ height: Spacing.sm }} />
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingTitle}>{i18n.t('dashboard')}</Text>
        <Text style={styles.greetingSubtitle}>{i18n.t('vault_ready')}</Text>
      </View>

      {/* Action Cards */}
      <View style={styles.actionCards}>
        <TouchableOpacity 
          activeOpacity={0.9} 
          style={styles.actionCardWrapper}
          onPress={() => navigation.navigate('Scanner')}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryContainer]}
            start={Gradients.primaryCta.start}
            end={Gradients.primaryCta.end}
            style={styles.signCard}
          >
            <View style={styles.signCardIcon}>
              <MaterialIcons name="edit" size={22} color={Colors.onPrimary} />
            </View>
            <Text style={styles.signCardTitle}>{i18n.t('sign_doc')}</Text>
            <Text style={styles.signCardSub}>{i18n.t('sign_sub')}</Text>
            <View style={styles.signCardDecor} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity 
          activeOpacity={0.8} 
          style={styles.verifyCard}
          onPress={() => navigation.navigate('VerifierScanner')}
        >
          <View style={styles.verifyCardIcon}>
            <MaterialIcons name="qr-code-scanner" size={22} color={Colors.primaryContainer} />
          </View>
          <Text style={styles.verifyCardTitle}>{i18n.t('verify_doc')}</Text>
          <Text style={styles.verifyCardSub}>{i18n.t('verify_sub')}</Text>
          <View style={styles.verifyCardDecor} />
        </TouchableOpacity>
      </View>

      {/* Recent Activity */}
      <View style={styles.activitySection}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>{i18n.t('recent_activity')}</Text>
          <TouchableOpacity onPress={() => onNavigateTab('history')}>
            <Text style={styles.viewAll}>{i18n.t('view_all')}</Text>
          </TouchableOpacity>
        </View>

        {loading && !anchors.length ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
        ) : anchors.length === 0 ? (
          <Text style={styles.emptyStateSub}>{i18n.t('no_activity')}</Text>
        ) : (
          anchors.slice(0, 3).map((a) => (
            <ActivityCard 
              key={a.id}
              documentName={getDocName(a)} 
              subtitle={`${i18n.t('signed_via_biometric')} • ${formatTimeAgo((a as any).created_at || new Date().toISOString())}${a.reference_id ? ` • ID: ${a.reference_id}` : ''}`} 
              status="verified" 
              onPress={() => navigation.navigate('AnchorDetails', { anchor: a })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function HistoryView({ anchors, loading, onRefresh, navigation }: { anchors: AnchorResponse[], loading: boolean, onRefresh: () => void, navigation: any }) {
  return (
    <ScrollView 
      style={styles.scroll} 
      contentContainerStyle={styles.content} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={loading} 
          onRefresh={onRefresh} 
          tintColor={Colors.primary}
          progressViewOffset={Spacing.base}
        />
      }
    >
      <View style={{ height: Spacing.sm }} />
      <Text style={styles.sectionHeadline}>{i18n.t('history')}</Text>
      <View style={styles.activitySection}>
        {loading && !anchors.length ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
        ) : anchors.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="history" size={48} color={Colors.onSurfaceVariant} />
            <Text style={styles.emptyStateTitle}>{i18n.t('no_history')}</Text>
            <Text style={styles.emptyStateSub}>{i18n.t('no_history_sub')}</Text>
          </View>
        ) : (
          anchors.map((a) => (
            <ActivityCard 
              key={a.id}
              documentName={getDocName(a)} 
              subtitle={`${i18n.t('signed_via_biometric')} • ${formatTimeAgo((a as any).created_at || new Date().toISOString())}${a.reference_id ? ` • ID: ${a.reference_id}` : ''}`} 
              status="verified" 
              onPress={() => navigation.navigate('AnchorDetails', { anchor: a })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function VaultView({ anchors, loading, onRefresh, navigation }: { anchors: AnchorResponse[], loading: boolean, onRefresh: () => void, navigation: any }) {
  return (
    <ScrollView 
      style={styles.scroll} 
      contentContainerStyle={styles.content} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={loading} 
          onRefresh={onRefresh} 
          tintColor={Colors.primary}
          progressViewOffset={Spacing.base}
        />
      }
    >
      <View style={{ height: Spacing.sm }} />
      <Text style={styles.sectionHeadline}>{i18n.t('vault')}</Text>
      {loading && !anchors.length ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      ) : anchors.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="enhanced-encryption" size={48} color={Colors.primaryFixedDim} />
          <Text style={styles.emptyStateTitle}>{i18n.t('empty_vault')}</Text>
          <Text style={styles.emptyStateSub}>{i18n.t('empty_vault_sub')}</Text>
        </View>
      ) : (
        <View style={styles.activitySection}>
          {anchors.map((a) => (
            <ActivityCard 
              key={a.id}
              documentName={getDocName(a)} 
              subtitle={`${i18n.t('hardware_anchored')} • ${formatTimeAgo((a as any).created_at || new Date().toISOString())}${a.reference_id ? ` • ID: ${a.reference_id}` : ''}`} 
              status="verified"
              icon="lock"
              onPress={() => navigation.navigate('AnchorDetails', { anchor: a })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}


function SettingsView({ navigation, onUpdate }: { navigation: any, onUpdate?: () => void }) {
  const { theme, toggleTheme, language } = useAppContext();
  const { logout } = useAuth();
  const [showLangModal, setShowLangModal] = useState(false);

  // Removed handleToggleLang in favor of LanguageSelector modal

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionHeadline}>{i18n.t('settings')}</Text>

      <Text style={styles.settingLabel}>{i18n.t('sec_ident')}</Text>
      <View style={styles.settingsGroup}>
        <TouchableOpacity style={styles.settingsRow} onPress={() => navigation.navigate('Profile')}>
          <MaterialIcons name="person" size={24} color={Colors.onSurfaceVariant} />
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingsText}>{i18n.t('profile')}</Text>
            <Text style={styles.settingsSub}>{i18n.t('profile_sub')}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={Colors.outline} />
        </TouchableOpacity>
      </View>

      <Text style={styles.settingLabel}>{i18n.t('appearance').toUpperCase()}</Text>
      <View style={styles.settingsGroup}>
        <TouchableOpacity style={styles.settingsRow} onPress={toggleTheme}>
          <MaterialIcons name="palette" size={24} color={Colors.onSurfaceVariant} />
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingsText}>{i18n.t('appearance')}</Text>
            <Text style={styles.settingsSub}>
              {theme === 'light' ? i18n.t('white_theme') : i18n.t('dark_theme')}
            </Text>
          </View>
          <MaterialIcons name="unfold-more" size={20} color={Colors.outline} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.settingsRow} onPress={() => setShowLangModal(true)}>
          <MaterialIcons name="language" size={24} color={Colors.onSurfaceVariant} />
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingsText}>{i18n.t('language')}</Text>
            <Text style={styles.settingsSub}>
              {i18n.getLanguageName(language)} - {i18n.t('change_lang')}
            </Text>
          </View>
          <MaterialIcons name="unfold-more" size={20} color={Colors.outline} />
        </TouchableOpacity>
        <LanguageSelector visible={showLangModal} onClose={() => setShowLangModal(false)} />
      </View>

      <View style={{ marginTop: Spacing.xl }}>
         <TouchableOpacity 
           style={[styles.settingsGroup, { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.outlineVariant }]} 
           onPress={logout}
         >
          <View style={styles.settingsRow}>
            <MaterialIcons name="logout" size={24} color={Colors.error} />
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingsText, { color: Colors.error, marginLeft: 0 }]}>{i18n.t('logout')}</Text>
              <Text style={styles.settingsSub}>{i18n.t('logout_sub')}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { theme, language } = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'vault' | 'settings'>('home');
  const [anchors, setAnchors] = useState<AnchorResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0); // For force re-render on global state change

  const fetchAnchors = useCallback(async () => {
    // Avoid redundant loads during active refresh
    if (loading) return;
    setLoading(true);
    
    try {
      const data = await anchorService.getUserAnchors();
      setAnchors(data);
      // Snappy Reload: One medium pulse only on COMPLETE success
      safeHaptics.impact(ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('[Dashboard] Error fetching anchors:', err);
    } finally {
      // Ensure it "sticks" for a split second for visual confirmation
      setTimeout(() => setLoading(false), 300);
    }
  }, [loading]);

  useEffect(() => {
    let active = true;
    if (isFocused && active) {
      fetchAnchors();
      // Selection haptic silenced to reduce noise
    }
    return () => { active = false; };
  }, [isFocused]);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeView 
            navigation={navigation} 
            onNavigateTab={setActiveTab} 
            anchors={anchors} 
            loading={loading}
            onRefresh={fetchAnchors}
          />
        );
      case 'history':
        return (
          <HistoryView 
            anchors={anchors} 
            loading={loading}
            onRefresh={fetchAnchors}
            navigation={navigation}
          />
        );
      case 'vault':
        return (
          <VaultView 
            anchors={anchors} 
            loading={loading}
            onRefresh={fetchAnchors}
            navigation={navigation}
          />
        );
      case 'settings':
        return <SettingsView navigation={navigation} onUpdate={() => setTick(prev => prev + 1)} />;
      default:
        return (
          <HomeView 
            navigation={navigation} 
            onNavigateTab={setActiveTab} 
            anchors={anchors} 
            loading={loading}
            onRefresh={fetchAnchors}
          />
        );
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme === 'dark' ? '#0A0F1A' : '#F8F9FA' }]}>
      {/* Global Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>SignVerify</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <MaterialIcons name="notifications-none" size={24} color={Colors.onBackground} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.avatar}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialIcons name="person" size={20} color={Colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dynamic Tab Content */}
      <View style={{ flex: 1 }}>
        {renderContent()}
      </View>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.base,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  appName: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    marginBottom: Spacing.xl,
    marginLeft: 0,
    marginRight: Spacing.sm,
  },
  greetingTitle: {
    ...Typography.headlineLarge,
    color: Colors.onBackground,
    marginBottom: Spacing.xs,
  },
  greetingSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  actionCards: {
    marginBottom: Spacing['2xl'],
    gap: Spacing.base,
  },
  actionCardWrapper: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.ambient,
  },
  signCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    minHeight: 140,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  signCardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  signCardTitle: {
    ...Typography.titleLarge,
    color: Colors.onPrimary,
    marginBottom: Spacing.xs,
  },
  signCardSub: {
    ...Typography.bodySmall,
    color: Colors.primaryFixedDim,
  },
  signCardDecor: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.xl,
    transform: [{ rotate: '45deg' }],
  },
  verifyCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    minHeight: 120,
    overflow: 'hidden',
  },
  verifyCardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  verifyCardTitle: {
    ...Typography.titleLarge,
    color: Colors.onBackground,
    marginBottom: Spacing.xs,
  },
  verifyCardSub: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
  },
  verifyCardDecor: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 100,
    height: 100,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    transform: [{ rotate: '45deg' }],
    opacity: 0.5,
  },
  activitySection: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    padding: Spacing.base,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  activityTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  viewAll: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
  },
  sectionHeadline: {
    ...Typography.headlineMedium,
    color: Colors.onBackground,
    marginBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    minHeight: 300,
  },
  emptyStateTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptyStateSub: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  settingsGroup: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  settingsText: {
    flex: 1,
    ...Typography.bodyLarge,
    color: Colors.onBackground,
    marginLeft: Spacing.md,
  },
  settingTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  settingLabel: {
    ...Typography.labelMedium,
    color: Colors.primary,
    marginTop: Spacing.xl,
    marginBottom: Spacing.base,
    letterSpacing: 1,
  },
  settingsSub: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerLow,
    marginLeft: 56,
  },
  spacer: {
    height: 80,
  },
});
