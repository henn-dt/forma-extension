import React, { useEffect, useState } from 'react'
import { Forma } from "forma-embedded-view-sdk/auto";
import './App.css'

type RgbaColor = { r: number; g: number; b: number; a: number };

const HENN_GREEN: RgbaColor = { r: 255, g: 0, b: 0, a: 1 }; // #9CFF80

export default function App() {
  const [buildingPaths, setBuildingPaths] = useState<string[]>([]);
  const [color, setColor] = useState<RgbaColor>(HENN_GREEN);

  useEffect(() => {
    (async () => {
      try {
        const paths = await Forma.geometry.getPathsByCategory({
          category: "building",
        });
        setBuildingPaths(paths);
      } catch (err) {
        console.error("Could not fetch building paths", err);
      }
    })();
  }, []);

    const colorSelected = async () => {
      const selectedPaths = await Forma.selection.getSelection();
      for (const path of selectedPaths) {
        if (!buildingPaths.includes(path)) continue;

        // get triangles for this building
        const positions = await Forma.geometry.getTriangles({ path });
        const numTriangles = positions.length / 3;

        // build RGBA array (per triangle)
        const c = new Uint8Array(numTriangles * 4);
        for (let i = 0; i < numTriangles; i++) {
          c[i * 4 + 0] = color.r;
          c[i * 4 + 1] = color.g;
          c[i * 4 + 2] = color.b;
          c[i * 4 + 3] = Math.round(color.a * 255);
        }

        await Forma.render.updateMesh({
          id: path,
          geometryData: { position: positions, color: c },
        });
      }
    };

    const reset = () => {
      Forma.render.cleanup();
    };

    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const hex = e.target.value.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      setColor((c) => ({ ...c, r, g, b }));
    };

    const hex = `#${[color.r, color.g, color.b]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")}`;

  return (
    <div className="panel">
      <h2>HENN Forma</h2>

      <p>
        Total number of buildings: <strong>{buildingPaths.length}</strong>
      </p>

      <label className="row">
        <span>Pick color:</span>
        <input type="color" value={hex} onChange={onPick} />
      </label>

      <label className="row">
        <span>Alpha:</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={color.a}
          onChange={(e) =>
            setColor((c) => ({ ...c, a: Number(e.target.value) }))
          }
        />
        <span>{color.a.toFixed(2)}</span>
      </label>

      <div className="buttons">
        <button onClick={colorSelected} disabled={!buildingPaths.length}>
          Color selected buildings
        </button>
        <button onClick={reset}>Reset</button>
      </div>

      <small className="hint">
        Tip: Select one or more buildings in Forma, then click “Color selected
        buildings”.
      </small>
    </div>
  );
}