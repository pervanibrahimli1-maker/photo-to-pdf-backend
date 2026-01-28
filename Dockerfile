# Node.js üçün rəsmi LTS (Long Term Support) image-ini əsas götürür
FROM node:18-alpine

# Tətbiq qovluğunu yaradır və ora keçir
WORKDIR /app

# package.json faylını kopyalayır
COPY package.json .
# package-lock.json-u kopyalama sətrini silirik, çünki onu yükləmək istəmirsiniz.

# Dependencies-i quraşdırır.
# package-lock.json olmadığı üçün bu addım ən son uyğun versiyaları yükləyəcək.
RUN npm install

# Tətbiqin qalan hissəsini kopyalayır
COPY . .

# İşləyən portu açıq qoyur
EXPOSE 3000

# Serveri işə salmaq üçün əmr
CMD ["npm", "start"]
