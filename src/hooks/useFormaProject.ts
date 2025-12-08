// Custom hook for Forma project state management
import { useState } from 'react';
import type { BBox } from '../types/geometry.types';
import type { Project } from '../types/forma.types';
import { getProjectId, getGeoLocation, getProjectMetadata, getTerrainBbox } from '../services/forma.service';
import { directusService } from '../services/directus.service';
import { calculateDimensions } from '../utils/geometry.utils';

export function useFormaProject() {
  const [status, setStatus] = useState<string>("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoadingProjectInfo, setIsLoadingProjectInfo] = useState(false);

  // Combined function that fetches both project info AND terrain bbox
  const fetchProjectInfo = async () => {
    setIsLoadingProjectInfo(true);
    setStatus("Fetching project data...");
    try {
      // Step 1: Get Project ID
      const id = await getProjectId();
      setProjectId(id);

      // Step 2: Get Geographic Location
      const geoLocation = await getGeoLocation();
      if (!geoLocation) {
        throw new Error("Could not get project location");
      }
      setLocation(geoLocation);

      // Step 3: Get Project Metadata
      const project = await getProjectMetadata();
      console.log('📋 Forma Project Metadata:', project);
      console.log('📋 Project name from Forma:', project.name);
      setProjectData(project);
      
      // Step 4: Get Terrain BBox (previously separate button)
      setStatus("Fetching terrain bounds...");
      const normalized = await getTerrainBbox();
      setBbox(normalized);
      
      // Step 5: Sync to Directus (non-blocking)
      setStatus("Syncing project to database...");
      try {
        // Calculate dimensions for size string
        const dimensions = calculateDimensions(normalized);
        const sizeString = `${Math.round(dimensions.width)}m × ${Math.round(dimensions.length)}m`;
        
        // Coordinates as [longitude, latitude]
        const coordinates: [number, number] = [geoLocation[1], geoLocation[0]];
        
        // Get project name from Forma project data
        const projectName = project.name || 'Unnamed Project';
        console.log('📤 Sending to Directus - Name:', projectName, 'ID:', id);
        
        const syncResult = await directusService.syncFormaProject(id, projectName, coordinates, sizeString);
        console.log('✅ Project synced to Directus:', syncResult);
        
        if (syncResult.isNew) {
          setStatus("Project data loaded & saved to database ✔");
        } else {
          setStatus("Project data loaded (already in database) ✔");
        }
      } catch (syncError) {
        console.error('⚠️ Failed to sync to Directus (non-critical):', syncError);
        // Don't fail the whole operation if sync fails
        setStatus("Project data loaded (database sync failed) ⚠️");
      }
      
    } catch (err) {
      console.error("Failed to get project info:", err);
      setStatus("Error getting project data ❌");
    } finally {
      setIsLoadingProjectInfo(false);
    }
  };

  return {
    status,
    location,
    projectData,
    bbox,
    projectId,
    fetchProjectInfo,
    setStatus,
    isLoadingProjectInfo
  };
}
