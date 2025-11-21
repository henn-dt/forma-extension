# Python Backend - Docker Deployment Plan

## 📋 Overview

This document outlines the complete Docker containerization and deployment strategy for the Python FastAPI backend service, which handles tree detection and 3D model generation.

**Current Status:** ❌ No Dockerfile exists - needs creation from scratch  
**Target:** Production-ready Docker container deployable to Azure Container Apps/Registry

---

## 🏗️ Architecture Context

```
React Frontend (Vite)
    ↓
Express Backend (Proxy)
    ↓ HTTP (port 3001 → 5001)
Python Backend (THIS SERVICE)
```

**Python Backend Responsibilities:**
- Tree detection using HSV color filtering (OpenCV)
- Image processing for satellite imagery analysis
- 3D model generation (OBJ file creation)
- Serving tree base models (Henkel_tree.obj, tree_lowpoly.obj)
- Large model file management (>20k trees → Downloads folder)

---

## 📁 Current File Structure

```
python_backend/
├── main.py                    # FastAPI application (305 lines)
├── tree_detector_core.py      # Tree detection logic (HSV filtering)
├── model_generator_core.py    # OBJ file generation
├── tree_mask_detector.py      # Image processing utilities
├── json_to_3d_model.py        # JSON → 3D conversion
├── requirements.txt           # ✅ Python dependencies
├── README.md                  # Service documentation
├── tree_model/                # Base 3D models (CRITICAL - must be included)
│   ├── Henkel_tree.obj       # Main tree model (KEEP)
│   ├── tree_lowpoly.obj      # Low-poly tree model (KEEP)
│   ├── Henkel_tree.mtl       # Material file
│   ├── tree_lowpoly.mtl      # Material file
│   ├── Forma_trees.obj       # 81MB file (EXCLUDE - too large)
│   ├── *.blend, *.blend1     # Blender files (EXCLUDE)
│   ├── *.3dm                 # Rhino files (EXCLUDE)
│   └── textures/             # Texture files (optional)
├── generated_models/          # Output directory (EXCLUDE from image)
│   └── Henkel_Large.3dm      # 490MB file (EXCLUDE)
└── __pycache__/               # Python cache (EXCLUDE)
```

**Critical Files to Include in Docker Image:**
- ✅ `main.py`, `*_core.py`, `*.py` (all Python code)
- ✅ `requirements.txt`
- ✅ `tree_model/Henkel_tree.obj` (~2-5MB)
- ✅ `tree_model/tree_lowpoly.obj` (~1-3MB)
- ✅ `tree_model/*.mtl` (material files)
- ❌ `tree_model/Forma_trees.obj` (81MB - too large)
- ❌ `generated_models/` (output only, not source)

---

## 🔧 Dockerfile Design Strategy

### Key Considerations

1. **Base Image Choice:**
   - `python:3.11-slim` (Recommended)
     - Pros: Smaller (120MB vs 900MB), faster builds
     - Cons: May need extra packages for OpenCV
   - `python:3.11-alpine` (Smallest)
     - Pros: Tiny (50MB base)
     - Cons: OpenCV compilation issues, slower builds
   
   **Decision:** Use `python:3.11-slim` with apt-get for OpenCV dependencies

2. **Dependencies:**
   - FastAPI + Uvicorn (web server)
   - OpenCV (requires system libraries)
   - NumPy (scientific computing)
   - Pillow (image handling)

3. **Volume Mounts:**
   - `/app/tree_model` - Base models (read-only in production)
   - `/app/generated_models` - Output directory (optional, can use Azure Blob)

4. **Performance:**
   - OpenCV needs: `libgl1-mesa-glx`, `libglib2.0-0`
   - Multi-stage build to reduce final image size

---

## 📝 Step-by-Step Implementation Plan

### **Phase 1: Create Dockerfile** (20 minutes)

#### Step 1.1: Create `.dockerignore`

**Purpose:** Exclude unnecessary files from Docker build context

**Create:** `python_backend/.dockerignore`
```dockerignore
# Python cache
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info/
dist/
build/
.pytest_cache/

# Virtual environments
venv/
env/
ENV/
.venv/

# Generated files (output only, not source)
generated_models/*
!generated_models/.gitkeep

# Large tree model files (exclude from image)
tree_model/Forma_trees.obj
tree_model/Forma_trees.mtl
tree_model/*.blend
tree_model/*.blend1
tree_model/*.3dm
tree_model/*.3ds
tree_model/*.fbx
tree_model/*.max

# Keep only essential models
!tree_model/Henkel_tree.obj
!tree_model/tree_lowpoly.obj
!tree_model/*.mtl

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Git files
.git/
.gitignore

# Documentation
README.md
*.md

# Docker files
Dockerfile
docker-compose.yml
.dockerignore

# Logs
*.log
logs/

# Test files
test_*.py
tests/
```

