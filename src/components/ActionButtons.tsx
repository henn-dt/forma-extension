import type { BBox } from '../types/geometry.types';
import type { Project } from '../types/forma.types';

interface ActionButtonsProps {
  onGetProjectInfo: () => void;
  onFetchTile: () => void;
  bbox: BBox | null;
  location: [number, number] | null;
  projectData: Project | null;
  isLoadingInfo?: boolean;
  isLoadingTile?: boolean;
}

export function ActionButtons({ 
  onGetProjectInfo, 
  onFetchTile, 
  bbox,
  location,
  projectData,
  isLoadingInfo = false,
  isLoadingTile = false
}: ActionButtonsProps) {
  return (
    <div className="buttons">
      <button onClick={onGetProjectInfo} disabled={isLoadingInfo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        {isLoadingInfo ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"/>
            </svg>
            Loading...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            Get Project Info
          </>
        )}
      </button>
      <button 
        onClick={onFetchTile} 
        disabled={isLoadingTile || !bbox || !location || !projectData}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
      >
        {isLoadingTile ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"/>
            </svg>
            Fetching...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            Fetch Mapbox Tile
          </>
        )}
      </button>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
