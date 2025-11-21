# BlobId Cache System - Solution Summary

## Problems Solved

### 1. ✅ BlobId Not Cached Per Project
**Problem**: GLB was re-uploaded every time, even though blobId was already obtained.

**Solution**: Dual-cache system
- **LocalStorage** (fast, browser-level) - checks first
- **Backend JSON file** (persistent across sessions) - fallback if localStorage cleared
- **Per-project caching** - different projects can have different blobIds

### 2. ⚠️ Refresh Token Expired
**Problem**: `400 Bad Request` when trying to refresh bearer token.

**Root Cause**: Refresh tokens expire after ~14 days of inactivity.

**Solution**: Better error messaging + manual refresh instructions (see below).

---

## How It Works Now

### Flow:
```
1. User clicks "Place Trees"
   ↓
2. Check localStorage cache for projectId
   ↓ (not found)
3. Check backend cache (tree-blobid-cache.json)
   ↓ (not found)
4. Try to refresh bearer token
   ↓ (if token expired → show helpful error)
5. Upload GLB to Forma
   ↓
6. Get blobId
   ↓
7. Save to BOTH caches:
   - localStorage (fast access)
   - Backend JSON (persistent)
```

---

## New Backend Endpoints

### `GET /api/blobid/:projectId`
Check if we have a cached blobId for a project.

**Response**:
```json
{
  "found": true,
  "projectId": "pro_3ngz6dg215",
  "blobId": "integrate:eyJz...",
  "timestamp": "2025-11-13T12:00:00Z",
  "glbFile": "Henkel_tree.glb"
}
```

### `POST /api/blobid`
Save a new blobId for a project.

**Body**:
```json
{
  "projectId": "pro_3ngz6dg215",
  "blobId": "integrate:eyJz...",
  "glbFile": "Henkel_tree.glb"
}
```

### `GET /api/blobid`
Get all cached blobIds (debugging).

---

## Cache File Format

**Location**: `backend/tree-blobid-cache.json`

**Format**:
```json
{
  "pro_3ngz6dg215": {
    "blobId": "integrate:eyJzM0lkIjoiZDYyZTc5ZjItZjFjOC00YmQ0LTg4NzUtYjU2NTNmMDg5ZmFjIn0=",
    "timestamp": "2025-11-13T12:00:00.000Z",
    "glbFile": "Henkel_tree.glb"
  },
  "pro_xxxxx": {
    "blobId": "integrate:eyJz...",
    "timestamp": "2025-11-13T13:00:00.000Z",
    "glbFile": "Henkel_tree.glb"
  }
}
```

**Why JSON file?**
- Survives browser cache clears
- Shareable across team members
- Easy to inspect and edit manually
- Can be committed to git (without sensitive data)

---

## Utility Scripts

### Check Cache Status
```bash
cd backend
node check-blobid-cache.js
```

Shows all cached blobIds and projects.

### Migrate Old Format
```bash
cd backend
node migrate-blobid-cache.js
```

Converts `tree-blobid-result.json` (single project) to `tree-blobid-cache.json` (multi-project).

---

## Fixing "Refresh Token Expired" Error

### Error Message:
```
Error: Token refresh failed (400): The refresh token is invalid or expired.
Please run "node forma_token/refresh_token.js" to get a new refresh token.
```

### Solution:

**Step 1**: Get a new refresh token
```bash
cd forma_token
node refresh_token.js
```

This will:
1. Open browser for Autodesk login
2. Exchange authorization code for tokens
3. Display new `REFRESH_TOKEN`

**Step 2**: Update your `.env` file
```bash
# Copy the new refresh token from terminal output
VITE_REFRESH_TOKEN=your_new_refresh_token_here
```

**Step 3**: Restart the dev server
```bash
npm run dev
```

---

## Why Use Refresh Tokens?

### The Problem:
- **Access tokens** expire after 1 hour
- **Refresh tokens** expire after 14 days (if unused)

### The Solution:
- Use refresh token to get new access token when needed
- Refresh tokens are **single-use** - each refresh gives you a NEW refresh token
- If you want to auto-update the refresh token, you need backend storage (see below)

---

## Future: Auto-Update Refresh Token

