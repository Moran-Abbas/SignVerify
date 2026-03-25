/**
 * Patches expo-file-system's podspec after every npm install.
 *
 * Problem: expo-file-system uses `s.source_files = "**\/*.{h,m,swift}"` which
 * recursively includes files from both ios/ and ios/Legacy/, producing duplicate
 * symbols. With useFrameworks: static, CocoaPods flattens all sources into a
 * single framework target, causing "Duplicate Symbol" and "Multiple Commands Produce" errors.
 *
 * Fix: recursively exclude all redundant files from Legacy (headers, and implementation files).
 */
const fs = require('fs');
const path = require('path');

const podspecPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-file-system',
  'ios',
  'ExpoFileSystem.podspec'
);

if (!fs.existsSync(podspecPath)) {
  console.warn('⚠️  expo-file-system podspec not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(podspecPath, 'utf8');

// Always perform the replacement to ensure we have the latest recursive exclusions
const excludeBlock = `
  s.exclude_files = [
    "Tests/**/*",
    "Legacy/Encoding.swift",
    "Legacy/FileSystemBackgroundSessionHandler.swift",
    "Legacy/FileSystemHelpers.swift",
    "Legacy/NetworkingHelpers.swift",
    "Legacy/**/*.h",
    "Legacy/**/*.m"
  ]`;

if (!content.includes('s.exclude_files')) {
  content = content.replace('s.source_files = "**/*.{h,m,swift}"', `s.source_files = "**/*.{h,m,swift}"${excludeBlock}`);
} else {
  // Update existing block to be recursive
  content = content.replace(/s\.exclude_files\s*=\s*\[[\s\S]*?\]/, excludeBlock.trim());
}

fs.writeFileSync(podspecPath, content);
console.log('✅ Patched expo-file-system podspec: recursively excluded Legacy duplicates');
