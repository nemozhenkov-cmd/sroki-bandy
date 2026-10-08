FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app

RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --include=dev

COPY chizhik-server.mjs ./

ENV PORT=10000
EXPOSE 10000

CMD ["xvfb-run", "--server-args=-screen 0 1280x720x24", "node", "chizhik-server.mjs"]
