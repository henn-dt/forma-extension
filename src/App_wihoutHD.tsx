import { useState } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import proj4 from 'proj4';
import './App.css'

/** Normalized bbox we'll show in the UI */
type BBox = {
  west: number; south: number; east: number; north: number;
  crs?: string;
};

type Project = {
  countryCode: string;
  srid: number;
  refPoint: [number, number];
  projString: string;
  timezone: string;
  hubId: string;
  name: string;
};

type MapboxData = {
  center: { latitude: number; longitude: number };
  zoom: number;
  style: string;
  size: { width: number; height: number };
  bbox: { west: number; south: number; east: number; north: number };
  url: string;
};

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_STYLE = 'mapbox/satellite-v9';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function calculateArea(bbox: BBox): number {
  const width = Math.abs(bbox.east - bbox.west);
  const height = Math.abs(bbox.north - bbox.south);
  return width * height;
}

function calculateDimensions(bbox: BBox): { width: number; length: number } {
  return {
    width: Math.abs(bbox.east - bbox.west),
    length: Math.abs(bbox.north - bbox.south)
  };
}

function calculateImageDimensions(
  bbox: BBox,
  maxSize: number = 1280
): { width: number; height: number } {
  const bboxWidth = Math.abs(bbox.east - bbox.west);
  const bboxHeight = Math.abs(bbox.north - bbox.south);
  const aspectRatio = bboxWidth / bboxHeight;
  
  let width: number;
  let height: number;
  
  if (aspectRatio > 1) {
    // Wider than tall
    width = maxSize;
    height = Math.round(maxSize / aspectRatio);
  } else {
    // Taller than wide
    height = maxSize;
    width = Math.round(maxSize * aspectRatio);
  }
  
  // Ensure both dimensions are valid for Mapbox (max 1280)
  width = Math.min(width, 1280);
  height = Math.min(height, 1280);
  
  console.log(`Image dimensions: ${width}×${height} (aspect ratio: ${aspectRatio.toFixed(3)})`);
  
  return { width, height };
}

function utmToLatLon(
  utmEasting: number,
  utmNorthing: number,
  projString: string
): { lat: number; lon: number } {
  // WGS84 lat/lon projection
  const projWgs84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
  
  // Convert
  const [lon, lat] = proj4(projString, projWgs84, [utmEasting, utmNorthing]);
  
  return { lat, lon };
}

function transformBboxCorrectly(
  terrainBounds: BBox, // Offsets in meters from refPoint
  refPointUTM: [number, number], // Absolute UTM coordinates [easting, northing]
  projString: string
): {
  corners: { lat: number; lon: number }[];
  bboxLatLon: [number, number, number, number]; // [west, south, east, north]
} {
  const [refEasting, refNorthing] = refPointUTM;
  
  console.log('Reference Point (absolute UTM):', refPointUTM);
  console.log('Terrain Bounds (relative offsets from refPoint):', terrainBounds);
  console.log('Projection string:', projString);
  
  // Step 1: Calculate corner coordinates in UTM
  const cornersAbsoluteUTM = [
    { 
      easting: refEasting + terrainBounds.west, 
      northing: refNorthing + terrainBounds.south 
    }, // SW
    { 
      easting: refEasting + terrainBounds.west, 
      northing: refNorthing + terrainBounds.north 
    }, // NW
    { 
      easting: refEasting + terrainBounds.east, 
      northing: refNorthing + terrainBounds.north 
    }, // NE
    { 
      easting: refEasting + terrainBounds.east, 
      northing: refNorthing + terrainBounds.south 
    }, // SE
  ];
  
  console.log('Corner coordinates (absolute UTM):', cornersAbsoluteUTM);
  
  // Step 2: Convert each corner from UTM to lat/lon
  const cornersLatLon = cornersAbsoluteUTM.map(corner => 
    utmToLatLon(corner.easting, corner.northing, projString)
  );
  
  console.log('Corner coordinates (WGS84 lat/lon):', cornersLatLon);
  
  // Step 3: Create axis-aligned bbox from corners
  const lats = cornersLatLon.map(c => c.lat);
  const lons = cornersLatLon.map(c => c.lon);
  
  const bboxLatLon: [number, number, number, number] = [
    Math.min(...lons), // west (min longitude)
    Math.min(...lats), // south (min latitude)
    Math.max(...lons), // east (max longitude)
    Math.max(...lats)  // north (max latitude)
  ];
  
  console.log('Axis-aligned bbox (WGS84):', bboxLatLon);
  
  return { corners: cornersLatLon, bboxLatLon };
}

