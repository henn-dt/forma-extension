// WarpDemo.tsx  — REPLACE your file with this version
import React, { useEffect, useState } from "react";

// ====== Output (UTM) size ======
const OUT_W = 2560;
const OUT_H = 2408;

// ====== Overscan so step 2 shows extra warped area around the UTM rect ======
const PAD = 220; // tweak to show more/less margin in step 2

// ====== Source & destination correspondences ======
// Source = where the UTM rectangle corners land inside the fetched lat/lon image (your numbers)
const SRC_CORNERS = [
  0, 2400,              // NW  (x,y) in fetched image
  200, 0,              // NE
  2560,120,          // SE
  2000, 2408            // SW
];

// Destination = UTM rectangle *offset by PAD* inside a larger canvas
const DST_PADDED = [
  PAD, PAD,                              // NW
  PAD + OUT_W, PAD,                      // NE
  PAD + OUT_W, PAD + OUT_H,              // SE
  PAD, PAD + OUT_H                       // SW
];

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];
    for (let k = i + 1; k < n; k++) {
      const c = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] = (i === j) ? 0 : A[k][j] - c * A[i][j];
      b[k] -= c * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i];
    for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}
function calculateHomography(src: number[], dst: number[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i * 2], sy = src[i * 2 + 1];
    const dx = dst[i * 2], dy = dst[i * 2 + 1];
    A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
    A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
  }
  const AtA: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  const Atb: number[] = Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0; for (let k = 0; k < A.length; k++) s += A[k][i] * A[k][j];
      AtA[i][j] = s;
    }
    let sb = 0; for (let k = 0; k < A.length; k++) sb -= A[k][i] * A[k][8]; // minus sign
    Atb[i] = sb;
  }
  const h = gaussianElimination(AtA, Atb);
  h.push(1);
  return h;
}
function applyH(H: number[], x: number, y: number): [number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
function bilinearSample(img: ImageData, x: number, y: number): [number, number, number, number] {
  const { width, height, data } = img;
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(x), x1 = Math.min(x0 + 1, width - 1);
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, height - 1);
  const dx = x - x0, dy = y - y0;
  const idx = (xx: number, yy: number) => ((yy * width + xx) * 4) | 0;
  const i00 = idx(x0, y0), i10 = idx(x1, y0), i01 = idx(x0, y1), i11 = idx(x1, y1);
  const r = data[i00] * (1 - dx) * (1 - dy) + data[i10] * dx * (1 - dy) + data[i01] * (1 - dx) * dy + data[i11] * dx * dy;
  const g = data[i00 + 1] * (1 - dx) * (1 - dy) + data[i10 + 1] * dx * (1 - dy) + data[i01 + 1] * (1 - dx) * dy + data[i11 + 1] * dx * dy;
  const b = data[i00 + 2] * (1 - dx) * (1 - dy) + data[i10 + 2] * dx * (1 - dy) + data[i01 + 2] * (1 - dx) * dy + data[i11 + 2] * dx * dy;
  const a = data[i00 + 3] * (1 - dx) * (1 - dy) + data[i10 + 3] * dx * (1 - dy) + data[i01 + 3] * (1 - dx) * dy + data[i11 + 3] * dx * dy;
  return [r, g, b, a];
}

// ====== 1) SOURCE: checkerboard plus FULL red border (represents lat/lon bbox) ======
function makeCheckerboardWithRedBorder(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = OUT_W;
  c.height = OUT_H;
  const g = c.getContext("2d")!;
  const tile = 160; // big squares for visibility
  for (let y = 0; y < OUT_H; y += tile) {
    for (let x = 0; x < OUT_W; x += tile) {
      g.fillStyle = ((x / tile + y / tile) % 2 === 0) ? "#f0f0f0" : "#cfcfcf";
      g.fillRect(x, y, tile, tile);
    }
  }
  // black inner frame just to mimic “content”
  g.strokeStyle = "#000000";
  g.lineWidth = 0;
  g.strokeRect(20, 20, OUT_W - 40, OUT_H - 40);

  // FULL red border around the *entire* lat/lon image
  g.strokeStyle = "#ff2d2d";
  g.lineWidth = 24;
  g.strokeRect(0, 0, OUT_W, OUT_H);

  // Optional: draw the UTM quad (where the site lies within the lat/lon image)
  g.strokeStyle = "#000000ff";
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(SRC_CORNERS[0], SRC_CORNERS[1]);
  g.lineTo(SRC_CORNERS[2], SRC_CORNERS[3]);
  g.lineTo(SRC_CORNERS[4], SRC_CORNERS[5]);
  g.lineTo(SRC_CORNERS[6], SRC_CORNERS[7]);
  g.closePath();
  g.stroke();

  return c;
}

