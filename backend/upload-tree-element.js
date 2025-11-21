/**
 * Complete Forma Tree Upload - Two-Step Process
 * 
 * Step 1: Upload GLB to Forma storage → get blobId
 * Step 2: Create element with that blobId → get element URN
 * 
 * Based on: https://aps.autodesk.com/en/docs/forma/v1/reference/http-reference/integrate-createelementv2-POST/
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const FORMA_PROJECT_ID = process.env.FORMA_PROJECT_ID; // e.g., "pro_jjjvrvdeq8"

if (!BEARER_TOKEN || !FORMA_PROJECT_ID) {
  console.error('❌ Missing BEARER_TOKEN or FORMA_PROJECT_ID in .env');
  process.exit(1);
}

/**
 * Step 1: Upload GLB file to Forma S3 storage
 * Returns: blobId
 */
async function uploadGLBToStorage() {
  try {
    console.log('\n--- STEP 1: Upload GLB to Forma Storage ---');
    
    // 1.1: Request upload link
    console.log('Requesting upload link...');
    // Use the correct API endpoint from the docs
    const uploadLinkUrl = `https://developer.api.autodesk.com/forma/integrate/v1alpha/upload-link?authcontext=${FORMA_PROJECT_ID}`;
    
    console.log('   URL:', uploadLinkUrl);
    console.log('   Token (first 30 chars):', BEARER_TOKEN.substring(0, 30));
    
    const linkResponse = await axios.get(uploadLinkUrl, {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Ads-Region': 'EMEA'  // Try US first (default), can also try 'EMEA' if this fails
      }
    });
    
    console.log('Full API response:', JSON.stringify(linkResponse.data, null, 2));
    
    // API returns { id, url, blobId } - use correct field names
    const { url: uploadUrl, blobId } = linkResponse.data;
    console.log('✅ Got upload link');
    console.log('   blobId:', blobId);
    console.log('   uploadUrl:', uploadUrl);
    console.log('   uploadUrl type:', typeof uploadUrl);
    
    // Validate uploadUrl exists
    if (!uploadUrl || typeof uploadUrl !== 'string') {
      console.error('❌ uploadUrl is missing or invalid!');
      console.error('Response keys:', Object.keys(linkResponse.data));
      throw new Error('uploadUrl not found in API response');
    }
    
    // 1.2: Read GLB file
    const glbPath = path.join(__dirname, '..', 'python_backend', 'tree_model', 'Henkel_tree.glb');
    
    if (!fs.existsSync(glbPath)) {
      throw new Error(`GLB file not found at: ${glbPath}`);
    }
    
    const glbBuffer = fs.readFileSync(glbPath);
    console.log('   GLB file size:', glbBuffer.length, 'bytes');
    
    // 1.3: Upload GLB to S3
    console.log('Uploading GLB to S3...');
    
    // IMPORTANT: Pre-signed URLs include the signature in the URL
    // DO NOT add Authorization, Content-Type, or other headers
    // The signature was calculated with specific headers by AWS
    await axios.put(uploadUrl, glbBuffer, {
      maxBodyLength: Infinity,
      maxContentLength: Infinity
      // No headers! The pre-signed URL handles authentication
    });
    
    console.log('✅ GLB uploaded successfully to S3');
    
    return blobId;
    
  } catch (error) {
    console.error('❌ Error uploading GLB to storage:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Message:', error.message);
    }
    throw error;
  }
}

/**
 * Step 2: Create element in Forma using the blobId
 * Returns: element URN
 */
async function createElementWithBlob(blobId) {
  try {
    console.log('\n--- STEP 2: Create Element in Forma ---');
    
    const createElementUrl = `https://developer.api.autodesk.com/forma/integrate/v2alpha/elements?authcontext=${FORMA_PROJECT_ID}`;
    
    const elementData = {
      properties: {
        name: "Henkel Tree (Low Poly)",
        description: "Tree model for automatic placement",
        category: "vegetation"
      },
      representations: {
        volumeMesh: {
          type: "linked",
          blobId: blobId
        }
      }
      // Note: No children needed for a single tree asset
    };
    
    console.log('Creating element with blobId:', blobId);
    
    const response = await axios.post(createElementUrl, elementData, {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Ads-Region': 'US'  // Must match the region from step 1
      }
    });
    
    const { urn } = response.data;
    console.log('✅ Element created successfully!');
    console.log('   URN:', urn);
    
    return urn;
    
  } catch (error) {
    console.error('❌ Error creating element:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Message:', error.message);
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('  Forma Tree Upload - Get BlobId Only');
    console.log('='.repeat(60));
    console.log('Project ID:', FORMA_PROJECT_ID);
    console.log('Token:', BEARER_TOKEN.substring(0, 20) + '...');
    
    // Step 1: Upload GLB → get blobId (THIS IS ALL WE NEED!)
    const blobId = await uploadGLBToStorage();
    
    // Step 2: We DON'T need to create element now - just save the blobId
    console.log('\n' + '='.repeat(60));
    console.log('  ✅ SUCCESS - GLB Uploaded to Forma Storage!');
    console.log('='.repeat(60));
    console.log('BlobId:', blobId);
    console.log('\n💡 This blobId can be used to place trees in Forma!');
    console.log('💡 Save this blobId in your .env file or use it in placement API calls');
    console.log('='.repeat(60));
    
    // Save to a file for reference
    const result = {
      blobId,
      timestamp: new Date().toISOString(),
      projectId: FORMA_PROJECT_ID,
      glbFile: 'Henkel_tree.glb',
      note: 'Use this blobId in the representations.volumeMesh field when placing trees'
    };
    
    const outputPath = path.join(__dirname, 'tree-blobid-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log('\n📄 BlobId saved to:', outputPath);
    
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
