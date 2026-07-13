FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0

EXPOSE 80

CMD ["npm", "start"]
