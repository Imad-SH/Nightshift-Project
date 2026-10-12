# Base Stage (for dev and build)
FROM node:22-alpine as base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

# Build Stage
FROM base as build
COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
