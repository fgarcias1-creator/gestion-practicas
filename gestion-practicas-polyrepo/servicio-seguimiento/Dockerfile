FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p src/uploads
RUN chown -R node:node /app
USER node
EXPOSE 3003
CMD ["node", "src/index.js"]
