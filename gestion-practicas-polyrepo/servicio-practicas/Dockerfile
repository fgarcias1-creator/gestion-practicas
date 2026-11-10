FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN chown -R node:node /app
USER node
EXPOSE 3002
CMD ["node", "src/index.js"]
