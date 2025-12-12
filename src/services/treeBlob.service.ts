/**
 * Tree Blob Management Service
 * 
 * Uses Forma SDK to upload tree GLB and get blobId
 */

import { Forma } from "forma-embedded-view-sdk/auto";

interface BlobIdCache {
  [projectId: string]: {
    blobId: string;
    fileId: string;
    timestamp: string;
  };
}

export interface TreeUploadResult {
  blobId: string;
  fileId: string;
}

/**
 * Get or create blobId and fileId for current project using Forma SDK
 */
export async function getTreeBlobId(): Promise<TreeUploadResult> {
  try {
    // 1. Get current project ID
    const projectId = await Forma.getProjectId();
    console.log('📍 Current project:', projectId);

    // 2. Check localStorage cache first (fastest)
    const cachedResult = getCachedBlobId(projectId);
    if (cachedResult) {
      console.log('✅ Using cached upload from localStorage');
      console.log('   fileId:', cachedResult.fileId);
      console.log('   blobId:', cachedResult.blobId);
      return cachedResult;
    }

    console.log('⚠️ No blobId found for this project. Uploading GLB via SDK...');

    // 3. Fetch GLB file from public folder (using 12m model)
    const glbResponse = await fetch('tree_model/treeModel_12m.glb');
    if (!glbResponse.ok) {
      throw new Error('Failed to fetch GLB file from public folder');
    }
    const glbBlob = await glbResponse.blob();
    const glbArrayBuffer = await glbBlob.arrayBuffer();
    console.log('📦 GLB file loaded, size:', glbArrayBuffer.byteLength, 'bytes');

    // 4. Upload using Forma SDK (returns { fileId, blobId })
    const upload = await Forma.integrateElements.uploadFile({
      authcontext: projectId,
      data: glbArrayBuffer
    });

    console.log('✅ GLB uploaded via SDK');
    console.log('   fileId:', upload.fileId);
    console.log('   blobId:', upload.blobId);

    // 5. Cache both IDs for future use
    cacheBlobId(projectId, upload.blobId, upload.fileId);

    return {
      blobId: upload.blobId,
      fileId: upload.fileId
    };

  } catch (error) {
    console.error('❌ Error getting tree blobId:', error);
    throw new Error(`Failed to get blobId: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check localStorage for cached upload result
 */
function getCachedBlobId(projectId: string): TreeUploadResult | null {
  try {
    const cacheStr = localStorage.getItem('forma_tree_blobids');
    if (!cacheStr) return null;

    const cache: BlobIdCache = JSON.parse(cacheStr);
    const entry = cache[projectId];

    if (!entry) return null;

    // Invalidate old cache format (before fileId was added)
    if (!entry.fileId) {
      console.log('⚠️ Cache is old format (missing fileId), will refresh');
      return null;
    }

    // Check if cache is less than 7 days old
    const cacheAge = Date.now() - new Date(entry.timestamp).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (cacheAge > sevenDays) {
      console.log('⚠️ Cached upload is older than 7 days, will refresh');
      return null;
    }

    return {
      blobId: entry.blobId,
      fileId: entry.fileId
    };
  } catch (error) {
    console.error('Error reading upload cache:', error);
    return null;
  }
}

/**
 * Save upload result to localStorage
 */
function cacheBlobId(projectId: string, blobId: string, fileId: string): void {
  try {
    const cacheStr = localStorage.getItem('forma_tree_blobids') || '{}';
    const cache: BlobIdCache = JSON.parse(cacheStr);

    cache[projectId] = {
      blobId,
      fileId,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem('forma_tree_blobids', JSON.stringify(cache));
    console.log('💾 Upload cached for project:', projectId);
  } catch (error) {
    console.error('Error caching upload:', error);
  }
}
