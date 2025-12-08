# =============================================================================
# Python FastAPI Tree Detection Service
# =============================================================================
# This Dockerfile builds the Python backend for tree detection using OpenCV
# and FastAPI. It includes all necessary system dependencies for image
# processing.
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required by OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    # OpenCV dependencies (libgl1 replaces libgl1-mesa-glx in newer Debian)
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    # OpenMP for parallel processing
    libgomp1 \
    # Wget for healthcheck
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first (Docker layer caching optimization)
# This layer is only rebuilt if requirements.txt changes
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY main.py .
COPY tree_detector_core.py .
COPY model_generator_core.py .
COPY tree_mask_detector.py .
COPY json_to_3d_model.py .

# Copy tree model assets (OBJ/GLB files for 3D generation)
COPY tree_model/ ./tree_model/

# Create output directories
RUN mkdir -p /app/generated_models

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose FastAPI port
EXPOSE 5001

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=5001

# Health check - verifies the FastAPI server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:5001/health || exit 1

# Run the FastAPI server with Uvicorn
CMD ["python", "main.py"]
