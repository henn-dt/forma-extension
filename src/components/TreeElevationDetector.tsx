/**
 * TreeElevationDetector Component
 * 
 * Adds Z-elevation values to detected tree positions
 * 
 * 🧪 FAST TEST MODE: Currently using fixed 8m height offset for ALL trees
 * - Skipping Forma.terrain.getElevationAt() for speed
 * - Processing all 8028+ detected trees
 * - Waiting for Forma devs response on MISSING_BASE issue
 * 
 * TODO: Re-enable elevation detection after MISSING_BASE is resolved
 */

import type { Project } from '../types/forma.types';
import { useState } from 'react';

interface TreePosition {
  x: number; // Local X coordinate (meters from refPoint)
  y: number; // Local Y coordinate (meters from refPoint)
  z?: number; // Elevation (will be added)
  tree_id?: number;
  type?: string;
  estimatedDiameterM?: number;
  [key: string]: unknown; // Allow other properties from detection
}

interface TreeElevationDetectorProps {
  detectedTrees: TreePosition[];
  projectData: Project;
  onElevationsDetected: (treesWithElevation: TreePosition[]) => void;
  onStatusUpdate: (status: string) => void;
}

export function TreeElevationDetector({
  detectedTrees,
  projectData,
  onElevationsDetected,
  onStatusUpdate
}: TreeElevationDetectorProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const detectElevations = async () => {
    try {
      setIsDetecting(true);
      setProgress(0);
      onStatusUpdate('Adding uniform height to all trees...');
      
      const treesWithElevation: TreePosition[] = [];
      
      // 🧪 FAST TEST: Skip elevation detection, use fixed 0m offset for ALL trees
      const FIXED_HEIGHT = 0.0; // Fixed height offset in meters (0 = ground level, adjust later)
      const treesToProcess = detectedTrees; // Process ALL trees (no limit)
      
      console.log(`🌲 FAST TEST MODE: Adding fixed ${FIXED_HEIGHT}m height to ALL ${treesToProcess.length} trees`);
      console.log(`📍 Project: ${projectData.name}`);
      console.log(`⚠️ Skipping Forma.terrain.getElevationAt() for speed - all trees at uniform height`);
      
      for (let i = 0; i < treesToProcess.length; i++) {
        const tree = treesToProcess[i];
        
        // 🧪 FAST TEST: Skip Forma.terrain.getElevationAt() - just use fixed height
        // Trees are already in local coordinates (relative to refPoint)
        
        // Add fixed height offset to tree data
        treesWithElevation.push({
          ...tree,
          z: FIXED_HEIGHT  // Fixed 0m offset (ground level - adjust after placement)
        });
        
        // Update progress every 500 trees or on last tree (larger batch since no API calls)
        if ((i + 1) % 500 === 0 || i === treesToProcess.length - 1) {
          const percentComplete = Math.round(((i + 1) / treesToProcess.length) * 100);
          setProgress(percentComplete);
          onStatusUpdate(`Adding height... ${i + 1}/${treesToProcess.length} (${percentComplete}%)`);
          console.log(`Progress: ${i + 1}/${treesToProcess.length} trees (${percentComplete}%)`);
        } else {
          const percentComplete = Math.round(((i + 1) / treesToProcess.length) * 100);
          setProgress(percentComplete);
        }
      }
      
      console.log('✅ Elevation detection complete!');
      console.log('Trees with elevation:', treesWithElevation);
      
      onStatusUpdate(`✅ Elevations detected for ${treesWithElevation.length} trees`);
      onElevationsDetected(treesWithElevation);
      
      // Clear status after 2 seconds
      setTimeout(() => {
        onStatusUpdate('');
        setProgress(0);
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error detecting elevations:', error);
      onStatusUpdate('Error detecting elevations');
      setTimeout(() => {
        onStatusUpdate('');
        setProgress(0);
      }, 3000);
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div style={{ marginTop: '10px' }}>
      <button
        onClick={detectElevations}
        disabled={!detectedTrees || detectedTrees.length === 0 || isDetecting}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: isDetecting ? '#d4850f' : (detectedTrees && detectedTrees.length > 0 ? '#28a745' : '#6c757d'),
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: (detectedTrees && detectedTrees.length > 0 && !isDetecting) ? 'pointer' : 'not-allowed',
          width: '100%',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Progress bar background */}
        {isDetecting && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress}%`,
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            transition: 'width 0.3s ease',
            zIndex: 0
          }} />
        )}
        
        {/* Button text */}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {isDetecting 
            ? `⏳ Processing... ${progress}%`
            : `📏 Add Trees at Ground Level (0m - adjust height after)`
          }
        </span>
      </button>
      
      <div style={{ 
        marginTop: '8px', 
        fontSize: '12px', 
        color: '#6c757d',
        textAlign: 'center'
      }}>
        {isDetecting 
          ? `Processing ${Math.round((progress / 100) * (detectedTrees?.length || 0))} of ${detectedTrees?.length || 0} trees...`
          : `🧪 Fast test: All ${detectedTrees?.length || 0} trees at ground level (adjust height offset manually after placement)`
        }
      </div>
    </div>
  );
}
