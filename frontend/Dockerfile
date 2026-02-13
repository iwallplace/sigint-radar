FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000"]
