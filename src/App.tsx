import { useMemo, useState } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import './App.css'

/** Normalized bbox we'll show in the UI */
type BBox = {
  west: number; south: number; east: number; north: number;
  crs?: string;
};

type FormaPosition = {
  x: number;
  y: number;
  z: number;
};

type FormaBBox = {
  min: FormaPosition;
  max: FormaPosition;
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

// Replace the calculatePreciseZoomLevel function with the simpler version that worked:
function calculateZoomLevel(bbox: BBox): number {
  const width = Math.abs(bbox.east - bbox.west);
  const height = Math.abs(bbox.north - bbox.south);
  const maxDimension = Math.max(width, height);
  
  // Empirical zoom levels based on terrain size
  if (maxDimension < 750) return 16;
  if (maxDimension < 2000) return 15;
  if (maxDimension < 3000) return 14;
  if (maxDimension < 6000) return 13;
  return 12;
}

function transformBboxToLatLon(
  utmBbox: BBox,
  srid: number,
  refPoint: [number, number] // lat, lon of the reference point
): { 
  corners: { lat: number; lon: number }[];
  center: { lat: number; lon: number };
  alignedBbox: { west: number; south: number; east: number; north: number };
} {
  // The bbox values are OFFSETS from the reference point, not absolute coordinates
  // We can't accurately transform these without the full UTM coordinates
  // So instead, we'll work directly in lat/lon space
  
  // Since Forma's bbox is small (< 2km typically), we can use a simpler approach:
  // Convert the offset distances to approximate lat/lon degrees
  
  const [refLat, refLon] = refPoint;
  
  // Approximate meters to degrees conversion at this latitude
  const metersPerDegreeLat = 111320; // roughly constant
  const metersPerDegreeLon = 111320 * Math.cos(refLat * Math.PI / 180);
  
  // Convert bbox offsets to lat/lon offsets
  const westLon = refLon + (utmBbox.west / metersPerDegreeLon);
  const eastLon = refLon + (utmBbox.east / metersPerDegreeLon);
  const southLat = refLat + (utmBbox.south / metersPerDegreeLat);
  const northLat = refLat + (utmBbox.north / metersPerDegreeLat);
  
  const corners = [
    { lat: southLat, lon: westLon }, // SW
    { lat: northLat, lon: westLon }, // NW
    { lat: northLat, lon: eastLon }, // NE
    { lat: southLat, lon: eastLon }, // SE
  ];
  
  const alignedBbox = {
    west: westLon,
    south: southLat,
    east: eastLon,
    north: northLat
  };
  
  const center = {
    lat: (southLat + northLat) / 2,
    lon: (westLon + eastLon) / 2
  };
  
  return { corners, center, alignedBbox };
}

function generateMapboxURL(
  center: { lat: number; lon: number },
  zoom: number,
  width: number = 1280,
  height: number = 1280
): string {
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${center.lon},${center.lat},${zoom.toFixed(2)}/${width}x${height}?access_token=${MAPBOX_ACCESS_TOKEN}`;
}

function App() {
  const [status, setStatus] = useState<string>("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mapboxData, setMapboxData] = useState<MapboxData | null>(null);
  const [manualZoom, setManualZoom] = useState<string>(""); // New state for manual zoom input

  const bboxPretty = useMemo(() => {
    if (!bbox) return "";
    const { west, south, east, north } = bbox;
    return `{"west": ${west.toFixed(6)}, "south": ${south.toFixed(6)}, "east": ${east.toFixed(6)}, "north": ${north.toFixed(6)}}`;
  }, [bbox]);

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

  const fetchMapboxTile = async (zoomOverride?: number) => {
    if (!bbox || !location || !projectData) {
      setStatus("Please fetch project info and bbox first ❌");
      return;
    }

    setStatus("Generating Mapbox URL with projection correction...");
    try {
      const transformed = transformBboxToLatLon(bbox, projectData.srid, location);
      
      console.log('UTM Bbox (offsets from ref point):', bbox);
      console.log('Reference point (lat, lon):', location);
      console.log('Transformed corners:', transformed.corners);
      console.log('Aligned lat/lon bbox:', transformed.alignedBbox);
      
      // Use manual zoom if provided, otherwise calculate
      let zoom: number;
      if (zoomOverride !== undefined) {
        zoom = zoomOverride;
      } else if (manualZoom && !isNaN(parseFloat(manualZoom))) {
        zoom = parseFloat(manualZoom);
      } else {
        zoom = calculateZoomLevel(bbox);
      }
      
      // Clamp and round to 2 decimals
      zoom = Math.round(Math.max(1, Math.min(22, zoom)) * 100) / 100;

      console.log('Zoom level:', zoom);
      
      const url = generateMapboxURL(transformed.center, zoom);

      const newMapboxData: MapboxData = {
        center: {
          latitude: transformed.center.lat,
          longitude: transformed.center.lon
        },
        zoom: zoom,
        style: MAPBOX_STYLE,
        size: {
          width: 1280,
          height: 1280
        },
        bbox: {
          west: bbox.west,
          south: bbox.south,
          east: bbox.east,
          north: bbox.north
        },
        url: url
      };

      console.log('Setting mapbox data:', newMapboxData);
      setMapboxData(newMapboxData);
      setManualZoom(zoom.toFixed(2)); // Update input field
      setStatus("Mapbox URL generated ✔");
      
      console.log("Mapbox Request Data:", {
        center: newMapboxData.center,
        zoom: newMapboxData.zoom.toFixed(2),
        transformedBbox: transformed.alignedBbox,
        originalUTMBbox: bbox
      });
    } catch (err) {
      console.error("Failed to generate Mapbox URL:", err);
      setStatus("Error generating Mapbox URL ❌");
    }
  };

  const adjustZoom = (delta: number) => {
    if (!mapboxData) return;
    // Adjust by 0.1 for finer control
    const newZoom = Math.round((mapboxData.zoom + delta * 0.01) * 100) / 100;
    const clampedZoom = Math.max(1, Math.min(22, newZoom));
    fetchMapboxTile(clampedZoom);
  };

  const handleManualZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and one decimal point
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setManualZoom(value);
    }
  };

  const applyManualZoom = () => {
    const zoom = parseFloat(manualZoom);
    if (!isNaN(zoom) && zoom >= 1 && zoom <= 22) {
      fetchMapboxTile(zoom);
    } else {
      setStatus("Invalid zoom level. Must be between 1 and 22 ❌");
      setTimeout(() => setStatus(""), 2000);
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
              <span className="label">Zoom Level:</span>
              <span>{typeof mapboxData.zoom === 'number' ? mapboxData.zoom.toFixed(2) : 'N/A'}</span>
            </div>
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

            {/* Manual Zoom Input */}
            <div style={{ marginTop: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold', minWidth: '100px' }}>Manual Zoom:</span>
                <input
                  type="text"
                  value={manualZoom}
                  onChange={handleManualZoomChange}
                  placeholder="e.g., 14.95"
                  style={{
                    width: '80px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    textAlign: 'center'
                  }}
                />
                <button 
                  onClick={applyManualZoom}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Apply
                </button>
              </label>
              <div style={{ fontSize: '0.85em', color: '#666', marginTop: '5px' }}>
                Enter zoom level (1.00 - 22.00) with up to 2 decimal places
              </div>
            </div>

            <div className="buttons" style={{ marginTop: '15px' }}>
              <button 
                onClick={() => adjustZoom(-1)}
                disabled={mapboxData.zoom <= 1}
                title="Zoom out by 0.01"
              >
                ➖ Zoom Out
              </button>
              <button 
                onClick={() => adjustZoom(1)}
                disabled={mapboxData.zoom >= 22}
                title="Zoom in by 0.01"
              >
                ➕ Zoom In
              </button>
              <button onClick={() => fetchMapboxTile()}>
                🔄 Reset
              </button>
            </div>
            
            <div className="buttons" style={{ marginTop: '10px' }}>
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