// ====== 2) WARP into padded canvas (so you see the skewed red border + crop box) ======
function warpWithOverscan(srcCanvas: HTMLCanvasElement): { warped: HTMLCanvasElement; cropRect: {x:number;y:number;w:number;h:number} } {
  const H = calculateHomography(DST_PADDED, SRC_CORNERS); // dst->src
  const sctx = srcCanvas.getContext("2d")!;
  const srcImg = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const W = OUT_W + PAD * 2;
  const Hh = OUT_H + PAD * 2;

  const out = document.createElement("canvas");
  out.width = W; out.height = Hh;
  const octx = out.getContext("2d")!;
  const dst = octx.createImageData(W, Hh);

  let p = 0;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const [sx, sy] = applyH(H, x, y);
      const [r, g, b, a] = bilinearSample(srcImg, sx, sy);
      dst.data[p++] = r; dst.data[p++] = g; dst.data[p++] = b; dst.data[p++] = a || 255;
    }
  }
  octx.putImageData(dst, 0, 0);

  // draw dashed crop box so step 2 clearly shows UTM extent
  octx.save();
  octx.strokeStyle = "rgba(0,128,0,0.9)";
  octx.lineWidth = 4;
  octx.setLineDash([12, 8]);
  octx.strokeRect(PAD, PAD, OUT_W, OUT_H);
  octx.restore();

  return { warped: out, cropRect: { x: PAD, y: PAD, w: OUT_W, h: OUT_H } };
}

// ====== 3) Crop to UTM rect (removes the skewed red lat/lon border) ======
function cropToUTMRect(warped: HTMLCanvasElement, rect: {x:number;y:number;w:number;h:number}): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rect.w; c.height = rect.h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(warped, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return c;
}

const WarpDemo: React.FC = () => {
  const [srcURL, setSrcURL] = useState("");
  const [warpedURL, setWarpedURL] = useState("");
  const [croppedURL, setCroppedURL] = useState("");

  useEffect(() => {
    // 1) Source (lat/lon bbox image, with full red border)
    const src = makeCheckerboardWithRedBorder();
    setSrcURL(src.toDataURL("image/png"));

    // 2) Warp into padded canvas so the red border becomes a skewed quad
    const { warped, cropRect } = warpWithOverscan(src);
    setWarpedURL(warped.toDataURL("image/png"));

    // 3) Crop to the UTM rectangle (dashed box area)
    const cropped = cropToUTMRect(warped, cropRect);
    setCroppedURL(cropped.toDataURL("image/png"));
  }, []);

  const frame = { border: "1px solid #ddd", borderRadius: 6, width: "100%" };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h2>Homography Warp Demo — with Overscan (shows warped lat/lon border in Step 2)</h2>
      <p style={{ opacity: 0.75 }}>
        Step 2 shows the **lat/lon red border** warped (skewed) and a **dashed green crop box** = UTM extent.
        Step 3 crops to that box (the red border disappears).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>1) Source (lat/lon image)</div>
          {srcURL ? <img src={srcURL} style={frame} /> : <div>Generating…</div>}
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>2) Warped to UTM space (with overscan)</div>
          {warpedURL ? <img src={warpedURL} style={frame} /> : <div>Warping…</div>}
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>3) Cropped to UTM bbox</div>
          {croppedURL ? <img src={croppedURL} style={frame} /> : <div>Cropping…</div>}
        </div>
      </div>
    </div>
  );
};

export default WarpDemo;
