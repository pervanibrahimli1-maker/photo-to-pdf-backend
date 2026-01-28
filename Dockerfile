# Node.js üçün rəsmi LTS (Long Term Support) image-ini əsas götürür
FROM node:18-alpine

# Tətbiq qovluğunu yaradır və ora keçir
WORKDIR /app

# Package.json faylını və package-lock.json-u kopyalayır
# Bu addım, yalnız dependencies dəyişdikdə rebuild olunmasını təmin edir (caching üçün)
COPY backend/package.json ./backend/
COPY backend/package-lock.json ./backend/

# Dependencies-i quraşdırır
RUN npm install --prefix ./backend

# Tətbiqin qalan hissəsini kopyalayır
COPY . .

# İşləyən portu açıq qoyur (Render.com bunu avtomatik idarə edir, lakin yaxşı təcrübədir)
EXPOSE 3000

# Serveri işə salmaq üçün əmr
# package.json-dakı "start" scriptini istifadə edir
CMD ["npm", "start", "--prefix", "./backend"]