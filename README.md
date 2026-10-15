# El Sonlatino Colombia: radio en línea

Emisoras agrupadas por ciudad. Cualquier persona puede escuchar; solo tú, con tu contraseña, puedes agregar, editar o borrar emisoras. Todo se guarda en el servidor, así que lo ves igual desde cualquier dispositivo.

## Qué contiene

| Archivo | Para qué sirve |
|---|---|
| `server.js` | El servidor: guarda las emisoras y protege los cambios con tu contraseña. No necesita instalar nada más. |
| `public/index.html` | La página de la radio (lo que ve la gente). |
| `public/logo.webp` | Tu logo. Para cambiarlo, reemplaza este archivo. |
| `package.json` | Le dice al hosting cómo arrancar la app. |

## Probarla en tu computador

1. Instala [Node.js](https://nodejs.org) (versión 18 o superior).
2. En la carpeta del proyecto, ejecuta:
   - Mac/Linux: `ADMIN_PASSWORD="tu-clave-segura" node server.js`
   - Windows (PowerShell): `$env:ADMIN_PASSWORD="tu-clave-segura"; node server.js`
3. Abre http://localhost:3000

## Usarla

La página tiene cuatro secciones y un buscador:

- **Buscador:** encuentra emisoras por nombre, ciudad, región o género (sin importar tildes). Busca en todas las emisoras.
- **Explorar:** emisoras agrupadas por ciudad. Siempre aparecen las 26 ciudades principales de Colombia como botones; las que aún no tienen emisoras salen atenuadas con un 0. Al agregar una emisora en una ciudad principal, la región se completa sola.
- **Favoritos:** cada persona marca sus favoritas con el corazón. Se guardan solo en su dispositivo.
- **Géneros:** filtra por género. Si una emisora tiene varios géneros separados por coma ("Salsa, Tropical"), aparece en cada uno.
- **Historial:** las últimas emisoras que escuchó esa persona, también guardadas solo en su dispositivo.
- **Enviar a otro dispositivo:** el botón abre el selector del navegador para mandar el audio a un Chromecast, TV o parlante (Chrome) o a un AirPlay (Safari). Necesita que ambos estén en la misma red wifi. En otros navegadores, como Firefox, el botón avisa que no está disponible.
- **Compartir:** copia o comparte un enlace directo a la emisora que estás escuchando (`?e=...`). Quien lo abre en otro dispositivo ve esa emisora ya seleccionada y solo toca play.
- **Mini reproductor:** al bajar por la lista aparece una barra fija abajo con la emisora actual, pausa y cambio de emisora. El audio no se corta al cambiar de sección.


- **Visitantes:** eligen la ciudad y la emisora y le dan play. No ven botones de edición.
- **Tú:** abajo de la página toca **Administrar**, escribe tu contraseña y aparecen "+ Agregar emisora", los lápices de edición y el menú de copia de seguridad. Cada cambio se guarda al instante en el servidor.
- Los cambios llegan a las demás personas al abrir la página y también se actualizan solos cada minuto.

## Publicarla en internet

Necesitas un servicio que ejecute Node.js **y conserve los archivos entre reinicios** (un disco o volumen persistente). Sirven un VPS propio, o plataformas como Railway, Render o Fly.io con su volumen/disco persistente. Los planes gratuitos que borran el disco al reiniciar **perderán tus emisoras**.

Configura estas variables de entorno:

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `ADMIN_PASSWORD` | Sí | Tu contraseña de administrador (mínimo 8 caracteres). |
| `DATA_DIR` | Recomendada | Carpeta donde se guardan los datos. Ponla dentro del disco persistente, por ejemplo `/data`. |
| `SESSION_SECRET` | No | Texto largo y aleatorio para firmar las sesiones. Si no la defines, se deriva de tu contraseña. |
| `PORT` | No | Puerto (la mayoría de plataformas lo definen solas). |

Comando de inicio: `npm start` (o `node server.js`).

Usa siempre **https**: si el streaming de una emisora es `https`, la página también debe serlo, y así tu contraseña viaja cifrada.

## Copias de seguridad

- Dentro de la app: menú (arriba a la derecha, en modo administrador) → **Descargar copia**. Para restaurar, **Importar copia** (reemplaza la lista actual).
- En el servidor: el archivo `stations.json` dentro de `DATA_DIR` contiene todo, logos incluidos.

## Seguridad en pocas palabras

- Sin contraseña correcta, el servidor rechaza cualquier cambio, aunque alguien intente llamarlo directamente.
- Tras 5 contraseñas incorrectas seguidas, esa conexión espera 15 minutos.
- La sesión de administrador dura 30 días en cada dispositivo; el botón **Salir** la cierra en ese dispositivo.
- Para cerrar de golpe todas las sesiones abiertas, cambia `SESSION_SECRET` (o `ADMIN_PASSWORD`, si no definiste `SESSION_SECRET`).
