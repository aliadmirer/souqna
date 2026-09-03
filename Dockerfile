# استخدام خادم Nginx خفيف ومستقر جداً (حجمه أقل من 25MB)
FROM nginx:alpine

# نسخ جميع ملفات الموقع (HTML, CSS, JS) إلى مجلد Nginx الرسمي
COPY . /usr/share/nginx/html

# التكفل بفتح البورت 80
EXPOSE 80

# تشغيل الخادم
CMD ["nginx", "-g", "daemon off;"]
