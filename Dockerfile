FROM node:22-alpine

# Install build dependencies (make, gcc, g++, python3) for compiling native modules
RUN apk add --no-cache make gcc g++ python3

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start server
CMD ["npm", "start"]
