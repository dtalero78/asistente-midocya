#!/bin/bash

# 🧹 Matar proceso que esté usando el puerto (por defecto 5001)
PORT=${PORT:-5001}
PID=$(lsof -ti tcp:$PORT)

if [ ! -z "$PID" ]; then
  echo "🔌 Cerrando proceso en el puerto $PORT (PID: $PID)..."
  kill -9 $PID
else
  echo "✅ Puerto $PORT libre"
fi

# ⚡ Activar entorno virtual
source .venv/bin/activate

# 🚀 Ejecutar la app
echo "🚀 Iniciando app en el puerto $PORT..."
python3 src/app.py