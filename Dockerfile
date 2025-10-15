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
ENV NEXTAUTH_SECRET=dummysecret
RUN npm run build 

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
#COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/migrate-mongo-config.js ./migrate-mongo-config.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
# Copy node_modules needed for scripts (papaparse and dotenv for import-rows.js)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/papaparse ./node_modules/papaparse
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
# Install migrate-mongo globally
RUN npm install -g migrate-mongo
RUN chmod +x ./start.sh
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["./start.sh"]
