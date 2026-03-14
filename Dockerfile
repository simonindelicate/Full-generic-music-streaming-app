FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Storage volume mount point — uploads and metadata live here
RUN mkdir -p storage/uploads storage/metadata

EXPOSE 3000

CMD ["node", "server.js"]
