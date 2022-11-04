FROM node:16.13.2
ENV NODE_ENV=production

ARG Version=1.0.0

LABEL name="news_spider"
LABEL version=$Version

RUN mkdir /news_spider
COPY ./package.json /news_spider/
COPY ./yarn.lock /news_spider/

WORKDIR /news_spider

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      apt-utils \
      python3 \
      build-essential \
      git \
      ca-certificates \
    && apt-get install -yq --no-install-recommends libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libnss3 libatk-bridge2.0-0 libdrm2 libgbm-dev libxshmfence1 \
    && yarn cache clean \
    && yarn install --network-concurrency 1 --production\
    && yarn cache clean \
    && apt-get autoremove --purge -y python3 build-essential git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

COPY . .

RUN chown -Rh $user:$user /news_spider

USER $user

CMD ["node", "index.js"]