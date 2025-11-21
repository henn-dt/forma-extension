/**
 * BlobId Cache Inspector
 * 
 * Reads and displays all cached blobIds from tree-blobid-cache.json
 * Usage: node check-blobid-cache.js
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'tree-blobid-cache.json');
const OLD_CACHE_FILE = path.join(__dirname, 'tree-blobid-result.json');

console.log('🔍 BlobId Cache Inspector\n');
console.log('═══════════════════════════════════════════════════════\n');

// Check new cache file
if (fs.existsSync(CACHE_FILE)) {
  console.log('📦 Found cache file:', CACHE_FILE);
  
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const projectCount = Object.keys(cache).length;
    
    console.log(`\n✅ Cached blobIds for ${projectCount} project(s):\n`);
    
    Object.entries(cache).forEach(([projectId, data]) => {
      console.log(`📍 Project: ${projectId}`);
      console.log(`   🔑 BlobId: ${data.blobId}`);
      console.log(`   📅 Cached: ${new Date(data.timestamp).toLocaleString()}`);
      console.log(`   📦 GLB File: ${data.glbFile || 'Henkel_tree.glb'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error reading cache file:', error.message);
  }
} else {
  console.log('⚠️ No cache file found at:', CACHE_FILE);
  console.log('   The cache will be created when the first GLB is uploaded.\n');
}

// Check old cache file format (for migration)
if (fs.existsSync(OLD_CACHE_FILE)) {
  console.log('\n📋 Found old-format cache file:', OLD_CACHE_FILE);
  
  try {
    const oldCache = JSON.parse(fs.readFileSync(OLD_CACHE_FILE, 'utf8'));
    
    if (oldCache.projectId && oldCache.blobId) {
      console.log('\n💡 You can migrate this to the new format:');
      console.log(`   Project: ${oldCache.projectId}`);
      console.log(`   BlobId: ${oldCache.blobId}`);
      console.log(`   Timestamp: ${oldCache.timestamp}`);
      
      // Offer to migrate
      console.log('\n🔄 Run this migration (optional):');
      console.log('   node backend/migrate-blobid-cache.js\n');
    }
  } catch (error) {
    console.error('❌ Error reading old cache file:', error.message);
  }
}

console.log('═══════════════════════════════════════════════════════\n');
console.log('💡 TIP: To manually add a blobId, edit tree-blobid-cache.json');
console.log('   Format:');
console.log('   {');
console.log('     "pro_xxxxx": {');
console.log('       "blobId": "integrate:eyJz...",');
console.log('       "timestamp": "2025-11-13T12:00:00.000Z",');
console.log('       "glbFile": "Henkel_tree.glb"');
console.log('     }');
console.log('   }\n');
