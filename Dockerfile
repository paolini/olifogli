# To build the image:
#
# $ VERSION=$( node -e "console.log(require('./package.json').version)" )
# $ APP=olifogli
# $ docker build . -t paolini/${APP}:${VERSION}
# $ docker tag paolini/${APP}:${VERSION} paolini/${APP}:latest
#
# To run the image:
# $ docker-compose -f docker-compose-production.yml up
#
# To push the image:
# $ docker push paolini/${APP}

FROM node:20-alpine AS base

# Install mongodump
RUN apk add --no-cache mongodb-tools

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production 

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . . 
RUN npm run build 

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
#COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
EXPOSE 3000
USER nextjs
CMD ["node", "server.js", "-H", "0.0.0.0"]
