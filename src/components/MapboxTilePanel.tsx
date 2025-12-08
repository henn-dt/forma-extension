import type { MapboxData } from '../types/mapbox.types';

interface MapboxTilePanelProps {
  mapboxData: MapboxData;
  onCopyJSON: () => void;
  onDownloadTile: () => void;
}

export function MapboxTilePanel({ mapboxData, onCopyJSON, onDownloadTile }: MapboxTilePanelProps) {
  return (
    <>
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
        <button onClick={onCopyJSON} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy Mapbox JSON
        </button>
        <button 
          onClick={onDownloadTile} 
          style={{ 
            flex: 1,
            backgroundColor: '#2196F3',
            color: 'white',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Tile Image
        </button>
      </div>
    </>
  );
}
