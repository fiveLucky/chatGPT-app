FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./

# Switch to a faster npm registry
RUN npm config set registry https://registry.npmmirror.com/
RUN pnpm config set registry https://registry.npmmirror.com/
RUN pnpm install

COPY . .

RUN pnpm run build

# Hugging Face Spaces 默认使用 7860 端口
ENV PORT=7860

EXPOSE 7860

CMD ["pnpm", "start"]

