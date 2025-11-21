"""
Core tree detection logic extracted from tree_mask_detector.py
No GUI dependencies - pure OpenCV processing
"""

import cv2
import numpy as np
import math
from datetime import datetime
from typing import Dict, List, Tuple, Any


def detect_trees_in_image(
    img: np.ndarray,
    hsv_thresholds: Dict[str, Dict[str, int]],
    detection_params: Dict[str, float],
    real_dimensions: Dict[str, float]
) -> Dict[str, Any]:
    """
    Main detection function - extracts trees from satellite image using HSV color filtering.
    
    Args:
        img: OpenCV image (BGR format)
        hsv_thresholds: dict with structure:
            {
                "hue": {"min": int, "max": int},
                "saturation": {"min": int, "max": int},
                "value": {"min": int, "max": int}
            }
        detection_params: dict with:
            {
                "min_diameter": float (meters),
                "max_diameter": float (meters),
                "cluster_threshold": float (meters)
            }
        real_dimensions: dict with:
            {
                "width": float (meters),
                "height": float (meters)
            }
    
    Returns:
        Dictionary with detection results matching frontend TypeScript types
    """
    height, width = img.shape[:2]
    
    # Calculate meters per pixel
    meters_per_pixel_x = real_dimensions["width"] / width
    meters_per_pixel_y = real_dimensions["height"] / height
    
    # Create HSV mask
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    lower_bound = np.array([
        hsv_thresholds["hue"]["min"],
        hsv_thresholds["saturation"]["min"],
        hsv_thresholds["value"]["min"]
    ])
    upper_bound = np.array([
        hsv_thresholds["hue"]["max"],
        hsv_thresholds["saturation"]["max"],
        hsv_thresholds["value"]["max"]
    ])
    
    mask = cv2.inRange(hsv, lower_bound, upper_bound)
    
    # Find contours (tree polygons)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Calculate minimum area threshold
    min_diameter_m = detection_params["min_diameter"]
    min_radius_m = min_diameter_m / 2
    min_area_m2 = math.pi * (min_radius_m ** 2)
    min_area_pixels = min_area_m2 / (meters_per_pixel_x * meters_per_pixel_y)
    
    # Calculate cluster threshold
    cluster_diameter_m = detection_params["cluster_threshold"]
    cluster_radius_m = cluster_diameter_m / 2
    cluster_area_m2 = math.pi * (cluster_radius_m ** 2)
    
    individual_trees = []
    tree_clusters = []
    
    for contour in contours:
        area_pixels = cv2.contourArea(contour)
        
        # Skip tiny noise
        if area_pixels < min_area_pixels:
            continue
        
        # Convert to real-world area
        area_m2 = area_pixels * meters_per_pixel_x * meters_per_pixel_y
        
        # Get centroid
        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        
        cx_px = int(M["m10"] / M["m00"])
        cy_px = int(M["m01"] / M["m00"])
        
        # 🔧 FIX: Flip Y-axis for Forma coordinate system
        # Image coords: Y increases downward (top-left origin)
        # Forma coords: Y increases upward (bottom-left origin)
        cy_px_flipped = height - cy_px
        
        cx_m = cx_px * meters_per_pixel_x
        cy_m = cy_px_flipped * meters_per_pixel_y  # Use flipped Y for meters
        
        # Get polygon points
        polygon_px = contour.reshape(-1, 2).tolist()
        # Flip Y-coordinate for each polygon point
        polygon_m = [[p[0] * meters_per_pixel_x, (height - p[1]) * meters_per_pixel_y] for p in polygon_px]
        
        # Classify as individual tree or cluster
        if area_m2 > cluster_area_m2:
            # Tree cluster - populate with multiple trees
            populated_trees = populate_cluster(
                contour,
                area_m2,
                meters_per_pixel_x,
                meters_per_pixel_y,
                detection_params["min_diameter"],
                detection_params["max_diameter"],
                height
            )
            
            tree_clusters.append({
                "type": "cluster",
                "areaM2": round(area_m2, 2),
                "centroidPx": [cx_px, cy_px],
                "centroidM": [round(cx_m, 2), round(cy_m, 2)],
                "polygonPx": polygon_px,
                "polygonM": [[round(p[0], 2), round(p[1], 2)] for p in polygon_m],
                "populatedTrees": populated_trees
            })
        else:
            # Individual tree
            estimated_diameter_m = 2 * math.sqrt(area_m2 / math.pi)
            
            # Only include if within size constraints
            if detection_params["min_diameter"] <= estimated_diameter_m <= detection_params["max_diameter"]:
                individual_trees.append({
                    "type": "individual",
                    "centroidPx": [cx_px, cy_px],
                    "centroidM": [round(cx_m, 2), round(cy_m, 2)],
                    "areaM2": round(area_m2, 2),
                    "estimatedDiameterM": round(estimated_diameter_m, 2),
                    "polygonPx": polygon_px,
                    "polygonM": [[round(p[0], 2), round(p[1], 2)] for p in polygon_m]
                })
    
    # Calculate summary
    total_populated = sum(len(cluster["populatedTrees"]) for cluster in tree_clusters)
    
    # Build result matching frontend TypeScript types
    return {
        "metadata": {
            "timestamp": datetime.now().isoformat(),
            "imageDimensionsPx": {"width": width, "height": height},
            "realDimensionsM": real_dimensions,
            "metersPerPixel": {"x": meters_per_pixel_x, "y": meters_per_pixel_y},
            "hsvRange": {
                "lower": lower_bound.tolist(),
                "upper": upper_bound.tolist()
            },
            "detectionParameters": detection_params
        },
        "summary": {
            "individualTreesCount": len(individual_trees),
            "treeClustersCount": len(tree_clusters),
            "totalPopulatedTrees": total_populated
        },
        "individualTrees": individual_trees,
        "treeClusters": tree_clusters
    }


