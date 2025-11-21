/**
 * Tree Placement Tester Component
 * 
 * Tests placing a small number of trees (10-15) in Forma to verify the workflow
 * before scaling up to thousands of trees.
 */

import { useState, useMemo } from 'react';
import { Forma } from 'forma-embedded-view-sdk/auto';
import { getTreeBlobId } from '../services/treeBlob.service';

// ========================================
// CONFIGURATION CONSTANTS (Easy to modify)
// ========================================
const MAX_TREES = 3000;                    // Maximum trees that can be placed at once
const SMALL_CLUSTER_THRESHOLD = 5;         // Clusters with < 5 trees are "small"
const GLB_HEIGHT_M = 12;                   // treeModel_12m.glb is 12m tall (real scale)

interface TreePlacementTesterProps {
  treesWithElevation: Array<{
    x: number;
    y: number;
    z?: number;
    tree_id?: number;
    type?: string;
    estimatedDiameterM?: number;
    centroid_m?: [number, number];
    [key: string]: unknown;
  }> | null;
}

export function TreePlacementTester({ treesWithElevation }: TreePlacementTesterProps) {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [isPlacing, setIsPlacing] = useState(false);
  const [treeDensity, setTreeDensity] = useState(100); // Percentage of trees to place
  const [treeScale, setTreeScale] = useState(4000); // 12m × scale/1000 for tree height
  const [useAuto, setUseAuto] = useState(true); // Auto mode: use elevation directly, no manual adjustments
  const [manualHeightOffset, setManualHeightOffset] = useState(0); // Manual height offset (when auto is off)
  const [manualScale, setManualScale] = useState(4000); // Manual scale override (when auto is off)
  const [useBatchMode, setUseBatchMode] = useState(false); // Toggle between batch vs one-by-one (DEFAULT: one-by-one is safer!)

  // When auto is ON: use elevation directly (no offset), when OFF: use manual values
  const heightOffset = useAuto ? 0 : manualHeightOffset;
  const effectiveScale = useAuto ? treeScale / 1000 : manualScale / 1000;

  // Calculate available trees and max allowed density
  const availableTrees = treesWithElevation?.filter(tree => tree.z !== undefined).length || 0;
  const maxAllowedDensity = useMemo(() => {
    if (availableTrees === 0) return 100;
    if (availableTrees <= MAX_TREES) return 100;
    return Math.floor((MAX_TREES / availableTrees) * 100);
  }, [availableTrees]);

  // Calculate how many trees will be placed
  const estimatedTreeCount = useMemo(() => {
    return Math.min(
      Math.round((availableTrees * treeDensity) / 100),
      MAX_TREES
    );
  }, [availableTrees, treeDensity]);

  // ========================================
  // TREE SELECTION FUNCTIONS
  // ========================================

  /**
   * Group trees by their centroid (cluster identifier)
   */
  function groupTreesByCentroid(trees: typeof treesWithElevation): {
    clusters: Map<string, typeof trees>;
    individuals: typeof trees;
  } {
    if (!trees) return { clusters: new Map(), individuals: [] };

    const clusters = new Map<string, typeof trees>();
    const individuals: typeof trees = [];

    trees.forEach(tree => {
      if (tree.type === 'cluster' && tree.centroid_m && Array.isArray(tree.centroid_m)) {
        const key = `${tree.centroid_m[0]}_${tree.centroid_m[1]}`;
        if (!clusters.has(key)) {
          clusters.set(key, []);
        }
        clusters.get(key)!.push(tree);
      } else {
        individuals.push(tree);
      }
    });

    return { clusters, individuals };
  }

  /**
   * Categorize clusters by size
   */
  function categorizeClustersBySize(clusters: Map<string, typeof treesWithElevation>) {
    const largeClusters = new Map<string, typeof treesWithElevation>();
    const smallClusters = new Map<string, typeof treesWithElevation>();

    clusters.forEach((trees, key) => {
      if (trees.length >= SMALL_CLUSTER_THRESHOLD) {
        largeClusters.set(key, trees);
      } else {
        smallClusters.set(key, trees);
      }
    });

    return { largeClusters, smallClusters };
  }

  /**
   * Select trees based on density percentage
   */
  function selectTreesByDensity(
    trees: typeof treesWithElevation,
    densityPercent: number
  ): typeof treesWithElevation {
    if (!trees || trees.length === 0) return [];
    if (densityPercent >= 100) return trees;

    const { clusters, individuals } = groupTreesByCentroid(trees);
    const { largeClusters, smallClusters } = categorizeClustersBySize(clusters);
    const selected: typeof treesWithElevation = [];

    // 1. Process LARGE clusters (≥5 trees)
    largeClusters.forEach(clusterTrees => {
      const targetCount = Math.max(1, Math.round(clusterTrees.length * (densityPercent / 100)));
      // Randomly sample trees from this cluster
      const shuffled = [...clusterTrees].sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, targetCount));
    });

    // 2. Process SMALL clusters (<5 trees)
    // Sort small clusters by size (descending) to prioritize larger ones
    const sortedSmallClusters = Array.from(smallClusters.entries())
      .sort((a, b) => b[1].length - a[1].length);

    const targetSmallClusters = Math.max(
      0,
      Math.round(sortedSmallClusters.length * (densityPercent / 100))
    );

    // Select top N small clusters (by size)
    sortedSmallClusters.slice(0, targetSmallClusters).forEach(([_, clusterTrees]) => {
      // Pick 1 random tree from each selected small cluster
      const randomTree = clusterTrees[Math.floor(Math.random() * clusterTrees.length)];
      selected.push(randomTree);
    });

    // 3. Process INDIVIDUAL trees
    const targetIndividuals = Math.round(individuals.length * (densityPercent / 100));
    const shuffledIndividuals = [...individuals].sort(() => Math.random() - 0.5);
    selected.push(...shuffledIndividuals.slice(0, targetIndividuals));

    // Shuffle final result for homogeneous distribution
    return selected.sort(() => Math.random() - 0.5);
  }

  // ========================================
  // PLACEMENT FUNCTION
  // ========================================

  const placeTestTrees = async () => {
    if (!treesWithElevation || treesWithElevation.length === 0) {
      setStatus('❌ No trees with elevation data available');
      return;
    }

    setIsPlacing(true);
    setProgress(0);
    setStatus('Starting test placement...');

    try {
      // 1. Get project ID and metadata for geoReference
      const projectId = await Forma.getProjectId();
      console.log('📋 Project ID:', projectId);

      const { srid, refPoint } = await Forma.project.get();
      console.log('🌍 Project metadata:', {
        srid,
        refPoint
      });

      // 2. Check edit access
      setStatus('Checking permissions...');
      const canEdit = await Forma.getCanEdit();
      if (!canEdit) {
        setStatus('❌ You need edit access to place trees');
        setIsPlacing(false);
        return;
      }
      console.log('✅ Edit access confirmed');

      // 3. Get terrain bounds to offset tree positions correctly
      setStatus('Getting terrain bounds...');
      const terrainBbox = await Forma.terrain.getBbox();
      console.log('🗺️ Terrain bbox:', terrainBbox);
      console.log('   ↳ Min Z (terrain base):', terrainBbox.min.z);
      console.log('   ↳ Max Z (terrain top):', terrainBbox.max.z);

      // The terrain bbox gives us the offset we need
      const terrainOffsetX = terrainBbox.min.x;
      const terrainOffsetY = terrainBbox.min.y;
      const terrainBaseZ = terrainBbox.min.z; // Store base elevation for debugging
      console.log(`📍 Terrain offset: (${terrainOffsetX.toFixed(2)}, ${terrainOffsetY.toFixed(2)})`);

      // 3. Test elevation at a known point to understand coordinate system
      const testElevation = await Forma.terrain.getElevationAt({ x: terrainOffsetX, y: terrainOffsetY });
      console.log(`🧪 Test elevation at terrain origin (${terrainOffsetX}, ${terrainOffsetY}):`, testElevation);
      console.log(`   ↳ Diff from bbox.min.z: ${(testElevation - terrainBaseZ).toFixed(3)}m`);

      // 4. Get blobId (automatically manages per-project upload & caching)
      setStatus('Loading tree model (may upload if first time for this project)...');
      console.log('📦 Getting tree model upload...');
      const { blobId, fileId } = await getTreeBlobId();
      console.log('✅ Upload ready:');
      console.log('   ↳ blobId:', blobId);
      console.log('   ↳ fileId:', fileId);

      // 5. 🔍 DISCOVER BASE LAYER KEY
      setStatus('Discovering base layer...');
      console.log('🔍 Discovering base layer for terrain snapping...');

      const rootUrn = await Forma.proposal.getRootUrn();
      console.log('📊 Root URN:', rootUrn);

      const { element: rootElement, elements } = await Forma.elements.get({
        urn: rootUrn,
        recursive: false  // Only get immediate children
      });

      console.log('📊 Proposal root element:', JSON.stringify(rootElement, null, 2));
      console.log('📊 All elements in proposal:', JSON.stringify(elements, null, 2));

      // Extract the base key from properties.flags
      // The base is identified by having flags[key].base = true
      let baseKey: string | null = null;

      if (rootElement.properties?.flags) {
        // Find the key where base = true
        for (const [key, flags] of Object.entries(rootElement.properties.flags)) {
          if (typeof flags === 'object' && flags !== null && 'base' in flags && flags.base === true) {
            baseKey = key;
            console.log('✅ Base key found:', baseKey);
            break;
          }
        }
      }

      if (!baseKey) {
        console.warn('⚠️ Base key not found! Trees will be placed at root level.');
        console.log('   Properties.flags:', rootElement.properties?.flags);
      } else {
        console.log('🎯 Will use parentPath:', `root/${baseKey}`);
      }

      // 6. Select trees based on density
      const filteredTrees = treesWithElevation.filter(tree => tree.z !== undefined && tree.z !== null);
      const selectedTrees = selectTreesByDensity(filteredTrees, treeDensity);

      // Apply hard cap
      const testTrees = selectedTrees.slice(0, MAX_TREES);

      if (testTrees.length === 0) {
        setStatus('❌ No trees with elevation data found');
        setIsPlacing(false);
        return;
      }

      console.log(`📊 Placing ${testTrees.length} trees (${treeDensity}% density)`);
      console.log(`📊 First tree position: (${testTrees[0].x.toFixed(2)}, ${testTrees[0].y.toFixed(2)}, ${testTrees[0].z?.toFixed(2)})`);

      // Use normalized effective scale (e.g. 4000 -> 4.0) for calculations
      const scale = effectiveScale;
      let totalPlaced = 0;

      // 7. CREATE ELEMENTS - CHOOSE METHOD BASED ON TOGGLE
      if (useBatchMode) {
        // ========================================
        // INSTANCE MODE (Fastest & Most Efficient)
        // ========================================
        setStatus(`Creating single tree definition and placing ${testTrees.length} instances...`);
        console.log(`⚡ Using INSTANCE mode (True Instancing)...`);

        const startTime = performance.now();
        let totalFailed = 0;

        try {
          // STEP 1: Create ONE single tree definition (The "Standard Tree")
          console.log(`📦 Creating single tree definition...`);
          const { urn: parentUrn } = await Forma.integrateElements.createElementV2({
            properties: {
              category: 'vegetation',
              name: 'Standard Tree'
            },
            representations: {
              volumeMesh: {
                type: "linked" as const,
                blobId
              }
            }
          });
          console.log(`✅ Created Standard Tree definition: ${parentUrn}`);

          // STEP 2: Place instances concurrently using the worker pattern
          console.log(`📍 Placing ${testTrees.length} instances concurrently...`);

          // Concurrency-limited worker pattern
          const CONCURRENCY = 25;
          let workerIndex = 0;

          const worker = async () => {
            while (true) {
              const i = workerIndex++;
              if (i >= testTrees.length) break;

              const tree = testTrees[i];

              // Recalculate transform for this tree
              const correctedX = terrainOffsetX + tree.x;
              const correctedY = terrainOffsetY + tree.y;
              const correctedZ = tree.z || 0;
              const finalZ = correctedZ + heightOffset;

              const transform: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
                effectiveScale, 0, 0, 0,
                0, effectiveScale, 0, 0,
                0, 0, effectiveScale, 0,
                correctedX,
                correctedY,
                finalZ,
                1
              ];

              try {
                await Forma.proposal.addElement({
                  urn: parentUrn, // REUSE the same URN!
                  transform,
                  name: `Tree ${i + 1}`
                });
                totalPlaced++;

                // update progress occasionally
                if (totalPlaced % 50 === 0 || totalPlaced === testTrees.length) {
                  const progressPercent = Math.round((totalPlaced / testTrees.length) * 100);
                  setProgress(progressPercent);
                  setStatus(`Placing instances: ${totalPlaced}/${testTrees.length} (${progressPercent}%)`);
                }
              } catch (addError) {
                console.error(`❌ Failed to add instance ${i + 1}:`, addError);
                totalFailed++;
              }
            }
          };

          // Launch workers
          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, testTrees.length) }).map(() => worker()));

          const totalTime = (performance.now() - startTime) / 1000;
          console.log(`\n🎉 Instance placement complete! Placed: ${totalPlaced}/${testTrees.length} (${totalFailed} failed)`);
          console.log(`⏱️ Total time: ${totalTime.toFixed(1)}s`);
          console.log(`📈 Rate: ${(totalPlaced / totalTime).toFixed(0)} trees/sec`);

        } catch (error) {
          console.error(`❌ Instance mode failed:`, error);
          setStatus(`❌ Error in instance mode: ${error instanceof Error ? error.message : String(error)}`);
        }

      } else {
        // ========================================
        // ONE-BY-ONE MODE (slower, but proven to work)
        // ========================================
        setStatus(`Creating ${testTrees.length} tree elements one by one...`);
        console.log(`🌳 Using ONE-BY-ONE mode (proven to work!)...`);

        const startTime = performance.now();
        const timings = {
          createElement: 0,
          addToProposal: 0,
          delays: 0
        };
        let totalFailed = 0;

        for (let i = 0; i < testTrees.length; i++) {
          const tree = testTrees[i];
          const correctedX = terrainOffsetX + tree.x;
          const correctedY = terrainOffsetY + tree.y;
          const correctedZ = tree.z || 0;
          const finalZ = correctedZ + heightOffset;

          const transform: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
            effectiveScale, 0, 0, 0,
            0, effectiveScale, 0, 0,
            0, 0, effectiveScale, 0,
            correctedX,
            correctedY,
            finalZ,
            1
          ];

          try {
            // Step 1: Create element with geometry (NO position yet)
            const createStart = performance.now();
            const { urn } = await Forma.integrateElements.createElementV2({
              properties: {
                category: 'vegetation',
                name: `Tree ${i + 1}`
              },
              representations: {
                volumeMesh: {
                  type: "linked" as const,
                  blobId
                }
              }
            });
            const createEnd = performance.now();
            timings.createElement += (createEnd - createStart);

            console.log(`✅ Tree ${i + 1}/${testTrees.length}: Created element ${urn}`);

            // Step 2: Add to proposal WITH transform (THIS IS THE KEY!)
            const addStart = performance.now();
            await Forma.proposal.addElement({
              urn,
              transform,
              name: `Tree ${i + 1}`
            });
            const addEnd = performance.now();
            timings.addToProposal += (addEnd - addStart);

            console.log(`✅ Tree ${i + 1}/${testTrees.length}: Added to proposal`);
            console.log(`   ↳ Position: (${correctedX.toFixed(2)}, ${correctedY.toFixed(2)}, ${finalZ.toFixed(2)})`);

            totalPlaced++;

            if (i % 10 === 0 || i === testTrees.length - 1) {
              const progressPercent = Math.round(((i + 1) / testTrees.length) * 100);
              setProgress(progressPercent);
              setStatus(`Placing trees: ${i + 1}/${testTrees.length} (${progressPercent}%)`);
            }

            // Timing for delay
            if (i < testTrees.length - 1) {
              const delayStart = performance.now();
              await new Promise(resolve => setTimeout(resolve, 100));
              const delayEnd = performance.now();
              timings.delays += (delayEnd - delayStart);
            }

            // Log intermediate timing every 50 trees
            if ((i + 1) % 50 === 0 && i > 0) {
              const avgCreate = (timings.createElement / (i + 1)).toFixed(0);
              const avgAdd = (timings.addToProposal / (i + 1)).toFixed(0);
              console.log(`⏱️ After ${i + 1} trees:`);
              console.log(`   ↳ Avg createElement: ${avgCreate}ms`);
              console.log(`   ↳ Avg addToProposal: ${avgAdd}ms`);
              console.log(`   ↳ Total time: ${((performance.now() - startTime) / 1000).toFixed(1)}s`);
            }

          } catch (error) {
            totalFailed++;
            console.error(`❌ Tree ${i + 1}/${testTrees.length} failed:`, error);
          }
        }

        // Final performance summary
        const totalTime = (performance.now() - startTime) / 1000;
        console.log(`\n🎉 One-by-one placement complete! Trees placed: ${totalPlaced}/${testTrees.length} (${totalFailed} failed)`);
        console.log(`\n📊 PERFORMANCE SUMMARY (${totalPlaced} trees):`);
        console.log(`   ✅ Total time: ${totalTime.toFixed(1)}s`);
        console.log(`   📦 createElement: ${(timings.createElement / 1000).toFixed(1)}s (${((timings.createElement / 1000 / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   📍 addToProposal: ${(timings.addToProposal / 1000).toFixed(1)}s (${((timings.addToProposal / 1000 / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   ⏸️ Delays (100ms each): ${(timings.delays / 1000).toFixed(1)}s (${((timings.delays / 1000 / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   📈 Average per tree: ${(totalTime * 1000 / totalPlaced).toFixed(0)}ms`);
      }

      const treeHeightM = GLB_HEIGHT_M * scale; // scale is normalized (1.0 = 12m model)

      if (totalPlaced === 0) {
        setStatus('❌ No trees were placed successfully');
        setIsPlacing(false);
        return;
      }

      console.log(`✅ Successfully placed ${totalPlaced}/${testTrees.length} trees!`);
      console.log(`   ↳ Tree height: ${treeHeightM.toFixed(1)}m, Height offset: +${heightOffset.toFixed(2)}m`);
      setProgress(100);
      setStatus(`🎉 Successfully placed ${totalPlaced} test trees!`);

      // Clear status after 5 seconds
      setTimeout(() => {
        setStatus('');
        setProgress(0);
      }, 5000);

    } catch (error) {
      console.error('❌ Placement error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`❌ Error: ${errorMessage}`);
      setTimeout(() => setStatus(''), 5000);
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <div className="section" style={{ marginTop: '10px' }}>
      <h3 style={{ marginBottom: '10px' }}>🧪 Tree Placement</h3>

      {/* Placement Mode Toggle */}
      <div style={{
        marginBottom: '15px',
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        border: '2px solid #dee2e6'
      }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
          🔧 Placement Mode:
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setUseBatchMode(true)}
            disabled={isPlacing}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 'bold',
              backgroundColor: useBatchMode ? '#007bff' : '#e9ecef',
              color: useBatchMode ? 'white' : '#495057',
              border: useBatchMode ? '2px solid #0056b3' : '2px solid #ced4da',
              borderRadius: '6px',
              cursor: !isPlacing ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
          >
            ⚡ Instance Mode
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>
              (Fastest & Best)
            </div>
          </button>
          <button
            onClick={() => setUseBatchMode(false)}
            disabled={isPlacing}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 'bold',
              backgroundColor: !useBatchMode ? '#28a745' : '#e9ecef',
              color: !useBatchMode ? 'white' : '#495057',
              border: !useBatchMode ? '2px solid #1e7e34' : '2px solid #ced4da',
              borderRadius: '6px',
              cursor: !isPlacing ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
          >
            🐌 One-by-One
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>
              (Slower but proven)
            </div>
          </button>
        </div>
      </div>

      {/* Tree Density Slider */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
          Tree Density: <strong>{treeDensity}%</strong>
          {availableTrees > MAX_TREES && (
            <span style={{ fontSize: '12px', color: '#dc3545', marginLeft: '8px' }}>
              (Max {maxAllowedDensity}% = {MAX_TREES} trees)
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="range"
            min="10"
            max={maxAllowedDensity}
            step="10"
            value={Math.min(treeDensity, maxAllowedDensity)}
            onChange={(e) => setTreeDensity(parseInt(e.target.value))}
            disabled={isPlacing}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min="10"
            max={maxAllowedDensity}
            step="10"
            value={Math.min(treeDensity, maxAllowedDensity)}
            onChange={(e) => setTreeDensity(Math.min(parseInt(e.target.value) || 100, maxAllowedDensity))}
            disabled={isPlacing}
            style={{
              width: '70px',
              padding: '6px',
              fontSize: '13px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>
        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '5px' }}>
          Will place ~<strong>{estimatedTreeCount}</strong> trees (homogeneous random sampling)
        </div>
        {/* Quick presets */}
        <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
          {[25, 50, 75, Math.min(100, maxAllowedDensity)].map(preset => (
            <button
              key={preset}
              onClick={() => setTreeDensity(preset)}
              disabled={isPlacing}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: treeDensity === preset ? '#007bff' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: !isPlacing ? 'pointer' : 'not-allowed'
              }}
            >
              {preset === Math.min(100, maxAllowedDensity) ? 'MAX' : `${preset}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Scale control with correlation to real tree size */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
          Tree Scale: <strong>{treeScale.toFixed(0)}</strong>
          <span style={{ fontSize: '12px', color: '#28a745', marginLeft: '8px' }}>
            (≈ {(GLB_HEIGHT_M * treeScale / 1000).toFixed(1)}m tall)
          </span>
        </label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="range"
            min="1000"
            max="4000"
            step="100"
            value={treeScale}
            onChange={(e) => setTreeScale(parseFloat(e.target.value))}
            disabled={isPlacing}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min="1000"
            max="10000"
            step="100"
            value={treeScale}
            onChange={(e) => setTreeScale(parseFloat(e.target.value) || 1000)}
            disabled={isPlacing}
            style={{
              width: '100px',
              padding: '6px',
              fontSize: '13px',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>
        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
          1000 = 12m tree | 2000 = 24m | 4000 = 48m (12m model, real scale)
        </div>
      </div>

      {/* Adjustments control */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '14px', marginRight: '10px' }}>
            Adjustments:
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={useAuto}
              onChange={(e) => setUseAuto(e.target.checked)}
              disabled={isPlacing}
              style={{ marginRight: '5px' }}
            />
            Auto (use elevation directly, no offsets)
          </label>
        </div>

        {useAuto ? (
          <div style={{
            padding: '10px',
            backgroundColor: '#e7f3e7',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#2d5016'
          }}>
            ✓ Trees will be placed at elevation Z coordinate (no height offset)
            <div style={{ fontSize: '11px', marginTop: '4px', color: '#5a7a42' }}>
              Using terrain elevation directly from detection
            </div>
          </div>
        ) : (
          <div>
            {/* Manual Height Offset */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
                Height Offset: <strong>{manualHeightOffset.toFixed(1)}m</strong>
              </label>
              <input
                type="range"
                min="-20"
                max="20"
                step="0.5"
                value={manualHeightOffset}
                onChange={(e) => setManualHeightOffset(parseFloat(e.target.value))}
                disabled={isPlacing}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                Adjust vertical position (negative = lower, positive = higher)
              </div>
            </div>

            {/* Manual Scale */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
                Tree Scale: <strong>{manualScale}</strong> (≈ {(GLB_HEIGHT_M * manualScale / 1000).toFixed(1)}m tall)
              </label>
              <input
                type="range"
                min="1000"
                max="10000"
                step="100"
                value={manualScale}
                onChange={(e) => setManualScale(parseFloat(e.target.value) || 1000)}
                disabled={isPlacing}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                Override tree size (1000 = 12m, 4000 = 48m)
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={placeTestTrees}
        disabled={!treesWithElevation || availableTrees === 0 || isPlacing}
        style={{
          padding: '12px 24px',
          fontSize: '14px',
          backgroundColor: isPlacing ? '#ffc107' : (availableTrees > 0 ? '#007bff' : '#6c757d'),
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: (availableTrees > 0 && !isPlacing) ? 'pointer' : 'not-allowed',
          width: '100%',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Progress bar */}
        {isPlacing && progress > 0 && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress}%`,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            transition: 'width 0.3s ease',
            zIndex: 0
          }} />
        )}

        {/* Button text */}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {isPlacing
            ? `⏳ Placing... ${progress}%`
            : `🌲 Place ${estimatedTreeCount} Trees in Forma`
          }
        </span>
      </button>

      {status && (
        <div style={{
          marginTop: '10px',
          padding: '10px',
          backgroundColor: status.startsWith('❌') ? '#f8d7da' :
            status.startsWith('⚠️') ? '#fff3cd' :
              status.startsWith('🎉') ? '#d4edda' : '#d1ecf1',
          color: status.startsWith('❌') ? '#721c24' :
            status.startsWith('⚠️') ? '#856404' :
              status.startsWith('🎉') ? '#155724' : '#0c5460',
          borderRadius: '4px',
          fontSize: '13px',
          border: `1px solid ${status.startsWith('❌') ? '#f5c6cb' :
            status.startsWith('⚠️') ? '#ffeaa7' :
              status.startsWith('🎉') ? '#c3e6cb' : '#bee5eb'}`
        }}>
          {status}
        </div>
      )}

      <div style={{
        marginTop: '10px',
        fontSize: '12px',
        color: '#6c757d',
        lineHeight: '1.4'
      }}>
        <p style={{ margin: '5px 0' }}>
          📍 Available trees: <strong>{availableTrees}</strong>
        </p>
        <p style={{ margin: '5px 0' }}>
          🌲 Tree size: <strong>12-48m</strong> (scale: 1000-4000)
        </p>
        <p style={{ margin: '5px 0' }}>
          📐 GLB model: <strong>12m real scale</strong>
        </p>
        <p style={{ margin: '5px 0' }}>
          💡 Auto mode uses Z coordinates directly from tree detection
        </p>
      </div>
    </div>
  );
}
