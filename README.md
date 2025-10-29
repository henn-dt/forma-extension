# Forma Tile Extraction Extension

A React-based Forma extension that fetches high-resolution Mapbox satellite imagery aligned with Forma's UTM coordinate system through advanced coordinate transformation and perspective warping.

![Forma Extension](./public/FormaWithZoom.png)

## 🎯 Overview

This extension solves a critical challenge in geospatial data integration: **obtaining satellite imagery that precisely aligns with Forma's UTM projection**. Unlike simple map overlays, this tool:

1. **Fetches raster tiles** at optimal zoom levels for maximum resolution
2. **Stitches tiles** into a single canvas covering the project area
3. **Transforms coordinates** from UTM to WGS84 (lat/lon)
4. **Applies perspective warping** to correct for projection differences
5. **Outputs UTM-aligned imagery** matching Forma's coordinate system

### Why This Matters

Forma uses **UTM (Universal Transverse Mercator)** projection, which represents positions as metric coordinates (meters east/north from a reference point). Mapbox and most web mapping services use **Web Mercator (EPSG:3857)** projection. Simply overlaying images from these different projections results in:
- Rotated/skewed imagery
- Misaligned features
- Distorted geometry

This extension uses **homography transformations** to correct these distortions, ensuring pixel-perfect alignment.

## 🚀 Key Features

### Core Functionality
- � **Dynamic Zoom Calculation**: Automatically determines optimal tile resolution based on project size
- 🗺️ **Raster Tile Stitching**: Fetches and combines multiple high-resolution tiles (512×512px @2x)
- 🔄 **Perspective Warping**: Uses Direct Linear Transform (DLT) to correct projection differences
- � **Precise Coordinate Transformation**: proj4 library for accurate UTM ↔ WGS84 conversion
- 💾 **Backend Storage**: Express API for saving processed tiles
- � **Project Metadata**: Display location, dimensions, SRID, and coordinate reference systems

### Technical Highlights
- ✅ Sub-meter accuracy (~0.75 m/pixel at zoom 18)
- ✅ Handles terrain bounds as offsets from reference points
- ✅ Supports any UTM zone via proj4 projection strings
- ✅ Eliminates padding artifacts from axis-aligned bboxes
- ✅ Pixel-perfect homography with nearest-neighbor sampling

## 📸 Visual Demonstrations

### Quality Comparison: Static API vs Raster Tiles
![WMTS vs Static](./public/WMTS.png)
*Left: Stitched raster tiles (zoom 17) | Right: Mapbox Static API*

The raster tile approach provides sharper imagery because:
- **Fixed zoom level** ensures consistent resolution, which is crucial for detecting trees accurately later on
- **No auto-zoom calculation** that reduces quality
- **Precise cropping** eliminates padding and rotation artifacts

