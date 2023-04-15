# Build stage #
FROM node:14 AS build

WORKDIR /usr/src/app

# Prepare environment
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# Copy source files
COPY ./src ./src

# Typescript → Javascript
RUN npm run-script build

# Deploy stage #
FROM node:14

WORKDIR /app

# Setup environment variables for docker
ENV CONFIG_CREDS_SETTINGS=/root/creds.json \
    CONFIG_POW_CREDS_SETTINGS=/root/pow_creds.json \
    CONFIG_REQUEST_STAT=/root/request-stat.json \
    CONFIG_SETTINGS=/root/settings.json \
    CONFIG_TOKEN_SETTINGS=/root/token_settings.json \
    CONFIG_USER_SETTINGS=/root/user_settings.json \
    CONFIG_WEBSOCKET_PATH=/root/websocket.json \
    CONFIG_DB_PATH=/root/db.json

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy build files from build stage
COPY --from=build /usr/src/app/dist ./dist

VOLUME /root

EXPOSE 9950

CMD [ "node", "dist/proxy.js" ]
