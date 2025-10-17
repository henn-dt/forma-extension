import { useMemo, useState } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import './App.css'

/** Normalized bbox we’ll show in the UI */
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

/** Try to normalize various shapes to west/south/east/north */
function normalizeBBox(input: any, crsHint?: string): BBox | null {
  if (!input) return null;

  // Case A: { west, south, east, north }
  if (["west","south","east","north"].every(k => k in input)) {
    return { west: input.west, south: input.south, east: input.east, north: input.north, crs: crsHint };
  }

  // Case B: { min:{x,y}, max:{x,y} }  (common pattern in geometry APIs)
  if (input.min && input.max && "x" in input.min && "y" in input.min) {
    const west  = input.min.x;
    const south = input.min.y;
    const east  = input.max.x;
    const north = input.max.y;
    return { west, south, east, north, crs: crsHint };
  }

  // Fallback: not recognized
  return null;
}

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

function App() {
  const [status, setStatus] = useState<string>("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [crs, setCrs] = useState<string>("EPSG:4326"); // keep 4326 by default (lon/lat)

  const bboxPretty = useMemo(() => {
    if (!bbox) return "";
    const { west, south, east, north } = bbox;
    return `{"west": ${west.toFixed(6)}, "south": ${south.toFixed(6)}, "east": ${east.toFixed(6)}, "north": ${north.toFixed(6)}}`;
  }, [bbox]);

  const copy = async () => {
    if (!bbox) return;

    const dimensions = calculateDimensions(bbox);

    const exportData = {
      geographicLocation: location ? {
        latitude: location[0].toFixed(6),
        longitude: location[1].toFixed(6)
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
      bboxValues: {
        west: bbox.west.toFixed(6),
        south: bbox.south.toFixed(6),
        east: bbox.east.toFixed(6),
        north: bbox.north.toFixed(6),
        crs: bbox.crs || "EPSG:4326",
        dimensions: {
          width: dimensions.width.toFixed(2),
          length: dimensions.length.toFixed(2)
        },
        area: calculateArea(bbox).toFixed(2)
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    await navigator.clipboard.writeText(jsonString);
    setStatus("Full JSON is copied ✔");
    setTimeout(() => setStatus(""), 1200);
  };

  const getBBox = async () => {
    setStatus("Fetching terrain bbox…");
    try {
      // Some SDK versions accept an options object (e.g., CRS). If yours doesn’t,
      // call without arguments: const raw = await Forma.terrain.getBBox();
      // Try with crs first; if it throws, retry without:
      let raw: FormaBBox;
      try {
        raw = await Forma.terrain.getBbox(); 
      } catch (error){
        console.error("Initial getBBox call failed:", error);
        throw new Error("Failed to fetch terrain bounds");
      }

      const normalized = normalizeBBox(raw, crs) || normalizeBBox(raw, undefined);
      if (!normalized) {
        throw new Error("Unable to normalize bbox format from SDK");
      }
      setBbox(normalized);
      setStatus("Done ✔");
    } catch (err) {
      console.error("getBBox failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to get bbox";
      setStatus(`Error: ${errorMessage}`);
      setBbox(null);
    }
  };

  const getProjectInfo = async () => {
    setStatus("Fetching project data...");
    try {
      const id = await Forma.getProjectId();
      setProjectId(id);

      // Get project location
      const geoLocation = await Forma.project.getGeoLocation();
      if (!geoLocation) {
        throw new Error("Could not get project location");
      }
      setLocation(geoLocation);

      // Get full project metadata
      const project = await Forma.project.get();
      setProjectData(project);
      
      setStatus("Project data loaded ✔");
    } catch (err) {
      console.error("Failed to get project info:", err);
      setStatus("Error getting project data ❌");
    }
  };

  return (
    <div className="panel">
      <h2>Terrain Information</h2>

      <label className="row">
        <span>CRS:</span>
        <select value={crs} onChange={(e) => setCrs(e.target.value)}>
          <option value="EPSG:4326">EPSG:4326 (lon/lat)</option>
          <option value="EPSG:3857">EPSG:3857 (web mercator)</option>
          {/* add more if you know they’re supported */}
        </select>
      </label>

      <div className="buttons">
        <button onClick={getProjectInfo}>Get Project Info</button>
        <button onClick={getBBox}>Get Terrain BBox</button>
        <button onClick={copy} disabled={!bbox}>Copy JSON</button>
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

        {bbox ? (
          <>
            <h3>Bbox Values</h3>
            <div className="line"><span className="label">west:</span><span>{bbox.west}</span></div>
            <div className="line"><span className="label">south:</span><span>{bbox.south}</span></div>
            <div className="line"><span className="label">east:</span><span>{bbox.east}</span></div>
            <div className="line"><span className="label">north:</span><span>{bbox.north}</span></div>
            {bbox.crs && (
              <div className="line"><span className="label">crs:</span><span>{bbox.crs}</span></div>
            )}
            <div className="section">
              <h4>Tile Dimensions</h4>
              <div className="line">
                <span className="label">width:</span>
                <span>{calculateDimensions(bbox).width.toFixed(2)} m</span>
              </div>
              <div className="line">
                <span className="label">length:</span>
                <span>{calculateDimensions(bbox).length.toFixed(2)} m</span>
              </div>
            </div>
            <div className="line">
              <span className="label">area:</span>
              <span>{calculateArea(bbox).toFixed(2)} m²</span>
            </div>
            <pre className="json">{bboxPretty}</pre>
          </>
        ) : (
          <p className="muted">No information yet.</p>
        )}
      </div>

      <small className="hint">
        Tip: This panel runs inside a Forma iframe. The call goes through the Embedded View SDK to the host. See the tutorial for how the panel is wired.
      </small>
    </div>
  );
}

export default App;