def populate_cluster(
    contour: np.ndarray,
    area_m2: float,
    meters_per_pixel_x: float,
    meters_per_pixel_y: float,
    min_diameter: float,
    max_diameter: float,
    height: int
) -> List[Dict[str, Any]]:
    """
    Distribute individual trees within a cluster polygon using Poisson disk sampling.
    
    Args:
        contour: OpenCV contour (polygon points)
        area_m2: Area of cluster in square meters
        meters_per_pixel_x: Horizontal scale factor
        meters_per_pixel_y: Vertical scale factor
        min_diameter: Minimum tree diameter in meters
        max_diameter: Maximum tree diameter in meters
        height: Image height in pixels (for Y-axis flip)
    
    Returns:
        List of populated tree dictionaries
    """
    populated_trees = []
    
    # Get bounding box
    x, y, w, h = cv2.boundingRect(contour)
    
    # Estimate number of trees
    avg_tree_diameter = (min_diameter + max_diameter) / 2
    avg_tree_area = math.pi * (avg_tree_diameter / 2) ** 2
    estimated_tree_count = max(1, int(area_m2 / avg_tree_area))
    
    # Minimum spacing between trees
    min_spacing_m = min_diameter
    avg_meters_per_pixel = (meters_per_pixel_x + meters_per_pixel_y) / 2
    min_spacing_px = min_spacing_m / avg_meters_per_pixel
    
    # Use random sampling with spacing constraint
    attempts = 0
    max_attempts = estimated_tree_count * 10
    
    while len(populated_trees) < estimated_tree_count and attempts < max_attempts:
        attempts += 1
        
        # Random point within bounding box
        test_x = np.random.randint(x, x + w)
        test_y = np.random.randint(y, y + h)
        
        # Check if point is inside contour
        if cv2.pointPolygonTest(contour, (float(test_x), float(test_y)), False) < 0:
            continue
        
        # Check minimum spacing from existing trees
        too_close = False
        for tree in populated_trees:
            dist = math.sqrt(
                (test_x - tree["positionPx"][0])**2 + 
                (test_y - tree["positionPx"][1])**2
            )
            if dist < min_spacing_px:
                too_close = True
                break
        
        if too_close:
            continue
        
        # 🔧 FIX: Flip Y-axis for Forma coordinate system (same as main detection loop)
        test_y_flipped = height - test_y
        position_m = [test_x * meters_per_pixel_x, test_y_flipped * meters_per_pixel_y]
        diameter_m = np.random.uniform(min_diameter, max_diameter)
        
        populated_trees.append({
            "positionPx": [int(test_x), int(test_y)],
            "positionM": [round(position_m[0], 2), round(position_m[1], 2)],
            "estimatedDiameterM": round(diameter_m, 2)
        })
    
    return populated_trees