**Why:** Prevents 81MB Forma_trees.obj and 490MB .3dm files from bloating image

---

#### Step 1.2: Create Production-Optimized Dockerfile

**Create:** `python_backend/Dockerfile`

```dockerfile
# ============================================
# Python Backend - Production Dockerfile
# Multi-stage build for minimal image size
# ============================================

# ==========================================
# Stage 1: Builder (dependencies compilation)
# ==========================================
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (better caching)
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==========================================
# Stage 2: Runtime (production image)
# ==========================================
FROM python:3.11-slim AS production

# Set working directory
WORKDIR /app

# Install runtime dependencies for OpenCV (smaller than build deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application source
COPY main.py .
COPY tree_detector_core.py .
COPY model_generator_core.py .
COPY tree_mask_detector.py .
COPY json_to_3d_model.py .

# Copy essential tree models ONLY (excluding large files via .dockerignore)
COPY tree_model/ ./tree_model/

# Create output directories
RUN mkdir -p generated_models

# Create non-root user for security
RUN useradd -m -u 1001 -s /bin/bash appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Set Python environment
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV LOG_LEVEL=INFO

# Expose FastAPI port
EXPOSE 5001

# Health check (FastAPI /health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health').read()" || exit 1

# Start FastAPI with Uvicorn (bind to 0.0.0.0 for container networking)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--log-level", "info"]
```

**Key Features:**
- ✅ Multi-stage build (reduces final image by ~300MB)
- ✅ Non-root user (security best practice)
- ✅ Virtual environment isolation
- ✅ Health check endpoint
- ✅ OpenCV dependencies included
- ✅ Only essential tree models copied (2 OBJ files vs 81MB+)

**Expected Image Size:** ~500-700MB (vs 1.2GB+ without optimization)

---

#### Step 1.3: Verify `requirements.txt`

**Current:** `python_backend/requirements.txt`
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
numpy>=1.21.0
opencv-python>=4.8.0
python-multipart==0.0.6
pillow>=10.0.0
```

**Optimization:** Use `opencv-python-headless` to reduce image size by ~200MB

**Updated:** `python_backend/requirements.txt`
```txt
# Web framework
fastapi==0.104.1
uvicorn[standard]==0.24.0

# Image processing (headless for Docker - no GUI needed)
opencv-python-headless==4.8.1.78
numpy>=1.21.0,<2.0.0
pillow>=10.0.0,<11.0.0

# File upload handling
python-multipart==0.0.6

# Optional: Azure Blob Storage (if migrating from Downloads folder)
# azure-storage-blob==12.19.0
```

**Why headless?** 
- Regular `opencv-python`: 150MB (includes GUI libs for X11, Qt)
- Headless `opencv-python-headless`: 50MB (no GUI)
- Docker doesn't need GUI → saves 100MB

---

#### Step 1.4: Update `main.py` for Container Environment

**Current code already binds to `0.0.0.0`** ✅

```python
if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",  # ✅ Already correct - listens on all interfaces
        port=5001,
        log_level="info"
    )
```

**No changes needed** - your code is already container-ready!

---

### **Phase 2: Environment Configuration** (10 minutes)

#### Step 2.1: Document Required Environment Variables

**Create:** `python_backend/.env.example`
```bash
# Python Backend Environment Variables
# Copy to .env for local development

# Server Configuration
PORT=5001
LOG_LEVEL=INFO

# Python Configuration
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1

# Optional: Azure Blob Storage (for large models)
# AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
# AZURE_STORAGE_CONTAINER_GENERATED_MODELS=generated-models
# AZURE_STORAGE_CONTAINER_TREE_MODELS=tree-models

# Optional: Model Generation Limits
MAX_TREES_LIMIT=60000
LARGE_MODEL_THRESHOLD=20000
```

#### Step 2.2: Create Startup Script (Optional - for debugging)

**Create:** `python_backend/start.sh`
```bash
#!/bin/bash
# Startup script for debugging and health checks

echo "🐍 Starting Python FastAPI Backend..."
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-5001}"
echo "Log Level: ${LOG_LEVEL:-INFO}"

