const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to stabilize Firebase Auth headers and settings in the Podfile.
 * This ensures the fix survives npx expo prebuild --clean.
 *
 * Note: The ExpoFileSystem duplicate-header fix (Error 65) is handled at the podspec
 * level via scripts/fix-expo-filesystem-podspec.js (run via npm postinstall), which
 * is more reliable than a post_install Podfile hook.
 */
const withFirebaseStabilization = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.projectRoot, 'ios', 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      const firebaseFix = `
    # --- SignVerify Firebase Stabilization ---
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'NO'

        if ['RNFBAuth', 'RNFBApp'].include?(target.name)
          config.build_settings['HEADER_SEARCH_PATHS'] ||= '$(inherited) '
          config.build_settings['HEADER_SEARCH_PATHS'] << '"$(PODS_ROOT)/Headers/Public/Firebase" '
          config.build_settings['HEADER_SEARCH_PATHS'] << '"$(PODS_CONFIGURATION_BUILD_DIR)/FirebaseAuth/FirebaseAuth.framework/Headers" '
        end

        if target.name.include?('Firebase') || target.name.include?('RNFB')
          config.build_settings['SWIFT_VERSION'] = '5.0'
        end
      end
    end
    # --- End SignVerify Firebase Stabilization ---

    # Silence Xcode "will be run during every build" warnings for script phases
    # that intentionally have no outputs (React Native, Hermes, Expo, Firebase).
    installer.pods_project.targets.each do |target|
      target.build_phases.each do |phase|
        next unless phase.is_a?(Xcodeproj::Project::Object::PBXShellScriptBuildPhase)
        next unless phase.output_paths.nil? || phase.output_paths.empty?
        phase.always_out_of_date = '1'
      end
    end
    installer.aggregate_targets.each do |agg|
      agg.user_project.targets.each do |target|
        target.build_phases.each do |phase|
          next unless phase.is_a?(Xcodeproj::Project::Object::PBXShellScriptBuildPhase)
          next unless phase.output_paths.nil? || phase.output_paths.empty?
          phase.always_out_of_date = '1'
        end
      end
      agg.user_project.save
    end
`;

      if (podfileContent.includes('post_install do |installer|')) {
        if (!podfileContent.includes('SignVerify Firebase Stabilization')) {
          podfileContent = podfileContent.replace(
            'post_install do |installer|',
            'post_install do |installer|' + firebaseFix
          );
        }
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};

module.exports = withFirebaseStabilization;
