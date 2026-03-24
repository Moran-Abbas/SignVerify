import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { authService } from '../services/authService';
import { Colors, Typography, Spacing, Radius } from '../theme';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to securely log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Log Out', 
        style: 'destructive',
        onPress: async () => {
          await authService.logout();
          navigation.reset({
            index: 0,
            routes: [{ name: 'Onboarding' }],
          });
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="close" size={24} color={Colors.onBackground} />
        </TouchableOpacity>
        <Text style={styles.title}>Account Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <View style={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarLarge}>
            <MaterialIcons name="person" size={48} color={Colors.onPrimary} />
          </View>
          <Text style={styles.profileName}>Secured Identity</Text>
          <Text style={styles.profilePhone}>Hardware Enclave Registered</Text>
        </View>

        <TouchableOpacity 
          style={styles.actionRow} 
          activeOpacity={0.7}
          onPress={() => Alert.alert('Secure Key', 'Your ECDSA P-256 public key is safely guarded by the device secure enclave.')}
        >
          <MaterialIcons name="security" size={24} color={Colors.secondary} />
          <Text style={styles.actionText}>Cryptographic Identity</Text>
          <MaterialIcons name="chevron-right" size={24} color={Colors.outline} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionRow, styles.logoutRow]} activeOpacity={0.7} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color={Colors.error} />
          <Text style={[styles.actionText, { color: Colors.error }]}>Log Out</Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  backBtn: {
    padding: Spacing.xs,
    marginLeft: -Spacing.xs,
  },
  title: {
    ...Typography.titleLarge,
    color: Colors.onBackground,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  profileName: {
    ...Typography.headlineSmall,
    color: Colors.onBackground,
    marginBottom: Spacing.xs,
  },
  profilePhone: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  actionText: {
    flex: 1,
    ...Typography.bodyLarge,
    color: Colors.onBackground,
    marginLeft: Spacing.md,
  },
  logoutRow: {
    marginTop: 'auto',
    backgroundColor: Colors.errorContainer,
  },
});
