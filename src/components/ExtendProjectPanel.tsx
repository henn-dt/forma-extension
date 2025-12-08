import { useState } from 'react';
import type { BBox } from '../types/geometry.types';
import type { Project } from '../types/forma.types';

// SVG Icons for directional arrows
const ArrowUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
    <path d="M12 19V5M5 12l7-7 7 7"/>
  </svg>
);

const ArrowDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const LoadingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle', animation: 'spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4M12 8h.01"/>
  </svg>
);

interface ExtendProjectPanelProps {
  bbox: BBox | null;
  projectData: Project | null;
  onFetchExtended: (extensions: { north: number; west: number; east: number; south: number }) => void | Promise<void>;
  isLoading: boolean;
}

export function ExtendProjectPanel({ 
  bbox, 
  projectData, 
  onFetchExtended, 
  isLoading 
}: ExtendProjectPanelProps) {
  const [extendNorth, setExtendNorth] = useState(0);
  const [extendWest, setExtendWest] = useState(0);
  const [extendEast, setExtendEast] = useState(0);
  const [extendSouth, setExtendSouth] = useState(0);

  // Calculate dimensions
  const currentWidth = bbox ? (bbox.east - bbox.west) : 0;
  const currentHeight = bbox ? (bbox.north - bbox.south) : 0;
  
  const extendedWidth = currentWidth + extendWest + extendEast;
  const extendedHeight = currentHeight + extendNorth + extendSouth;

  const handleFetchExtended = async () => {
    await onFetchExtended({
      north: extendNorth,
      west: extendWest,
      east: extendEast,
      south: extendSouth
    });
  };

  return (
    <div className="section">
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <h3>Extend Project Boundaries</h3>
      <p className="help-text" style={{ marginBottom: '15px' }}>
        Extend the project boundaries to fetch a larger satellite tile. 
        Enter the distance in meters to extend in each direction.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ marginBottom: '5px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
            <ArrowUpIcon /> Extend North (m):
          </span>
          <input 
            type="number" 
            value={extendNorth} 
            onChange={(e) => setExtendNorth(Math.max(0, Number(e.target.value)))}
            min="0"
            step="50"
            disabled={isLoading || !bbox}
            style={{ padding: '8px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ marginBottom: '5px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
            <ArrowRightIcon /> Extend East (m):
          </span>
          <input 
            type="number" 
            value={extendEast} 
            onChange={(e) => setExtendEast(Math.max(0, Number(e.target.value)))}
            min="0"
            step="50"
            disabled={isLoading || !bbox}
            style={{ padding: '8px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ marginBottom: '5px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
            <ArrowLeftIcon /> Extend West (m):
          </span>
          <input 
            type="number" 
            value={extendWest} 
            onChange={(e) => setExtendWest(Math.max(0, Number(e.target.value)))}
            min="0"
            step="50"
            disabled={isLoading || !bbox}
            style={{ padding: '8px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ marginBottom: '5px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
            <ArrowDownIcon /> Extend South (m):
          </span>
          <input 
            type="number" 
            value={extendSouth} 
            onChange={(e) => setExtendSouth(Math.max(0, Number(e.target.value)))}
            min="0"
            step="50"
            disabled={isLoading || !bbox}
            style={{ padding: '8px' }}
          />
        </label>
      </div>

      <div style={{ 
        background: '#f0f0f0', 
        padding: '12px', 
        borderRadius: '5px', 
        marginBottom: '15px' 
      }}>
        <div className="line">
          <span className="label">Original Dimensions:</span>
          <span>{currentWidth.toFixed(0)}m × {currentHeight.toFixed(0)}m</span>
        </div>
        <div className="line">
          <span className="label">Extended Dimensions:</span>
          <span style={{ fontWeight: 'bold', color: '#2196F3' }}>
            {extendedWidth.toFixed(0)}m × {extendedHeight.toFixed(0)}m
          </span>
        </div>
        <div className="line">
          <span className="label">Additional Area:</span>
          <span>
            +{((extendedWidth * extendedHeight) - (currentWidth * currentHeight)).toFixed(0)}m²
          </span>
        </div>
      </div>

      <button 
        onClick={handleFetchExtended}
        disabled={isLoading || !bbox || !projectData}
        style={{ 
          width: '100%',
          padding: '12px',
          fontSize: '1.1em',
          backgroundColor: '#2196F3',
          color: 'white',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {isLoading ? (
          <><LoadingIcon /> Fetching...</>
        ) : (
          <><GlobeIcon /> Fetch Extended Tile</>
        )}
      </button>

      {!bbox && (
        <p className="help-text" style={{ marginTop: '10px', color: '#ff6b6b', display: 'flex', alignItems: 'center' }}>
          <InfoIcon /> Please fetch project info and terrain bounds first using the "Project Tile" tab.
        </p>
      )}
    </div>
  );
}
