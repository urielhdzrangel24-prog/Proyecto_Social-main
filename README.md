# Proyecto_Social

## Ejecutar el prototipo

```bash
python app.py
```

Abre `http://127.0.0.1:8000`. La base SQLite se crea automáticamente en `synergai.db`.

El panel de maestros está disponible en `/teacher`. Las aulas aceptan información básica obligatoria y datos opcionales de ciclo escolar, calendario, grado y grupo.

El panel de estudiantes está disponible en `/student`. Los estudiantes pueden unirse con el código del aula, consultar actividades y entregar texto o archivos de hasta 5 MB. Los archivos se almacenan fuera de SQLite en `uploads/` y solo se sirven mediante una ruta protegida.

El botón de asistencia IA genera actualmente un borrador local de actividad. Está separado en `/api/teacher/ai-draft` para conectarlo posteriormente a un modelo real.

La IA local usa por defecto `http://127.0.0.1:1234/v1` y el modelo `google/gemma-3-4b`. Se pueden cambiar mediante `SYNERGAI_AI_URL` y `SYNERGAI_AI_MODEL`. No se envían datos a servicios externos.

La tabla de notificaciones y las suscripciones push ya están preparadas para el futuro panel de estudiantes. El envío push real requerirá configurar claves VAPID cuando se conecte un proveedor de notificaciones.
