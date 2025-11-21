/**
 * BlobId Cache Migration Script
 * 
 * Migrates old tree-blobid-result.json format to new tree-blobid-cache.json format
 * Usage: node migrate-blobid-cache.js
 */

const fs = require('fs');
const path = require('path');

const OLD_FILE = path.join(__dirname, 'tree-blobid-result.json');
const NEW_FILE = path.join(__dirname, 'tree-blobid-cache.json');

console.log('🔄 BlobId Cache Migration\n');
console.log('═══════════════════════════════════════════════════════\n');

// Check if old file exists
if (!fs.existsSync(OLD_FILE)) {
  console.log('❌ Old cache file not found:', OLD_FILE);
  console.log('   Nothing to migrate.\n');
  process.exit(0);
}

try {
  // Read old format
  const oldData = JSON.parse(fs.readFileSync(OLD_FILE, 'utf8'));
  
  console.log('📋 Old cache file found:');
  console.log(`   Project: ${oldData.projectId}`);
  console.log(`   BlobId: ${oldData.blobId}`);
  console.log(`   Timestamp: ${oldData.timestamp}`);
  console.log('');

  // Read new cache (if exists) or create empty
  let newCache = {};
  if (fs.existsSync(NEW_FILE)) {
    console.log('📦 Existing new cache found, merging...');
    newCache = JSON.parse(fs.readFileSync(NEW_FILE, 'utf8'));
  }

  // Add old entry to new cache
  if (oldData.projectId && oldData.blobId) {
    newCache[oldData.projectId] = {
      blobId: oldData.blobId,
      timestamp: oldData.timestamp,
      glbFile: oldData.glbFile || 'Henkel_tree.glb'
    };

    // Save new cache
    fs.writeFileSync(NEW_FILE, JSON.stringify(newCache, null, 2));
    
    console.log('✅ Migration successful!');
    console.log(`   New cache file: ${NEW_FILE}`);
    console.log(`   Total projects cached: ${Object.keys(newCache).length}\n`);
    
    // Offer to delete old file
    console.log('💡 Old cache file can now be safely deleted (optional)');
    console.log('   Or keep it as a backup.\n');
  } else {
    console.log('⚠️ Old cache file is missing projectId or blobId');
    console.log('   Cannot migrate.\n');
  }

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════\n');
