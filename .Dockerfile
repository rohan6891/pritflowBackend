# Use the official Node.js 18 image as the base image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Ensure the uploads directory exists and set permissions
RUN mkdir -p /app/uploads && chmod -R 755 /app/uploads

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["npm", "start"]