### Coordinate Transformation Process
![UTM to LatLon](./public/UTM-to-LatLon.png)
*Visualization of coordinate transformation from UTM to WGS84 lat/lon*
*(Credit: [Forma Developer Forum](https://forums.autodesk.com/t5/forma-developer-forum/terrain-bbox-differs-from-mapbox-image/m-p/12688873))*

### Perspective Warping Demo
![Warp Demo](./public/WarpDemo.png)
*Demonstrating the homography transform that corrects Web Mercator → UTM distortions*

## 🏗️ Architecture

### **Old Approach (Static API)** ❌
```
UTM Bbox → WGS84 Bbox → Static API (auto-zoom) → Padded Image → Warp
```
**Problems:**
- Mapbox auto-calculates zoom (often too low)
- Axis-aligned bbox creates padding
- Complex corner pixel calculations
- Lower effective resolution

### **New Approach (Raster Tiles)** ✅
```
UTM Bbox → WGS84 Bbox → Calculate Optimal Zoom → Fetch Raster Tiles → Stitch → Crop → Warp
```
**Benefits:**
- Fixed zoom based on desired resolution
- Precise cropping to exact bbox
- Higher quality tiles (@2x = 512×512px)
- Simplified corner calculation

### Zoom Calculation Formula
```typescript
zoom = log2((earthCircumference/256) / desiredMPP / cos(lat))
```
Where:
- `desiredMPP` = meters per pixel (calculated from bbox size / output pixels)
- `earthCircumference/256` = meters per pixel at zoom 0
- `cos(lat)` = correction for latitude distortion in Web Mercator

**Example:** For a ~2km bbox at mid-latitudes with 2560×2408px output:
- Desired: ~0.8 m/px
- Calculated zoom: ~18
- Actual resolution: ~0.6 m/px (sub-meter accuracy)

## 🛠️ Technical Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Forma SDK:** `forma-embedded-view-sdk/auto`
- **Coordinate Transforms:** proj4 2.19.10
- **Map Provider:** Mapbox Raster Tiles API (v4) + Static Images API
- **Image Processing:** Canvas 2D API (homography, stitching, warping)
- **Backend:** Node.js + Express (tile storage)

## 📋 Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Forma account with embedded view access
- **Mapbox Access Token** ([Get one here](https://account.mapbox.com/))

## 🔧 Installation

1. **Clone the repository:**
```bash
git clone https://github.com/ABCHai25/Forma-Project-Info.git
cd Forma-Project-Info
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
Create a `.env` file in the project root:
```bash
VITE_MAPBOX_TOKEN=your_mapbox_token_here
VITE_API_BASE_URL=http://localhost:3001  # Optional, defaults to localhost:3001
```

4. **Start the backend server:**
```bash
cd backend
npm install
npm start
```

5. **Start the development server:**
```bash
npm run dev
```

## 📖 Usage Guide

### Basic Workflow

1. **Launch** the extension in your Forma project
2. **Get Project Info** → Retrieves metadata (location, SRID, projection string, reference point)
3. **Get Terrain BBox** → Fetches terrain bounds (offsets from reference point)
4. **Fetch Mapbox Tile** → Automatically:
   - Calculates optimal zoom level
   - Fetches raster tiles at that zoom
   - Stitches tiles into single canvas
   - Crops precisely to bbox
   - Applies perspective warp to UTM projection
   - Displays aligned imagery
5. **Confirm & Save Tile** → Saves processed tile to backend storage

## 📁 Project Structure

```
my-react-forma/
├── src/
│   ├── App.tsx                 # Main application (raster tiles + warping)
│   ├── App_bboxMap&zoom.tsx    # Legacy: Static API with manual zoom
│   ├── App_wihoutHD.tsx        # Legacy: Static API without zoom controls
│   ├── App_without_Zoom.tsx    # Legacy: Static API baseline
│   ├── WMTS.tsx                # Demo: Raster tiles vs Static API comparison
│   ├── App-WMTS.tsx            # Entry point for WMTS demo
│   ├── WarpDemo.tsx            # Demo: Perspective warping visualization
│   ├── App-WarpDemo.tsx        # Entry point for warp demo
│   └── main.tsx
├── backend/
│   ├── index.js                # Express server for tile storage
│   └── package.json
├── fetched_tiles/              # Saved satellite tiles
│   ├── satellite_tile_*.png    # Sample tiles (included in repo)
│   └── satellite_tile_*.json   # Metadata for samples
├── public/
│   ├── FormaWithZoom.png       # Main screenshot
│   ├── WMTS.png                # Quality comparison
│   └── WarpDemo.png            # Warping demonstration
├── forma_Kasper_example.js     # Reference: Forma projection explanation
└── README.md
```

### Legacy Files (Reference Only)

These files document the evolution of the solution and may be useful for understanding different approaches:

- **`App_bboxMap&zoom.tsx`**: Uses Mapbox Static Images API with manual zoom controls. Simpler but lower quality due to auto-zoom calculation and padding artifacts.
- **`App_wihoutHD.tsx`**: Similar to above but without @2x resolution.
- **`App_without_Zoom.tsx`**: Baseline implementation without zoom controls.

**Recommendation:** Use `App.tsx` for production. Legacy files are kept for educational purposes and can be removed if not needed.

### Demo Files

- **`WMTS.tsx`**: Side-by-side comparison showing why raster tiles provide better quality than Static API
- **`WarpDemo.tsx`**: Interactive visualization of homography transformation

To run demos, change the import in `main.tsx`:
```typescript
// import App from './App.tsx'           // Main app
// import App from './App-WMTS.tsx'      // Quality comparison demo
// import App from './App-WarpDemo.tsx'  // Warping demo
```

## 🧮 How It Works

The extension performs a multi-step transformation pipeline:

1. **Coordinate Transformation**: Convert UTM terrain bounds (offsets from reference point) to WGS84 lat/lon using proj4
2. **Zoom Calculation**: Determine optimal tile zoom level based on desired resolution (meters per pixel)
3. **Tile Fetching**: Fetch grid of high-resolution raster tiles covering the WGS84 bbox
4. **Stitching & Cropping**: Combine tiles and crop precisely to bbox boundaries
5. **Perspective Warping**: Apply homography transformation to correct Web Mercator → UTM distortions

**Key Insight:** UTM corners form a rotated quadrilateral within the Mercator image. The homography matrix maps this quadrilateral back to an axis-aligned rectangle in UTM projection, ensuring perfect alignment with Forma's coordinate system.

## 🔑 Key Algorithms

### Direct Linear Transform (DLT)
Solves for homography matrix from 4 point correspondences:
```
For each corner pair (x,y) → (x',y'):
  [-x  -y  -1   0   0   0  x·x'  y·x'  x'] [h0]   [0]
  [ 0   0   0  -x  -y  -1  x·y'  y·y'  y'] [h1] = [0]
                                            [h2]
                                            [h3]
                                            [h4]
                                            [h5]
                                            [h6]
                                            [h7]
                                            [1]
```
Solve using Gaussian elimination + least squares.

### Tile Coordinate Conversion
```typescript
// Longitude → Tile X
x = floor(((lon + 180) / 360) × 2^zoom)

// Latitude → Tile Y (Web Mercator projection)
y = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 × 2^zoom)
```

## 🌐 API Reference

### Mapbox APIs Used

**Raster Tiles API (Current):**
```
GET https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token={token}
```
- Returns 512×512px tiles (with @2x)
- Fixed zoom level for consistent quality
- Stitched to cover bbox

**Static Images API (Legacy):**
```
GET https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[{bbox}]/{width}x{height}@2x?access_token={token}
```
- Auto-calculates zoom (less control)
- Returns single image with padding
- Used in legacy App versions

### Backend API

**Save Tile:**
```http
POST /api/saveTile
Content-Type: application/json

{
  "imageUrl": "data:image/png;base64,...",
  "projectId": "pro_t6b6iu8gr8",
  "zoom": 18,
  "bbox": { "west": -979, "south": -920, "east": 978, "north": 920 },
  "center": { "latitude": 51.171957, "longitude": 6.843056 }
}
```

**Response:**
```json
{
  "message": "Tile saved successfully",
  "filename": "satellite_tile_pro_t6b6iu8gr8_zoom18_2025-10-29T10-35-32.png",
  "path": "/fetched_tiles/satellite_tile_..."
}
```

## 🔒 Security

- ✅ **Environment variables** for sensitive tokens (`.env` excluded from Git)
- ✅ **CORS enabled** on backend for frontend communication
- ✅ **50MB body limit** to handle large base64 images
- ✅ **Token sanitization** in console logs (configured, can be removed before push)
- ✅ **`.github` folder ignored** (contains Copilot instructions with API usage patterns)

**Before pushing to public repo:**
```bash
# Remove token from console logs
# Search for: MAPBOX_ACCESS_TOKEN
# Remove from: line 867 in App.tsx
```

## 🧪 Testing

Test the extension with different project sizes:
- **Small** (<750m): Should use zoom 19-20
- **Medium** (1-2km): Should use zoom 17-18
- **Large** (>3km): Should use zoom 15-16

Verify alignment:
1. Load tile in Forma
2. Overlay on Forma's satellite layer
3. Check that features (buildings, roads) align exactly

## 📊 Performance

**Typical Performance (2km bbox, zoom 18):**
- Tile fetching: ~2-3 seconds (4-9 tiles × 512×512px)
- Stitching: <100ms
- Cropping: <50ms
- Warping: ~3-5 seconds (5-6M pixels transformed)
- Total: ~6-8 seconds

**Optimizations:**
- Nearest-neighbor sampling (faster than bilinear)
- Canvas-based operations (hardware accelerated)
- Efficient homography calculation
- @2x tiles maximize quality without excessive resolution

## 🐛 Troubleshooting

**Issue:** Warped image appears blank or distorted
- **Check:** Console for "Valid pixels sampled" percentage
- **Solution:** Ensure corners form a valid quadrilateral (not degenerate)

**Issue:** Low-quality output despite high zoom
- **Check:** Zoom level in console logs
- **Solution:** Verify desiredMPP calculation and cos(lat) correction

**Issue:** Misalignment with Forma
- **Check:** Reference point and projection string
- **Solution:** Ensure proj4 string matches Forma's SRID exactly

**Issue:** 413 Payload Too Large
- **Solution:** Backend body limit increased to 50MB (already configured)

## 📚 Additional Resources

- **Forma Embedded Views:** https://aps.autodesk.com/en/docs/forma/v1/embedded-views/
- **Mapbox Raster Tiles:** https://docs.mapbox.com/api/maps/raster-tiles/
- **proj4 Documentation:** http://proj4.org/
- **UTM Projection:** https://en.wikipedia.org/wiki/Universal_Transverse_Mercator_coordinate_system
- **Homography Tutorial:** https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html
- **forma_Kasper_example.js:** Reference code from Forma developer explaining projection handling

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- [ ] Web Workers for parallel tile fetching
- [ ] GPU-accelerated warping (WebGL)
- [ ] IndexedDB caching for tiles
- [ ] Dynamic quality adjustment
- [ ] Batch processing multiple projects
- [ ] Alignment validation metrics (SSIM, RMSE)

**To contribute:**
1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Kasper (Forma Team):** For `forma_Kasper_example.js` explaining Forma's coordinate system
- **Kristoffer:** For zoom calculation formula and Mapbox API guidance
- **Mapbox:** For high-quality satellite imagery
- **proj4:** For robust coordinate transformation library
- **Autodesk Forma Team:** For embedded view SDK and documentation

---

**Built with ❤️ for accurate geospatial data integration**

*Last Updated: October 29, 2025*