/**
 * Generate Mapbox URL using bbox parameter (auto-calculates zoom!)
 */
function generateMapboxURLWithBbox(
  bboxLatLon: [number, number, number, number], // [west, south, east, north]
  width: number,
  height: number
): string {
  const [west, south, east, north] = bboxLatLon;
  
  // Use bbox parameter - Mapbox automatically calculates the best zoom level!
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/[${west},${south},${east},${north}]/${width}x${height}@2x?logo=false&access_token=${MAPBOX_ACCESS_TOKEN}`;
}

/**
 * Calculate pixel positions of UTM corners in the fetched Mapbox image
 */
function calculateCornerPixelPositions(
  cornersLatLon: { lat: number; lon: number }[],
  bboxLatLon: [number, number, number, number], // [west, south, east, north]
  imageSize: { width: number; height: number }
): { x: number; y: number }[] {
  const [west, south, east, north] = bboxLatLon;
  
  return cornersLatLon.map(corner => {
    // Normalize to 0-1 range
    const normX = (corner.lon - west) / (east - west);
    const normY = (north - corner.lat) / (north - south); // Flip Y (image top = north)
    
    return {
      x: normX * imageSize.width,
      y: normY * imageSize.height
    };
  });
}

/**
 * Calculate homography matrix from 4 point correspondences
 * Based on Direct Linear Transform (DLT) algorithm
 */
function calculateHomography(
  src: number[], // [x1,y1, x2,y2, x3,y3, x4,y4]
  dst: number[]  // [x1,y1, x2,y2, x3,y3, x4,y4]
): number[] {
  // Build the matrix A for homography calculation
  const A: number[][] = [];
  
  for (let i = 0; i < 4; i++) {
    const sx = src[i * 2];
    const sy = src[i * 2 + 1];
    const dx = dst[i * 2];
    const dy = dst[i * 2 + 1];
    
    A.push([
      -sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx
    ]);
    A.push([
      0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy
    ]);
  }
  
  // Solve using SVD (simplified approach for 3x3 homography)
  // For simplicity, we'll use a direct calculation method
  
  // This is a simplified version - for production, use a proper linear algebra library
  // But this works well enough for our perspective transform
  
  const h = solveHomography(A);
  return h;
}

function solveHomography(A: number[][]): number[] {
  // Simplified homography solver
  // Returns the 9 coefficients of the 3x3 homography matrix
  
  // This is a basic implementation - for better accuracy, use numeric.js or similar
  // But for our use case (perspective correction), this approximation works
  
  // Using least squares approximation
  const AtA: number[][] = [];
  const Atb: number[] = [];
  
  // Build normal equations
  for (let i = 0; i < 8; i++) {
    AtA[i] = [];
    Atb[i] = 0;
    for (let j = 0; j < 8; j++) {
      let sum = 0;
      for (let k = 0; k < A.length; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
    for (let k = 0; k < A.length; k++) {
      Atb[i] -= A[k][i] * A[k][8];
    }
  }
  
  // Solve using Gaussian elimination
  const h = gaussianElimination(AtA, Atb);
  h.push(1); // h[8] = 1 (normalization)
  
  return h;
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = A.length;
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];
    
    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] -= c * A[i][j];
        }
      }
      b[k] -= c * b[i];
    }
  }
  
  // Back substitution
  const x: number[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i];
    for (let j = i + 1; j < n; j++) {
      x[i] -= A[i][j] * x[j];
    }
    x[i] /= A[i][i];
  }
  
  return x;
}

/**
 * Apply homography transform to a point
 */
function applyHomography(h: number[], x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + h[8];
  const px = (h[0] * x + h[1] * y + h[2]) / w;
  const py = (h[3] * x + h[4] * y + h[5]) / w;
  return [px, py];
}

/**
 * Warp fetched Mapbox image back to UTM projection using perspective transform
 * This removes the rotation/shearing that occurred during UTM → lat/lon conversion
*/
async function warpImageToUTM(
  blobUrl: string, // NOW RECEIVES BLOB URL (not imageUrl)
  cornerPixelsInFetchedImage: { x: number; y: number }[], // [SW, NW, NE, SE]
  utmDimensions: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      console.log('Image loaded, applying perspective transform...');
      console.log('Input image size:', img.width, 'x', img.height);
      console.log('Output UTM size:', utmDimensions.width, 'x', utmDimensions.height);
      
      const canvas = document.createElement('canvas');
      canvas.width = utmDimensions.width;
      canvas.height = utmDimensions.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Source corners in fetched image (rotated quadrilateral)
      // Order: [NW, NE, SE, SW] (clockwise from top-left)
      const scale = img.width / utmDimensions.width;
      const srcCorners = [
        cornerPixelsInFetchedImage[1].x * scale, cornerPixelsInFetchedImage[1].y * scale, // NW
        cornerPixelsInFetchedImage[2].x * scale, cornerPixelsInFetchedImage[2].y * scale, // NE
        cornerPixelsInFetchedImage[3].x * scale, cornerPixelsInFetchedImage[3].y * scale, // SE
        cornerPixelsInFetchedImage[0].x * scale, cornerPixelsInFetchedImage[0].y * scale  // SW
      ];
      
      // Destination corners in UTM canvas (perfect rectangle)
      // Order: [NW, NE, SE, SW] (clockwise from top-left)
      const dstCorners = [
        0, 0,                                        // NW
        utmDimensions.width, 0,                     // NE
        utmDimensions.width, utmDimensions.height,  // SE
        0, utmDimensions.height                     // SW
      ];

      console.log('Source corners (in fetched image):', srcCorners);
      console.log('Destination corners (UTM rectangle):', dstCorners);
      
      // Calculate INVERSE homography: dst -> src
      const H = calculateHomography(dstCorners, srcCorners);
      console.log('Inverse homography matrix calculated');
      
      // Get source image data
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(img, 0, 0);
      const srcImageData = srcCtx.getImageData(0, 0, img.width, img.height);
      
      // Create destination image data
      const dstImageData = ctx.createImageData(utmDimensions.width, utmDimensions.height);

      console.log('Applying homography transform...');
      let pixelsProcessed = 0;
      let validPixels = 0;
      const totalPixels = utmDimensions.width * utmDimensions.height;
      
      // Apply perspective transform pixel-by-pixel
      for (let y = 0; y < utmDimensions.height; y++) {
        for (let x = 0; x < utmDimensions.width; x++) {
          // Transform destination pixel to source pixel
          const [srcX, srcY] = applyHomography(H, x, y);
          
          // Use nearest-neighbor for sharper results (or bilinearSample for smoother)
          if (srcX >= 0 && srcX < img.width - 1 && srcY >= 0 && srcY < img.height - 1) {
            const color = nearestNeighborSample(srcImageData, srcX, srcY, img.width, img.height);
            const dstIdx = (y * utmDimensions.width + x) * 4;
            dstImageData.data[dstIdx] = color.r;
            dstImageData.data[dstIdx + 1] = color.g;
            dstImageData.data[dstIdx + 2] = color.b;
            dstImageData.data[dstIdx + 3] = 255;
            validPixels++;
          } else {
            // Fill out-of-bounds pixels with black (optional: could use transparent)
            const dstIdx = (y * utmDimensions.width + x) * 4;
            dstImageData.data[dstIdx] = 0;
            dstImageData.data[dstIdx + 1] = 0;
            dstImageData.data[dstIdx + 2] = 0;
            dstImageData.data[dstIdx + 3] = 255;
          }
          pixelsProcessed++;
        }
        // Log progress every 10%
        if (y % Math.floor(utmDimensions.height / 10) === 0) {
          const progress = ((pixelsProcessed / totalPixels) * 100).toFixed(0);
          console.log(`Transform progress: ${progress}%`);
        }
      }
      
      console.log('Putting transformed image data to canvas...');
      console.log(`Valid pixels sampled: ${validPixels} / ${totalPixels} (${((validPixels/totalPixels)*100).toFixed(1)}%)`);
      ctx.putImageData(dstImageData, 0, 0);
      
      // Use maximum quality PNG (no compression parameter for PNG, but we can try JPEG quality 1.0 or use PNG)
      const outputDataURL = canvas.toDataURL('image/png'); // PNG is lossless
      
      console.log('✅ Perspective transform complete!');
      console.log('Output data URL length:', outputDataURL.length);

      // Sanity check: data URL should start with "data:image/png;base64,"
      if (!outputDataURL.startsWith('data:image/png;base64,')) {
        console.error('❌ Invalid data URL format!');
        reject(new Error('Failed to generate valid data URL'));
        return;
      }
      
      resolve(outputDataURL);
    };
    
    img.onerror = (err) => {
      console.error('Image load error:', err);
      reject(new Error('Failed to load image from blob'));
    };
    
    // CRITICAL FIX: Use blobUrl (the parameter), not imageUrl
    img.src = blobUrl;
  });
}

/**
 * Nearest-neighbor sampling - sharper but may show pixelation
 */
function nearestNeighborSample(
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
): { r: number; g: number; b: number } {
  const px = Math.round(x);
  const py = Math.round(y);
  
  // Clamp to valid range
  const clampedX = Math.max(0, Math.min(width - 1, px));
  const clampedY = Math.max(0, Math.min(height - 1, py));
  
  const idx = (clampedY * width + clampedX) * 4;
  return {
    r: imageData.data[idx],
    g: imageData.data[idx + 1],
    b: imageData.data[idx + 2]
  };
}

/**
 * Bilinear interpolation for smooth pixel sampling
 * NOTE: Currently using nearestNeighborSample for sharper results.
 * Switch back to this if nearest-neighbor appears too pixelated.
 */
function bilinearSample(
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
): { r: number; g: number; b: number } {
  // Clamp to valid range
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));

  const x0 = Math.floor(x);
  const x1 = Math.min(x0 + 1, width - 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(y0 + 1, height - 1);
  
  const dx = x - x0;
  const dy = y - y0;
  
  const getPixel = (px: number, py: number) => {
    const idx = (py * width + px) * 4;
    return {
      r: imageData.data[idx],
      g: imageData.data[idx + 1],
      b: imageData.data[idx + 2]
    };
  };
  
  const c00 = getPixel(x0, y0);
  const c10 = getPixel(x1, y0);
  const c01 = getPixel(x0, y1);
  const c11 = getPixel(x1, y1);
  
  return {
    r: Math.round(
      c00.r * (1 - dx) * (1 - dy) +
      c10.r * dx * (1 - dy) +
      c01.r * (1 - dx) * dy +
      c11.r * dx * dy
    ),
    g: Math.round(
      c00.g * (1 - dx) * (1 - dy) +
      c10.g * dx * (1 - dy) +
      c01.g * (1 - dx) * dy +
      c11.g * dx * dy
    ),
    b: Math.round(
      c00.b * (1 - dx) * (1 - dy) +
      c10.b * dx * (1 - dy) +
      c01.b * (1 - dx) * dy +
      c11.b * dx * dy
    )
  };
}

function App() {
  const [status, setStatus] = useState<string>("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mapboxData, setMapboxData] = useState<MapboxData | null>(null);

  const copyJSON = async () => {
    if (!bbox) return;

    const dimensions = calculateDimensions(bbox);
    const exportData = {
      geographicLocation: location ? {
        latitude: parseFloat(location[0].toFixed(6)),
        longitude: parseFloat(location[1].toFixed(6))
      } : null,
      projectDetails: projectData ? {
        id: projectId,
        name: projectData.name,
        countryCode: projectData.countryCode,
        srid: projectData.srid,
        timezone: projectData.timezone,
        refPoint: projectData.refPoint,
        projString: projectData.projString
      } : null,
      terrainBounds: {
        west: parseFloat(bbox.west.toFixed(6)),
        south: parseFloat(bbox.south.toFixed(6)),
        east: parseFloat(bbox.east.toFixed(6)),
        north: parseFloat(bbox.north.toFixed(6)),
        dimensions: {
          width: parseFloat(dimensions.width.toFixed(2)),
          length: parseFloat(dimensions.length.toFixed(2))
        },
        area: parseFloat(calculateArea(bbox).toFixed(2))
      }
    };

    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setStatus("JSON copied to clipboard ✔");
    setTimeout(() => setStatus(""), 1200);
  };

  const getBBox = async () => {
    setStatus("Fetching terrain bbox…");
    try {
      const raw = await Forma.terrain.getBbox();
      
      const normalized: BBox = {
        west: raw.min.x,
        south: raw.min.y,
        east: raw.max.x,
        north: raw.max.y
      };

      setBbox(normalized);
      setStatus("Terrain bbox loaded ✔");
    } catch (err) {
      console.error("getBBox failed:", err);
      setStatus("Error getting bbox ❌");
    }
  };

  const getProjectInfo = async () => {
    setStatus("Fetching project data...");
    try {
      const id = await Forma.getProjectId();
      setProjectId(id);

      const geoLocation = await Forma.project.getGeoLocation();
      if (!geoLocation) {
        throw new Error("Could not get project location");
      }
      setLocation(geoLocation);

      const project = await Forma.project.get();
      setProjectData(project);
      
      setStatus("Project data loaded ✔");
    } catch (err) {
      console.error("Failed to get project info:", err);
      setStatus("Error getting project data ❌");
    }
  };

  const fetchMapboxTile = async () => {
    if (!bbox || !projectData) {
      setStatus("Please fetch project info and bbox first ❌");
      return;
    }

    setStatus("Generating and warping Mapbox tile...");
    try {
      // 1. Calculate UTM image dimensions
      const utmDimensions = calculateImageDimensions(bbox);
      
      // Get the reference point and projection string from Forma
      const refPointUTM = projectData.refPoint; // [easting, northing]
      const projString = projectData.projString; // Full proj4 string
      
      console.log('Using projection string:', projString);
      console.log('Reference point (UTM):', refPointUTM);

      // Convert UTM bbox to lat/lon using the CORRECT projection
      const { corners: cornersLatLon, bboxLatLon } = transformBboxCorrectly(
        bbox,
        refPointUTM,
        projString // Pass projString instead of srid
      );
    

      // 3. Fetch axis-aligned image from Mapbox (will have padding due to rotation)
      const mapboxUrl = generateMapboxURLWithBbox(
        bboxLatLon,
        utmDimensions.width,
        utmDimensions.height
      );
      
      console.log('Fetching image from Mapbox:', mapboxUrl);
      console.log('UTM dimensions:', utmDimensions);
      console.log('Lat/lon bbox:', bboxLatLon);

      // Fetch the image as blob to avoid CORS
      const response = await fetch(mapboxUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // CRITICAL: Output at @2x resolution to maintain quality!
      const outputDimensions = {
        width: utmDimensions.width * 2,  // Match the @2x input resolution
        height: utmDimensions.height * 2
      };
      
      // 4. Calculate where UTM corners are in the fetched image (in pixels)
      // Use outputDimensions (2x) to match the final output size
      const cornerPixels = calculateCornerPixelPositions(
        cornersLatLon,
        bboxLatLon,
        outputDimensions  // Use @2x dimensions!
      );
      
      console.log('UTM corner positions in fetched image (at @2x resolution):', cornerPixels);
      
      // 5. Warp image back to UTM projection
      setStatus("Applying perspective transform to match UTM projection...");
      
      const warpedImageURL = await warpImageToUTM(
        blobUrl,
        cornerPixels,
        outputDimensions // Use higher resolution output
      );

      URL.revokeObjectURL(blobUrl);
      
      const newMapboxData: MapboxData = {
        center: {
          latitude: (bboxLatLon[1] + bboxLatLon[3]) / 2,
          longitude: (bboxLatLon[0] + bboxLatLon[2]) / 2
        },
        zoom: 0, // Not applicable with bbox method
        style: MAPBOX_STYLE,
        size: outputDimensions, // Reflect actual @2x output size
        bbox: {
          west: bbox.west,
          south: bbox.south,
          east: bbox.east,
          north: bbox.north
        },
        url: warpedImageURL // This is now the corrected, warped image!
      };

      setMapboxData(newMapboxData);
      setStatus("Mapbox tile warped to UTM ✔");
      
    } catch (err) {
      console.error("Failed to generate Mapbox tile:", err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'} ❌`);
    }
  };

  const copyMapboxJSON = async () => {
    if (!mapboxData) return;

    const safeData = {
      center: mapboxData.center,
      zoom: typeof mapboxData.zoom === 'number' ? parseFloat(mapboxData.zoom.toFixed(2)) : mapboxData.zoom,
      style: mapboxData.style,
      size: mapboxData.size,
      bbox: mapboxData.bbox
    };

    await navigator.clipboard.writeText(JSON.stringify(safeData, null, 2));
    setStatus("Mapbox JSON copied to clipboard ✔");
    setTimeout(() => setStatus(""), 1200);
  };

  const saveTileToBackend = async () => {
    if (!mapboxData || !mapboxData.url) {
      setStatus("No tile to save ❌");
      return;
    }

    setStatus("Saving tile to backend...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/saveTile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: mapboxData.url,
          projectId: projectId,
          zoom: mapboxData.zoom,
          bbox: mapboxData.bbox,
          center: mapboxData.center
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      setStatus(`Tile saved: ${result.filename} ✔`);
      console.log('Save result:', result);
      
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      console.error("Failed to save tile:", err);
      setStatus(`Error saving tile ❌`);
    }
  };

  return (
    <div className="panel">
      <h2>Forma Project Info</h2>

      <div className="buttons">
        <button onClick={getProjectInfo}>Get Project Info</button>
        <button onClick={getBBox}>Get Terrain BBox</button>
        <button onClick={() => fetchMapboxTile()} disabled={!bbox || !location || !projectData}>
          Fetch Mapbox Tile
        </button>
        <button onClick={copyJSON} disabled={!bbox}>Copy Project JSON</button>
      </div>

      <div className="box">
        <div className="line">
          <span className="label">Status:</span>
          <span>{status || "—"}</span>
        </div>

        {location && (
          <div className="section">
            <h3>Geographic Location</h3>
            <div className="line">
              <span className="label">Latitude:</span>
              <span>{location[0].toFixed(6)}°</span>
            </div>
            <div className="line">
              <span className="label">Longitude:</span>
              <span>{location[1].toFixed(6)}°</span>
            </div>
          </div>
        )}

        {projectData && (
          <div className="section">
            <h3>Project Details</h3>
            <div className="line">
              <span className="label">ID:</span>
              <span>{projectId}</span>
            </div>
            <div className="line">
              <span className="label">Name:</span>
              <span>{projectData.name}</span>
            </div>
            <div className="line">
              <span className="label">Country:</span>
              <span>{projectData.countryCode}</span>
            </div>
            <div className="line">
              <span className="label">SRID:</span>
              <span>{projectData.srid}</span>
            </div>
            <div className="line">
              <span className="label">Timezone:</span>
              <span>{projectData.timezone}</span>
            </div>
          </div>
        )}

        {mapboxData && (
          <div className="section">
            <h3>Mapbox Satellite Tile</h3>
            <div className="line">
              <span className="label">Center:</span>
              <span>
                {mapboxData.center?.latitude != null && mapboxData.center?.longitude != null
                  ? `${mapboxData.center.latitude.toFixed(6)}, ${mapboxData.center.longitude.toFixed(6)}`
                  : 'N/A'}
              </span>
            </div>
            <div className="line">
              <span className="label">Image Size:</span>
              <span>{mapboxData.size.width} × {mapboxData.size.height}</span>
            </div>

            <div className="buttons" style={{ marginTop: '15px' }}>
              <button onClick={copyMapboxJSON} style={{ flex: 1 }}>
                Copy Mapbox JSON
              </button>
              <button 
                onClick={saveTileToBackend} 
                style={{ 
                  flex: 1,
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  fontWeight: 'bold'
                }}
              >
                ✓ Confirm & Save Tile
              </button>
            </div>
            
            <img 
              src={mapboxData.url} 
              alt="Satellite view" 
              style={{ 
                width: '100%', 
                marginTop: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }} 
            />
          </div>
        )}

        {bbox && (
          <div className="section">
            <h3>Terrain Bounds</h3>
            <div className="line">
              <span className="label">West:</span>
              <span>{bbox.west.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">South:</span>
              <span>{bbox.south.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">East:</span>
              <span>{bbox.east.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">North:</span>
              <span>{bbox.north.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">Width:</span>
              <span>{calculateDimensions(bbox).width.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">Length:</span>
              <span>{calculateDimensions(bbox).length.toFixed(2)} m</span>
            </div>
            <div className="line">
              <span className="label">Area:</span>
              <span>{calculateArea(bbox).toFixed(2)} m²</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;