# Check tree models exist
if [ ! -f "tree_model/Henkel_tree.obj" ]; then
    echo "❌ ERROR: Henkel_tree.obj not found!"
    exit 1
fi

if [ ! -f "tree_model/tree_lowpoly.obj" ]; then
    echo "❌ ERROR: tree_lowpoly.obj not found!"
    exit 1
fi

echo "✅ Base tree models found"

# Start uvicorn
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001} --log-level ${LOG_LEVEL:-info}
```

**Make executable:**
```bash
chmod +x python_backend/start.sh
```

---

### **Phase 3: Local Testing with Docker** (20 minutes)

#### Step 3.1: Build Docker Image Locally

```powershell
# Navigate to python_backend
cd c:\Users\ABC\AbdellahCh\App_Deployment\FormaTileExtraction\my-react-forma\python_backend

# Build image
docker build -t forma-python-backend:latest .

# Verify image created
docker images | Select-String forma-python

# Expected output:
# forma-python-backend   latest   <image_id>   ~600MB
```

#### Step 3.2: Run Container Locally

```powershell
# Run container (standalone)
docker run -d `
  --name python-backend `
  -p 5001:5001 `
  -e LOG_LEVEL=DEBUG `
  -v ${PWD}/generated_models:/app/generated_models `
  forma-python-backend:latest

# Check logs
docker logs -f python-backend

# Expected output:
# 🐍 Starting Tree Detection API...
# INFO:     Started server process [1]
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://0.0.0.0:5001
```

#### Step 3.3: Test Endpoints

```powershell
# Test health endpoint
curl http://localhost:5001/health

# Expected:
# {
#   "status": "ok",
#   "service": "tree-detection",
#   "message": "Python FastAPI backend is running"
# }

# Test root endpoint
curl http://localhost:5001/

# Test API docs
Start-Process "http://localhost:5001/docs"
```

#### Step 3.4: Test Tree Detection (with sample image)

```powershell
# Create test request
curl -X POST http://localhost:5001/detect-trees `
  -F "image=@path/to/test_satellite_image.png" `
  -F "hue_min=35" `
  -F "hue_max=85" `
  -F "sat_min=40" `
  -F "sat_max=255" `
  -F "val_min=40" `
  -F "val_max=255" `
  -F "min_diameter=3" `
  -F "max_diameter=15" `
  -F "cluster_threshold=10" `
  -F "real_width=100" `
  -F "real_height=100"

# Should return JSON with detected trees
```

---

### **Phase 4: Integration with Express Backend** (15 minutes)

#### Step 4.1: Update Docker Compose (Project Root)

**Update:** `my-react-forma/docker-compose.yml` to include Python backend

```yaml
version: "3.9"

services:
  # =======================================
  # Python Backend (Tree Detection)
  # =======================================
  python-backend:
    build:
      context: ./python_backend
      dockerfile: Dockerfile
    container_name: forma-python-backend
    ports:
      - "5001:5001"
    environment:
      - PYTHONUNBUFFERED=1
      - LOG_LEVEL=INFO
      - PORT=5001
    volumes:
      # Tree models (read-only in production)
      - ./python_backend/tree_model:/app/tree_model:ro
      # Generated models (optional - can use Azure Blob instead)
      - ./python_backend/generated_models:/app/generated_models
      # Hot-reload for development (optional)
      # - ./python_backend/main.py:/app/main.py
      # - ./python_backend/tree_detector_core.py:/app/tree_detector_core.py
    restart: unless-stopped
    networks:
      - forma-network
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  # =======================================
  # Express Backend (API Proxy)
  # =======================================
  express-backend:
    build:
      context: ./backend
      dockerfile: dockerfile
    container_name: forma-express-backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - PORT=3001
      - PYTHON_API_URL=http://python-backend:5001  # Docker service name
    volumes:
      - ./fetched_tiles:/app/fetched_tiles
      - ./segmentation_output:/app/segmentation_output
    depends_on:
      python-backend:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - forma-network

networks:
  forma-network:
    driver: bridge
```

#### Step 4.2: Test Full Stack

```powershell
# Navigate to project root
cd c:\Users\ABC\AbdellahCh\App_Deployment\FormaTileExtraction\my-react-forma

# Start both backends
docker-compose up python-backend express-backend

# In another terminal, test proxying
curl http://localhost:3001/health

# Expected:
# {
#   "status": "ok",
#   "express": "ok",
#   "python": "ok"
# }
```

