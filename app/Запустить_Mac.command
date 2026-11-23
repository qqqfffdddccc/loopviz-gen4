#!/bin/bash
cd "$(dirname "$0")"
echo "================================================="
echo "   CLOUD 3D Audio Visualizer (Offline Web App)   "
echo "================================================="
echo "Запуск локального сервера для Mac..."

# Запускаем встроенный в macOS python3 веб-сервер
python3 -m http.server 3000 &
PID=$!

sleep 1

# Открываем сайт в браузере по умолчанию (Safari / Chrome / Arc)
open "http://localhost:3000"

echo ""
echo "Сайт открыт: http://localhost:3000"
echo "Работает 100% без интернета!"
echo "Для остановки закройте это окно Терминала."
echo "================================================="

wait $PID
