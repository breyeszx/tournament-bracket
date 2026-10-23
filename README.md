# Mesa Uno — torneos suizos estilo TOM

App web estática (sin backend, sin dependencias) para organizar torneos suizos al estilo del
Tournament Operations Manager de Pokémon: inscribes a los participantes, la app calcula las
rondas y genera los emparejamientos ronda a ronda según el standing.

## Uso

Abre `index.html` en cualquier navegador, o sirve la carpeta como sitio estático
(Vercel, Netlify, GitHub Pages, `npx serve .`). Los torneos se guardan en `localStorage`
del navegador; desde **Ajustes → Copiar JSON** puedes respaldarlos e importarlos en otro equipo.

## Reglas implementadas

| Regla | Detalle |
|---|---|
| Puntos | Victoria 3 · Empate 1 · Derrota 0 · Bye 3 (cuenta como victoria en el récord) |
| Rondas | Tabla oficial Play! Pokémon (4–8: 3, 9–12: 4, 13–20: 5, 21–32: 5, 33–64: 6, 65–128: 7, 129–226: 8, 227–799: 9) con **mínimo 4**. Editable en Ajustes. |
| Ronda 1 | Emparejamiento aleatorio |
| Rondas 2+ | Por standing, de arriba hacia abajo, evitando rivales repetidos (backtracking). Si es imposible evitarlos, se permite y se avisa. |
| Bye | Al jugador activo de peor standing que aún no haya recibido bye |
| Desempates | 1) OWP: promedio del % de victorias de los oponentes (mínimo 25 % cada uno, byes excluidos). 2) OOWP: promedio del OWP de los oponentes. 3) Nombre. |
| Retiros | Un jugador retirado no se empareja más; sus resultados siguen contando para los desempates de los demás |

## Archivos

- `engine.js` — motor puro (standings, desempates, emparejamientos). Funciona en navegador y en Node.
- `app.js` — interfaz y persistencia.
- `app.css` — estilos (tema claro/oscuro automático).
- `body.html` — fragmento de página; `index.html` es el mismo fragmento con la cabecera HTML.

## Probar el motor

```sh
node -e "const E=require('./engine.js'); console.log(E.recommendedRounds(17))"
```
