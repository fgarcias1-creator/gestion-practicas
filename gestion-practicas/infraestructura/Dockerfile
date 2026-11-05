FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY db ./db
CMD ["node", "db/init.js", "--si-no-existe"]
