import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing } from '../theme';
import { i18n, Language, NativeLanguageNames } from '../i18n/i18n';
import { useAppContext } from '../context/AppContext';

interface LanguageSelectorProps {
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES: Language[] = ['en', 'he', 'ar', 'es', 'fr', 'ru'];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ visible, onClose }) => {
  const { language, setLanguage } = useAppContext();

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>{i18n.t('language')}</Text>
          </View>
          
          <FlatList
            data={LANGUAGES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.option,
                  item === language && styles.optionSelected
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.optionTextWrap}>
                  <Text style={[
                    styles.optionLabel,
                    item === language && styles.optionLabelSelected
                  ]}>
                    {NativeLanguageNames[item]}
                  </Text>
                  <Text style={styles.optionCode}>{item.toUpperCase()}</Text>
                </View>
                {item === language && (
                  <MaterialIcons name="check-circle" size={24} color={Colors.primary} />
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing['4xl'],
    maxHeight: '50%',
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.outlineVariant,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  optionSelected: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    ...Typography.bodyLarge,
    color: Colors.onBackground,
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionCode: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});
