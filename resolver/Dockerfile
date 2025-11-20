# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies: ffmpeg, ffprobe, and yt-dlp requirements
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install yt-dlp
RUN pip install --no-cache-dir yt-dlp==2024.10.7

# Copy application code
COPY deepscan_resolver.py .
COPY doomscroller_resolver.py .

# Create cookies directory
RUN mkdir -p /app/cookies

# Expose ports for both services
EXPOSE 5000 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Default command (can be overridden in docker-compose)
CMD ["python", "deepscan_resolver.py"]
