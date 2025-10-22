const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create directories if they don't exist
const TILES_DIR = path.join(__dirname, '../fetched_tiles');
const SEGMENTATION_DIR = path.join(__dirname, '../segmentation_output');

if (!fs.existsSync(TILES_DIR)) {
  fs.mkdirSync(TILES_DIR, { recursive: true });
}

if (!fs.existsSync(SEGMENTATION_DIR)) {
  fs.mkdirSync(SEGMENTATION_DIR, { recursive: true });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Save tile endpoint
app.post('/api/saveTile', async (req, res) => {
  try {
    const { imageUrl, projectId, zoom, bbox, center } = req.body;

    if (!imageUrl || !projectId) {
      return res.status(400).json({ 
        error: 'Missing required fields: imageUrl, projectId' 
      });
    }

    console.log('Saving tile for project:', projectId);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `satellite_tile_${projectId}_zoom${zoom}_${timestamp}.png`;
    const filepath = path.join(TILES_DIR, filename);

    // Download image from Mapbox
    console.log('Downloading image from Mapbox...');
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    
    const imageBuffer = Buffer.from(response.data);

    // Save image to disk
    fs.writeFileSync(filepath, imageBuffer);
    console.log('Image saved to:', filepath);

    // Save metadata
    const metadata = {
      projectId,
      zoom,
      bbox,
      center,
      filename,
      filepath,
      timestamp: new Date().toISOString(),
      imageSize: imageBuffer.length
    };

    const metadataPath = path.join(TILES_DIR, `${filename}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('Metadata saved');

    res.json({
      success: true,
      message: 'Tile saved successfully',
      filename,
      filepath,
      metadata
    });

  } catch (error) {
    console.error('Error saving tile:', error.message);
    res.status(500).json({ 
      error: 'Failed to save tile', 
      message: error.message 
    });
  }
});

// List saved tiles endpoint
app.get('/api/tiles', (req, res) => {
  try {
    const files = fs.readdirSync(TILES_DIR)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        const metadataFile = `${file}.json`;
        const metadataPath = path.join(TILES_DIR, metadataFile);
        
        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        }
        
        return {
          filename: file,
          metadata
        };
      });

    res.json({ tiles: files });
  } catch (error) {
    console.error('Error listing tiles:', error.message);
    res.status(500).json({ 
      error: 'Failed to list tiles', 
      message: error.message 
    });
  }
});

const HOST = '0.0.0.0';              // <— add this
app.listen(PORT, HOST, () => {       // <— bind to 0.0.0.0
  console.log(`Backend server running on http://${HOST}:${PORT}`);
  console.log(`Tiles directory: ${TILES_DIR}`);
  console.log(`Segmentation directory: ${SEGMENTATION_DIR}`);
});