---

### **Phase 5: Azure Container Registry Preparation** (30 minutes)

#### Step 5.1: Build for Azure

```powershell
# Build image with Azure tag
docker build -t formaregistry.azurecr.io/python-backend:latest ./python_backend

# Verify build
docker images | Select-String python-backend
```

#### Step 5.2: Push to Azure Container Registry

```bash
# Login to ACR
az acr login --name formaregistry

# Build directly in ACR (recommended - faster)
az acr build \
  --registry formaregistry \
  --image python-backend:latest \
  --image python-backend:v1.0.0 \
  --file Dockerfile \
  ./python_backend

# Verify image in ACR
az acr repository show-tags \
  --name formaregistry \
  --repository python-backend \
  --output table

# Expected output:
# Result
# --------
# latest
# v1.0.0
```

---

### **Phase 6: Azure Deployment** (30 minutes)

#### Step 6.1: Deploy to Azure Container Apps

**Why Container Apps:**
- Serverless scaling (scales to zero)
- Auto-scaling based on load
- Cheaper for intermittent workloads
- Built-in HTTPS and service discovery

```bash
# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name formaregistry --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name formaregistry --query "passwords[0].value" -o tsv)

# Deploy Python backend
az containerapp create \
  --name python-backend \
  --resource-group forma-rg \
  --environment forma-env \
  --image formaregistry.azurecr.io/python-backend:latest \
  --target-port 5001 \
  --ingress internal \
  --min-replicas 0 \
  --max-replicas 5 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --registry-server formaregistry.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --env-vars \
    PYTHONUNBUFFERED=1 \
    LOG_LEVEL=INFO \
    PORT=5001

# Get internal FQDN (for Express backend to call)
az containerapp show \
  --name python-backend \
  --resource-group forma-rg \
  --query properties.configuration.ingress.fqdn \
  --output tsv

# Output: python-backend.internal.formahappymeadow-12345678.eastus.azurecontainerapps.io
```

**Note:** `--ingress internal` makes Python backend only accessible within Container Apps environment (more secure)

#### Step 6.2: Update Express Backend to Use Python Backend URL

```bash
# Update Express backend environment variable
az containerapp update \
  --name express-backend \
  --resource-group forma-rg \
  --set-env-vars \
    PYTHON_API_URL=https://python-backend.internal.formahappymeadow-12345678.eastus.azurecontainerapps.io
```

---

### **Phase 7: Handle Large Files (Azure Blob Storage)** (45 minutes)

#### Problem: Downloads folder doesn't work in containers

**Current issue:**
- `os.path.expanduser("~")` → `/home/appuser` in container
- Container filesystems are ephemeral (lost on restart)
- Can't access user's Windows Downloads folder from Azure

**Solution:** Use Azure Blob Storage for generated models

#### Step 7.1: Create Storage Account (if not exists)

```bash
# Create storage account
az storage account create \
  --name formatilesstorage \
  --resource-group forma-rg \
  --location eastus \
  --sku Standard_LRS

# Create container for generated models
az storage container create \
  --name generated-models \
  --account-name formatilesstorage \
  --public-access off

# Get connection string
CONNECTION_STRING=$(az storage account show-connection-string \
  --name formatilesstorage \
  --resource-group forma-rg \
  --output tsv)

echo $CONNECTION_STRING
```

#### Step 7.2: Update `requirements.txt`

```txt
# Add to requirements.txt
azure-storage-blob==12.19.0
```

#### Step 7.3: Update `main.py` for Blob Storage

**Add to top of `main.py`:**
```python
import os
from azure.storage.blob import BlobServiceClient

# Initialize Azure Blob Storage (if configured)
AZURE_STORAGE_ENABLED = os.getenv('AZURE_STORAGE_CONNECTION_STRING') is not None

if AZURE_STORAGE_ENABLED:
    blob_service_client = BlobServiceClient.from_connection_string(
        os.getenv('AZURE_STORAGE_CONNECTION_STRING')
    )
    generated_models_container = blob_service_client.get_container_client('generated-models')
    logger.info("✅ Azure Blob Storage initialized")
else:
    logger.warning("⚠️ Azure Blob Storage not configured - using local filesystem")
```

