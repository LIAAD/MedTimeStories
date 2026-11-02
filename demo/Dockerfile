FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_DATASET_URL=/data/inception-dataset.json
ENV VITE_DATASET_URL=${VITE_DATASET_URL}

RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache nodejs

ARG VITE_DATASET_URL=/data/inception-dataset.json
ENV VITE_DATASET_URL=${VITE_DATASET_URL}

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY scripts/convert-inception.mjs /app/scripts/convert-inception.mjs
COPY docker-entrypoint.sh /usr/local/bin/medstories-entrypoint
RUN chmod +x /usr/local/bin/medstories-entrypoint

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/medstories-entrypoint"]
