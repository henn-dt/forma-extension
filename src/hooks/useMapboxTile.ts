// Custom hook for Mapbox tile state management
import { useState } from 'react';
import type { BBox } from '../types/geometry.types';
import type { Project } from '../types/forma.types';
import type { MapboxData } from '../types/mapbox.types';
import { fetchAndStitchRasterTiles } from '../services/mapboxTile.service';
import { warpImageToUTM } from '../services/imageWarping.service';
import { calculateImageDimensions, calculateOptimalZoom } from '../utils/zoomCalculations.utils';
import { transformBboxCorrectly } from '../utils/coordinateTransform.utils';
import { lon2tile, lat2tile } from '../utils/tileCalculations.utils';

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_STYLE = 'mapbox/satellite-v9';

export function useMapboxTile() {
  const [status, setStatus] = useState<string>("");
  const [mapboxData, setMapboxData] = useState<MapboxData | null>(null);
  const [extendedTileData, setExtendedTileData] = useState<MapboxData | null>(null);
  const [isExtendedTileLoading, setIsExtendedTileLoading] = useState(false);
  const [isFetchingTile, setIsFetchingTile] = useState(false);

  const fetchTile = async (bbox: BBox, projectData: Project) => {
    setIsFetchingTile(true);
    setStatus("Generating Mapbox tile... This might take a couple of minutes ⏳");
    try {
      // 1. Calculate UTM image dimensions
      const utmDimensions = calculateImageDimensions(bbox);
      
      // Get the reference point and projection string from Forma
      const refPointUTM = projectData.refPoint;
      const projString = projectData.projString;
      
      console.log('Using projection string:', projString);
      console.log('Reference point (UTM):', refPointUTM);

      // 2. Convert UTM bbox to lat/lon
      const { bboxLatLon } = transformBboxCorrectly(bbox, refPointUTM, projString);
      
      const centerLat = (bboxLatLon[1] + bboxLatLon[3]) / 2;
      
      const bboxMeters = {
        width: Math.abs(bbox.east - bbox.west),
        height: Math.abs(bbox.north - bbox.south)
      };
      
      const outputDimensions = {
        width: utmDimensions.width * 2,
        height: utmDimensions.height * 2
      };
      
      // 3. Calculate optimal zoom level
      const optimalZoom = calculateOptimalZoom(bboxMeters, outputDimensions, centerLat);
      console.log(`Using zoom level ${optimalZoom} for ${bboxMeters.width.toFixed(0)}×${bboxMeters.height.toFixed(0)}m bbox`);
      
      // 4. Fetch and stitch raster tiles
      setStatus(`Fetching tiles at zoom ${optimalZoom}... This might take a couple of minutes ⏳`);
      const blobUrl = await fetchAndStitchRasterTiles(bboxLatLon, optimalZoom, outputDimensions);
      
      console.log('Tiles stitched and cropped to bbox');
      console.log('First tile URL example:', `https://api.mapbox.com/v4/mapbox.satellite/${optimalZoom}/${lon2tile(bboxLatLon[0], optimalZoom)}/${lat2tile(bboxLatLon[3], optimalZoom)}@2x.png?access_token=${MAPBOX_ACCESS_TOKEN}`);
      
      // 5. Calculate corner pixel positions
      const bboxWidthDeg = bboxLatLon[2] - bboxLatLon[0];
      const bboxHeightDeg = bboxLatLon[3] - bboxLatLon[1];
      
      const { corners: cornersLatLon } = transformBboxCorrectly(bbox, refPointUTM, projString);
      
      const cornerPixels = cornersLatLon.map(corner => {
        const normX = (corner.lon - bboxLatLon[0]) / bboxWidthDeg;
        const normY = (bboxLatLon[3] - corner.lat) / bboxHeightDeg;
        
        return {
          x: normX * outputDimensions.width,
          y: normY * outputDimensions.height
        };
      });
      
      console.log('UTM corner positions within Mercator image:', cornerPixels);
      console.log('  SW:', cornerPixels[0]);
      console.log('  NW:', cornerPixels[1]);
      console.log('  NE:', cornerPixels[2]);
      console.log('  SE:', cornerPixels[3]);
      
      // 6. Warp image to UTM projection
      setStatus("Applying perspective transform to match UTM projection...");
      
      const warpedImageURL = await warpImageToUTM(blobUrl, cornerPixels, outputDimensions);
      URL.revokeObjectURL(blobUrl);
      
      const newMapboxData: MapboxData = {
        center: {
          latitude: centerLat,
          longitude: (bboxLatLon[0] + bboxLatLon[2]) / 2
        },
        zoom: optimalZoom,
        style: MAPBOX_STYLE,
        size: outputDimensions,
        bbox: {
          west: bbox.west,
          south: bbox.south,
          east: bbox.east,
          north: bbox.north
        },
        url: warpedImageURL
      };

      setMapboxData(newMapboxData);
      setStatus("Mapbox tile warped to UTM ✔");
      
    } catch (err) {
      console.error("Failed to generate Mapbox tile:", err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'} ❌`);
    } finally {
      setIsFetchingTile(false);
    }
  };

  // Download tile image to user's local Downloads folder
  const downloadTileImage = (projectId: string | null) => {
    if (!mapboxData || !mapboxData.url) {
      setStatus("No tile to download ❌");
      return;
    }

    setStatus("Preparing download...");
    try {
      // Create a timestamp for the filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `satellite_tile_${projectId || 'unknown'}_${timestamp}.png`;
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = mapboxData.url;
      link.download = filename;
      
      // Trigger the download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatus(`Tile downloaded: ${filename} ✔`);
      console.log('Downloaded tile:', filename);
      
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      console.error("Failed to download tile:", err);
      setStatus(`Error downloading tile ❌`);
    }
  };

  const fetchExtendedTile = async (
    originalBbox: BBox, 
    projectData: Project,
    extensions: { north: number; west: number; east: number; south: number }
  ) => {
    setIsExtendedTileLoading(true);
    setStatus("Generating extended tile... This might take a couple of minutes ⏳");
    
    try {
      // Calculate extended UTM bbox
      const extendedBbox: BBox = {
        west: originalBbox.west - extensions.west,
        south: originalBbox.south - extensions.south,
        east: originalBbox.east + extensions.east,
        north: originalBbox.north + extensions.north
      };

      console.log('Original bbox:', originalBbox);
      console.log('Extensions:', extensions);
      console.log('Extended bbox:', extendedBbox);

      // 1. Calculate UTM image dimensions
      const utmDimensions = calculateImageDimensions(extendedBbox);
      
      const refPointUTM = projectData.refPoint;
      const projString = projectData.projString;

      // 2. Convert UTM bbox to lat/lon
      const { bboxLatLon } = transformBboxCorrectly(extendedBbox, refPointUTM, projString);
      
      const centerLat = (bboxLatLon[1] + bboxLatLon[3]) / 2;
      
      const bboxMeters = {
        width: Math.abs(extendedBbox.east - extendedBbox.west),
        height: Math.abs(extendedBbox.north - extendedBbox.south)
      };
      
      const outputDimensions = {
        width: utmDimensions.width * 2,
        height: utmDimensions.height * 2
      };
      
      // 3. Calculate optimal zoom level
      const optimalZoom = calculateOptimalZoom(bboxMeters, outputDimensions, centerLat);
      console.log(`Extended tile: zoom ${optimalZoom} for ${bboxMeters.width.toFixed(0)}×${bboxMeters.height.toFixed(0)}m bbox`);
      
      // 4. Fetch and stitch raster tiles
      setStatus(`Fetching extended tiles at zoom ${optimalZoom}... This might take a couple of minutes ⏳`);
      const blobUrl = await fetchAndStitchRasterTiles(bboxLatLon, optimalZoom, outputDimensions);
      
      // 5. Calculate corner pixel positions
      const bboxWidthDeg = bboxLatLon[2] - bboxLatLon[0];
      const bboxHeightDeg = bboxLatLon[3] - bboxLatLon[1];
      
      const { corners: cornersLatLon } = transformBboxCorrectly(extendedBbox, refPointUTM, projString);
      
      const cornerPixels = cornersLatLon.map(corner => {
        const normX = (corner.lon - bboxLatLon[0]) / bboxWidthDeg;
        const normY = (bboxLatLon[3] - corner.lat) / bboxHeightDeg;
        
        return {
          x: normX * outputDimensions.width,
          y: normY * outputDimensions.height
        };
      });
      
      // 6. Warp image to UTM projection
      setStatus("Warping extended tile to UTM projection...");
      
      const warpedImageURL = await warpImageToUTM(blobUrl, cornerPixels, outputDimensions);
      URL.revokeObjectURL(blobUrl);
      
      const newExtendedData: MapboxData = {
        center: {
          latitude: centerLat,
          longitude: (bboxLatLon[0] + bboxLatLon[2]) / 2
        },
        zoom: optimalZoom,
        style: MAPBOX_STYLE,
        size: outputDimensions,
        bbox: {
          west: extendedBbox.west,
          south: extendedBbox.south,
          east: extendedBbox.east,
          north: extendedBbox.north
        },
        url: warpedImageURL
      };

      setExtendedTileData(newExtendedData);
      setStatus("Extended tile ready ✔");
      
    } catch (err) {
      console.error("Failed to generate extended tile:", err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'} ❌`);
    } finally {
      setIsExtendedTileLoading(false);
    }
  };

  return {
    status,
    mapboxData,
    extendedTileData,
    isExtendedTileLoading,
    isFetchingTile,
    fetchTile,
    fetchExtendedTile,
    downloadTileImage,
    setStatus
  };
}
