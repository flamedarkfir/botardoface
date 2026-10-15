# Reglas de Firebase para la asistencia por cámara

Archivo: `database.rules.propuesta.json` (Realtime Database).

IMPORTANTE
- Es una PROPUESTA. No sustituyas tus reglas actuales: copia solo los nodos `rostros`, `asistenciaDia`, `asistencias` y `asistencias_config` dentro de tus reglas existentes (Firebase > Realtime Database > Reglas) y pruébalos en el simulador antes de publicar.
- Mientras no publiques reglas, la protección es solo visual (la app oculta la cámara a quien no es profesor); alguien con conocimientos podría leer o escribir esos datos directamente.
- Los profesores se detectan por correo verificado (`email_verified`). Si agregas un profesor nuevo, añade su correo en la lista (igual que en `badges.js`).
- `asistencias_config` y las asistencias individuales las puede leer cualquier usuario autenticado porque la app del estudiante las consulta; solo los profesores escriben.
- Los rostros son datos biométricos de menores: pide autorización firmada del acudiente antes de registrarlos.

Notificaciones al estudiante: la cámara escribe en `users/{uid}/notificaciones` del alumno. Si tus reglas actuales ya permiten que un usuario autenticado escriba notificaciones a otro (como pasa con los nuevos seguidores), no hay que cambiar nada; si no, permítelo para ese nodo.
Contador de 24 h: nodo `reconocimientos` (lectura para usuarios autenticados, escritura solo profesores).
