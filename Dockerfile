FROM node:26-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3780

EXPOSE 3780

CMD ["npm", "start"]