FROM nginx:1.27-alpine

# El archivo nginx.conf está dentro de services/web/
COPY services/web/nginx.conf /etc/nginx/conf.d/default.conf

# El index.html está en la carpeta templates/ de la raíz
COPY templates/index.html /usr/share/nginx/html/index.html

# La carpeta static está en la raíz
COPY static /usr/share/nginx/html/static