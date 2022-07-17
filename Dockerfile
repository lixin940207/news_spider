FROM node:16.13.2-slim

ARG Version=1.0.0

LABEL name="news_spider"
LABEL version=$Version

RUN mkdir /news_spider
COPY ./package.json /news_spider/
COPY ./package-lock.json /news_spider/

WORKDIR /news_spider

RUN apt-get update \
    && apt-get install -y --no-install-recommends apt-utils python3 build-essential git ca-certificates \
    && yarn cache clean \
    && yarn install --network-concurrency 1 \
    && yarn cache clean \
    && apt-get autoremove --purge -y python3 build-essential git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \

COPY --chown=node:node . .

RUN npm build

USER node

CMD ["node", "index.js"]