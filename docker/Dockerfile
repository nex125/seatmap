FROM oven/bun:alpine AS base

WORKDIR /app

# Install dependencies for the monorepo
COPY package.json ./
# For better caching, copy the whole project structure for workspaces
COPY . .

# Use bun install for faster and more consistent behavior with the rest of the project
RUN bun install

# Expose the port from seatmap/apps/demo/vite.config.ts
EXPOSE 3005

# Start the dev server using turbo via the root package.json
CMD ["bun", "run", "dev"]