**Update `/generate-model` endpoint:**
```python
# Replace Downloads folder logic with:
if total_trees > 20000:
    logger.info(f"Large model detected ({total_trees} trees), saving to Azure Blob Storage...")
    
    obj_content, mtl_content = generate_obj_content(detection_data)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    obj_filename = f"trees_model_{total_trees}trees_{timestamp}.obj"
    
    if AZURE_STORAGE_ENABLED:
        # Upload to Azure Blob Storage
        blob_client = generated_models_container.get_blob_client(obj_filename)
        blob_client.upload_blob(obj_content, overwrite=True)
        
        # Generate SAS URL for download (valid for 1 hour)
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions
        from datetime import timedelta
        
        sas_token = generate_blob_sas(
            account_name=blob_service_client.account_name,
            container_name='generated-models',
            blob_name=obj_filename,
            account_key=blob_service_client.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=1)
        )
        
        download_url = f"{blob_client.url}?{sas_token}"
        
        return {
            "download_url": download_url,
            "filename": obj_filename,
            "filesize_mb": round(len(obj_content.encode()) / (1024 * 1024), 2),
            "total_trees": total_trees,
            "message": f"Model saved to cloud storage ({len(obj_content.encode()) / (1024 * 1024):.1f}MB)",
            "expires_in": "1 hour"
        }
    else:
        # Fallback: local filesystem (development only)
        local_path = os.path.join("/app/generated_models", obj_filename)
        with open(local_path, 'w') as f:
            f.write(obj_content)
        
        return {
            "filepath": local_path,
            "filename": obj_filename,
            "message": "Model saved locally (Azure Blob not configured)"
        }
```

#### Step 7.4: Update Container App with Blob Storage

```bash
# Add environment variable
az containerapp update \
  --name python-backend \
  --resource-group forma-rg \
  --set-env-vars \
    AZURE_STORAGE_CONNECTION_STRING="$CONNECTION_STRING"

# Restart container to apply changes
az containerapp revision restart \
  --name python-backend \
  --resource-group forma-rg
```

---

### **Phase 8: Performance Optimization** (Optional - 30 minutes)

#### Step 8.1: Add Caching for Large Models

```python
# Add Redis caching for frequently accessed models
# requirements.txt
redis==5.0.1

# main.py
import redis

redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=6379,
    decode_responses=False
)

# Cache detection results for 10 minutes
@app.post("/detect-trees")
async def detect_trees(...):
    # Generate cache key
    cache_key = f"detection:{hash(image.file.read())}"
    
    # Check cache
    cached = redis_client.get(cache_key)
    if cached:
        logger.info("Cache hit!")
        return JSONResponse(content=json.loads(cached))
    
    # ... detection logic ...
    
    # Store in cache
    redis_client.setex(cache_key, 600, json.dumps(result))
    
    return JSONResponse(content=result)
```

#### Step 8.2: Enable Horizontal Scaling

```bash
# Update Container App to scale based on HTTP requests
az containerapp update \
  --name python-backend \
  --resource-group forma-rg \
  --min-replicas 1 \
  --max-replicas 10 \
  --scale-rule-name http-requests \
  --scale-rule-type http \
  --scale-rule-http-concurrency 20
```

---

## 🧪 Testing Checklist

### Local Testing (Docker)

- [ ] `docker build -t forma-python-backend .` succeeds
- [ ] Image size < 800MB (optimized)
- [ ] `docker run` starts without errors
- [ ] `curl http://localhost:5001/health` returns `{"status":"ok"}`
- [ ] API docs accessible at `http://localhost:5001/docs`
- [ ] Can detect trees in test image
- [ ] Can generate small model (<20k trees)
- [ ] Can generate large model (>20k trees)
- [ ] Base tree models loaded correctly

### Integration Testing (Docker Compose)

- [ ] Both backends start via `docker-compose up`
- [ ] Express can reach Python backend
- [ ] Health check shows both services healthy
- [ ] End-to-end detection works through Express proxy
- [ ] Model generation works through Express proxy

### Azure Testing (Container Apps)

- [ ] Image pushed to ACR successfully
- [ ] Container App starts without errors
- [ ] Health endpoint returns healthy
- [ ] Logs show no errors (`az containerapp logs show`)
- [ ] Can handle 4951m × 4886m tiles
- [ ] Can detect 88k trees without timeout
- [ ] Large models save to Azure Blob Storage
- [ ] Download URLs are accessible

---

## 📊 Resource Requirements

### Development (Local Docker)
- **CPU:** 1.0 cores
- **Memory:** 1-2 GB (2GB for large tiles)
- **Disk:** 2 GB (includes OpenCV, NumPy)
- **Build Time:** 3-5 minutes (first build)

