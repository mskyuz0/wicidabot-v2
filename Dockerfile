FROM node:24-alpine

WORKDIR /App

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 4333

CMD ["node", "dist/main.js"]