FROM ubuntu:24.04

# Prevent tzdata prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install curl, certificates, and Node.js
RUN apt-get update && apt-get install -y curl ca-certificates tar && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Download and install Coral CLI
RUN curl -L https://github.com/withcoral/coral/releases/download/v0.3.0/coral-x86_64-unknown-linux-gnu.tar.gz -o coral.tar.gz \
    && tar -xzf coral.tar.gz \
    && mv coral /usr/local/bin/coral \
    && chmod +x /usr/local/bin/coral \
    && rm coral.tar.gz

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Copy entrypoint script and make it executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

# Start the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
