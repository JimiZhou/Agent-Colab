FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY SKILL.md ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "src/server.js"]
