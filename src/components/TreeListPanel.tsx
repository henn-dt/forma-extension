/**
 * Tree List Panel - Table of detected trees with download buttons
 */

import { useState } from 'react';
import type { TreeDetectionResult } from '../types/treeDetection.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface TreeListPanelProps {
  detectionResult: TreeDetectionResult;
  treesWithElevation?: Array<{
    x: number;
    y: number;
    z?: number;
    tree_id?: number;
    type?: string;
    [key: string]: unknown;
  }> | null;
}

export function TreeListPanel({ 
  detectionResult,
  treesWithElevation
}: TreeListPanelProps) {
  const [isDownloadingOBJ, setIsDownloadingOBJ] = useState(false);
  const [isDownloadingJSON, setIsDownloadingJSON] = useState(false);
  
  // Build elevation lookup map for quick access
  const elevationMap = new Map<string, number>();
  if (treesWithElevation) {
    treesWithElevation.forEach((tree) => {
      const key = `${tree.x.toFixed(1)}-${tree.y.toFixed(1)}`;
      elevationMap.set(key, tree.z || 0);
    });
  }
  
  const allTrees = [
    ...detectionResult.individualTrees.map((tree, i) => {
      const key = `${tree.centroidM[0].toFixed(1)}-${tree.centroidM[1].toFixed(1)}`;
      return {
        id: `individual-${i}`,
        type: 'Individual' as const,
        position: tree.centroidM,
        diameter: tree.estimatedDiameterM,
        area: tree.areaM2,
        elevation: elevationMap.get(key)
      };
    }),
    ...detectionResult.treeClusters.flatMap((cluster, ci) => 
      cluster.populatedTrees.map((tree, ti) => {
        const key = `${tree.positionM[0].toFixed(1)}-${tree.positionM[1].toFixed(1)}`;
        return {
          id: `cluster-${ci}-tree-${ti}`,
          type: 'Populated' as const,
          position: tree.positionM,
          diameter: tree.estimatedDiameterM,
          area: 0,
          elevation: elevationMap.get(key)
        };
      })
    )
  ];

  const handleDownloadJSON = () => {
    setIsDownloadingJSON(true);
    try {
      // Create optimized JSON for Forma tree placement
      const treesForPlacement = allTrees.map((tree, index) => ({
        id: index + 1,
        type: tree.type,
        position: {
          x: tree.position[0], // Local X coordinate (meters from refPoint)
          y: tree.position[1], // Local Y coordinate (meters from refPoint)
          z: tree.elevation !== undefined ? tree.elevation : null // Elevation in meters above sea level
        },
        diameter: tree.diameter,
        area: tree.area > 0 ? tree.area : null,
        hasElevation: tree.elevation !== undefined
      }));

      // Summary statistics
      const treesWithElevationCount = treesForPlacement.filter(t => t.hasElevation).length;
      
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          totalTrees: treesForPlacement.length,
          treesWithElevation: treesWithElevationCount,
          elevationCoverage: `${Math.round((treesWithElevationCount / treesForPlacement.length) * 100)}%`,
          coordinateSystem: "local", // Positions are relative to project refPoint
          units: {
            position: "meters",
            elevation: "meters above sea level",
            diameter: "meters",
            area: "square meters"
          }
        },
        summary: {
          individualTrees: detectionResult.summary.individualTreesCount,
          treeClusters: detectionResult.summary.treeClustersCount,
          populatedTrees: detectionResult.summary.totalPopulatedTrees
        },
        trees: treesForPlacement,
        // Include original detection result for reference
        originalDetectionResult: detectionResult
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Create blob
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `trees_for_placement_${timestamp}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Tree placement JSON downloaded:', {
        totalTrees: treesForPlacement.length,
        withElevation: treesWithElevationCount
      });
    } finally {
      setIsDownloadingJSON(false);
    }
  };

  const handleDownloadOBJ = async () => {
    setIsDownloadingOBJ(true);
    try {
      console.log('📦 Requesting 3D model generation...');
      
      // Call backend with detection data
      const response = await fetch(`${API_BASE_URL}/api/generate-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(detectionResult)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if it's a JSON response (large model saved to Downloads) or OBJ content
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        // Large model - already saved to Downloads folder
        const data = await response.json();
        console.log('✅ Large model saved to Downloads folder:', data);
        alert(`✅ Large model generated!\n\n` +
              `📁 Saved to: Downloads/${data.filename}\n` +
              `📊 Trees: ${data.total_trees?.toLocaleString()}\n` +
              `💾 Size: ${data.filesize_mb}MB\n\n` +
              `⚠️ Warning: This is a large file. It may take time to open in 3D software.`);
      } else {
        // Normal model - download as blob
        const objContent = await response.text();
        console.log('✅ Model generated, size:', objContent.length, 'bytes');

        // Create blob and download
        const blob = new Blob([objContent], { type: 'model/obj' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.download = `trees_model_${timestamp}.obj`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ OBJ file downloaded successfully');
      }
      
    } catch (error) {
      console.error('❌ OBJ download failed:', error);
      alert(`Failed to download OBJ file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDownloadingOBJ(false);
    }
  };

  return (
    <div className="section">
      <div className="tree-list-header">
        <h3>Detected Trees ({allTrees.length})</h3>
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          alignItems: 'stretch',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleDownloadOBJ}
            disabled={isDownloadingOBJ || allTrees.length === 0}
            className="btn btn-secondary"
            title="Download 3D model as OBJ file for Rhino, Blender, etc."
            style={{ 
              flex: '1',
              minWidth: '140px'
            }}
          >
            {isDownloadingOBJ ? '⏳ Downloading...' : '📦 Download OBJ'}
          </button>
          <button
            onClick={handleDownloadJSON}
            disabled={isDownloadingJSON || allTrees.length === 0}
            className="btn btn-secondary"
            title="Download tree positions for Forma placement (includes elevation data)"
            style={{ 
              flex: '1',
              minWidth: '140px'
            }}
          >
            {isDownloadingJSON ? '⏳ Downloading...' : '📥 Download for Placement'}
          </button>
        </div>
      </div>

      <div className="tree-list">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Position (m)</th>
              <th>Diameter (m)</th>
              <th>Area (m²)</th>
              <th>Elevation (m)</th>
            </tr>
          </thead>
          <tbody>
            {allTrees.map((tree) => (
              <tr key={tree.id}>
                <td>{tree.type}</td>
                <td>{tree.position[0].toFixed(1)}, {tree.position[1].toFixed(1)}</td>
                <td>{tree.diameter.toFixed(2)}</td>
                <td>{tree.area > 0 ? tree.area.toFixed(2) : '-'}</td>
                <td>
                  {tree.elevation !== undefined ? (
                    <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                      {tree.elevation.toFixed(2)}
                    </span>
                  ) : (
                    <span style={{ color: '#6c757d' }}>-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