### Production (Azure Container Apps)
- **Minimum:**
  - CPU: 1.0 vCPU
  - Memory: 2 GB
  - Cost: ~$15-20/month
- **Recommended (with auto-scaling):**
  - CPU: 1.0 vCPU
  - Memory: 2 GB
  - Replicas: 1-5 (auto-scale)
  - Cost: ~$20-40/month (scales with usage)

### Image Size Comparison
- **Unoptimized:** ~1.2 GB (regular opencv-python, no multi-stage)
- **Optimized:** ~600 MB (headless opencv, multi-stage build)
- **Savings:** 50% reduction

---

## 🔒 Security Considerations

### Secrets Management
- [ ] Use Azure Key Vault for blob storage connection strings
- [ ] Never commit `.env` files
- [ ] Use managed identities where possible
- [ ] Rotate credentials regularly

### Container Security
- [ ] ✅ Run as non-root user (implemented)
- [ ] ✅ Use minimal base image (slim)
- [ ] Scan images for vulnerabilities
- [ ] Keep Python dependencies updated

### Network Security
- [ ] Use internal ingress (not publicly accessible)
- [ ] Only Express backend should call Python backend
- [ ] Enable HTTPS (Container Apps default)
- [ ] Configure CORS properly

---

## 🚀 Deployment Commands Summary

### Quick Deploy to Azure

```bash
# 1. Build and push to ACR
az acr build \
  --registry formaregistry \
  --image python-backend:latest \
  ./python_backend

# 2. Deploy to Container App (internal ingress)
az containerapp create \
  --name python-backend \
  --resource-group forma-rg \
  --environment forma-env \
  --image formaregistry.azurecr.io/python-backend:latest \
  --target-port 5001 \
  --ingress internal \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars PYTHONUNBUFFERED=1 LOG_LEVEL=INFO

# 3. Get internal URL
az containerapp show \
  --name python-backend \
  --resource-group forma-rg \
  --query properties.configuration.ingress.fqdn

# 4. Update Express backend
az containerapp update \
  --name express-backend \
  --resource-group forma-rg \
  --set-env-vars PYTHON_API_URL=https://<python-backend-fqdn>

# 5. Test
az containerapp logs show --name python-backend --resource-group forma-rg --follow
```

---

## 📚 Troubleshooting

### Container won't start
```bash
# Check logs
az containerapp logs show \
  --name python-backend \
  --resource-group forma-rg \
  --follow

# Common issues:
# - Missing tree models → Verify .dockerignore includes them
# - OpenCV errors → Check libgl1-mesa-glx installed
# - Port binding errors → Verify PORT=5001 env var
```

### Health check failing
```bash
# Test health endpoint manually
docker exec -it python-backend curl http://localhost:5001/health

# Check if uvicorn is running
docker exec -it python-backend ps aux | grep uvicorn

# Check Python errors
docker exec -it python-backend python -c "import cv2; print(cv2.__version__)"
```

### High memory usage during detection
```bash
# Monitor resource usage
az containerapp show \
  --name python-backend \
  --resource-group forma-rg \
  --query properties.template.containers[0].resources

# Increase memory if needed
az containerapp update \
  --name python-backend \
  --resource-group forma-rg \
  --memory 4.0Gi
```

### Tree models not found
```bash
# Verify models in image
docker run --rm forma-python-backend ls -lh /app/tree_model/

# Should show:
# Henkel_tree.obj
# tree_lowpoly.obj
# *.mtl files

# If missing, check .dockerignore excludes them
```

---

## ✅ Next Steps

After completing this Python backend Docker setup:

1. **✅ Complete** - Python backend containerized and deployable
2. **✅ Complete** - Express backend containerized (see `backend/DOCKER_DEPLOYMENT_PLAN.md`)
3. **📋 Next** - Test full stack locally with `docker-compose up`
4. **📋 Then** - Deploy both to Azure Container Apps
5. **📋 Finally** - Update React frontend to use production API URLs

---

## 📖 Additional Resources

- [FastAPI Docker Documentation](https://fastapi.tiangolo.com/deployment/docker/)
- [OpenCV Docker Best Practices](https://github.com/opencv/opencv/wiki/Docker)
- [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Multi-stage Docker Builds](https://docs.docker.com/build/building/multi-stage/)
- [Azure Blob Storage Python SDK](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-python)

---

**Document Version:** 1.0  
**Last Updated:** November 11, 2025  
**Author:** GitHub Copilot  
**Status:** Ready for implementation
