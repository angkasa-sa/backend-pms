FROM node:18-bullseye

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY requirements.txt ./

RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/temp && chmod 755 /app/temp

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "index.js"]
