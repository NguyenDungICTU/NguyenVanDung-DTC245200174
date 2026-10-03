FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY server.js ./

RUN addgroup -S quiz && \
    adduser -S quiz -G quiz && \
    chown -R quiz:quiz /app

USER quiz

EXPOSE 3000

CMD ["npm", "start"]
