FROM node:10.12.0-alpine

# Set the default working directory
WORKDIR /usr/src

ENV NODE_ENV production
ENV PORT 8000

EXPOSE 8000

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the relevant files to the working directory
COPY . .

# Build and export the app
CMD ["npm", "start"]