FROM node:16-alpine

WORKDIR /app

COPY . .

RUN yarn --frozen-lockfile

EXPOSE 80
EXPOSE 3000

CMD yarn start
