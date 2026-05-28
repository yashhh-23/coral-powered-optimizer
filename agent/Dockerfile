FROM node:20-slim

# Install necessary tools
RUN apt-get update && apt-get install -y curl tar ca-certificates && rm -rf /var/lib/apt/lists/*

# Download and install Coral CLI
RUN curl -L https://github.com/withcoral/coral/releases/download/v0.4.1/coral-x86_64-unknown-linux-gnu.tar.gz -o coral.tar.gz \
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
