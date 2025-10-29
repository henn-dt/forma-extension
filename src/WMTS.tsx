// WMTS.tsx  (REPLACE YOUR FILE WITH THIS)
import React, { useEffect, useState } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const ZOOM = 17;
const TILE_PX = 512; // using @2x tiles
const STYLE_STATIC = "mapbox/satellite-v9";

// Your bbox [W, S, E, N] (lon/lat)
const BBOX: [number, number, number, number] = [
  6.828683293083065,
  51.16342727273645,
  6.857428727193196,
  51.1804862068052,
];

/* =========================
   NEW: Mercator aspect helpers
   ========================= */
const R = 6378137;
const mercX = (lon: number) => R * (lon * Math.PI / 180);
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/** 
 * Compute correct output size from bbox **in Web Mercator meters**,
 * then fit inside Mapbox Static's pre-@2x limit (<= 1280).
 */
function computeMercatorSize([west, south, east, north]: [number, number, number, number], max = 1280) {
  const dx = mercX(east) - mercX(west);
  const dy = mercY(north) - mercY(south);
  const aspect = dx / dy; // width / height
  let w = max, h = Math.round(max / aspect);
  if (h > max) { h = max; w = Math.round(max * aspect); }
  return { width: w, height: h }; // pre-@2x size
}

// Slippy helpers (unchanged)
function lonLatToGlobalPixel(lon: number, lat: number, z: number, tilePx: number) {
  const n = Math.pow(2, z);
  const x = (lon + 180) / 360 * n * tilePx;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * tilePx;
  return { x, y };
}
function lon2tile(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function lat2tile(lat: number, z: number) {
  const n = Math.pow(2, z);
  return Math.floor(
    (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * n
  );
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

const WMTS: React.FC = () => {
  const [stitchedURL, setStitchedURL] = useState<string>("");
  const [staticURL, setStaticURL] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [west, south, east, north] = BBOX;

      /* =========================
         CHANGED: use Mercator-based size
         ========================= */
      const { width: outW1x, height: outH1x } = computeMercatorSize(BBOX, 1280);
      const outW = outW1x * 2; // @2x parity
      const outH = outH1x * 2;

      /* =========================
         CHANGED: Static image URL uses the corrected size
         ========================= */
      const staticSrc = `https://api.mapbox.com/styles/v1/${STYLE_STATIC}/static/[${west},${south},${east},${north}]/${outW1x}x${outH1x}@2x?logo=false&attribution=false&access_token=${MAPBOX_TOKEN}`;
      setStaticURL(staticSrc);

      // Tile range at chosen ZOOM
      const xMin = lon2tile(west, ZOOM);
      const xMax = lon2tile(east, ZOOM);
      const yMin = lat2tile(north, ZOOM);
      const yMax = lat2tile(south, ZOOM);
      const tilesX = xMax - xMin + 1;
      const tilesY = yMax - yMin + 1;

      // Stitch all tiles
      const stitched = document.createElement("canvas");
      stitched.width = tilesX * TILE_PX;
      stitched.height = tilesY * TILE_PX;
      const sctx = stitched.getContext("2d")!;
      sctx.imageSmoothingEnabled = false;

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const x = xMin + tx;
          const y = yMin + ty;
          const url = `https://api.mapbox.com/v4/mapbox.satellite/${ZOOM}/${x}/${y}@2x.png?access_token=${MAPBOX_TOKEN}`;
          const im = await loadImage(url);
          sctx.drawImage(im, tx * TILE_PX, ty * TILE_PX);
        }
      }

      // Compute pixel crop rect for EXACT bbox within stitched canvas (no stretch)
      const topLeftGlobal = lonLatToGlobalPixel(west, north, ZOOM, TILE_PX);
      const botRightGlobal = lonLatToGlobalPixel(east, south, ZOOM, TILE_PX);
      const originGlobal = { x: xMin * TILE_PX, y: yMin * TILE_PX };

      const cropX = Math.round(topLeftGlobal.x - originGlobal.x);
      const cropY = Math.round(topLeftGlobal.y - originGlobal.y);
      const cropW = Math.round(botRightGlobal.x - topLeftGlobal.x);
      const cropH = Math.round(botRightGlobal.y - topLeftGlobal.y);

      // Draw cropped area to an output canvas with SAME SIZE as the (corrected) static image
      const out = document.createElement("canvas");
      out.width = outW;     // CHANGED
      out.height = outH;    // CHANGED
      const octx = out.getContext("2d")!;
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(stitched, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height);

      setStitchedURL(out.toDataURL("image/png"));
    })().catch(console.error);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h2>WMTS (XYZ) Tiled BBox → Stitched → Cropped (z={ZOOM})</h2>
      <p style={{ marginTop: -8, opacity: 0.8 }}>
        BBox: [{BBOX.map(v => v.toFixed(6)).join(", ")}] — static & stitched now use correct Mercator aspect.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Stitched tiles (crop to bbox)</div>
          {stitchedURL ? (
            <img src={stitchedURL} alt="stitched" style={{ width: "100%", display: "block", border: "1px solid #ddd" }} />
          ) : (
            <div>Loading tiles…</div>
          )}
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
            Imagery © Maxar, © Mapbox, © OpenStreetMap
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Mapbox Static Image (bbox)</div>
          {staticURL ? (
            <img src={staticURL} alt="static" style={{ width: "100%", display: "block", border: "1px solid #ddd" }} />
          ) : (
            <div>Preparing…</div>
          )}
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
            Imagery © Maxar, © Mapbox, © OpenStreetMap
          </div>
        </div>
      </div>
    </div>
  );
};

export default WMTS;