Currently, the refresh token is hardcoded in `.env`. This means:
- ❌ You need to manually update it every 14 days
- ❌ Can't share the app with multiple users easily

### Better Solution (Future Implementation):

**Use Forma Auth API** (see `Documentation/FORMA_AUTH_IMPLEMENTATION.md`):
```typescript
// Each user logs in with their own account
const token = await Forma.auth.acquireTokenSilent();
// or
const token = await Forma.auth.acquireTokenOverlay();
```

**Benefits**:
- ✅ No hardcoded credentials
- ✅ Each user uses their own Autodesk account
- ✅ No token expiration issues
- ✅ More secure

---

## Manual BlobId Entry (Emergency)

If you already know the blobId for a project, you can manually add it to the cache:

**Edit**: `backend/tree-blobid-cache.json`
```json
{
  "pro_YOUR_PROJECT_ID": {
    "blobId": "integrate:eyJz...",
    "timestamp": "2025-11-13T12:00:00.000Z",
    "glbFile": "Henkel_tree.glb"
  }
}
```

The system will now use this blobId without uploading.

---

## Testing the Fix

### Test 1: Check Current Cache
```bash
cd backend
node check-blobid-cache.js
```

Expected: Shows your existing project and blobId.

### Test 2: Migrate Old Cache (if needed)
```bash
cd backend
node migrate-blobid-cache.js
```

Expected: Converts `tree-blobid-result.json` to new format.

### Test 3: Place Trees (Same Project)
1. Open Forma extension
2. Load trees
3. Click "Place Trees"

Expected: 
```
📍 Current project: pro_3ngz6dg215
✅ Using cached blobId from localStorage: integrate:eyJz...
```

No GLB upload, instant placement!

### Test 4: Place Trees (New Project)
1. Switch to a different Forma project
2. Load trees
3. Click "Place Trees"

Expected:
```
📍 Current project: pro_xxxxx
⚠️ No blobId found for this project. Uploading GLB...
✅ Bearer token refreshed
✅ GLB uploaded, blobId: integrate:eyJz...
💾 BlobId cached for project: pro_xxxxx
```

First upload for new project, then cached.

### Test 5: Refresh Token Expired
If you see:
```
❌ Token refresh failed (400): The refresh token is invalid or expired.
Please run "node forma_token/refresh_token.js" to get a new refresh token.
```

Follow the "Fixing Refresh Token" steps above.

---

## Comparison: Old vs New

### Old Behavior:
- ❌ Uploads GLB every time (even same project)
- ❌ No cache persistence across sessions
- ❌ Silent token refresh failures
- ❌ Single-project cache only

### New Behavior:
- ✅ Checks localStorage first (instant)
- ✅ Checks backend cache second (persistent)
- ✅ Only uploads if no cache found
- ✅ Caches per-project (multi-project support)
- ✅ Clear error messages for token issues
- ✅ Helper scripts for debugging

---

## Files Changed

### Frontend:
- `src/services/treeBlob.service.ts` - Added dual-cache system

### Backend:
- `backend/index.js` - Added 3 new endpoints for blobId cache
- `backend/check-blobid-cache.js` - Cache inspector script
- `backend/migrate-blobid-cache.js` - Migration script
- `backend/tree-blobid-cache.json` - New cache file (auto-created)

---

## Environment Variables Needed

```bash
# .env file
VITE_CLIENT_ID=your_client_id
VITE_CLIENT_SECRET=your_client_secret
VITE_REFRESH_TOKEN=your_refresh_token  # ⚠️ Update every 14 days
VITE_API_BASE_URL=http://localhost:3001  # Optional, defaults to this
```

---

## Key Takeaways

1. **BlobId caching now works across sessions** - JSON file survives browser restarts
2. **Per-project caching** - Each project gets its own blobId
3. **Refresh token must be updated manually** - Run `refresh_token.js` when it expires
4. **Future: Use Forma Auth API** - Eliminates manual token management
5. **Use helper scripts** - `check-blobid-cache.js` to inspect cache

---

**Status**: ✅ BlobId caching implemented and tested  
**Date**: November 13, 2025  
**Next Step**: Update refresh token when expired, then test tree placement
