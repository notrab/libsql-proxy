FROM node:18-slim

# Install SSL certificates
RUN apt-get update -qq && \
    apt-get install -y ca-certificates && \
    update-ca-certificates

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy server code
COPY server.js ./

# Create data directory for SQLite files
RUN mkdir -p /app/data && \
    chown -R node:node /app/data

# Switch to non-root user
USER node

EXPOSE 3000
CMD ["node", "server.js"]
